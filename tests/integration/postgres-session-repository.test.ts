// tests/integration/postgres-session-repository.test.ts

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./helpers/test-database";
import { PostgresSessionRepository } from "../../src/adapters/persistence/postgres-session-repository";
import type { NewSession } from "../../src/core/domain/session";

const MISSING_ID = 999_999;
const T0 = new Date("2030-01-01T12:00:00.000Z");
const at = (offsetMs: number): Date => new Date(T0.getTime() + offsetMs);

/** Espera a promessa ser rejeitada e devolve o erro (falha se ela resolver). */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (err: unknown) {
		return err;
	}
	throw new Error("a promessa deveria ter sido rejeitada, mas resolveu");
}

describe("PostgresSessionRepository", () => {
	let db: TestDatabase;
	let sessions: PostgresSessionRepository;

	/** Ids dos usuários "A" e "B" (recriados a cada teste). */
	let userA: number;
	let userB: number;

	/** Garante tokenHash único por chamada. */
	let tokenCounter = 0;
	const nextHash = (): string => `hash-${++tokenCounter}`;

	async function insertUser(email: string): Promise<number> {
		const { rows } = await db.pool.query<{ id: number }>(
			"INSERT INTO app_user (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id",
			[email, email, "hash", "usuario"],
		);
		const row = rows[0];
		if (row === undefined) throw new Error("INSERT de usuário não devolveu id");
		return row.id;
	}

	/** Sessão base do usuário A, com MFA verificado; cada teste sobrescreve só o que exercita. */
	function newSession(overrides: Partial<NewSession> = {}): NewSession {
		return {
			userId: userA,
			tokenHash: nextHash(),
			mfaVerifiedAt: T0,
			expiresAt: at(8 * 60 * 60_000),
			ip: "10.0.0.1",
			userAgent: "vitest",
			...overrides,
		};
	}

	async function countSessions(): Promise<number> {
		const { rows } = await db.pool.query<{ n: string }>("SELECT count(*) AS n FROM session");
		return Number(rows[0]?.n);
	}

	async function rawRow(id: number) {
		const { rows } = await db.pool.query<{
			user_id: number;
			token_hmac: string;
			mfa_verified_at: Date | null;
			expires_at: Date;
			ip: string | null;
			user_agent: string | null;
			last_seen_at: Date;
			created_at: Date;
		}>(
			"SELECT user_id, token_hmac, mfa_verified_at, expires_at, ip, user_agent, last_seen_at, created_at FROM session WHERE id = $1",
			[id],
		);
		return rows[0];
	}

	/** Fixa last_seen_at num valor conhecido (o banco usa now() ao criar). */
	async function setLastSeen(id: number, date: Date): Promise<void> {
		await db.pool.query("UPDATE session SET last_seen_at = $2 WHERE id = $1", [id, date]);
	}

	async function lastSeenOf(id: number): Promise<Date | undefined> {
		return (await rawRow(id))?.last_seen_at;
	}

	beforeAll(async () => {
		db = await createTestDatabase();
		sessions = new PostgresSessionRepository(db.pool);
	});

	beforeEach(async () => {
		// CASCADE leva a tabela session junto
		await db.pool.query("TRUNCATE app_user RESTART IDENTITY CASCADE");
		userA = await insertUser("a@optare.test");
		userB = await insertUser("b@optare.test");
	});

	afterAll(async () => {
		await db.drop();
	});

	// ---------------------------------------------------------------- create

	describe("create", () => {
		it("devolve id gerado pelo banco e o userId enviado", async () => {
			const created = await sessions.create(newSession());

			expect(created.id).toBeGreaterThan(0);
			expect(created.userId).toBe(userA);
		});

		it("devolve mfaVerifiedAt e expiresAt iguais aos enviados", async () => {
			const created = await sessions.create(newSession({ mfaVerifiedAt: T0, expiresAt: at(600_000) }));

			expect(created.mfaVerifiedAt).toEqual(T0);
			expect(created.expiresAt).toEqual(at(600_000));
		});

		it("aceita mfaVerifiedAt nulo (sessão com 2FA pendente)", async () => {
			const created = await sessions.create(newSession({ mfaVerifiedAt: null }));

			expect(created.mfaVerifiedAt).toBeNull();
		});

		it("lastSeenAt e createdAt vêm do banco e começam iguais", async () => {
			const created = await sessions.create(newSession());

			expect(created.createdAt).toBeInstanceOf(Date);
			expect(created.lastSeenAt).toEqual(created.createdAt);
		});

		it("grava tokenHash, ip e userAgent nas colunas certas", async () => {
			const created = await sessions.create(
				newSession({ tokenHash: "meu-hash", ip: "192.168.0.7", userAgent: "Firefox" }),
			);

			const row = await rawRow(created.id);
			expect(row?.token_hmac).toBe("meu-hash");
			expect(row?.ip).toBe("192.168.0.7");
			expect(row?.user_agent).toBe("Firefox");
			expect(row?.user_id).toBe(userA);
		});

		it("aceita ip e userAgent nulos", async () => {
			const created = await sessions.create(newSession({ ip: null, userAgent: null }));

			const row = await rawRow(created.id);
			expect(row?.ip).toBeNull();
			expect(row?.user_agent).toBeNull();
		});

		it("permite várias sessões do mesmo usuário, com ids distintos", async () => {
			const first = await sessions.create(newSession());
			const second = await sessions.create(newSession());

			expect(second.id).not.toBe(first.id);
			expect(await countSessions()).toBe(2);
		});

		it("rejeita tokenHash repetido (23505) e não grava a segunda linha", async () => {
			await sessions.create(newSession({ tokenHash: "repetido" }));

			const err = await rejection(sessions.create(newSession({ tokenHash: "repetido" })));

			expect(err).toMatchObject({ code: "23505" });
			expect(await countSessions()).toBe(1);
		});

		it("rejeita usuário inexistente (23503)", async () => {
			const err = await rejection(sessions.create(newSession({ userId: MISSING_ID })));

			expect(err).toMatchObject({ code: "23503" });
			expect(await countSessions()).toBe(0);
		});
	});

	// ------------------------------------------------------- findByTokenHash

	describe("findByTokenHash", () => {
		it("devolve null quando o hash não existe", async () => {
			expect(await sessions.findByTokenHash("nao-existe")).toBeNull();
		});

		it("devolve null com a tabela vazia e com outras sessões presentes", async () => {
			await sessions.create(newSession());

			expect(await sessions.findByTokenHash("nao-existe")).toBeNull();
		});

		it("devolve exatamente a sessão do hash pedido, entre várias", async () => {
			const a = await sessions.create(newSession({ userId: userA, tokenHash: "hash-a" }));
			const b = await sessions.create(newSession({ userId: userB, tokenHash: "hash-b" }));

			expect(await sessions.findByTokenHash("hash-b")).toEqual(b);
			expect(await sessions.findByTokenHash("hash-a")).toEqual(a);
		});

		it("compara o hash exatamente (diferencia maiúsculas e não aceita prefixo)", async () => {
			await sessions.create(newSession({ tokenHash: "AbCd" }));

			expect(await sessions.findByTokenHash("abcd")).toBeNull();
			expect(await sessions.findByTokenHash("AbC")).toBeNull();
		});

		it("devolve a sessão em qualquer estado, inclusive vencida e com 2FA pendente", async () => {
			const expired = await sessions.create(newSession({ tokenHash: "vencida", expiresAt: at(-60_000) }));
			const pending = await sessions.create(newSession({ tokenHash: "pendente", mfaVerifiedAt: null }));

			expect(await sessions.findByTokenHash("vencida")).toEqual(expired);
			expect((await sessions.findByTokenHash("pendente"))?.mfaVerifiedAt).toBeNull();
			expect((await sessions.findByTokenHash("pendente"))?.id).toBe(pending.id);
		});

		it("mapeia todos os campos do domínio", async () => {
			const created = await sessions.create(newSession({ tokenHash: "completa" }));

			const found = await sessions.findByTokenHash("completa");

			expect(found).toEqual({
				id: created.id,
				userId: userA,
				mfaVerifiedAt: T0,
				expiresAt: at(8 * 60 * 60_000),
				lastSeenAt: created.lastSeenAt,
				createdAt: created.createdAt,
			});
		});
	});

	// ---------------------------------------------------------------- rotate

	describe("rotate", () => {
		it("devolve a nova sessão e apaga a antiga", async () => {
			const old = await sessions.create(newSession({ tokenHash: "velho", mfaVerifiedAt: null }));

			const fresh = await sessions.rotate(old.id, newSession({ tokenHash: "novo" }));

			expect(fresh).not.toBeNull();
			expect(fresh?.id).not.toBe(old.id);
			expect(await sessions.findByTokenHash("velho")).toBeNull();
			expect((await sessions.findByTokenHash("novo"))?.id).toBe(fresh?.id);
			expect(await countSessions()).toBe(1);
		});

		it("a nova sessão usa os dados enviados (userId, mfaVerifiedAt, expiresAt, ip, userAgent)", async () => {
			const old = await sessions.create(newSession({ mfaVerifiedAt: null }));

			const fresh = await sessions.rotate(
				old.id,
				newSession({
					userId: userB,
					tokenHash: "novo",
					mfaVerifiedAt: at(1000),
					expiresAt: at(5000),
					ip: "10.9.9.9",
					userAgent: "Chrome",
				}),
			);

			expect(fresh).toMatchObject({ userId: userB, mfaVerifiedAt: at(1000), expiresAt: at(5000) });
			const row = await rawRow(fresh?.id ?? MISSING_ID);
			expect(row?.token_hmac).toBe("novo");
			expect(row?.ip).toBe("10.9.9.9");
			expect(row?.user_agent).toBe("Chrome");
		});

		it("não mexe nas outras sessões", async () => {
			const other = await sessions.create(newSession({ tokenHash: "outra", userId: userB }));
			const old = await sessions.create(newSession({ tokenHash: "velho" }));

			await sessions.rotate(old.id, newSession({ tokenHash: "novo" }));

			expect(await sessions.findByTokenHash("outra")).toEqual(other);
			expect(await countSessions()).toBe(2);
		});

		it("devolve null e NÃO insere quando a sessão antiga não existe", async () => {
			const result = await sessions.rotate(MISSING_ID, newSession({ tokenHash: "novo" }));

			expect(result).toBeNull();
			expect(await countSessions()).toBe(0);
			expect(await sessions.findByTokenHash("novo")).toBeNull();
		});

		it("não ressuscita sessão encerrada em outra aba (delete antes do rotate)", async () => {
			const old = await sessions.create(newSession({ tokenHash: "velho" }));
			await sessions.delete(old.id);

			const result = await sessions.rotate(old.id, newSession({ tokenHash: "novo" }));

			expect(result).toBeNull();
			expect(await countSessions()).toBe(0);
		});

		it("segunda rotação da mesma sessão antiga devolve null e não cria outra", async () => {
			const old = await sessions.create(newSession({ tokenHash: "velho" }));
			await sessions.rotate(old.id, newSession({ tokenHash: "novo-1" }));

			const second = await sessions.rotate(old.id, newSession({ tokenHash: "novo-2" }));

			expect(second).toBeNull();
			expect(await sessions.findByTokenHash("novo-2")).toBeNull();
			expect(await countSessions()).toBe(1);
		});

		it("com tokenHash repetido rejeita (23505) e a sessão antiga continua existindo (rollback)", async () => {
			await sessions.create(newSession({ tokenHash: "ocupado", userId: userB }));
			const old = await sessions.create(newSession({ tokenHash: "velho" }));

			const err = await rejection(sessions.rotate(old.id, newSession({ tokenHash: "ocupado" })));

			expect(err).toMatchObject({ code: "23505" });
			expect((await sessions.findByTokenHash("velho"))?.id).toBe(old.id);
			expect(await countSessions()).toBe(2);
		});

		it("com usuário inexistente rejeita (23503) e a sessão antiga continua existindo", async () => {
			const old = await sessions.create(newSession({ tokenHash: "velho" }));

			const err = await rejection(sessions.rotate(old.id, newSession({ userId: MISSING_ID })));

			expect(err).toMatchObject({ code: "23503" });
			expect((await sessions.findByTokenHash("velho"))?.id).toBe(old.id);
		});

		it("devolve a conexão ao pool mesmo quando falha (pool de 2 não trava)", async () => {
			await sessions.create(newSession({ tokenHash: "ocupado", userId: userB }));
			const old = await sessions.create(newSession({ tokenHash: "velho" }));

			for (let i = 0; i < 5; i++) {
				await rejection(sessions.rotate(old.id, newSession({ tokenHash: "ocupado" })));
			}
			await sessions.rotate(MISSING_ID, newSession());

			expect((await sessions.findByTokenHash("velho"))?.id).toBe(old.id);
		});

		it("duas rotações simultâneas da mesma sessão: só uma vence", async () => {
			const old = await sessions.create(newSession({ tokenHash: "velho" }));

			const results = await Promise.all([
				sessions.rotate(old.id, newSession({ tokenHash: "novo-1" })),
				sessions.rotate(old.id, newSession({ tokenHash: "novo-2" })),
			]);

			expect(results.filter((r) => r !== null)).toHaveLength(1);
			expect(await countSessions()).toBe(1);
		});
	});

	// ----------------------------------------------------------------- touch

	describe("touch", () => {
		it("avança last_seen_at para a data informada", async () => {
			const s = await sessions.create(newSession());
			await setLastSeen(s.id, T0);

			await sessions.touch(s.id, at(60_000));

			expect(await lastSeenOf(s.id)).toEqual(at(60_000));
		});

		it("não volta o relógio: data mais antiga é ignorada", async () => {
			const s = await sessions.create(newSession());
			await setLastSeen(s.id, at(60_000));

			await sessions.touch(s.id, T0);

			expect(await lastSeenOf(s.id)).toEqual(at(60_000));
		});

		it("data igual à atual não altera nada", async () => {
			const s = await sessions.create(newSession());
			await setLastSeen(s.id, T0);

			await sessions.touch(s.id, T0);

			expect(await lastSeenOf(s.id)).toEqual(T0);
		});

		it("id inexistente não lança nem cria linha", async () => {
			await expect(sessions.touch(MISSING_ID, T0)).resolves.toBeUndefined();

			expect(await countSessions()).toBe(0);
		});

		it("só atualiza a sessão informada", async () => {
			const target = await sessions.create(newSession());
			const other = await sessions.create(newSession());
			await setLastSeen(target.id, T0);
			await setLastSeen(other.id, T0);

			await sessions.touch(target.id, at(60_000));

			expect(await lastSeenOf(other.id)).toEqual(T0);
		});

		it("não altera expiresAt nem mfaVerifiedAt", async () => {
			const s = await sessions.create(newSession({ mfaVerifiedAt: null, expiresAt: at(600_000) }));
			await setLastSeen(s.id, T0);

			await sessions.touch(s.id, at(60_000));

			const row = await rawRow(s.id);
			expect(row?.expires_at).toEqual(at(600_000));
			expect(row?.mfa_verified_at).toBeNull();
		});
	});

	// ---------------------------------------------------------------- delete

	describe("delete", () => {
		it("apaga a sessão informada", async () => {
			const s = await sessions.create(newSession({ tokenHash: "alvo" }));

			await sessions.delete(s.id);

			expect(await sessions.findByTokenHash("alvo")).toBeNull();
			expect(await countSessions()).toBe(0);
		});

		it("não apaga as outras sessões", async () => {
			const target = await sessions.create(newSession());
			const other = await sessions.create(newSession({ tokenHash: "outra" }));

			await sessions.delete(target.id);

			expect(await sessions.findByTokenHash("outra")).toEqual(other);
		});

		it("é idempotente: id inexistente e segunda chamada não lançam", async () => {
			const s = await sessions.create(newSession());

			await expect(sessions.delete(MISSING_ID)).resolves.toBeUndefined();
			await sessions.delete(s.id);
			await expect(sessions.delete(s.id)).resolves.toBeUndefined();
		});
	});

	// -------------------------------------------------------- deleteAllForUser

	describe("deleteAllForUser", () => {
		it("apaga todas as sessões do usuário e devolve quantas", async () => {
			await sessions.create(newSession({ userId: userA }));
			await sessions.create(newSession({ userId: userA, mfaVerifiedAt: null }));
			await sessions.create(newSession({ userId: userA }));

			const count = await sessions.deleteAllForUser(userA);

			expect(count).toBe(3);
			expect(await countSessions()).toBe(0);
		});

		it("não toca nas sessões de outros usuários", async () => {
			await sessions.create(newSession({ userId: userA }));
			const other = await sessions.create(newSession({ userId: userB, tokenHash: "do-b" }));

			await sessions.deleteAllForUser(userA);

			expect(await sessions.findByTokenHash("do-b")).toEqual(other);
		});

		it("devolve 0 para usuário sem sessões ou inexistente", async () => {
			await sessions.create(newSession({ userId: userA }));

			expect(await sessions.deleteAllForUser(userB)).toBe(0);
			expect(await sessions.deleteAllForUser(MISSING_ID)).toBe(0);
			expect(await countSessions()).toBe(1);
		});
	});

	// ----------------------------------------------------------- deleteExpired

	describe("deleteExpired", () => {
		it("apaga as vencidas, mantém as válidas e devolve quantas apagou", async () => {
			await sessions.create(newSession({ expiresAt: at(-60_000) }));
			await sessions.create(newSession({ expiresAt: at(-1) }));
			const valid = await sessions.create(newSession({ tokenHash: "valida", expiresAt: at(60_000) }));

			const count = await sessions.deleteExpired(T0);

			expect(count).toBe(2);
			expect(await sessions.findByTokenHash("valida")).toEqual(valid);
			expect(await countSessions()).toBe(1);
		});

		it("limite inclusivo: expires_at == now é apagada", async () => {
			await sessions.create(newSession({ tokenHash: "no-limite", expiresAt: T0 }));

			expect(await sessions.deleteExpired(T0)).toBe(1);
			expect(await sessions.findByTokenHash("no-limite")).toBeNull();
		});

		it("1 ms antes do vencimento ainda não apaga", async () => {
			await sessions.create(newSession({ expiresAt: at(1) }));

			expect(await sessions.deleteExpired(T0)).toBe(0);
			expect(await countSessions()).toBe(1);
		});

		it("considera só o teto: inatividade antiga não apaga sessão dentro do teto", async () => {
			const s = await sessions.create(newSession({ expiresAt: at(60_000) }));
			await setLastSeen(s.id, at(-3 * 60 * 60_000));

			expect(await sessions.deleteExpired(T0)).toBe(0);
		});

		it("devolve 0 com a tabela vazia", async () => {
			expect(await sessions.deleteExpired(T0)).toBe(0);
		});
	});
});
