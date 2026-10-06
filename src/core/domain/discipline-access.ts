// src/core/domain/discipline-access.ts

import type {
	ActorContext,
	CoordinationDisciplineScope,
	DisciplineScope,
} from "./discipline";
import type { Role } from "./role";

// Papéis que veem todas as disciplinas pelo próprio papel.
// Record<Role, ...> obriga a decidir isso para todo papel novo (o build quebra se faltar).
const SEES_ALL_DISCIPLINES: Record<Role, boolean> = {
	usuario: false,
	coordenacao: false,
	chefe: true,
	admin: true,
};

/** O que a regra de disciplina precisa saber de uma credencial. */
export interface DisciplinedCredential {
	/** Dono da Nominal; `null` para Plataforma (que não tem dono). */
	readonly ownerId: number | null;
	readonly scope: DisciplineScope;
}

/**
 * Diz se o ator passa na regra de disciplina de UM escopo (de um grupo, subgrupo ou credencial).
 * Função pura: não conhece banco, credencial nem dono.
 * Ordem da regra:
 * 1. Dono (`chefe`) e Admin passam sempre;
 * 2. coordenação com a política `all` passa sempre;
 * 3. escopo `general` passa para todos (Geral é implícita);
 * 4. escopo `specific` passa se o ator tem ao menos uma das disciplinas.
 * Falha fechada: `specific` com conjunto vazio nunca passa para quem não vê tudo.
 * Não olha se a disciplina está ativa: desativar não remove vínculos existentes.
 * @param coordinationScope Política da coordenação (parâmetro, não constante, para os testes cobrirem os dois modos).
 */
export function scopeAllows(
	actor: ActorContext,
	scope: DisciplineScope,
	coordinationScope: CoordinationDisciplineScope,
): boolean {
	if (SEES_ALL_DISCIPLINES[actor.role]) return true;
	if (actor.role === "coordenacao" && coordinationScope === "all") return true;
	if (scope.kind === "general") return true;
	// some() devolve false para conjunto vazio: é o que dá a falha fechada
	return [...scope.ids].some((id) => actor.disciplineIds.has(id));
}

/**
 * Regra de disciplina de uma credencial: o dono sempre passa (senão "Minhas senhas" sumiria
 * se as disciplinas mudassem); os demais seguem `scopeAllows` no escopo da credencial.
 * Isto é só a dimensão "disciplina": o acesso final também depende da visibilidade
 * (Privada/Compartilhada) e do contêiner, combinadas depois em `canViewCredential`.
 */
export function disciplineAllows(
	actor: ActorContext,
	credential: DisciplinedCredential,
	coordinationScope: CoordinationDisciplineScope,
): boolean {
	// ownerId null (Plataforma) nunca é "do ator": a comparação com o id numérico dá false
	if (credential.ownerId === actor.id) return true;
	return scopeAllows(actor, credential.scope, coordinationScope);
}

/**
 * Regra de disciplina dos contêineres: o ator precisa passar no grupo E no subgrupo.
 * (O dono da credencial ignora o contêiner; isso é decidido em `canViewCredential`.)
 */
export function containerAllows(
	actor: ActorContext,
	group: DisciplineScope,
	subgroup: DisciplineScope,
	coordinationScope: CoordinationDisciplineScope,
): boolean {
	return (
		scopeAllows(actor, group, coordinationScope) &&
		scopeAllows(actor, subgroup, coordinationScope)
	);
}
