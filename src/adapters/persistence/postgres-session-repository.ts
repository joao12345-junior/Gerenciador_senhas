// src/adapters/persistence/postgres-session-repository.ts

import type { Pool, PoolClient } from "pg";
import type { NewSession, Session } from "../../core/domain/session";
import type { SessionRepository } from "../../core/ports/session-repository";
import { SESSION_COLUMNS, toSession, type SessionRow } from "./session-row";

/**
 * Adaptador de saída (Ports & Adapters) que persiste sessões no Postgres (KingHost,
 * tabela `session`). Implementa a porta {@link SessionRepository}.
 *
 * Só guarda e recupera: quem decide se uma sessão ainda vale é o `session-policy`.
 * O token em claro nunca chega aqui, apenas o HMAC (`tokenHash`).
 *
 * Contrato (difere dos demais repositórios): sessão inexistente não é erro.
 * Consultas devolvem `null`; `touch`, `delete` e `rotate` sobre id ausente não lançam,
 * porque sessões somem legitimamente (logout em outra aba, expiração, limpeza).
 */
export class PostgresSessionRepository implements SessionRepository {
	constructor(private readonly pool: Pool) {}

	/** BEGIN → work(client) → COMMIT; em erro, ROLLBACK e relança; sempre release(). */
	private async withTransaction<T>(
		work: (client: PoolClient) => Promise<T>,
	): Promise<T> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			const result = await work(client);
			await client.query("COMMIT");
			return result;
		} catch (err: unknown) {
			await client.query("ROLLBACK");
			throw err;
		} finally {
			client.release();
		}
	}

	/**
	 * INSERT da sessão. Aceita `Pool` ou `PoolClient` para servir tanto o `create`
	 * (conexão avulsa) quanto o `rotate` (dentro da transação).
	 * Não faz `release()`: quem pega a conexão é quem a devolve.
	 */
	private async insertSession(
		db: Pool | PoolClient,
		data: NewSession,
	): Promise<Session> {
		const { rows } = await db.query<SessionRow>(
			`INSERT INTO session (user_id, token_hmac, mfa_verified_at, expires_at, ip, user_agent)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 RETURNING ${SESSION_COLUMNS}`,
			[
				data.userId,
				data.tokenHash,
				data.mfaVerifiedAt,
				data.expiresAt,
				data.ip,
				data.userAgent,
			],
		);
		const row = rows[0];
		if (row === undefined) throw new Error("INSERT não devolveu linha");
		return toSession(row);
	}

	/**
	 * Cria a sessão. `id`, `created_at` e `last_seen_at` vêm do banco (identity / `now()`).
	 * @throws erro original do pg (23505) se o `tokenHash` já existir.
	 */
	async create(data: NewSession): Promise<Session> {
		return this.insertSession(this.pool, data);
	}

	/** @returns a sessão em qualquer estado (inclusive vencida), ou `null` se o hash não existe. */
	async findByTokenHash(tokenHash: string): Promise<Session | null> {
		const { rows } = await this.pool.query<SessionRow>(
			`SELECT ${SESSION_COLUMNS} FROM session WHERE token_hmac = $1`,
			[tokenHash],
		);

		const row = rows[0];
		if (row === undefined) return null;
		return toSession(row);
	}

	/**
	 * Troca atomicamente a sessão antiga pela nova (novo token), usado após o 2FA
	 * para evitar fixação de sessão.
	 * @returns a nova sessão, ou `null` se a antiga já não existia (nada é inserido).
	 * @throws erro original do pg se o INSERT falhar (ex.: `tokenHash` repetido);
	 * o ROLLBACK restaura a sessão antiga.
	 */
	async rotate(oldId: number, data: NewSession): Promise<Session | null> {
		return this.withTransaction(async (client) => {
			const { rows } = await client.query(
				`DELETE FROM session WHERE id = $1 RETURNING id`,
				[oldId],
			);
			// Nada apagado = a sessão já não existe (logout em outra aba, ou outra
			// requisição rotacionou antes). Inserir aqui ressuscitaria uma sessão encerrada.
			if (rows.length === 0) return null;
			return this.insertSession(client, data);
		});
	}

	/**
	 * Registra a última atividade. Idempotente; id inexistente não lança.
	 * Só avança o relógio: requisições simultâneas podem terminar fora de ordem, e a
	 * mais antiga não pode sobrescrever a mais nova (por isso o `last_seen_at < $2`).
	 */
	async touch(id: number, at: Date): Promise<void> {
		await this.pool.query(
			`UPDATE session SET last_seen_at = $2 WHERE id = $1 AND last_seen_at < $2`,
			[id, at],
		);
	}

	/** Apaga uma sessão (logout). Idempotente: id inexistente não lança. */
	async delete(id: number): Promise<void> {
		await this.pool.query(`DELETE FROM session WHERE id = $1`, [id]);
	}

	/** Encerra todas as sessões do usuário (desligamento, troca de senha). @returns quantas. */
	async deleteAllForUser(userId: number): Promise<number> {
		const { rowCount } = await this.pool.query(
			`DELETE FROM session WHERE user_id = $1`,
			[userId],
		);
		return rowCount ?? 0;
	}

	/**
	 * Limpeza periódica pelo teto absoluto: apaga onde `expires_at <= now`
	 * (limite inclusivo, igual ao `evaluateSession`). Não considera inatividade:
	 * sessões ociosas, mas dentro do teto, ficam até vencer; `evaluateSession`
	 * já as trata como `expired`. @returns quantas.
	 */
	async deleteExpired(now: Date): Promise<number> {
		const { rowCount } = await this.pool.query(
			`DELETE FROM session WHERE expires_at <= $1`,
			[now],
		);
		return rowCount ?? 0;
	}
}
