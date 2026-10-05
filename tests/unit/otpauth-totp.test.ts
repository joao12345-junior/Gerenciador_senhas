// tests/unit/otpauth-totp.test.ts
import * as OTPAuth from "otpauth";
import { describe, expect, it } from "vitest";
import { OtpauthTotpService } from "@/adapters/crypto/otpauth-totp";
import { FakeClock } from "../fakes/fake-clock";

const START = new Date("2026-01-01T12:00:00Z");
const STEP_NOW = Math.floor(START.getTime() / 1000 / 30);

/** Gera o código "de fora", direto pela lib, para um instante específico. */
function codeAt(secret: string, date: Date): string {
	return new OTPAuth.TOTP({
		secret: OTPAuth.Secret.fromBase32(secret),
		algorithm: "SHA1",
		digits: 6,
		period: 30,
	}).generate({ timestamp: date.getTime() });
}

/** Instante `seconds` segundos antes de START. */
function before(seconds: number): Date {
	return new Date(START.getTime() - seconds * 1000);
}

describe("OtpauthTotpService", () => {
	const totp = new OtpauthTotpService(new FakeClock(START));
	const secret = totp.generateSecret();

	it("aceita o código do passo atual e devolve o número do passo", () => {
		expect(totp.verify(secret, codeAt(secret, START))).toBe(STEP_NOW);
	});

	// TODO 2: o relógio do serviço está em START. O código gerado para 30 s antes
	// pertence ao passo anterior, que a janela (±1) ainda tolera.
	it("aceita código do passo anterior e devolve passo - 1", () => {
		expect(totp.verify(secret, codeAt(secret, before(30)))).toBe(STEP_NOW - 1);
	});

	// 90 s antes são 3 passos atrás: fora da janela de ±1, deve ser rejeitado.
	it("rejeita código de 3 passos atrás", () => {
		expect(totp.verify(secret, codeAt(secret, before(90)))).toBeNull();
	});

	// TODO 3: it.each roda o mesmo teste para cada valor da lista.
	it.each(["abcdef", "12345", "1234567", "", "12 456"])(
		"rejeita código malformado: '%s'",
		(bad) => {
			expect(totp.verify(secret, bad)).toBeNull();
		},
	);

	// TODO 4: dois generateSecret() diferem; resultado casa /^[A-Z2-7]+$/ (base32)
	it("gera segredos diferentes, em base32 válido", () => {
		const a = totp.generateSecret();
		const b = totp.generateSecret();
		expect(a).not.toBe(b);
		expect(a).toMatch(/^[A-Z2-7]+$/); // alfabeto base32: A-Z e 2-7
	});

	// TODO 5: a URI codifica espaços (%20); decodifico para comparar texto legível.
	it("monta a URI otpauth com o emissor", () => {
		const uri = totp.buildOtpAuthUri(secret, "joao@optare.com.br");
		expect(uri.startsWith("otpauth://totp/")).toBe(true);
		expect(decodeURIComponent(uri)).toContain("issuer=Cofre Optare");
	});
});
