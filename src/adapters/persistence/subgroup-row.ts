// src/adapters/persistence/subgroup-row.ts

import type { DisciplineScope } from "@/core/domain/discipline";
import type { VaultSubgroup } from "@/core/domain/vault-subgroup";

/** Linha crua de `vault_subgroup`, como o driver `pg` devolve. */
export type SubgroupRow = Readonly<{
	id: number;
	group_id: number;
	name: string;
	url: string | null;
	logo_url: string | null;
	active: boolean;
}>;

/** Vínculo subgrupo→disciplina, já com o flag da disciplina universal (Geral). */
export type SubgroupDisciplineLink = Readonly<{
	discipline_id: number;
	is_universal: boolean;
}>;

/**
 * Monta o escopo a partir dos vínculos.
 * @throws Error com o id do subgrupo se os vínculos forem vazios, duplicados
 * ou misturarem Geral com disciplinas específicas.
 * Mensagens (prefixo `subgrupo ${subgroupId}: `), mesmas três do group-row:
 *   "sem vínculo de disciplina (lista vazia)"
 *   "disciplina ${id} vinculada mais de uma vez"
 *   "disciplina universal (Geral) misturada com disciplinas específicas"
 */
export function toSubgroupScope(
	subgroupId: number,
	links: readonly SubgroupDisciplineLink[],
): DisciplineScope {
	if (links.length === 0)
		throw new Error(
			`subgrupo ${subgroupId}: sem vínculo de disciplina (lista vazia)`,
		);
	const idsDiscipline = new Set<number>();
	for (const link of links) {
		if (idsDiscipline.has(link.discipline_id))
			throw new Error(
				`subgrupo ${subgroupId}: disciplina ${link.discipline_id} vinculada mais de uma vez`,
			);
		idsDiscipline.add(link.discipline_id);
	}

	if (links.some((l) => l.is_universal) && links.some((l) => !l.is_universal))
		throw new Error(
			`subgrupo ${subgroupId}: disciplina universal (Geral) misturada com disciplinas específicas`,
		);

	if (links.some((l) => l.is_universal)) {
		return { kind: "general" };
	}
	return { kind: "specific", ids: idsDiscipline };
}

/** Converte linha + vínculos em `VaultSubgroup` (url/logo_url → url/logoUrl, group_id → groupId). */
export function toVaultSubgroup(
	row: SubgroupRow,
	links: readonly SubgroupDisciplineLink[],
): VaultSubgroup {
	return {
		id: row.id,
		name: row.name,
		groupId: row.group_id,
		url: row.url,
		logoUrl: row.logo_url,
		active: row.active,
		scope: toSubgroupScope(row.id, links),
	};
}
