// tests/unit/errors.test.ts

import { describe, expect, it } from "vitest";
import {
	AuthIntegrityError,
	DuplicateNameError,
	NotFoundError,
	type NamedEntity,
} from "@/core/errors";

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

describe("DuplicateNameError", () => {
	const entities: NamedEntity[] = ["group", "subgroup", "discipline"];

	it("é instância de Error e de DuplicateNameError", () => {
		const duplicateNameError = new DuplicateNameError("group");
		expect(duplicateNameError).toBeInstanceOf(Error);
		expect(duplicateNameError).toBeInstanceOf(DuplicateNameError);
	});
	it("name é 'DuplicateNameError'", () => {
		expect(new DuplicateNameError("group").name).toBe("DuplicateNameError");
	});
	it.each(entities)("expõe a entidade '%s' para o caso de uso", (entity) => {
		expect(new DuplicateNameError(entity).entity).toBe(entity);
	});
	it.each(entities)(
		"a mensagem é genérica e não cita a entidade '%s'",
		(entity) => {
			const { message } = new DuplicateNameError(entity);
			expect(message).not.toBe("");
			expect(message).not.toContain(entity);
		},
	);
});

describe("NotFoundError", () => {
	const entities: NamedEntity[] = ["group", "subgroup", "discipline"];
	const id = 4242; // vários dígitos: um "7" poderia aparecer na mensagem por acaso

	it("é instância de Error e de NotFoundError", () => {
		const notFoundError = new NotFoundError("group", id);
		expect(notFoundError).toBeInstanceOf(Error);
		expect(notFoundError).toBeInstanceOf(NotFoundError);
	});
	it("name é 'NotFoundError'", () => {
		expect(new NotFoundError("group", id).name).toBe("NotFoundError");
	});
	it.each(entities)("expõe a entidade '%s' para o caso de uso", (entity) => {
		expect(new NotFoundError(entity, id).entity).toBe(entity);
	});
	it.each([7, id])("expõe o id %i para o log", (value) => {
		expect(new NotFoundError("group", value).id).toBe(value);
	});
	it.each(entities)(
		"a mensagem é genérica e não cita a entidade '%s' nem o id",
		(entity) => {
			const { message } = new NotFoundError(entity, id);
			expect(message).not.toBe("");
			expect(message).not.toContain(entity);
			expect(message).not.toContain(String(id));
		},
	);
});
