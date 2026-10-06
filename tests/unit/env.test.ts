// tests/unit/env.test.ts

import { describe, expect, it } from "vitest";
import { parseEnv } from "@/config/env";

/** base64 de 32 bytes preenchidos com o mesmo número. Cada número gera uma chave diferente. */
const key = (n: number) => Buffer.alloc(32, n).toString("base64");

const VALID = {
	DATABASE_URL: "postgres://x",
	LOGDASH_DATABASE_URL: "postgres://y",
	MASTER_KEY_V1: key(1),
	SESSION_PEPPER: key(2),
	RECOVERY_PEPPER: key(3),
	AUTH_MAC_KEY: key(4),
	RESEND_API_KEY: "re_teste_123",
	MAIL_FROM: "cofre@optare.com.br",
};

/** Executa `fn` e devolve a mensagem do erro lançado ("" se não lançar). */
function errorMessage(fn: () => unknown): string {
	try {
		fn();
	} catch (error) {
		return (error as Error).message;
	}
	return "";
}

describe("parseEnv", () => {
	it("aceita um ambiente válido", () => {
		expect(() => parseEnv(VALID)).not.toThrow();
	});

	it("recusa variável obrigatória ausente", () => {
		const { DATABASE_URL: _removida, ...semDatabaseUrl } = VALID;
		expect(() => parseEnv(semDatabaseUrl)).toThrow(/DATABASE_URL/);
	});

	it("recusa chave que não tem 32 bytes", () => {
		const curta = Buffer.alloc(16, 1).toString("base64");
		expect(() => parseEnv({ ...VALID, MASTER_KEY_V1: curta })).toThrow(
			/MASTER_KEY_V1/,
		);
	});

	it("recusa chave com lixo no lugar de base64", () => {
		const lixo = `${"!".repeat(43)}=`;
		expect(() => parseEnv({ ...VALID, SESSION_PEPPER: lixo })).toThrow(
			/SESSION_PEPPER/,
		);
	});

	it("recusa chaves repetidas e diz com qual ela se repete", () => {
		const repetida = { ...VALID, AUTH_MAC_KEY: VALID.SESSION_PEPPER };
		expect(() => parseEnv(repetida)).toThrow(
			/AUTH_MAC_KEY: igual a SESSION_PEPPER/,
		);
	});

	it("recusa a mesma chave escrita com texto diferente (mesmos bytes)", () => {
		// O último caractere antes do "=" carrega 4 bits úteis e 2 bits ignorados:
		// trocar por um vizinho muda o texto, mas não os bytes decodificados.
		const alfabeto =
			"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		const original = VALID.SESSION_PEPPER;
		const ultimo = original.charAt(42);
		const vizinho = alfabeto.charAt(alfabeto.indexOf(ultimo) + 1);
		const mesmosBytes = `${original.slice(0, 42)}${vizinho}=`;

		expect(mesmosBytes).not.toBe(original);
		expect(Buffer.from(mesmosBytes, "base64")).toEqual(
			Buffer.from(original, "base64"),
		);
		expect(() => parseEnv({ ...VALID, AUTH_MAC_KEY: mesmosBytes })).toThrow(
			/AUTH_MAC_KEY: igual a SESSION_PEPPER/,
		);
	});

	it("o erro lista só nomes, nunca o valor de uma chave", () => {
		const repetida = { ...VALID, AUTH_MAC_KEY: VALID.SESSION_PEPPER };
		const message = errorMessage(() => parseEnv(repetida));

		expect(message).toContain("AUTH_MAC_KEY");
		expect(message).not.toContain(VALID.SESSION_PEPPER);
	});

	it("LOGDASH_DB_SSL ausente vira false", () => {
		expect(parseEnv(VALID).LOGDASH_DB_SSL).toBe(false);
	});

	it("LOGDASH_DB_SSL 'true' vira true", () => {
		expect(parseEnv({ ...VALID, LOGDASH_DB_SSL: "true" }).LOGDASH_DB_SSL).toBe(
			true,
		);
	});

	it("recusa LOGDASH_DB_SSL com valor fora de true/false", () => {
		expect(() => parseEnv({ ...VALID, LOGDASH_DB_SSL: "talvez" })).toThrow(
			/LOGDASH_DB_SSL/,
		);
	});

	it("recusa RESEND_API_KEY ausente", () => {
		const { RESEND_API_KEY: _removida, ...semChave } = VALID;
		expect(() => parseEnv(semChave)).toThrow(/RESEND_API_KEY/);
	});

	it("recusa RESEND_API_KEY sem o prefixo 're_'", () => {
		expect(() => parseEnv({ ...VALID, RESEND_API_KEY: "sem_prefixo" })).toThrow(
			/RESEND_API_KEY/,
		);
	});

	it("recusa MAIL_FROM ausente", () => {
		const { MAIL_FROM: _removida, ...semRemetente } = VALID;
		expect(() => parseEnv(semRemetente)).toThrow(/MAIL_FROM/);
	});

	it("recusa MAIL_FROM que não é e-mail", () => {
		expect(() => parseEnv({ ...VALID, MAIL_FROM: "email" })).toThrow(
			/MAIL_FROM/,
		);
	});

	it("o erro de uma RESEND_API_KEY inválida não contém o valor dela", () => {
		const segredo = "segredo-sem-prefixo";
		const message = errorMessage(() =>
			parseEnv({ ...VALID, RESEND_API_KEY: segredo }),
		);

		expect(message).toContain("RESEND_API_KEY"); // sem isto o teste passa vazio, sem erro nenhum
		expect(message).not.toContain(segredo);
	});
});
