// tests/unit/errors.test.ts

import { describe, expect, it } from "vitest";
import { AuthIntegrityError } from "@/core/errors";

describe("AuthIntegrityError", () => {
	const userId = 98764;
	it("É instância de Error e de AuthIntegrityError", () => {
		const integrityError = new AuthIntegrityError(userId);
		expect(integrityError).toBeInstanceOf(Error);
		expect(integrityError).toBeInstanceOf(AuthIntegrityError);
	});
	it("name é 'AuthIntegrityError'", () => {
		const integrityError = new AuthIntegrityError(userId);
		expect(integrityError.name).toBe("AuthIntegrityError");
	});
	it("a mensagem não contém o id do usuário", () => {
		const integrityError = new AuthIntegrityError(userId);
		expect(integrityError.message).not.toContain(String(userId));
	});
	it("expõe o userId para o caso de uso registrar o alerta", () => {
		expect(new AuthIntegrityError(userId).userId).toBe(userId);
	});
});
