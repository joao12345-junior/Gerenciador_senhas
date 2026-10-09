// scripts/mutation/helpers.mjs
//
// Construtores de mutação usados pelos arquivos em scripts/mutation/configs/.
// Cada helper devolve uma função (fonte) => fonte mutada, ou null se o trecho não existe.

/** Troca a 1ª ocorrência de `find` por `replace` dentro do corpo do método `name`. */
export function inMethod(name, find, replace) {
	return (src) => {
		const start = src.indexOf(`async ${name}(`);
		if (start === -1) return null;
		const end = src.indexOf("\n\t}\n", start);
		const body = src.slice(start, end);
		if (!body.includes(find)) return null;
		return src.slice(0, start) + body.replace(find, () => replace) + src.slice(end);
	};
}

/** Troca a 1ª ocorrência de `find` por `replace` no arquivo inteiro. */
export function inFile(find, replace) {
	return (src) => (src.includes(find) ? src.replace(find, () => replace) : null);
}

/** True se a 1ª diferença entre os textos cai numa linha de comentário (mutação inútil). */
export function touchesComment(before, after) {
	let i = 0;
	while (i < before.length && before[i] === after[i]) i++;
	const lineStart = before.lastIndexOf("\n", i - 1) + 1;
	let lineEnd = before.indexOf("\n", i);
	if (lineEnd === -1) lineEnd = before.length;
	const line = before.slice(lineStart, lineEnd).trim();
	return line.startsWith("//") || line.startsWith("*") || line.startsWith("/*");
}
