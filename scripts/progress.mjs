// scripts/progress.mjs
// Lê docs/progresso.md e imprime o percentual por bloco e o total ponderado.
// Uso: npm run progress

import { readFileSync } from "node:fs";

const FILE = new URL("../docs/progresso.md", import.meta.url);
const HEADER = /^##\s+(.+?)\s+\(peso\s+(\d+)\)\s*$/;
const ITEM = /^- \[( |x|X)\]\s+/;

/** @type {{name: string, weight: number, done: number, total: number}[]} */
const blocks = [];
for (const line of readFileSync(FILE, "utf8").split(/\r?\n/)) {
	const header = HEADER.exec(line);
	if (header) {
		blocks.push({ name: header[1], weight: Number(header[2]), done: 0, total: 0 });
		continue;
	}
	const item = ITEM.exec(line);
	const current = blocks.at(-1);
	if (item && current) {
		current.total += 1;
		if (item[1] !== " ") current.done += 1;
	}
}

if (blocks.length === 0) throw new Error("nenhum bloco '## Nome (peso N)' em docs/progresso.md");
const weightSum = blocks.reduce((s, b) => s + b.weight, 0);
if (weightSum !== 100) console.warn(`aviso: pesos somam ${weightSum}, não 100 (o total é normalizado)`);

const bar = (ratio) => {
	const filled = Math.round(ratio * 20);
	return "█".repeat(filled) + "░".repeat(20 - filled);
};

let total = 0;
const width = Math.max(...blocks.map((b) => b.name.length));
for (const b of blocks) {
	if (b.total === 0) throw new Error(`bloco sem itens: ${b.name}`);
	const ratio = b.done / b.total;
	total += (ratio * b.weight) / weightSum;
	console.log(
		`${b.name.padEnd(width)}  ${bar(ratio)}  ${String(Math.round(ratio * 100)).padStart(3)}%  (${b.done}/${b.total}, peso ${b.weight})`,
	);
}
console.log(`\nTOTAL  ${bar(total)}  ${(total * 100).toFixed(1)}%`);
