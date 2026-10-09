// scripts/mutate.mjs
//
// Executor único de testes de mutação. Aplica UMA mutação por vez no arquivo-alvo, roda
// os testes e restaura o arquivo. A mutação "morre" se algum teste ficar vermelho;
// se tudo continua verde, ela "sobrevive" (teste fraco). Travar (timeout) conta como morta.
//
// As mutações de cada alvo ficam em scripts/mutation/configs/<nome>.mjs.
//
// Uso:
//   npm run mutate                      lista as configs disponíveis
//   npm run mutate -- session           roda a config "session"
//   npm run mutate -- all               roda todas, em sequência
//   npm run mutate -- session --dry     só confere se cada trecho existe no arquivo
//   npm run mutate -- session --only=M05,M06
//   npm run mutate -- session --no-bail mostra todos os testes vermelhos (mais lento)

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { touchesComment } from "./mutation/helpers.mjs";

const CONFIG_DIR = join(dirname(fileURLToPath(import.meta.url)), "mutation", "configs");
const TIMEOUT_MS = 180_000;

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const BAIL = !args.includes("--no-bail");
const onlyArg = args.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice(7).split(",") : null;
const wanted = args.find((a) => !a.startsWith("--"));

const available = readdirSync(CONFIG_DIR)
	.filter((f) => f.endsWith(".mjs"))
	.map((f) => f.slice(0, -4))
	.sort();

