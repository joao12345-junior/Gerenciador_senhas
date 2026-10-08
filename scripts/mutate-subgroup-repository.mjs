// scripts/mutate-subgroup-repository.mjs
//
// Teste de mutação manual do PostgresSubgroupRepository: aplica UMA mutação por vez no
// adaptador, roda os testes de integração e restaura o arquivo. Uma mutação "morre"
// quando algum teste fica vermelho; se tudo continua verde, ela "sobrevive" (teste fraco).
//
// Uso:  node scripts/mutate-subgroup-repository.mjs         (roda tudo, ~15 min)
//       node scripts/mutate-subgroup-repository.mjs --dry   (só confere se cada trecho existe)

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TARGET = "src/adapters/persistence/postgres-subgroup-repository.ts";
const TEST_FILE = "tests/integration/postgres-subgroup-repository.test.ts";
const BACKUP = `${TARGET}.mutation-backup`;
const DRY = process.argv.includes("--dry");

/** Troca a 1ª ocorrência de `find` por `replace` dentro do corpo do método `name`. */
function inMethod(name, find, replace) {
	return (src) => {
		const start = src.indexOf(`async ${name}(`);
		if (start === -1) return null;
		const end = src.indexOf("\n\t}\n", start);
		const body = src.slice(start, end);
		if (!body.includes(find)) return null;
		return src.slice(0, start) + body.replace(find, () => replace) + src.slice(end);
	};
}

/** Troca a 1ª ocorrência de `find` no arquivo inteiro. */
function inFile(find, replace) {
	return (src) => (src.includes(find) ? src.replace(find, () => replace) : null);
}

/** True se a 1ª diferença entre os textos cai numa linha de comentário (mutação inútil). */
function touchesComment(before, after) {
	let i = 0;
	while (i < before.length && before[i] === after[i]) i++;
	const lineStart = before.lastIndexOf("\n", i - 1) + 1;
	let lineEnd = before.indexOf("\n", i);
	if (lineEnd === -1) lineEnd = before.length;
	const line = before.slice(lineStart, lineEnd).trim();
	return line.startsWith("//") || line.startsWith("*") || line.startsWith("/*");
}

const NOT_FOUND_IF = 'if ((result.rowCount ?? 0) === 0) throw new NotFoundError("subgroup", id);';
const DUP_IF = 'if (isUniqueViolation(err)) throw new DuplicateNameError("subgroup");';

const MUTATIONS = [
	["M01 create sem assertScopeNotEmpty", inMethod("create", "assertScopeNotEmpty(data.scope);", "")],
	["M02 código 23505 trocado por 23506", inFile('codeOf(err) === "23505"', 'codeOf(err) === "23506"')],
	["M03 withTransaction sem ROLLBACK", inFile('await client.query("ROLLBACK");', "")],
	["M04 listByGroup ordena por name (sem norm_name)", inFile("ORDER BY norm_name(name), id", "ORDER BY name, id")],
	["M05 listByGroup sem checar se o grupo existe", inMethod("listByGroup", 'if ((group.rowCount ?? 0) === 0) throw new NotFoundError("group", groupId);', "")],
	["M06 listByGroup sem filtrar por group_id", inFile("WHERE group_id = $1", "WHERE $1::int IS NOT NULL")],
	["M07 findById ignora os vínculos", inMethod("findById", "row, links.get(id) ?? []", "row, []")],
	["M08 findById não devolve null", inMethod("findById", "if (row === undefined) return null;", "")],
	["M09 listByGroup ignora os vínculos", inMethod("listByGroup", "rows.map((r) => r.id),", "[],")],
	["M10 create sem converter 23505", inMethod("create", DUP_IF, "")],
	["M11 create sem converter FK de grupo", inMethod("create", 'if (isMissingGroup(err)) throw new NotFoundError("group", data.groupId);', "")],
	["M12 isMissingGroup converte qualquer 23503", inFile(' && constraintOf(err) === GROUP_FK', "")],
	["M13 create troca url e logoUrl", inMethod("create", "data.url ?? null, data.logoUrl ?? null", "data.logoUrl ?? null, data.url ?? null")],
	["M14 insertLinks general sem WHERE is_universal", inFile('FROM discipline WHERE is_universal",', 'FROM discipline",')],
	["M15 insertLinks specific ignora scope.ids", inFile("[subgroupId, [...scope.ids]]", "[subgroupId, []]")],
	["M16 update ignora groupId", inMethod("update", "sets.push(`group_id = $${values.length}`);", "")],
	["M17 update url só se truthy", inMethod("update", "if (data.url !== undefined) {", "if (data.url) {")],
	["M18 update logoUrl só se truthy", inMethod("update", "if (data.logoUrl !== undefined) {", "if (data.logoUrl) {")],
	["M19 update sem checar id no ramo vazio", inMethod("update", 'if ((exists.rowCount ?? 0) === 0) throw new NotFoundError("subgroup", id);', "")],
	["M20 update sem NotFoundError após UPDATE", inMethod("update", NOT_FOUND_IF, "")],
	["M21 update sem converter 23505", inMethod("update", DUP_IF, "")],
	["M22 update sem converter FK de grupo", inMethod("update", "if (isMissingGroup(err) && data.groupId !== undefined)", "if (false)")],
	["M23 setActive sem NotFoundError", inMethod("setActive", NOT_FOUND_IF, "")],
	["M24 setActive grava sempre true", inMethod("setActive", "[id, active]", "[id, true]")],
	["M25 setScope sem assertScopeNotEmpty", inMethod("setScope", "assertScopeNotEmpty(scope);", "")],
	["M26 setScope sem DELETE dos vínculos antigos", inFile('"DELETE FROM subgroup_discipline WHERE subgroup_id = $1"', '"SELECT $1::int"')],
	["M27 setScope sem NotFoundError", inMethod("setScope", NOT_FOUND_IF, "")],
];

