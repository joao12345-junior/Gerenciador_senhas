// scripts/mutate-session-repository.mjs
//
// Teste de mutação manual do PostgresSessionRepository: aplica UMA mutação por vez no
// adaptador, roda os testes de integração e restaura o arquivo. Uma mutação "morre"
// quando algum teste fica vermelho; se tudo continua verde, ela "sobrevive" (teste fraco).
//
// Uso:  node scripts/mutate-session-repository.mjs         (roda tudo, ~5 min)
//       node scripts/mutate-session-repository.mjs --dry   (só confere se cada trecho existe)

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const TARGET = "src/adapters/persistence/postgres-session-repository.ts";
const TEST_FILE = "tests/integration/postgres-session-repository.test.ts";
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

const MUTATIONS = [
	["M01 findByTokenHash sem WHERE (devolve a 1ª sessão)", inMethod("findByTokenHash", "WHERE token_hmac = $1", "WHERE $1::text IS NOT NULL")],
	["M02 findByTokenHash não devolve null", inMethod("findByTokenHash", "if (row === undefined) return null;", "")],
	["M03 insertSession grava ip no lugar do user_agent", inFile("data.ip,\n\t\t\t\tdata.userAgent,", "data.userAgent,\n\t\t\t\tdata.ip,")],
	["M04 insertSession grava mfaVerifiedAt nulo", inFile("data.mfaVerifiedAt,", "null,")],
	["M05 insertSession grava expiresAt errado (+1 s)", inFile("data.expiresAt,", "new Date(data.expiresAt.getTime() + 1000),")],
	["M06 rotate sem checar se o DELETE apagou algo", inMethod("rotate", "if (rows.length === 0) return null;", "")],
	["M07 rotate checa rows.length === 1 invertido", inMethod("rotate", "rows.length === 0", "rows.length !== 0")],
	["M08 withTransaction sem BEGIN (cada comando vira commit próprio)", inFile('await client.query("BEGIN");', "")],
	["M09 rotate apaga por user_id em vez de id", inMethod("rotate", "DELETE FROM session WHERE id = $1 RETURNING id", "DELETE FROM session WHERE user_id = $1 RETURNING id")],
	["M10 rotate insere antes de apagar", inMethod("rotate", "const { rows } = await client.query(\n\t\t\t\t`DELETE FROM session WHERE id = $1 RETURNING id`,\n\t\t\t\t[oldId],\n\t\t\t);", "const created = await this.insertSession(client, data);\n\t\t\tconst { rows } = await client.query(\n\t\t\t\t`DELETE FROM session WHERE id = $1 RETURNING id`,\n\t\t\t\t[oldId],\n\t\t\t);\n\t\t\tif (rows.length > 0) return created;")],
	["M11 withTransaction sem ROLLBACK", inFile('await client.query("ROLLBACK");', "")],
	["M12 withTransaction sem release", inFile("client.release();", "")],
	["M13 withTransaction sem COMMIT", inFile('await client.query("COMMIT");', "")],
	["M14 touch sem a guarda last_seen_at < $2", inFile(" AND last_seen_at < $2", "")],
	["M15 touch com < trocado por >", inMethod("touch", "last_seen_at < $2", "last_seen_at > $2")],
	["M16 touch sem filtrar por id", inFile("WHERE id = $1 AND last_seen_at < $2", "WHERE $1::int IS NOT NULL AND last_seen_at < $2")],
	["M17 touch com parâmetros trocados", inMethod("touch", "[id, at],", "[at, id],")],
	["M18 delete sem filtrar por id", inMethod("delete", "DELETE FROM session WHERE id = $1", "DELETE FROM session WHERE $1::int IS NOT NULL")],
	["M19 deleteAllForUser sem filtrar por usuário", inMethod("deleteAllForUser", "WHERE user_id = $1", "WHERE $1::int IS NOT NULL")],
	["M20 deleteAllForUser devolve sempre 0", inMethod("deleteAllForUser", "return rowCount ?? 0;", "return 0;")],
	["M21 deleteExpired com < em vez de <=", inMethod("deleteExpired", "expires_at <= $1", "expires_at < $1")],
	["M22 deleteExpired com sentido invertido", inMethod("deleteExpired", "expires_at <= $1", "expires_at >= $1")],
	["M23 deleteExpired devolve sempre 0", inMethod("deleteExpired", "return rowCount ?? 0;", "return 0;")],
	["M24 deleteExpired olha last_seen_at em vez de expires_at", inMethod("deleteExpired", "expires_at <= $1", "last_seen_at <= $1")],
	["M25 insertSession ignora o client da transação (usa sempre o pool)", inFile("const { rows } = await db.query<SessionRow>(", "const { rows } = await this.pool.query<SessionRow>(")],
];

const original = readFileSync(TARGET, "utf8");

/** Aplica a mutação e recusa as que não mudam nada ou que só mexem em comentário. */
const CRLF = original.includes("\r\n");
const normalized = original.replace(/\r\n/g, "\n");
function apply(fn) {
	const m = fn(normalized);
	if (m === null || m === normalized) return { m: null, why: "trecho não encontrado" };
	if (touchesComment(normalized, m)) return { m: null, why: "caiu em comentário" };
	return { m: CRLF ? m.replace(/\n/g, "\r\n") : m };
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
		["--env-file=.env", "./node_modules/vitest/vitest.mjs", "run", "--config", "vitest.integration.config.ts", TEST_FILE, "--bail=1", "--reporter=json", `--outputFile=${out}`],
		{ encoding: "utf8", timeout: 180_000 },
	);
	// Travou (ex.: conexões vazadas esgotam o pool): conta como mutação morta
	if (res.error?.code === "ETIMEDOUT") return { code: 1, failed: ["travou (timeout)"], total: 0, parsed: true };
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

/** Formata milissegundos como "1m 05s". */
function fmt(ms) {
	const total = Math.round(ms / 1000);
	return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}
const startedAt = Date.now();

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
		console.log(`▶  ${name} rodando... (${results.length + 1}/${SELECTED.length})`);
		const t0 = Date.now();
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
		const elapsed = Date.now() - startedAt;
		const done = results.length + 1;
		const eta = (elapsed / done) * (SELECTED.length - done);
		console.log(`   levou ${fmt(Date.now() - t0)} | total ${fmt(elapsed)} | falta ~${fmt(eta)}`);
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
console.log(`\nTempo total: ${fmt(Date.now() - startedAt)}`);
console.log("\nAdaptador restaurado ao estado original.");
