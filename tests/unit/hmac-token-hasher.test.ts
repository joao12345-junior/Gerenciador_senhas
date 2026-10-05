// tests/unit/hmac-token-hasher.test.ts

import { describe, it, expect } from "vitest";
import { HmacTokenHasher } from "@/adapters/crypto/hmac-token-hasher";

const PEPPER_A = Buffer.alloc(32, 1);
const PEPPER_B = Buffer.alloc(32, 2);

describe("HmacTokenHasher", () => {
	it("mesma entrada e mesmo pepper geram o mesmo hash", () => {
		const hasher = new HmacTokenHasher(PEPPER_A);
		expect(hasher.hash("token-123")).toBe(hasher.hash("token-123"));
	});

	it("peppers diferentes geram hashes diferentes", () => {
		const a = new HmacTokenHasher(PEPPER_A);
		const b = new HmacTokenHasher(PEPPER_B);
		expect(a.hash("token-123")).not.toBe(b.hash("token-123"));
	});

	it("entradas diferentes geram hashes diferentes", () => {
		const hasher = new HmacTokenHasher(PEPPER_A);
		expect(hasher.hash("token-1")).not.toBe(hasher.hash("token-2"));
	});

	it("saída é hexadecimal de 64 caracteres", () => {
		const hasher = new HmacTokenHasher(PEPPER_A);
		expect(hasher.hash("token-123")).toMatch(/^[0-9a-f]{64}$/);
	});
});