const original = readFileSync(TARGET, "utf8");

/** Aplica a mutação e recusa as que não mudam nada ou que só mexem em comentário. */
function apply(fn) {
	const m = fn(original);
	if (m === null || m === original) return { m: null, why: "trecho não encontrado" };
	if (touchesComment(original, m)) return { m: null, why: "caiu em comentário" };
	return { m };
}

// --only=M05,M06 roda só as mutações listadas
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice(7).split(",") : null;
const SELECTED = MUTATIONS.filter(([name]) => !ONLY || ONLY.includes(name.slice(0, 3)));

function restore() {
	if (existsSync(BACKUP)) {
		writeFileSync(TARGET, readFileSync(BACKUP, "utf8"));
		unlinkSync(BACKUP);
	}
}

// Sobra de execução interrompida: restaura antes de qualquer coisa
if (existsSync(BACKUP)) {
	console.log("Backup de execução anterior encontrado: restaurando o adaptador.");
	restore();
}
process.on("SIGINT", () => {
	restore();
	process.exit(130);
});

function runTests() {
	const out = join(tmpdir(), `mut-${process.pid}.json`);
	const res = spawnSync(
		process.execPath,
		["--env-file=.env", "./node_modules/vitest/vitest.mjs", "run", "--config", "vitest.integration.config.ts", TEST_FILE, "--reporter=json", `--outputFile=${out}`],
		{ encoding: "utf8" },
	);
	let failed = [];
	let total = 0;
	let parsed = false;
	if (existsSync(out)) {
		try {
			const json = JSON.parse(readFileSync(out, "utf8"));
			parsed = true;
			total = json.numTotalTests ?? 0;
			for (const file of json.testResults ?? []) {
				for (const t of file.assertionResults ?? []) {
					if (t.status === "failed") failed.push(t.fullName ?? t.title);
				}
			}
		} catch {
			parsed = false;
		}
		unlinkSync(out);
	}
	return { code: res.status, failed, total, parsed };
}

const results = [];

if (DRY) {
	for (const [name, fn] of SELECTED) {
		const { why } = apply(fn);
		const ok = why === undefined;
		console.log(`${ok ? "OK       " : "PROBLEMA "} ${name}${ok ? "" : ` (${why})`}`);
		results.push(ok);
	}
	console.log(results.every(Boolean) ? "\nTodas as mutações se aplicam." : "\nAlguma mutação não se aplica ao arquivo atual.");
	process.exit(results.every(Boolean) ? 0 : 1);
}

console.log("Rodando a base (sem mutação)...");
const base = runTests();
if (base.code !== 0 || !base.parsed) {
	console.log("A base não está verde: corrija os testes antes de mutar.", base.failed.slice(0, 5));
	process.exit(1);
}
console.log(`Base verde (${base.total} testes).\n`);

try {
	for (const [name, fn] of SELECTED) {
		const { m: mutated, why } = apply(fn);
		if (mutated === null) {
			console.log(`?  ${name}: não aplicada (${why})`);
			results.push({ name, status: "NÃO APLICADA", failed: [] });
			continue;
		}
		writeFileSync(BACKUP, original);
		writeFileSync(TARGET, mutated);
		const r = runTests();
		restore();
		let status;
		if (!r.parsed) status = "ERRO DE EXECUÇÃO";
		else if (r.code === 0) status = "SOBREVIVEU";
		else if (r.failed.length === 0) status = "ERRO DE EXECUÇÃO";
		else status = "morta";
		const mark = status === "morta" ? "✓" : "✗";
		console.log(`${mark}  ${name}: ${status}${r.failed.length ? ` (${r.failed.length} teste(s) vermelho(s))` : ""}`);
		results.push({ name, status, failed: r.failed });
	}
} finally {
	restore();
	writeFileSync(TARGET, original);
}

console.log("\n===== RESUMO =====");
const survived = results.filter((r) => r.status !== "morta");
console.log(`Mortas: ${results.length - survived.length} de ${results.length}`);
for (const r of survived) console.log(`  ${r.status}: ${r.name}`);
console.log("\nTestes que pegaram cada mutação (primeiro de cada):");
for (const r of results.filter((x) => x.status === "morta")) console.log(`  ${r.name} -> ${r.failed[0]}`);
console.log("\nAdaptador restaurado ao estado original.");
