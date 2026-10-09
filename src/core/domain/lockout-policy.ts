// src/core/domain/lockout-policy.ts
//
// Política de bloqueio: 3 erros (de senha OU de 2FA) travam a conta até um admin
// desbloquear. Função pura, testável sem banco.

import type { UserAuthRecord } from "./user";

/** Erros tolerados antes de travar a conta. */
export const MAX_FAILED_ATTEMPTS = 3;

/**
 * True se a conta está travada: o contador chegou ao máximo OU existe um bloqueio
 * com data (`lockedUntil`) ainda no futuro.
 */
export function isLocked(
	user: Pick<UserAuthRecord, "failedLoginAttempts" | "lockedUntil">,
	now: Date,
): boolean {
	return (
		user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS ||
		(user.lockedUntil !== null && user.lockedUntil > now)
	);
}
