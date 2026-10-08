import type { DisciplineScope } from "./discipline";

/**
 * Subgrupo do cofre, dentro de um grupo. No grupo "Postagem" cada subgrupo é
 * uma plataforma/órgão de postagem de projetos. Tabela `vault_subgroup`
 * (antiga `platform`). O nome é único dentro do grupo, não no cofre inteiro.
 */
export interface VaultSubgroup {
	readonly id: number;
	/** Grupo ao qual pertence. Pode ser alterado (ver {@link UpdateVaultSubgroup}). */
	readonly groupId: number;
	readonly name: string;
	/** Endereço do site do subgrupo; `null` = não informado. */
	readonly url: string | null;
	/** Endereço do logo; `null` = não informado. */
	readonly logoUrl: string | null;
	/**
	 * Subgrupo desativado esconde todas as credenciais dele de todos, inclusive
	 * as Nominais do proprietário (o admin só as vê reativando o subgrupo).
	 */
	readonly active: boolean;
	/** Quem enxerga o subgrupo: Geral (todos) ou só as disciplinas listadas. */
	readonly scope: DisciplineScope;
}

/**
 * Dados para criar um subgrupo. Fora daqui: `id` (gerado pelo banco) e
 * `active` (todo subgrupo nasce ativo).
 */
export interface NewVaultSubgroup {
	readonly groupId: number;
	readonly name: string;
	/** Opcional. Ausente ou `null` = sem URL. */
	readonly url?: string | null;
	/** Opcional. Ausente ou `null` = sem logo. */
	readonly logoUrl?: string | null;
	/** Obrigatório na criação: o banco exige ao menos uma disciplina (Geral conta). */
	readonly scope: DisciplineScope;
}

/**
 * Campos editáveis de um subgrupo, todos opcionais. Para `url` e `logoUrl`
 * há três estados: ausente = manter, `null` = limpar, texto = trocar.
 * `groupId` permite mover o subgrupo para outro grupo (o caso de uso revalida
 * disciplinas e nome único no destino). `active` e `scope` ficam de fora: têm
 * métodos próprios (`setActive`, `setScope`).
 */
export type UpdateVaultSubgroup = Partial<Omit<NewVaultSubgroup, "scope">>;
