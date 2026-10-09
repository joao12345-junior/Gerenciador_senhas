// src/core/domain/session.ts

/** Sessão no banco. O token em claro nunca entra aqui: só o cookie o conhece. */
export interface Session {
	readonly id: number;
	readonly userId: number;
	/** null = senha confere, 2FA pendente: NÃO vale como login. */
	readonly mfaVerifiedAt: Date | null;
	/** Teto absoluto. */
	readonly expiresAt: Date;
	/** Última atividade, para o limite de inatividade. */
	readonly lastSeenAt: Date;
	readonly createdAt: Date;
}

export interface NewSession {
	readonly userId: number;
	/** HMAC do token (TokenHasher). O repositório nunca vê o token em claro. */
	readonly tokenHash: string;
	readonly mfaVerifiedAt: Date | null;
	readonly expiresAt: Date;
	readonly ip: string | null;
	readonly userAgent: string | null;
}
