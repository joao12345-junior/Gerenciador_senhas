// src/core/domain/permissions.ts

import { ROLES, type Role } from "./role";

/** Ações controladas pelo sistema. Formato `recurso:verbo`; `-own` = só o que é do próprio ator. */
export const ACTIONS = [
	"credential:list",
	"credential:reveal",
	"credential:create",
	"credential:update",
	"credential:delete",
	"credential:create-own",
	"credential:update-own",
	"credential:delete-own",
	"platform:manage",
	"user:manage",
	"audit:list",
] as const;

export type Action = (typeof ACTIONS)[number];

// Conjunto base: o que todo usuário autenticado pode fazer
const BASE_ACTIONS: readonly Action[] = [
	"credential:list",
	"credential:reveal",
	"credential:create-own",
	"credential:update-own",
	"credential:delete-own",
];

// Coordenação = base + gestão geral (tudo, menos auditoria)
const COORDINATION_ACTIONS: readonly Action[] = [
	...BASE_ACTIONS,
	"credential:create",
	"credential:update",
	"credential:delete",
	"platform:manage",
	"user:manage",
];

/**
 * Mapa papel → ações. `Record<Role, ...>` obriga todo papel a aparecer:
 * se surgir um quarto papel e ninguém mapeá-lo, o build quebra.
 */
const PERMISSIONS: Record<Role, ReadonlySet<Action>> = {
	usuario: new Set(BASE_ACTIONS),
	coordenacao: new Set(COORDINATION_ACTIONS),
	// Chefe ("Dono" na tela): mesmas ações da coordenação; a diferença (todas as disciplinas)
	// é regra de visibilidade, tratada em credential-access, não aqui
	chefe: new Set(COORDINATION_ACTIONS),
	admin: new Set(ACTIONS), // admin tem tudo, inclusive ações futuras
};

/** Diz se o papel tem a ação. Regras que dependem do alvo (dono, papel da conta) ficam nos casos de uso. */
export function can(role: Role, action: Action): boolean {
	return PERMISSIONS[role].has(action);
}

// Quem pode gerenciar a conta de quem. Record<Role, ...> obriga a tabela a cobrir todo papel.
// Só admin mexe em contas chefe e admin (evita escalada de privilégio).
const MANAGEABLE_TARGETS: Record<Role, ReadonlySet<Role>> = {
	usuario: new Set(),
	coordenacao: new Set<Role>(["usuario", "coordenacao"]),
	chefe: new Set<Role>(["usuario", "coordenacao"]),
	admin: new Set<Role>(ROLES),
};

/**
 * Diz se o ator pode gerenciar a conta de um alvo.
 * Admin gerencia todas; coordenação e chefe só usuario e coordenacao; usuário ninguém.
 */
export function canManageUser(actorRole: Role, targetRole: Role): boolean {
	return can(actorRole, "user:manage") && MANAGEABLE_TARGETS[actorRole].has(targetRole);
}
