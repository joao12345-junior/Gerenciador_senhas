// tests/unit/subgroup-row.test.ts

import { describe, expect, it } from "vitest";
import {
	toSubgroupScope,
	toVaultSubgroup,
	type SubgroupDisciplineLink,
	type SubgroupRow,
} from "@/adapters/persistence/subgroup-row";

// ---------- helpers ----------

const general = (id: number): SubgroupDisciplineLink => ({
	discipline_id: id,
	is_universal: true,
});

const specific = (id: number): SubgroupDisciplineLink => ({
	discipline_id: id,
	is_universal: false,
});

/** Linha válida; sobrescreva só o campo que o teste exercita. */
function row(overrides: Partial<SubgroupRow> = {}): SubgroupRow {
	return {
		id: 7,
		group_id: 3,
		name: "Prefeitura POA",
		url: "https://exemplo.gov.br",
		logo_url: "https://exemplo.gov.br/logo.png",
		active: true,
		...overrides,
	};
}

// ids sem dígitos em comum com os ids de disciplina usados nos testes
const SUBGROUP_IDS = [1, 42, 9001];

describe("SubgroupRow", () => {
	describe("toSubgroupScope", () => {
		describe("escopos válidos", () => {
			it("só o vínculo universal → { kind: 'general' }", () => {
				expect(toSubgroupScope(7, [general(1)])).toEqual({ kind: "general" });
			});

			it("vários não universais → specific com ids em Set", () => {
				expect(toSubgroupScope(7, [specific(2), specific(3), specific(5)])).toEqual({
					kind: "specific",
					ids: new Set([2, 3, 5]),
				});
			});

			it("um único não universal → specific com um id", () => {
				expect(toSubgroupScope(7, [specific(4)])).toEqual({
					kind: "specific",
					ids: new Set([4]),
				});
			});

			it("ids vêm em Set, não em array", () => {
				const scope = toSubgroupScope(7, [specific(2)]);

				expect(scope.kind === "specific" && scope.ids instanceof Set).toBe(true);
			});
		});

		describe("dados corrompidos", () => {
			it.each(SUBGROUP_IDS)("lista vazia (subgrupo %i) → Error com o id", (id) => {
				expect(() => toSubgroupScope(id, [])).toThrow(
					`subgrupo ${id}: sem vínculo de disciplina (lista vazia)`,
				);
			});

			it.each(SUBGROUP_IDS)("disciplina repetida (subgrupo %i) → Error com ids", (id) => {
				expect(() => toSubgroupScope(id, [specific(5), specific(5)])).toThrow(
					`subgrupo ${id}: disciplina 5 vinculada mais de uma vez`,
				);
			});

			it("universal repetida também é duplicidade", () => {
				expect(() => toSubgroupScope(7, [general(1), general(1)])).toThrow(
					"disciplina 1 vinculada mais de uma vez",
				);
			});

			it.each(SUBGROUP_IDS)("Geral + específica (subgrupo %i) → Error com o id", (id) => {
				expect(() => toSubgroupScope(id, [general(1), specific(2)])).toThrow(
					`subgrupo ${id}: disciplina universal (Geral) misturada com disciplinas específicas`,
				);
			});

			it("Geral + específica em qualquer ordem lança", () => {
				expect(() => toSubgroupScope(7, [specific(2), general(1)])).toThrow(
					/misturada/,
				);
			});

			it("a mensagem não diz 'grupo' sozinho: cita o subgrupo", () => {
				expect(() => toSubgroupScope(7, [])).toThrow(/^subgrupo 7:/);
			});
		});
	});

	describe("toVaultSubgroup", () => {
		it("copia id, name e active", () => {
			expect(toVaultSubgroup(row({ id: 11, name: "Sema", active: false }), [general(1)])).toMatchObject({
				id: 11,
				name: "Sema",
				active: false,
			});
		});

		it("group_id vira groupId", () => {
			expect(toVaultSubgroup(row({ group_id: 99 }), [general(1)]).groupId).toBe(99);
		});

		it("url e logo_url viram url e logoUrl", () => {
			const result = toVaultSubgroup(
				row({ url: "https://a.com", logo_url: "https://a.com/l.png" }),
				[general(1)],
			);

			expect(result.url).toBe("https://a.com");
			expect(result.logoUrl).toBe("https://a.com/l.png");
		});

		it("url e logo_url null continuam null (não viram undefined nem string vazia)", () => {
			const result = toVaultSubgroup(row({ url: null, logo_url: null }), [general(1)]);

			expect(result.url).toBeNull();
			expect(result.logoUrl).toBeNull();
		});

		it("string vazia em url é preservada (não vira null)", () => {
			expect(toVaultSubgroup(row({ url: "" }), [general(1)]).url).toBe("");
		});

		it("scope general quando o vínculo é universal", () => {
			expect(toVaultSubgroup(row(), [general(1)]).scope).toEqual({ kind: "general" });
		});

		it("scope specific quando há disciplinas específicas", () => {
			expect(toVaultSubgroup(row(), [specific(2), specific(4)]).scope).toEqual({
				kind: "specific",
				ids: new Set([2, 4]),
			});
		});

		it("o resultado tem exatamente os campos do domínio (sem vazar colunas cruas)", () => {
			expect(Object.keys(toVaultSubgroup(row(), [general(1)])).sort()).toEqual(
				["active", "groupId", "id", "logoUrl", "name", "scope", "url"],
			);
		});

		it.each(SUBGROUP_IDS)("vínculos vazios (subgrupo %i) → Error com o id da linha", (id) => {
			expect(() => toVaultSubgroup(row({ id }), [])).toThrow(`subgrupo ${id}:`);
		});

		it("vínculos misturados → Error", () => {
			expect(() => toVaultSubgroup(row(), [general(1), specific(2)])).toThrow(/misturada/);
		});
	});
});
