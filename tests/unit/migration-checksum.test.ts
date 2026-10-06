// tests/unit/migration-checksum.test.ts

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	canonicalChecksum,
	matchesStoredChecksum,
} from "../../scripts/migration-checksum";

const sha256 = (text: string) =>
	createHash("sha256").update(text).digest("hex");

const LF = "ALTER TABLE t ADD COLUMN a integer;\nCREATE INDEX i ON t (a);\n";
const CRLF = LF.replace(/\n/g, "\r\n");

describe("canonicalChecksum", () => {
	it("é igual para o mesmo SQL com fim de linha LF ou CRLF", () => {
		expect(canonicalChecksum(CRLF)).toBe(canonicalChecksum(LF));
	});

	it("muda quando o conteúdo muda", () => {
		expect(canonicalChecksum(LF.replace("integer", "text"))).not.toBe(
			canonicalChecksum(LF),
		);
	});
});

describe("matchesStoredChecksum", () => {
	it("aceita o checksum gravado a partir de LF quando o arquivo está em CRLF", () => {
		expect(matchesStoredChecksum(CRLF, sha256(LF))).toBe(true);
	});

	it("aceita o checksum antigo (CRLF cru) quando o arquivo passou para LF", () => {
		expect(matchesStoredChecksum(LF, sha256(CRLF))).toBe(true);
	});

	it("aceita o checksum antigo quando o arquivo continua exatamente igual", () => {
		expect(matchesStoredChecksum(CRLF, sha256(CRLF))).toBe(true);
	});

	it("aceita o checksum antigo de um arquivo com fim de linha misto, sem mudança", () => {
		const misto = "linha 1\r\nlinha 2\nlinha 3\r\n";
		expect(matchesStoredChecksum(misto, sha256(misto))).toBe(true);
	});

	it("recusa quando o conteúdo mudou, mesmo com o mesmo fim de linha", () => {
		const alterado = LF.replace("integer", "text");
		expect(matchesStoredChecksum(alterado, sha256(LF))).toBe(false);
		expect(matchesStoredChecksum(alterado.replace(/\n/g, "\r\n"), sha256(CRLF))).toBe(false);
	});

	it("recusa um checksum que não corresponde a nada", () => {
		expect(matchesStoredChecksum(LF, "")).toBe(false);
		expect(matchesStoredChecksum(LF, "abc")).toBe(false);
	});
});
