// tests/unit/discipline-access.test.ts

import { describe, expect, it } from "vitest";
import type {
	ActorContext,
	CoordinationDisciplineScope,
	DisciplineScope,
} from "../../src/core/domain/discipline";
import {
	containerAllows,
	disciplineAllows,
	scopeAllows,
} from "../../src/core/domain/discipline-access";
import type { Role } from "../../src/core/domain/role";

// Ids de disciplina só para os testes (no banco são inteiros de `discipline`)
const HIDRO = 1;
const GAS = 2;
const ELETRICA = 3;

const GENERAL: DisciplineScope = { kind: "general" };
const specific = (...ids: number[]): DisciplineScope => ({
	kind: "specific",
	ids: new Set(ids),
});
const actor = (
	role: Role,
	disciplines: number[] = [],
	id = 1,
): ActorContext => ({ id, role, disciplineIds: new Set(disciplines) });

const POLICIES: CoordinationDisciplineScope[] = ["own", "all"];

describe("scopeAllows", () => {
	// [descrição, papel, disciplinas do ator, escopo do item, política da coordenação, esperado]
	const cases: [
		string,
		Role,
		number[],
		DisciplineScope,
		CoordinationDisciplineScope,
		boolean,
	][] = [
		// Dono e Admin veem tudo pelo papel, com qualquer política
		...POLICIES.flatMap((p): typeof cases => [
			["admin sem disciplina vê item específico", "admin", [], specific(HIDRO), p, true],
			["chefe sem disciplina vê item específico", "chefe", [], specific(HIDRO), p, true],
			["admin vê até escopo específico vazio", "admin", [], specific(), p, true],
			["chefe vê até escopo específico vazio", "chefe", [], specific(), p, true],
		]),

		// Usuário: a política da coordenação não o afeta (mesmo com "all")
		...POLICIES.flatMap((p): typeof cases => [
			["usuário sem nenhuma disciplina vê Geral", "usuario", [], GENERAL, p, true],
			["usuário sem nenhuma disciplina não vê específico", "usuario", [], specific(HIDRO), p, false],
			["usuário com a disciplina vê específico", "usuario", [HIDRO], specific(HIDRO), p, true],
			["usuário com outra disciplina não vê específico", "usuario", [GAS], specific(HIDRO), p, false],
			["interseção parcial basta (item Hidro+Gás, ator só Gás)", "usuario", [GAS], specific(HIDRO, GAS), p, true],
			["ator com várias disciplinas, nenhuma em comum", "usuario", [GAS, ELETRICA], specific(HIDRO), p, false],
			["escopo específico vazio nega (falha fechada)", "usuario", [HIDRO], specific(), p, false],
		]),

		// Coordenação com política "own": só o que tem em comum (ou Geral)
		["coordenação (own) vê Geral", "coordenacao", [], GENERAL, "own", true],
		["coordenação (own) com disciplina em comum vê", "coordenacao", [HIDRO], specific(HIDRO), "own", true],
		["coordenação (own) sem disciplina em comum não vê", "coordenacao", [GAS], specific(HIDRO), "own", false],
		["coordenação (own) sem disciplina nenhuma não vê específico", "coordenacao", [], specific(HIDRO), "own", false],
		["coordenação (own) não vê escopo específico vazio", "coordenacao", [HIDRO], specific(), "own", false],

		// Coordenação com política "all": vê tudo, como o Dono
		["coordenação (all) sem disciplina em comum vê", "coordenacao", [GAS], specific(HIDRO), "all", true],
		["coordenação (all) vê até escopo específico vazio", "coordenacao", [], specific(), "all", true],
		["coordenação (all) vê Geral", "coordenacao", [], GENERAL, "all", true],
	];

	it.each(cases)("%s", (_desc, role, disciplines, scope, policy, expected) => {
		expect(scopeAllows(actor(role, disciplines), scope, policy)).toBe(expected);
	});
});

