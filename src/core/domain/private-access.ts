// src/core/domain/private-access.ts

import type { Role } from "./role";

/**
 * Como o visualizador chega a uma credencial Nominal Privada de outra pessoa, pelo nível:
 * - `none`: não chega (por nível; a regra "é a minha" é decidida antes, em `canViewCredential`);
 * - `with-reason`: abre pedindo um motivo, gravado na auditoria;
 * - `direct`: abre sem pedir motivo. A abertura ainda é auditada como "revelou por nível".
 */
export type PrivateAccessMode = "none" | "with-reason" | "direct";

// Tabela [visualizador][dono]. Os dois Record obrigam a cobrir todos os papéis:
// se surgir um quinto papel e ninguém preencher a tabela, o build quebra.
// Células a ter cuidado: chefe -> chefe é "none" (Dono não vê a Privada de outro Dono)
// e admin -> admin é "direct" (decisão de 2026-10-02; o rastro na auditoria compensa).
const ACCESS: Record<Role, Record<Role, PrivateAccessMode>> = {
	usuario: {
		usuario: "none",
		coordenacao: "none",
		chefe: "none",
		admin: "none",
	},
	coordenacao: {
		usuario: "with-reason",
		coordenacao: "with-reason",
		chefe: "none",
		admin: "none",
	},
	chefe: {
		usuario: "direct",
		coordenacao: "direct",
		chefe: "none",
		admin: "none",
	},
	admin: {
		usuario: "direct",
		coordenacao: "direct",
		chefe: "direct",
		admin: "direct",
	},
};

/**
 * Diz como um papel acessa a Privada de outra pessoa, só pelo nível dos dois.
 * Função pura: não conhece o dono nem a credencial, só os papéis.
 * @param viewerRole Papel de quem quer abrir a credencial.
 * @param ownerRole Papel (atual) do proprietário da credencial.
 * @returns `none`, `with-reason` (pedir motivo) ou `direct` (não pedir, mas auditar).
 */
export function privateAccessMode(
	viewerRole: Role,
	ownerRole: Role,
): PrivateAccessMode {
	return ACCESS[viewerRole][ownerRole];
}
