// scripts/migration-checksum.ts
// Checksum das migrations: o migrate.ts usa para detectar arquivo alterado depois de aplicado.

import { createHash } from "node:crypto";

function sha256(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

/**
 * Checksum canônico de uma migration: o hash do SQL com fim de linha LF.
 * É o valor que o migrate grava. Normalizar evita que o mesmo conteúdo gere
 * checksums diferentes por causa de LF/CRLF (git no Windows, editor, etc.).
 */
export function canonicalChecksum(sql: string): string {
	return sha256(sql.replace(/\r\n/g, "\n"));
}

/**
 * Diz se o checksum gravado vale para este SQL, ignorando só a diferença de fim de linha.
 * Aceita três formas do mesmo conteúdo: o texto como está (migrations antigas foram
 * gravadas assim, algumas com CRLF), o LF canônico e o CRLF completo.
 * Mudança de conteúdo continua sendo recusada.
 */
export function matchesStoredChecksum(sql: string, stored: string): boolean {
	const lf = sql.replace(/\r\n/g, "\n");
	const accepted = [sha256(sql), sha256(lf), sha256(lf.replace(/\n/g, "\r\n"))];
	return accepted.includes(stored);
}