describe("disciplineAllows", () => {
	it.each(POLICIES)("o dono passa sem disciplina em comum (política %s)", (p) => {
		const credential = { ownerId: 7, scope: specific(HIDRO) };
		expect(disciplineAllows(actor("usuario", [GAS], 7), credential, p)).toBe(true);
	});

	it.each(POLICIES)("o dono passa mesmo com escopo específico vazio (política %s)", (p) => {
		const credential = { ownerId: 7, scope: specific() };
		expect(disciplineAllows(actor("usuario", [], 7), credential, p)).toBe(true);
	});

	it("quem não é dono e não tem disciplina em comum não passa", () => {
		const credential = { ownerId: 7, scope: specific(HIDRO) };
		expect(disciplineAllows(actor("usuario", [GAS], 8), credential, "own")).toBe(false);
	});

	it("quem não é dono passa pela disciplina em comum", () => {
		const credential = { ownerId: 7, scope: specific(HIDRO) };
		expect(disciplineAllows(actor("usuario", [HIDRO], 8), credential, "own")).toBe(true);
	});

	it("credencial Geral passa para quem não é dono", () => {
		const credential = { ownerId: 7, scope: GENERAL };
		expect(disciplineAllows(actor("usuario", [], 8), credential, "own")).toBe(true);
	});

	it("Plataforma (sem dono) nunca vale como 'do ator': segue a disciplina", () => {
		const platform = { ownerId: null, scope: specific(HIDRO) };
		expect(disciplineAllows(actor("usuario", [GAS], 1), platform, "own")).toBe(false);
		expect(disciplineAllows(actor("usuario", [HIDRO], 1), platform, "own")).toBe(true);
	});

	it("coordenação (all) passa em credencial de outro sem disciplina em comum", () => {
		const credential = { ownerId: 7, scope: specific(HIDRO) };
		expect(disciplineAllows(actor("coordenacao", [GAS], 8), credential, "all")).toBe(true);
	});

	it("coordenação (own) não passa em credencial de outro sem disciplina em comum", () => {
		const credential = { ownerId: 7, scope: specific(HIDRO) };
		expect(disciplineAllows(actor("coordenacao", [GAS], 8), credential, "own")).toBe(false);
	});
});

describe("containerAllows", () => {
	// [descrição, grupo, subgrupo, esperado] para um usuário com Hidro
	const cases: [string, DisciplineScope, DisciplineScope, boolean][] = [
		["passa no grupo e no subgrupo", specific(HIDRO), specific(HIDRO), true],
		["grupo Geral e subgrupo com a disciplina", GENERAL, specific(HIDRO), true],
		["grupo com a disciplina e subgrupo Geral", specific(HIDRO), GENERAL, true],
		["os dois Geral", GENERAL, GENERAL, true],
		["falha só no grupo", specific(GAS), specific(HIDRO), false],
		["falha só no subgrupo", specific(HIDRO), specific(GAS), false],
		["falha nos dois", specific(GAS), specific(GAS), false],
		["grupo Geral e subgrupo sem a disciplina", GENERAL, specific(GAS), false],
		["grupo sem a disciplina e subgrupo Geral", specific(GAS), GENERAL, false],
	];

	it.each(cases)("usuário com Hidro: %s", (_desc, group, subgroup, expected) => {
		expect(containerAllows(actor("usuario", [HIDRO]), group, subgroup, "own")).toBe(expected);
	});

	it.each(["chefe", "admin"] as const)("%s passa em qualquer contêiner", (role) => {
		expect(containerAllows(actor(role), specific(GAS), specific(ELETRICA), "own")).toBe(true);
	});

	it("coordenação (all) passa em qualquer contêiner; (own) não", () => {
		const coord = actor("coordenacao", [HIDRO]);
		expect(containerAllows(coord, specific(GAS), specific(GAS), "all")).toBe(true);
		expect(containerAllows(coord, specific(GAS), specific(GAS), "own")).toBe(false);
	});
});
