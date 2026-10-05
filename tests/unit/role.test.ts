import { describe, expect, it } from "vitest";
import { ROLES, isAtLeast, isRole, roleRank, type Role } from "../../src/core/domain/role";

describe("isRole", () => {
	it.each(ROLES)("aceita o papel válido %s", (role) => {
		expect(isRole(role)).toBe(true);
	});

	// Comparação é exata: maiúscula, espaço, vazio e nomes herdados do Object são recusados.
	// "Dono" é só o rótulo da tela; o valor gravado é "chefe".
	it.each(["Admin", " admin", "admin ", "", "banana", "Chefe", "dono", "constructor", "__proto__"])(
		"recusa o valor inválido %j",
		(value) => {
			expect(isRole(value)).toBe(false);
		},
	);

	// Valores que não são texto (ex.: corpo de requisição malformado)
	it.each([null, undefined, 42, {}, ["admin"]])("recusa o valor não-texto %j", (value) => {
		expect(isRole(value as never)).toBe(false);
	});
});

describe("roleRank", () => {
	it.each<[Role, number]>([
		["usuario", 1],
		["coordenacao", 2],
		["chefe", 3],
		["admin", 4],
	])("papel %s tem nível %i", (role, rank) => {
		expect(roleRank(role)).toBe(rank);
	});

	it("ROLES está em ordem estritamente crescente de nível", () => {
		const ranks = ROLES.map(roleRank);
		expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
		expect(new Set(ranks).size).toBe(ROLES.length);
	});
});

describe("isAtLeast", () => {
	// [papel, mínimo, esperado]
	const cases: [Role, Role, boolean][] = [
		["usuario", "usuario", true],
		["usuario", "coordenacao", false],
		["coordenacao", "usuario", true],
		["coordenacao", "coordenacao", true],
		["coordenacao", "chefe", false],
		["chefe", "coordenacao", true],
		["chefe", "chefe", true],
		["chefe", "admin", false],
		["admin", "chefe", true],
		["admin", "admin", true],
	];

	it.each(cases)("%s ≥ %s → %s", (role, minimum, expected) => {
		expect(isAtLeast(role, minimum)).toBe(expected);
	});
});
