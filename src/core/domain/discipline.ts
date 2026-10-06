// src/core/domain/discipline.ts

import type { Role } from "./role";

/**
 * Disciplinas de um item (grupo, subgrupo ou credencial).
 * "Geral" é exclusiva: ou o item é `general` (visível a todas as disciplinas) ou é `specific`
 * com um conjunto de ids. O tipo impede o estado ilegal "Geral + Hidro" por construção.
 * Quem monta isso a partir das linhas do banco é o repositório (a linha da disciplina
 * universal vira `general`; as demais viram `specific`).
 */
export type DisciplineScope =
	| { readonly kind: "general" }
	| { readonly kind: "specific"; readonly ids: ReadonlySet<number> };

/**
 * Quem está agindo, só com o que a regra de disciplina precisa.
 * `disciplineIds` são as disciplinas ESPECÍFICAS da pessoa: "Geral" não entra aqui
 * (todo usuário a tem implicitamente) e Dono/Admin não têm linhas (veem tudo pelo papel).
 */
export interface ActorContext {
	readonly id: number;
	readonly role: Role;
	readonly disciplineIds: ReadonlySet<number>;
}

/**
 * Política da coordenação sobre credenciais e contêineres:
 * - `own`: só o que tem disciplina em comum com ela (ou Geral);
 * - `all`: tudo, como o Dono (hoje é a que a Raisa pode pedir).
 * Vale só para visibilidade de credenciais; sobre usuários a coordenação segue por disciplina em comum.
 */
export type CoordinationDisciplineScope = "own" | "all";
