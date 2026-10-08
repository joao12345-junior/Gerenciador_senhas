// tests/unit/group-row.test.ts

import { describe, expect, it } from "vitest";
import {
	parseFieldTemplate,
	toScope,
	toVaultGroup,
	type GroupDisciplineLink,
	type GroupRow,
} from "@/adapters/persistence/group-row";

// ---------- helpers ----------

/** Vínculo com a disciplina universal (Geral). */
const general = (id: number): GroupDisciplineLink => ({
	discipline_id: id,
	is_universal: true,
});

/** Vínculo com uma disciplina específica. */
const specific = (id: number): GroupDisciplineLink => ({
	discipline_id: id,
	is_universal: false,
});

/** Linha válida; sobrescreva só o campo que o teste exercita. */
function row(overrides: Partial<GroupRow> = {}): GroupRow {
	return {
		id: 7,
		name: "Postagem",
		icon: "folder",
		position: 3,
		active: true,
		field_template: [],
		...overrides,
	};
}

// ids com dígitos que não se confundem entre si (a mensagem não pode ter id fixo)
const GROUP_IDS = [1, 42, 9001];

describe("GroupRow", () => {
	// ---------- toScope ----------

	describe("toScope", () => {
		describe("escopos válidos", () => {
			it("só o vínculo universal → { kind: 'general' }", () => {
				expect(toScope(7, [general(1)])).toEqual({ kind: "general" });
			});

			it("vários não universais → specific com ids em Set", () => {
				expect(toScope(7, [specific(2), specific(3), specific(5)])).toEqual({
					kind: "specific",
					ids: new Set([2, 3, 5]),
				});
			});

			it("um único não universal → specific com um id", () => {
				expect(toScope(7, [specific(4)])).toEqual({
					kind: "specific",
					ids: new Set([4]),
				});
			});

			it("a ordem dos vínculos não muda o resultado", () => {
				expect(toScope(7, [specific(5), specific(2)])).toEqual(
					toScope(7, [specific(2), specific(5)]),
				);
			});
		});

		describe("vínculos inconsistentes lançam Error com o id do grupo", () => {
			it.each(GROUP_IDS)("lista vazia (grupo %i)", (groupId) => {
				expect(() => toScope(groupId, [])).toThrow(Error);
				expect(() => toScope(groupId, [])).toThrow(String(groupId));
			});

			it.each(GROUP_IDS)(
				"universal misturado com específicas (grupo %i)",
				(groupId) => {
					const mixed = [general(1), specific(2)];
					expect(() => toScope(groupId, mixed)).toThrow(String(groupId));
					// ordem invertida também é inconsistente
					expect(() => toScope(groupId, [...mixed].reverse())).toThrow(
						String(groupId),
					);
				},
			);

			it.each(GROUP_IDS)(
				"discipline_id repetido entre não universais (grupo %i)",
				(groupId) => {
					const links = [specific(2), specific(31337), specific(31337)];
					expect(() => toScope(groupId, links)).toThrow(String(groupId));
					expect(() => toScope(groupId, links)).toThrow("31337");
				},
			);

			it.each(GROUP_IDS)("universal repetido (grupo %i)", (groupId) => {
				const links = [general(31337), general(31337)];
				expect(() => toScope(groupId, links)).toThrow(String(groupId));
				expect(() => toScope(groupId, links)).toThrow("31337");
			});
		});
	});

	// ---------- parseFieldTemplate ----------

	describe("parseFieldTemplate", () => {
		describe("formatos válidos", () => {
			it("lista vazia → lista vazia", () => {
				expect(parseFieldTemplate(7, [])).toEqual([]);
			});

			it("lista com entradas → mesmas entradas, mesma ordem", () => {
				const raw = [
					{ label: "PIN", secret: true },
					{ label: "Matrícula", secret: false },
					{ label: "Token", secret: true },
				];
				expect(parseFieldTemplate(7, raw)).toEqual(raw);
			});
		});

		describe("formatos inválidos lançam Error com o id do grupo", () => {
			const INVALID: ReadonlyArray<[string, unknown]> = [
				["null", null],
				["undefined", undefined],
				["objeto", {}],
				["string", "x"],
				["número", 1],
				["sem secret", [{ label: "a" }]],
				["sem label", [{ secret: true }]],
				["label não string", [{ label: 1, secret: true }]],
				["secret não boolean", [{ label: "a", secret: "sim" }]],
				["entrada nula", [null]],
				["uma entrada válida e outra inválida", [{ label: "a", secret: true }, { label: "b" }]],
			];

			describe.each(INVALID)("%s", (_name, raw) => {
				it.each(GROUP_IDS)("grupo %i", (groupId) => {
					expect(() => parseFieldTemplate(groupId, raw)).toThrow(Error);
					expect(() => parseFieldTemplate(groupId, raw)).toThrow(
						String(groupId),
					);
				});
			});
		});
	});

	// ---------- toVaultGroup ----------

	describe("toVaultGroup", () => {
		it("mapeia cada campo de snake_case para camelCase (valores distintos por campo)", () => {
			const template = [{ label: "PIN", secret: true }];
			const result = toVaultGroup(
				row({
					id: 11,
					name: "Licitações",
					icon: "gavel",
					position: 5,
					active: false,
					field_template: template,
				}),
				[specific(2)],
			);

			expect(result).toEqual({
				id: 11,
				name: "Licitações",
				icon: "gavel",
				position: 5,
				active: false,
				scope: { kind: "specific", ids: new Set([2]) },
				fieldTemplate: template,
			});
		});

		it("active true também é copiado (não fixa false)", () => {
			expect(toVaultGroup(row({ active: true }), [general(1)]).active).toBe(true);
		});

		it("scope vem de toScope", () => {
			const links = [specific(2), specific(9)];
			expect(toVaultGroup(row(), links).scope).toEqual(toScope(7, links));
			expect(toVaultGroup(row(), links).scope).toEqual({
				kind: "specific",
				ids: new Set([2, 9]),
			});
		});

		it("fieldTemplate vem de parseFieldTemplate", () => {
			const raw = [{ label: "Chave", secret: true }];
			expect(toVaultGroup(row({ field_template: raw }), [general(1)]).fieldTemplate).toEqual(
				parseFieldTemplate(7, raw),
			);
		});

		it.each(GROUP_IDS)("propaga o erro de vínculos inválidos (grupo %i)", (id) => {
			expect(() => toVaultGroup(row({ id }), [])).toThrow(String(id));
		});

		it.each(GROUP_IDS)("propaga o erro de template inválido (grupo %i)", (id) => {
			expect(() =>
				toVaultGroup(row({ id, field_template: null }), [general(1)]),
			).toThrow(String(id));
		});
	});
});
