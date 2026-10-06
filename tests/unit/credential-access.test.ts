import { describe, expect, it } from "vitest";
import {
	canViewCredential,
	type AccessDecision,
	type CredentialAccessInfo,
	type CredentialOwner,
} from "../../src/core/domain/credential-access";
import type {
	ActorContext,
	CoordinationDisciplineScope,
	DisciplineScope,
} from "../../src/core/domain/discipline";
import type { Role } from "../../src/core/domain/role";

// Ids de disciplina só para os testes
const HIDRO = 1;
const GAS = 2;

const ACTOR_ID = 10;
const OWNER_ID = 20; // sempre diferente do ator, para o atalho do dono não disparar sem querer

const GENERAL: DisciplineScope = { kind: "general" };
const specific = (...ids: number[]): DisciplineScope => ({
	kind: "specific",
	ids: new Set(ids),
});
const actor = (
	role: Role,
	disciplines: number[] = [],
	id = ACTOR_ID,
): ActorContext => ({ id, role, disciplineIds: new Set(disciplines) });
const owner = (
	role: Role = "usuario",
	deleted = false,
	id = OWNER_ID,
): CredentialOwner => ({ id, role, deleted });

/** Credencial Nominal (com dono). */
const nominal = (
	o: CredentialOwner,
	visibility: "private" | "shared",
	scope: DisciplineScope = GENERAL,
): CredentialAccessInfo => ({ owner: o, visibility, scope });
/** Credencial de Plataforma (sem dono). */
const platform = (
	visibility: "private" | "shared",
	scope: DisciplineScope = GENERAL,
): CredentialAccessInfo => ({ owner: null, visibility, scope });

// Container que não bloqueia ninguém / container que exige Hidro
const OPEN = { group: GENERAL, subgroup: GENERAL };
const NEEDS_HIDRO = { group: specific(HIDRO), subgroup: GENERAL };

// Resultados esperados, escritos literalmente (nada derivado do código testado)
const DENIED: AccessDecision = { allowed: false };
const PLAIN: AccessDecision = { allowed: true, viaPrivilege: false };
const DIRECT: AccessDecision = {
	allowed: true,
	viaPrivilege: true,
	reasonRequired: false,
};
const WITH_REASON: AccessDecision = {
	allowed: true,
	viaPrivilege: true,
	reasonRequired: true,
};

const POLICIES: CoordinationDisciplineScope[] = ["own", "all"];
const ROLES: Role[] = ["usuario", "coordenacao", "chefe", "admin"];

describe("canViewCredential: dono deletado", () => {
	// Só o admin enxerga; admin sem disciplina e com container bloqueado prova
	// que ele passa pelo portão do dono deletado, não pelas demais regras.
	it.each(POLICIES)("admin vê (política %s)", (p) => {
		const decision = canViewCredential(
			actor("admin"),
			nominal(owner("usuario", true), "private", specific(GAS)),
			NEEDS_HIDRO,
			p,
		);
		expect(decision).toEqual(PLAIN);
	});

	const others: Role[] = ["usuario", "coordenacao", "chefe"];
	it.each(others.flatMap((r) => POLICIES.map((p) => [r, p] as const)))(
		"%s não vê (política %s)",
		(role, p) => {
			const decision = canViewCredential(
				actor(role, [HIDRO]),
				nominal(owner("usuario", true), "shared"),
				OPEN,
				p,
			);
			expect(decision).toEqual(DENIED);
		},
	);
});

describe("canViewCredential: o ator é o dono", () => {
	const me = owner("usuario", false, ACTOR_ID);

	it("dono vê a própria privada mesmo com container bloqueado e sem a disciplina", () => {
		const decision = canViewCredential(
			actor("usuario", [GAS]),
			nominal(me, "private", specific(GAS)),
			NEEDS_HIDRO,
			"own",
		);
		expect(decision).toEqual(PLAIN);
	});

	it("o mesmo cenário com outro ator é negado (prova que é o atalho do dono que decide)", () => {
		const decision = canViewCredential(
			actor("usuario", [GAS], 99),
			nominal(me, "private", specific(GAS)),
			NEEDS_HIDRO,
			"own",
		);
		expect(decision).toEqual(DENIED);
	});

	it("dono vê a própria sem privilégio, sem pedir motivo", () => {
		const decision = canViewCredential(
			actor("coordenacao"),
			nominal(owner("coordenacao", false, ACTOR_ID), "private"),
			OPEN,
			"own",
		);
		expect(decision).toEqual(PLAIN);
	});
});

