import { describe, expect, it } from "vitest";
import {
	ACTIONS,
	can,
	canManageUser,
	type Action,
} from "../../src/core/domain/permissions";
import { ROLES, type Role } from "../../src/core/domain/role";

const ADMIN_ONLY: readonly Action[] = [
	"audit:list",
	"discipline:manage",
	"user:restore",
];

describe("can", () => {
	it("admin tem todas as ações", () => {
		for (const action of ACTIONS) {
			expect(can("admin", action)).toBe(true);
		}
	});

	// Chefe ("Dono") tem as mesmas ações da coordenação
	it.each(["coordenacao", "chefe"] as const)(
		"%s tem tudo, menos as ações só do admin",
		(role) => {
			for (const action of ACTIONS) {
				expect(can(role, action)).toBe(!ADMIN_ONLY.includes(action));
			}
		},
	);

	it.each(ADMIN_ONLY)("só admin tem %s", (action) => {
		expect(ROLES.filter((role) => can(role, action))).toEqual(["admin"]);
	});

	it("só coordenação, chefe e admin listam rotações", () => {
		expect(ROLES.filter((role) => can(role, "rotation:list"))).toEqual([
			"coordenacao",
			"chefe",
			"admin",
		]);
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
