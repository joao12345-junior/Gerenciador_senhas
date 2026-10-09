// src/core/domain/session-policy.ts  (função pura, testável sem banco)

import type { Session } from "./session";

export const IDLE_TIMEOUT_MS = 30 * 60_000;
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60_000;
export const PENDING_MFA_TIMEOUT_MS = 10 * 60_000;
/** Só regrava last_seen_at se a anterior for mais antiga que isto (evita UPDATE por requisição). */
export const TOUCH_INTERVAL_MS = 60_000;

export type SessionStatus = "active" | "pending-mfa" | "expired";

/**
 * Decide o que a sessão vale agora.
 *
 * Atenção: o prazo de 10 min do MFA pendente NÃO é checado aqui. Ele vale porque
 * o caso de uso de login grava `expiresAt = now + PENDING_MFA_TIMEOUT_MS`
 * nas sessões criadas sem MFA verificado.
 */
export function evaluateSession(session: Session, now: Date): SessionStatus {
	if (now >= session.expiresAt) return "expired";
	if (now.getTime() - session.lastSeenAt.getTime() >= IDLE_TIMEOUT_MS)
		return "expired";
	if (session.mfaVerifiedAt === null) return "pending-mfa";
	return "active";
}

/** True se vale a pena gravar a atividade agora. */
export function shouldTouch(session: Session, now: Date): boolean {
	return now.getTime() - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS;
}
