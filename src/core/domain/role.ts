// src/core/domain/role.ts

/**
 * Papéis do sistema, em ordem crescente de nível; fonte única para tipo e validação.
 * `chefe` é o valor no código; o rótulo mostrado na tela é "Dono".
 */
export const ROLES = ["usuario", "coordenacao", "chefe", "admin"] as const;

export type Role = (typeof ROLES)[number];

const ROLE_SET: ReadonlySet<string> = new Set(ROLES);

// Record<Role, number>: se alguém criar um papel novo e esquecer o nível, o build quebra
const ROLE_RANK: Record<Role, number> = {
	usuario: 1,
	coordenacao: 2,
	chefe: 3,
	admin: 4,
};

/**
 * Diz se um valor desconhecido é um papel válido.
 * Aceita `unknown` porque o valor vem de fora (banco, requisição) e não é confiável.
 */
export function isRole(value: unknown): value is Role {
	// Set de strings: o typeof garante o tipo antes de perguntar ao Set
	return typeof value === "string" && ROLE_SET.has(value);
}

/** Nível numérico do papel (usuario=1, coordenacao=2, chefe=3, admin=4). */
export function roleRank(role: Role): number {
	return ROLE_RANK[role];
}

/** O nível de `role` é maior ou igual ao de `minimum`? (usado na regra das Privadas) */
export function isAtLeast(role: Role, minimum: Role): boolean {
	return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
