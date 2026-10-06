import {
	type ActorContext,
	type CoordinationDisciplineScope,
	type DisciplineScope,
} from "./discipline";
import type { Role } from "./role";
import { containerAllows, disciplineAllows } from "./discipline-access";
import { privateAccessMode } from "./private-access";

/**
 * Visibilidade da credencial: `private` só o dono (e quem tem privilégio de
 * nível) enxerga; `shared` segue apenas as regras de disciplina/container.
 */
export type CredentialVisibility = "private" | "shared";
/** Dono de uma credencial Nominal, com o papel ATUAL (não o da criação). */
export interface CredentialOwner {
	readonly id: number;
	readonly role: Role;
	readonly deleted: boolean;
}
/**
 * Dados da credencial necessários para decidir acesso.
 * `owner === null` significa credencial de Plataforma (sem dono).
 */
export interface CredentialAccessInfo {
	readonly owner: CredentialOwner | null;
	readonly visibility: CredentialVisibility;
	readonly scope: DisciplineScope;
}
/**
 * Resultado da decisão de acesso. `viaPrivilege` indica que o acesso veio do
 * nível do papel (gera auditoria "revelou por nível"); `reasonRequired` só
 * existe nesse caso e diz se o ator precisa informar um motivo.
 */
export type AccessDecision =
	| { readonly allowed: false }
	| { readonly allowed: true; readonly viaPrivilege: false }
	| {
			readonly allowed: true;
			readonly viaPrivilege: true;
			readonly reasonRequired: boolean;
	  };

/**
 * Política atual de disciplinas da coordenação: `own` = só as próprias.
 * Mude para `all` apenas se a coordenação pedir (decisão de negócio).
 */
export const COORDINATION_DISCIPLINE_SCOPE: CoordinationDisciplineScope = "own";

/**
 * Decide se `actor` pode ver a credencial. Função pura de domínio (sem I/O).
 *
 * A ORDEM dos portões é a regra:
 * 1. Dono deletado: só o admin enxerga.
 * 2. O próprio dono sempre vê (ignora disciplina e container).
 * 3. Os demais precisam passar no container (grupo E subgrupo) e na disciplina.
 * 4. Plataforma: só é visível se `shared` (`private` é estado impossível, nega).
 * 5. Nominal de outro: `shared` libera; `private` depende de
 *    {@link privateAccessMode} (nenhum, direto ou com motivo).
 *
 * @param actor Quem pede o acesso, com o papel e as disciplinas atuais.
 * @param credential Dados da credencial (dono, visibilidade, escopo).
 * @param container Escopos do grupo e do subgrupo onde a credencial está.
 * @param coordinationScope Política de disciplinas da coordenação.
 * @returns Decisão tipada; ver {@link AccessDecision}.
 */
export function canViewCredential(
	actor: ActorContext,
	credential: CredentialAccessInfo,
	container: { group: DisciplineScope; subgroup: DisciplineScope },
	coordinationScope: CoordinationDisciplineScope,
): AccessDecision {
	const owner = credential.owner;
	if (owner && owner.deleted) {
		if (actor.role === "admin") {
			return { allowed: true, viaPrivilege: false };
		}
		return { allowed: false };
	}
	if (owner?.id === actor.id) return { allowed: true, viaPrivilege: false };
	if (
		!containerAllows(
			actor,
			container.group,
			container.subgroup,
			coordinationScope,
		) ||
		!disciplineAllows(
			actor,
			{ ownerId: null, scope: credential.scope },
			coordinationScope,
		)
	)
		return { allowed: false };
	if (owner === null)
		switch (credential.visibility) {
			case "shared":
				return { allowed: true, viaPrivilege: false };
			case "private":
				return { allowed: false };
		}
	switch (credential.visibility) {
		case "shared":
			return { allowed: true, viaPrivilege: false };
		case "private": {
			const mode = privateAccessMode(actor.role, owner.role);
			switch (mode) {
				case "none":
					return { allowed: false };
				case "direct":
					return { allowed: true, viaPrivilege: true, reasonRequired: false };
				case "with-reason":
					return { allowed: true, viaPrivilege: true, reasonRequired: true };
				default: {
					const _exhaustive: never = mode;
					return _exhaustive;
				}
			}
		}
	}
}
