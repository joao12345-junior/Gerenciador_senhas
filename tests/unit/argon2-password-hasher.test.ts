// tests/unit/argon2-password-hasher.test.ts

import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "@/adapters/crypto/argon2-password-hasher";
import argon2 from "argon2";

const TIMEOUT = 20_000;

describe("Argon2PasswordHasher", () => {
	const hasher = new Argon2PasswordHasher();

	it("verifica a senha correta", { timeout: TIMEOUT }, async () => {
		const hash = await hasher.hash("senha-forte-123");
		expect(await hasher.verify(hash, "senha-forte-123")).toBe(true);
	});

	it("rejeita senha errada", { timeout: TIMEOUT }, async () => {
		const hash = await hasher.hash("senha-forte-123");
		expect(await hasher.verify(hash, "outra-senha")).toBe(false);
	});

	it(
		"hashes de mesma senha devem ser diferentes",
		{ timeout: TIMEOUT },
		async () => {
			const hash1 = await hasher.hash("senha-forte-123");
			const hash2 = await hasher.hash("senha-forte-123");
			expect(hash1).not.toBe(hash2);
		},
	);

	it("hash deve começar com '$argon2id$'", { timeout: TIMEOUT }, async () => {
		const hash = await hasher.hash("senha-forte-123");
		expect(hash.startsWith("$argon2id$")).toBe(true);
	});

	it("retorna false (sem lançar) para hash malformado", async () => {
		expect(await hasher.verify("nao-e-um-hash", "qualquer")).toBe(false);
	});

	it(
		"needsRehash é false para hash gerado agora",
		{ timeout: TIMEOUT },
		async () => {
			const hash = await hasher.hash("senha-forte-123");
			expect(hasher.needsRehash(hash)).toBe(false);
		},
	);

	it(
		"needsRehash é true para hash com parâmetros mais fracos",
		{ timeout: TIMEOUT },
		async () => {
			const weak = await argon2.hash("senha-forte-123", {
				type: argon2.argon2id,
				memoryCost: 8192,
				timeCost: 1,
			});
			expect(hasher.needsRehash(weak)).toBe(true);
		},
	);
});