describe("canViewCredential: barreiras de container e disciplina (não dono)", () => {
	it("só o container bloqueia: credencial Geral e compartilhada, ator sem Hidro", () => {
		const decision = canViewCredential(
			actor("usuario", [GAS]),
			nominal(owner(), "shared", GENERAL),
			NEEDS_HIDRO,
			"own",
		);
		expect(decision).toEqual(DENIED);
	});

	it("só a disciplina bloqueia: container aberto, credencial exige Hidro, ator só Gás", () => {
		const decision = canViewCredential(
			actor("usuario", [GAS]),
			nominal(owner(), "shared", specific(HIDRO)),
			OPEN,
			"own",
		);
		expect(decision).toEqual(DENIED);
	});

	it("passa nos dois: ator com Hidro, container e credencial Hidro", () => {
		const decision = canViewCredential(
			actor("usuario", [HIDRO]),
			nominal(owner(), "shared", specific(HIDRO)),
			NEEDS_HIDRO,
			"own",
		);
		expect(decision).toEqual(PLAIN);
	});

	it("o container também barra a Plataforma", () => {
		const decision = canViewCredential(
			actor("usuario", [GAS]),
			platform("shared"),
			NEEDS_HIDRO,
			"own",
		);
		expect(decision).toEqual(DENIED);
	});

	it.each(["chefe", "admin"] as const)(
		"%s vê tudo mesmo sem disciplina e com container bloqueado",
		(role) => {
			const decision = canViewCredential(
				actor(role),
				nominal(owner(), "shared", specific(GAS)),
				NEEDS_HIDRO,
				"own",
			);
			expect(decision).toEqual(PLAIN);
		},
	);

	it('coordenação: política "own" nega, "all" libera (item de outra disciplina)', () => {
		const credential = nominal(owner(), "shared", specific(GAS));
		const coordinator = actor("coordenacao", [HIDRO]);
		expect(canViewCredential(coordinator, credential, OPEN, "own")).toEqual(
			DENIED,
		);
		expect(canViewCredential(coordinator, credential, OPEN, "all")).toEqual(
			PLAIN,
		);
	});
});

describe("canViewCredential: Plataforma (sem dono)", () => {
	it.each(ROLES)("compartilhada liberada para %s", (role) => {
		const decision = canViewCredential(
			actor(role, [HIDRO]),
			platform("shared"),
			OPEN,
			"own",
		);
		expect(decision).toEqual(PLAIN);
	});

	// Estado impossível (o banco proíbe), mas a função deve falhar fechada
	it.each(ROLES)("privada é negada para %s (estado impossível)", (role) => {
		const decision = canViewCredential(
			actor(role, [HIDRO]),
			platform("private"),
			OPEN,
			"own",
		);
		expect(decision).toEqual(DENIED);
	});
});

describe("canViewCredential: Nominal de outro dono, compartilhada", () => {
	it.each(ROLES)("liberada para %s sem privilégio", (role) => {
		const decision = canViewCredential(
			actor(role, [HIDRO]),
			nominal(owner("chefe"), "shared"),
			OPEN,
			"own",
		);
		expect(decision).toEqual(PLAIN);
	});
});

describe("canViewCredential: Nominal privada de outro dono (papel do ator × papel do dono)", () => {
	// [papel do ator, papel do dono, esperado] — escrito à mão, sem chamar privateAccessMode
	const cases: [Role, Role, AccessDecision][] = [
		["usuario", "usuario", DENIED],
		["usuario", "coordenacao", DENIED],
		["usuario", "chefe", DENIED],
		["usuario", "admin", DENIED],
		["coordenacao", "usuario", WITH_REASON],
		["coordenacao", "coordenacao", WITH_REASON],
		["coordenacao", "chefe", DENIED],
		["coordenacao", "admin", DENIED],
		["chefe", "usuario", DIRECT],
		["chefe", "coordenacao", DIRECT],
		["chefe", "chefe", DENIED],
		["chefe", "admin", DENIED],
		["admin", "usuario", DIRECT],
		["admin", "coordenacao", DIRECT],
		["admin", "chefe", DIRECT],
		["admin", "admin", DIRECT],
	];

	it.each(cases.flatMap(([a, o, e]) => POLICIES.map((p) => [a, o, p, e] as const)))(
		"%s sobre privada de %s (política %s)",
		(viewerRole, ownerRole, p, expected) => {
			const decision = canViewCredential(
				actor(viewerRole, [HIDRO]),
				nominal(owner(ownerRole), "private"),
				OPEN,
				p,
			);
			expect(decision).toEqual(expected);
		},
	);

	it("privilégio não ultrapassa a barreira de disciplina (coordenação, item de outra disciplina)", () => {
		const decision = canViewCredential(
			actor("coordenacao", [HIDRO]),
			nominal(owner("usuario"), "private", specific(GAS)),
			OPEN,
			"own",
		);
		expect(decision).toEqual(DENIED);
	});

	it("privilégio não ultrapassa o container (coordenação sem Hidro)", () => {
		const decision = canViewCredential(
			actor("coordenacao", [GAS]),
			nominal(owner("usuario"), "private"),
			NEEDS_HIDRO,
			"own",
		);
		expect(decision).toEqual(DENIED);
	});
});
