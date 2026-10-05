import { describe, expect, it } from "vitest";
import { ACTIONS, can, canManageUser } from "../../src/core/domain/permissions";
import { ROLES, type Role } from "../../src/core/domain/role";

describe("can", () => {
	it("admin tem todas as ações", () => {
		for (const action of ACTIONS) {
			expect(can("admin", action)).toBe(true);
		}
	});

	// Chefe ("Dono") tem as mesmas ações da coordenação
	it.each(["coordenacao", "chefe"] as const)("%s tem tudo, menos auditoria", (role) => {
		for (const action of ACTIONS) {
			expect(can(role, action)).toBe(action !== "audit:list");
		}
	});

	it("usuário só tem listar, revelar e mexer nas próprias credenciais", () => {
		const allowed = [
			"credential:list",
			"credential:reveal",
			"credential:create-own",
			"credential:update-own",
			"credential:delete-own",
		];
		for (const action of ACTIONS) {
			expect(can("usuario", action)).toBe(allowed.includes(action));
		}
	});

	it("só admin vê a auditoria", () => {
		const roles = ROLES.filter((role) => can(role, "audit:list"));
		expect(roles).toEqual(["admin"]);
	});
});

describe("canManageUser", () => {
	// [ator, alvo, esperado]
	const cases: [Role, Role, boolean][] = [
		["admin", "admin", true],
		["admin", "chefe", true],
		["admin", "coordenacao", true],
		["admin", "usuario", true],
		["chefe", "admin", false], // escalada de privilégio
		["chefe", "chefe", false], // donos não mexem um no outro
		["chefe", "coordenacao", true],
		["chefe", "usuario", true],
		["coordenacao", "admin", false], // escalada de privilégio
		["coordenacao", "chefe", false], // escalada de privilégio
		["coordenacao", "coordenacao", true],
		["coordenacao", "usuario", true],
		["usuario", "admin", false],
		["usuario", "chefe", false],
		["usuario", "coordenacao", false],
		["usuario", "usuario", false],
	];

	it.each(cases)("ator %s sobre alvo %s → %s", (actor, target, expected) => {
		expect(canManageUser(actor, target)).toBe(expected);
	});
});
