// tests/unit/rotation-flag.test.ts

import { describe, expect, it } from "vitest";
import { remainingFields } from "../../src/core/domain/rotation-flag";

// Helper para escrever os conjuntos sem repetir `new Set`
const set = (...ids: string[]): ReadonlySet<string> => new Set(ids);

describe("remainingFields", () => {
	describe("resolução parcial e total", () => {
		it("devolve o que ainda falta trocar", () => {
			const result = remainingFields(set("password", "pin"), set("password"));
			expect(result).toEqual(set("pin"));
		});
		it("devolve vazio quando todos os campos pendentes foram trocados", () => {
			const result = remainingFields(
				set("password", "pin"),
				set("password", "pin"),
			);
			expect(result).toEqual(set());
		});
		it("devolve tudo quando nada foi trocado", () => {
			const result = remainingFields(set("password", "pin"), set());
			expect(result).toEqual(set("password", "pin"));
		});
	});

	describe("bordas", () => {
		it("ignora campo trocado que nunca esteve pendente", () => {
			const result = remainingFields(set("password"), set("login", "notes"));
			expect(result).toEqual(set("password"));
		});
		it("pendente vazio devolve vazio", () => {
			const result = remainingFields(set(), set("password"));
			expect(result).toEqual(set());
		});
		it("changed vazio não altera nada", () => {
			const result = remainingFields(set("pin"), set());
			expect(result).toEqual(set("pin"));
		});
	});

	describe("contrato", () => {
		it("não altera os conjuntos recebidos", () => {
			const fields = set("pin", "password");
			const changed = set("password");

			const fieldsAntes = [...fields];
			const changedAntes = [...changed];

			remainingFields(fields, changed);
			expect([...fields]).toEqual(fieldsAntes);
			expect([...changed]).toEqual(changedAntes);
		});
		it("trata ids de campo extra como texto comum", () => {
			const result = remainingFields(set("field-7", "field-8"), set("field-7"));
			expect(result).toEqual(set("field-8"));
		});
	});
});
