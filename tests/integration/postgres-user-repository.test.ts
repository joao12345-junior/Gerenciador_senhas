// tests/integration/postgres-user-repository.test.ts

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./helpers/test-database";
import { PostgresUserRepository } from "../../src/adapters/persistence/postgres-user-repository";
import { HmacAuthIntegrity } from "../../src/adapters/crypto/hmac-auth-integrity";
import type { NewUser } from "../../src/core/domain/user";
import { AuthIntegrityError } from "../../src/core/errors";

const NEW_USER: NewUser = {
	name: "Ana",
	email: "ana@optare.com.br",
	role: "usuario",
	passwordHash: "hash-de-teste",
	mustChangePassword: true,
};

describe("PostgresUserRepository", () => {
	let db: TestDatabase;
	let repo: PostgresUserRepository;

	beforeAll(async () => {
		db = await createTestDatabase();
		// chave fixa só de teste: 32 bytes com valor 1
		repo = new PostgresUserRepository(
			db.pool,
			new HmacAuthIntegrity(Buffer.alloc(32, 1)),
		);
	});

	beforeEach(async () => {
		await db.pool.query("TRUNCATE app_user RESTART IDENTITY CASCADE");
	});

	afterAll(async () => {
		await db.drop();
	});

	describe("create", () => {
		it("devolve o usuário com id e sem nenhum segredo", async () => {
			const user = await repo.create(NEW_USER);

			expect(user.id).toBe(1);
			expect(user).toMatchObject({
				name: "Ana",
				email: "ana@optare.com.br",
				role: "usuario",
				mustChangePassword: true,
				totpEnabled: false,
				deactivatedAt: null,
				deletedAt: null,
				deletedBy: null,
			});
			expect(user.createdAt).toBeInstanceOf(Date);
			expect(user).not.toHaveProperty("passwordHash");
		});
	});

	describe("findAuthByEmail", () => {
		it("devolve o registro de autenticação de uma conta criada", async () => {
			const user = await repo.create(NEW_USER);
			const record = await repo.findAuthByEmail("ana@optare.com.br");

			expect(record).toMatchObject({
				id: user.id,
				email: "ana@optare.com.br",
				passwordHash: "hash-de-teste",
				totpSecretEnc: null,
				totpLastStep: null,
				failedLoginAttempts: 0,
				lockedUntil: null,
			});
		});

		it("devolve null quando o e-mail não existe", async () => {
			expect(await repo.findAuthByEmail("ninguem@optare.com.br")).toBeNull();
		});

		it("lança AuthIntegrityError se o papel foi alterado direto no banco", async () => {
			const user = await repo.create(NEW_USER);
			// simula ataque: muda o papel sem recalcular o MAC
			await db.pool.query("UPDATE app_user SET role = 'admin' WHERE id = $1", [
				user.id,
			]);

			await expect(
				repo.findAuthByEmail("ana@optare.com.br"),
			).rejects.toBeInstanceOf(AuthIntegrityError);
		});

		it("lança AuthIntegrityError se a conta não tem MAC", async () => {
			const user = await repo.create(NEW_USER);
			await db.pool.query("UPDATE app_user SET auth_mac = NULL WHERE id = $1", [
				user.id,
			]);

			await expect(
				repo.findAuthByEmail("ana@optare.com.br"),
			).rejects.toBeInstanceOf(AuthIntegrityError);
		});
	});

	describe("findAuthById", () => {
		it("devolve o registro de autenticação pelo id", async () => {
			const user = await repo.create(NEW_USER);

			expect(await repo.findAuthById(user.id)).toMatchObject({
				id: user.id,
				email: "ana@optare.com.br",
				passwordHash: "hash-de-teste",
			});
		});

		it("devolve null quando o id não existe", async () => {
			expect(await repo.findAuthById(999)).toBeNull();
		});
	});

	describe("findById", () => {
		it("devolve o usuário sem passwordHash", async () => {
			const user = await repo.create(NEW_USER);

			const found = await repo.findById(user.id);

			expect(found).toMatchObject({
				id: user.id,
				email: "ana@optare.com.br",
				role: "usuario",
			});
			expect(found).not.toHaveProperty("passwordHash");
		});

		it("devolve null quando o id não existe", async () => {
			expect(await repo.findById(999)).toBeNull();
		});

		it("lança AuthIntegrityError se o papel foi alterado direto no banco", async () => {
			const user = await repo.create(NEW_USER);

			await db.pool.query("UPDATE app_user SET role = 'admin' WHERE id = $1", [
				user.id,
			]);

			await expect(repo.findById(user.id)).rejects.toBeInstanceOf(
				AuthIntegrityError,
			);
		});
	});

	describe("updatePasswordHash", () => {
		it("grava o novo hash e recalcula o MAC", async () => {
			const user = await repo.create(NEW_USER);
			await repo.updatePasswordHash(user.id, "novo-hash", false);
			expect(await repo.findAuthById(user.id)).toMatchObject({
				passwordHash: "novo-hash",
				mustChangePassword: false,
			});
		});

		it("não grava nada se a conta foi adulterada", async () => {
			const user = await repo.create(NEW_USER);
			await db.pool.query("UPDATE app_user SET role = 'admin' WHERE id = $1", [
				user.id,
			]);

			await expect(
				repo.updatePasswordHash(user.id, "novo-hash", false),
			).rejects.toBeInstanceOf(AuthIntegrityError);

			const { rows } = await db.pool.query(
				"SELECT password_hash FROM app_user WHERE id = $1",
				[user.id],
			);
			expect(rows[0].password_hash).toBe("hash-de-teste");
		});

		it("lança erro se o usuário não existe", async () => {
			await expect(repo.updatePasswordHash(999, "x", false)).rejects.toThrow();
		});
	});

	describe("saveTotpSecret", () => {
		it("grava o segredo, ativa o 2FA e recalcula o MAC", async () => {
			const user = await repo.create(NEW_USER);
			await repo.saveTotpSecret(user.id, "segredo-cifrado");

			expect(await repo.findAuthById(user.id)).toMatchObject({
				totpSecretEnc: "segredo-cifrado",
				totpEnabled: true,
			});
		});

		it("não grava nada se a conta foi adulterada", async () => {
			const user = await repo.create(NEW_USER);
			await db.pool.query("UPDATE app_user SET role = 'admin' WHERE id = $1", [
				user.id,
			]);

			await expect(
				repo.saveTotpSecret(user.id, "segredo-cifrado"),
			).rejects.toBeInstanceOf(AuthIntegrityError);

			const { rows } = await db.pool.query(
				"SELECT totp_secret_enc FROM app_user WHERE id = $1",
				[user.id],
			);
			expect(rows[0].totp_secret_enc).toBeNull();
		});

		it("lança erro se o usuário não existe", async () => {
			await expect(repo.saveTotpSecret(999, "x")).rejects.toThrow();
		});
	});

	describe("advanceTotpStep", () => {
		it("aceita o primeiro step e grava", async () => {
			const user = await repo.create(NEW_USER);

			expect(await repo.advanceTotpStep(user.id, 100)).toBe(true);
			expect(await repo.findAuthById(user.id)).toMatchObject({
				totpLastStep: 100,
			});
		});

		it("recusa o mesmo step de novo", async () => {
			const user = await repo.create(NEW_USER);
			await repo.advanceTotpStep(user.id, 100);

			expect(await repo.advanceTotpStep(user.id, 100)).toBe(false);
		});

		it("recusa um step menor e mantém o valor", async () => {
			const user = await repo.create(NEW_USER);
			await repo.advanceTotpStep(user.id, 100);

			expect(await repo.advanceTotpStep(user.id, 99)).toBe(false);
			expect(await repo.findAuthById(user.id)).toMatchObject({
				totpLastStep: 100,
			});
		});

		it("aceita um step maior", async () => {
			const user = await repo.create(NEW_USER);
			await repo.advanceTotpStep(user.id, 100);

			expect(await repo.advanceTotpStep(user.id, 101)).toBe(true);
		});

		it("com duas chamadas simultâneas do mesmo step, só uma ganha", async () => {
			const user = await repo.create(NEW_USER);
			// Aquece o pool: abre as 2 conexões antes, senão a 2ª chamada espera
			// a conexão nascer e a corrida não acontece.
			await Promise.all([db.pool.query("SELECT 1"), db.pool.query("SELECT 1")]);

			// Várias rodadas: uma corrida pode "dar sorte" e passar sem querer.
			for (let step = 100; step < 120; step++) {
				const results = await Promise.all([
					repo.advanceTotpStep(user.id, step),
					repo.advanceTotpStep(user.id, step),
				]);

				expect(results.filter(Boolean)).toHaveLength(1);
			}
		});

		it("devolve false se o usuário não existe", async () => {
			expect(await repo.advanceTotpStep(999, 100)).toBe(false);
		});
	});

	describe("registerFailedLogin", () => {
		it("soma uma tentativa a cada chamada", async () => {
			const user = await repo.create(NEW_USER);

			await repo.registerFailedLogin(user.id, null);
			await repo.registerFailedLogin(user.id, null);

			expect(await repo.findAuthById(user.id)).toMatchObject({
				failedLoginAttempts: 2,
			});
		});

		it("grava o bloqueio quando recebe uma data", async () => {
			const user = await repo.create(NEW_USER);
			const until = new Date("2030-01-01T00:00:00Z");

			await repo.registerFailedLogin(user.id, until);

			expect((await repo.findAuthById(user.id))?.lockedUntil).toEqual(until);
		});

		it("lockUntil nulo não remove um bloqueio existente", async () => {
			const user = await repo.create(NEW_USER);
			const until = new Date("2030-01-01T00:00:00Z");

			await repo.registerFailedLogin(user.id, until);
			await repo.registerFailedLogin(user.id, null);

			expect((await repo.findAuthById(user.id))?.lockedUntil).toEqual(until);
		});

		it("Concorrência, igual ao do advanceTotpStep", async () => {
			const user = await repo.create(NEW_USER);
			await Promise.all(
				[1, 2, 3, 4, 5].map(() => repo.registerFailedLogin(user.id, null)),
			);
			expect((await repo.findAuthById(user.id))?.failedLoginAttempts).toBe(5);
		});


		it("devolve o total de tentativas depois do incremento", async () => {
			const user = await repo.create(NEW_USER);

			expect(await repo.registerFailedLogin(user.id, null)).toBe(1);
			expect(await repo.registerFailedLogin(user.id, null)).toBe(2);
			expect(await repo.registerFailedLogin(user.id, null)).toBe(3);
		});

		it("chamadas simultâneas recebem totais distintos (nenhuma lê o mesmo valor)", async () => {
			const user = await repo.create(NEW_USER);

			const totals = await Promise.all(
				[1, 2, 3, 4, 5].map(() => repo.registerFailedLogin(user.id, null)),
			);

			expect([...totals].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
		});

		it("rejeita quando o usuário não existe, citando o id", async () => {
			await expect(repo.registerFailedLogin(999, null)).rejects.toThrow("999");
		});
	});

	describe("refundLoginAttempt", () => {
		it("diminui o contador em um", async () => {
			const user = await repo.create(NEW_USER);
			await repo.registerFailedLogin(user.id, null);
			await repo.registerFailedLogin(user.id, null);

			await repo.refundLoginAttempt(user.id);

			expect(await repo.findAuthById(user.id)).toMatchObject({
				failedLoginAttempts: 1,
			});
		});

		it("desfaz exatamente a reserva: reservar e devolver deixa o contador como estava", async () => {
			const user = await repo.create(NEW_USER);
			await repo.registerFailedLogin(user.id, null);

			await repo.registerFailedLogin(user.id, null);
			await repo.refundLoginAttempt(user.id);

			expect(await repo.findAuthById(user.id)).toMatchObject({
				failedLoginAttempts: 1,
			});
		});

		it("não fica abaixo de zero", async () => {
			const user = await repo.create(NEW_USER);

			await repo.refundLoginAttempt(user.id);
			await repo.refundLoginAttempt(user.id);

			expect(await repo.findAuthById(user.id)).toMatchObject({
				failedLoginAttempts: 0,
			});
		});

		it("não mexe no bloqueio por data", async () => {
			const user = await repo.create(NEW_USER);
			const until = new Date("2030-01-01T00:00:00Z");
			await repo.registerFailedLogin(user.id, until);

			await repo.refundLoginAttempt(user.id);

			expect((await repo.findAuthById(user.id))?.lockedUntil).toEqual(until);
		});

		it("só altera o usuário informado", async () => {
			const ana = await repo.create(NEW_USER);
			const bia = await repo.create({ ...NEW_USER, email: "bia@optare.com.br" });
			await repo.registerFailedLogin(ana.id, null);
			await repo.registerFailedLogin(bia.id, null);

			await repo.refundLoginAttempt(ana.id);

			expect(await repo.findAuthById(ana.id)).toMatchObject({ failedLoginAttempts: 0 });
			expect(await repo.findAuthById(bia.id)).toMatchObject({ failedLoginAttempts: 1 });
		});

		it("usuário inexistente não lança", async () => {
			await expect(repo.refundLoginAttempt(999)).resolves.toBeUndefined();
		});
	});

	describe("resetFailedLogins", () => {
		it("zera as tentativas e remove o bloqueio", async () => {
			const user = await repo.create(NEW_USER);
			await repo.registerFailedLogin(user.id, new Date("2030-01-01T00:00:00Z"));

			await repo.resetFailedLogins(user.id);

			expect(await repo.findAuthById(user.id)).toMatchObject({
				failedLoginAttempts: 0,
				lockedUntil: null,
			});
		});
	});
});
