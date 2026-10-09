// src/core/ports/session-repository.ts

import type { NewSession, Session } from "../domain/session";

export interface SessionRepository {
	create(data: NewSession): Promise<Session>;

	/** @returns a sessão (qualquer estado), ou null se o hash não existe. */
	findByTokenHash(tokenHash: string): Promise<Session | null>;

	/**
	 * Troca atomicamente: apaga a sessão antiga e cria a nova (novo token).
	 * Usado ao confirmar o 2FA, para o token do cookie mudar (evita fixação de sessão).
	 * @returns a nova sessão, ou null se a antiga já não existia (ex.: logout em outra aba).
	 */
	rotate(oldId: number, data: NewSession): Promise<Session | null>;

	/** Grava a última atividade. Idempotente; id inexistente não lança. */
	touch(id: number, at: Date): Promise<void>;

	/** Apaga uma sessão (logout). Idempotente: id inexistente não lança. */
	delete(id: number): Promise<void>;

	/** Encerra todas as sessões do usuário (desligamento, troca de senha). @returns quantas. */
	deleteAllForUser(userId: number): Promise<number>;

	/** Limpeza periódica de sessões vencidas. @returns quantas. */
	deleteExpired(now: Date): Promise<number>;
}
