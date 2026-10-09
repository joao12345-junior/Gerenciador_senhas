// src/adapters/persistence/session-row.ts

import type { Session } from "@/core/domain/session";

/** Linha crua de `session`, como o driver `pg` devolve (timestamptz vira Date). */
export type SessionRow = Readonly<{
	id: number;
	user_id: number;
	mfa_verified_at: Date | null;
	expires_at: Date;
	last_seen_at: Date;
	created_at: Date;
}>;

/** Colunas lidas de `session`. Sem token_hmac, ip e user_agent: o domínio não precisa deles. */
export const SESSION_COLUMNS =
	"id, user_id, mfa_verified_at, expires_at, last_seen_at, created_at";

/** snake_case → camelCase. Sem regra de negócio aqui. */
export function toSession(row: SessionRow): Session {
	return {
		id: row.id,
		userId: row.user_id,
		mfaVerifiedAt: row.mfa_verified_at,
		expiresAt: row.expires_at,
		lastSeenAt: row.last_seen_at,
		createdAt: row.created_at,
	};
}
