// src/adapters/persistence/group-row.ts

import type { FieldTemplateEntry, VaultGroup } from "@/core/domain/vault-group";
import type { DisciplineScope } from "@/core/domain/discipline"; // ajuste ao caminho real
import { z } from "zod";

/** Linha crua de `vault_group`, como o driver `pg` devolve. */
export type GroupRow = Readonly<{
	id: number;
	name: string;
	icon: string;
	position: number;
	active: boolean;
	field_template: unknown; // jsonb: o formato só é conhecido depois de validar
}>;

/** Vínculo grupo→disciplina, já com o flag da disciplina universal (Geral). */
export type GroupDisciplineLink = Readonly<{
	discipline_id: number;
	is_universal: boolean;
}>;

const fieldTemplateSchema = z.array(
	z.object({
		label: z.string(),
		secret: z.boolean(),
	}),
);

/**
 * Monta o escopo a partir dos vínculos.
 * @throws Error com o id do grupo se os vínculos forem vazios, duplicados ou
 * misturarem Geral com disciplinas específicas.
 */
export function toScope(
	groupId: number,
	links: readonly GroupDisciplineLink[],
): DisciplineScope {
	if (links.length === 0)
		throw new Error(
			`grupo ${groupId}: sem vínculo de disciplina (lista vazia)`,
		);
	const idsDiscipline = new Set<number>();
	for (const link of links) {
		if (idsDiscipline.has(link.discipline_id))
			throw new Error(
				`grupo ${groupId}: disciplina ${link.discipline_id} vinculada mais de uma vez`,
			);
		idsDiscipline.add(link.discipline_id);
	}

	if (links.some((l) => l.is_universal) && links.some((l) => !l.is_universal))
		throw new Error(
			`grupo ${groupId}: disciplina universal (Geral) misturada com disciplinas específicas`,
		);

	if (links.some((l) => l.is_universal)) {
		return { kind: "general" };
	}
	return { kind: "specific", ids: idsDiscipline };
}

/**
 * Valida o jsonb do template de campos.
 * @throws Error com o id do grupo se o formato for inválido.
 */
export function parseFieldTemplate(
	groupId: number,
	raw: unknown,
): readonly FieldTemplateEntry[] {
	const result = fieldTemplateSchema.safeParse(raw);
	if (!result.success)
		throw new Error(`grupo ${groupId}: field_template com formato inválido`);
	return result.data;
}

/** Converte linha + vínculos em `VaultGroup`. */
export function toVaultGroup(
	row: GroupRow,
	links: readonly GroupDisciplineLink[],
): VaultGroup {
	return {
		id: row.id,
		name: row.name,
		icon: row.icon,
		position: row.position,
		active: row.active,
		scope: toScope(row.id, links),
		fieldTemplate: parseFieldTemplate(row.id, row.field_template),
	};
}
