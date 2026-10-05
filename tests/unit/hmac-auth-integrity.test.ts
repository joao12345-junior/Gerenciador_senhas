// tests/unit/hmac-auth-integrity.test.ts

import type { AuthFields } from "@/core/ports/auth-integrity";
import { describe, expect, it } from "vitest";
import { HmacAuthIntegrity } from "@/adapters/crypto/hmac-auth-integrity";

describe("HMAC-Auth-Test", () => {
	const KEY_A = Buffer.alloc(32, 1);
	const KEY_B = Buffer.alloc(32, 2);

	const BASE: AuthFields = {
		id: 1,
		email: "ana@optare.com.br",
		role: "usuario",
		passwordHash: "hash-exemplo",
		totpSecretEnc: "segredo-cifrado",
		totpEnabledAt: new Date("2026-01-01T00:00:00Z"),
		mustChangePassword: false,
		deactivatedAt: null,
		deletedAt: null,
	};

	// Grupo 1
	it("Mesma entrada e chave geram mesmo MAC", () => {
		const integrity = new HmacAuthIntegrity(KEY_A);

		const primeiro = integrity.sign(BASE);
		const segundo = integrity.sign(BASE);

		expect(primeiro).toBe(segundo);
	});
	it("Chaves diferentes geram MAC diferente", () => {
		const integrity1 = new HmacAuthIntegrity(KEY_A);
		const integrity2 = new HmacAuthIntegrity(KEY_B);

		const primeiro = integrity1.sign(BASE);
		const segundo = integrity2.sign(BASE);
		expect(primeiro).not.toBe(segundo);
	});
	it("Campos diferentes não iguais", () => {
		const integrity = new HmacAuthIntegrity(KEY_A);

		const primeiro = integrity.sign(BASE);
		const segundo = integrity.sign({ ...BASE, id: 2 });
		expect(primeiro).not.toBe(segundo);
	});
	it("Formato hexadecimal 64", () => {
		const integrity = new HmacAuthIntegrity(KEY_A);
		const mac = integrity.sign(BASE);
		expect(mac).toMatch(/^[0-9a-f]{64}$/);
	});

	//Grupo 2
	it("Ida e volta do verify", () => {
		const integrity = new HmacAuthIntegrity(KEY_A);
		const mac = integrity.sign(BASE);
		expect(integrity.verify(BASE, mac)).toBe(true);
	});
	it("Outra Chave dentro do verify", () => {
		const integrity1 = new HmacAuthIntegrity(KEY_A);
		const integrity2 = new HmacAuthIntegrity(KEY_B);
		expect(integrity1.verify(BASE, integrity2.sign(BASE))).toBe(false);
	});

	// Grupo 3
	it.each<[string, Partial<AuthFields>]>([
		["id", { id: 2 }],
		["email", { email: "outro@optare.com.br" }],
		["role", { role: "admin" }],
		["passwordHash", { passwordHash: "senha-forte-hash" }],
		["totpSecretEnc", { totpSecretEnc: "abcdf1234" }],
		["totpSecretEnc zerado", { totpSecretEnc: null }],
		["totpEnabledAt", { totpEnabledAt: new Date("2026-06-01T00:00:00Z") }],
		["totpEnabledAt nulo", { totpEnabledAt: null }],
		["mustChangePassword", { mustChangePassword: true }],
		["deactivatedAt", { deactivatedAt: new Date("2026-01-01T00:00:00Z") }],
		["deletedAt", { deletedAt: new Date("2026-01-01T00:00:00Z") }],
	])("verify recusa se %s for adulterado", (_campo, alteracao) => {
		const integrity = new HmacAuthIntegrity(KEY_A);
		const mac = integrity.sign(BASE);

		const adulterada = { ...BASE, ...alteracao };

		expect(integrity.verify(adulterada, mac)).toBe(false);
	});

	// Grupo 4
	it("verify recusa MAC curto", () => {
		const integrity = new HmacAuthIntegrity(KEY_A);
		expect(integrity.verify(BASE, "abc")).toBe(false);
	});
	it("verify recusa MAC vazio", () => {
		const integrity = new HmacAuthIntegrity(KEY_A);
		expect(integrity.verify(BASE, "")).toBe(false);
	});
	it("verify recusa MAC do tamanho certo mas errado", () => {
		const integrity = new HmacAuthIntegrity(KEY_A);
		expect(integrity.verify(BASE, "0".repeat(64))).toBe(false);
	});
	it("null e a string 'null' geram MACs diferentes", () => {
		const integrity = new HmacAuthIntegrity(KEY_A);

		const macNull = integrity.sign({ ...BASE, totpSecretEnc: null });
		const macString = integrity.sign({ ...BASE, totpSecretEnc: "null" });
		expect(macNull).not.toBe(macString);
	});
});