/** Formata milissegundos como "1m 05s". */
function fmt(ms) {
	const total = Math.round(ms / 1000);
	return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, "0")}s`;
}

if (!wanted) {
	console.log("Configs disponíveis:");
	for (const name of available) console.log(`  ${name}`);
	console.log("\nUso: npm run mutate -- <config|all> [--dry] [--only=M01,M02] [--no-bail]");
	process.exit(0);
}

const names = wanted === "all" ? available : [wanted];
for (const n of names) {
	if (!available.includes(n)) {
		console.error(`Config "${n}" não existe. Disponíveis: ${available.join(", ")}`);
		process.exit(2);
	}
}

// Arquivo-alvo em mutação agora, para o Ctrl+C restaurar
let activeRestore = null;
process.on("SIGINT", () => {
	activeRestore?.();
	process.exit(130);
});

/** Roda o vitest sobre o arquivo de teste e resume o resultado. */
function runTests(config) {
	const out = join(tmpdir(), `mut-${process.pid}.json`);
	const vitestArgs =
		config.kind === "unit"
			? ["./node_modules/vitest/vitest.mjs", "run", config.testFile]
			: ["--env-file=.env", "./node_modules/vitest/vitest.mjs", "run", "--config", "vitest.integration.config.ts", config.testFile];
	if (BAIL) vitestArgs.push("--bail=1");
	vitestArgs.push("--reporter=json", `--outputFile=${out}`);

	const res = spawnSync(process.execPath, vitestArgs, { encoding: "utf8", timeout: TIMEOUT_MS });
	// Travou (ex.: conexões vazadas esgotam o pool): conta como mutação morta
	if (res.error?.code === "ETIMEDOUT") return { code: 1, failed: ["travou (timeout)"], total: 0, parsed: true };

	const failed = [];
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

/** Roda todas as mutações de uma config. @returns quantas NÃO morreram. */
function runConfig(name, config) {
	const { target, testFile } = config;
	const backup = `${target}.mutation-backup`;
	const restore = () => {
		if (existsSync(backup)) {
			writeFileSync(target, readFileSync(backup));
			unlinkSync(backup);
		}
	};

	if (existsSync(backup)) {
		console.log("Backup de execução anterior encontrado: restaurando o alvo.");
		restore();
	}

	const original = readFileSync(target, "utf8");
	// Os trechos são casados em texto com \n; o CRLF do Windows é devolvido na gravação
	const crlf = original.includes("\r\n");
	const normalized = original.replace(/\r\n/g, "\n");

	/** Aplica a mutação e recusa as que não mudam nada ou que só mexem em comentário. */
	function apply(fn) {
		const m = fn(normalized);
		if (m === null || m === normalized) return { m: null, why: "trecho não encontrado" };
		if (touchesComment(normalized, m)) return { m: null, why: "caiu em comentário" };
		return { m: crlf ? m.replace(/\n/g, "\r\n") : m };
	}

	const selected = config.mutations.filter(([n]) => !ONLY || ONLY.includes(n.slice(0, 3)));
	console.log(`\n===== ${name}: ${selected.length} mutações em ${target} =====`);

	if (DRY) {
		let allOk = true;
		for (const [mutName, fn] of selected) {
			const { why } = apply(fn);
			if (why) allOk = false;
			console.log(`${why ? "PROBLEMA " : "OK       "} ${mutName}${why ? ` (${why})` : ""}`);
		}
		console.log(allOk ? "Todas as mutações se aplicam." : "Alguma mutação não se aplica ao arquivo atual.");
		return allOk ? 0 : 1;
	}

	console.log("Rodando a base (sem mutação)...");
	const base = runTests(config);
	if (base.code !== 0 || !base.parsed) {
		console.log("A base não está verde: corrija os testes antes de mutar.", base.failed.slice(0, 5));
		return 1;
	}
	console.log(`Base verde (${base.total} testes).\n`);

	const results = [];
	const startedAt = Date.now();
	activeRestore = restore;
	try {
		for (const [mutName, fn] of selected) {
			const { m: mutated, why } = apply(fn);
			if (mutated === null) {
				console.log(`?  ${mutName}: não aplicada (${why})`);
				results.push({ name: mutName, status: "NÃO APLICADA", failed: [] });
				continue;
			}
			console.log(`▶  ${mutName} rodando... (${results.length + 1}/${selected.length})`);
			const t0 = Date.now();
			writeFileSync(backup, original);
			writeFileSync(target, mutated);
			const r = runTests(config);
			restore();

			let status;
			if (!r.parsed || r.failed.length === 0 && r.code !== 0) status = "ERRO DE EXECUÇÃO";
			else if (r.code === 0) status = "SOBREVIVEU";
			else status = "morta";
			console.log(`${status === "morta" ? "✓" : "✗"}  ${mutName}: ${status}${r.failed.length ? ` (${r.failed.length} teste(s) vermelho(s))` : ""}`);

			const elapsed = Date.now() - startedAt;
			const done = results.length + 1;
			console.log(`   levou ${fmt(Date.now() - t0)} | total ${fmt(elapsed)} | falta ~${fmt((elapsed / done) * (selected.length - done))}`);
			results.push({ name: mutName, status, failed: r.failed });
		}
	} finally {
		restore();
		writeFileSync(target, original);
		activeRestore = null;
	}

	const survived = results.filter((r) => r.status !== "morta");
	console.log(`\n----- RESUMO ${name} -----`);
	console.log(`Mortas: ${results.length - survived.length} de ${results.length}  |  tempo: ${fmt(Date.now() - startedAt)}`);
	for (const r of survived) console.log(`  ${r.status}: ${r.name}`);
	console.log("\nTeste que pegou cada mutação:");
	for (const r of results.filter((x) => x.status === "morta")) console.log(`  ${r.name} -> ${r.failed[0]}`);
	console.log(`\n${target} restaurado ao estado original (teste: ${testFile}).`);
	return survived.length;
}

let problems = 0;
for (const name of names) {
	const config = (await import(pathToFileURL(join(CONFIG_DIR, `${name}.mjs`)).href)).default;
	problems += runConfig(name, config);
}
if (names.length > 1) console.log(`\n===== TOTAL: ${problems === 0 ? (DRY ? "tudo se aplica" : "tudo morto") : `${problems} mutação(ões) com problema`} =====`);
process.exit(problems === 0 ? 0 : 1);
