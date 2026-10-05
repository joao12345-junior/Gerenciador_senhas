// tests/unit/crypto-token-generator.test.ts
import { describe, expect, it } from "vitest";
import { CryptoTokenGenerator } from "@/adapters/crypto/crypto-token-generator";

describe("CryptoTokenGenerator", () => {
	const generator = new CryptoTokenGenerator();

	it("sessionToken tem 43 caracteres base64url", () => {
		expect(generator.sessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});

	it("sessionToken não se repete em 1000 chamadas", () => {
		const tokens = new Set(
			Array.from({ length: 1000 }, () => generator.sessionToken()),
		);
		expect(tokens.size).toBe(1000);
	});

	it("recoveryCode segue o formato XXXXX-XXXXX sem caracteres ambíguos", () => {
		expect(generator.recoveryCode()).toMatch(
			/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/,
		);
	});

	it("recoveryCode não se repete em 1000 chamadas", () => {
		const codes = new Set(
			Array.from({ length: 1000 }, () => generator.recoveryCode()),
		);
		expect(codes.size).toBe(1000);
	});
});
