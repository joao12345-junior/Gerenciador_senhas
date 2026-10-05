// tests/integration/postgres-account-signing.test.ts

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./helpers/test-database";
import { PostgresAccountSigning } from "../../src/adapters/persistence/postgres-account-signing";
import { PostgresUserRepository } from "../../src/adapters/persistence/postgres-user-repository";
import { HmacAuthIntegrity } from "../../src/adapters/crypto/hmac-auth-integrity";
import type { NewUser, User } from "../../src/core/domain/user";
import { AuthIntegrityError } from "../../src/core/errors";

/** Conta base dos testes; cada teste troca só o e-mail (é UNIQUE). */
const NEW_USER: NewUser = {
	name: "Ana",
	email: "ana@optare.com.br",
	role: "usuario",
	passwordHash: "hash-de-teste",
	mustChangePassword: true,
};

describe("PostgresAccountSigning", () => {
	let db: TestDatabase;
	let signing: PostgresAccountSigning;
	let users: PostgresUserRepository;

	beforeAll(async () => {
		db = await createTestDatabase();
		// Mesma instância nos dois adapters: a chave tem que ser a mesma
		// para o MAC gravado por um passar na verificação do outro.
		const integrity = new HmacAuthIntegrity(Buffer.alloc(32, 1));
		signing = new PostgresAccountSigning(db.pool, integrity);
		users = new PostgresUserRepository(db.pool, integrity);
	});

	beforeEach(async () => {
		await db.pool.query("TRUNCATE app_user RESTART IDENTITY CASCADE");
	});

	afterAll(async () => {
		await db.drop();
	});

	/**
	 * Cria uma conta e apaga o MAC dela, simulando uma conta antiga
	 * (de antes da migration 007). `create` sempre assina, por isso o UPDATE.
	 */
	async function createUnsignedAccount(email: string): Promise<User> {
		const user = await users.create({ ...NEW_USER, email });
		await db.pool.query("UPDATE app_user SET auth_mac = NULL WHERE id = $1", [
			user.id,
		]);
		return user;
	}

	describe("listUnsigned", () => {
		it("devolve só as contas sem MAC", async () => {
			const userUnsigned = await createUnsignedAccount("ana@optare.com");
			await users.create({
				...NEW_USER,
				email: "bia@optare.com.br",
			});

			const lista = await signing.listUnsigned();
			expect(lista).toHaveLength(1);
			expect(lista[0]?.id).toBe(userUnsigned.id);
		});
		it("não expõe hash nem segredo", async () => {
			await createUnsignedAccount("ana@optare.com.br");

			const lista = await signing.listUnsigned();

			// Lista fechada: se alguém devolver a linha crua, o teste quebra.
			expect(Object.keys(lista[0]!).sort()).toEqual([
				"createdAt",
				"email",
				"id",
				"name",
				"role",
			]);
		});
	});

	describe("sign", () => {
		it("assina a conta e ela passa a ser lida", async () => {
			const ana = await createUnsignedAccount("ana@optare.com.br");

			expect(await signing.sign([ana.id])).toBe(1);

			// Sem MAC, findAuthById lançaria AuthIntegrityError.
			expect(await users.findAuthById(ana.id)).not.toBeNull();
			expect(await signing.listUnsigned()).toHaveLength(0);
		});

		it("não toca em conta que já tem MAC, mesmo inválido", async () => {
			const ana = await users.create(NEW_USER);
			// Adultera o papel direto no banco: o MAC antigo deixa de bater.
			await db.pool.query("UPDATE app_user SET role = 'admin' WHERE id = $1", [
				ana.id,
			]);

			expect(await signing.sign([ana.id])).toBe(0);

			// Continua adulterada: o sign não pode ter re-assinado.
			await expect(users.findAuthById(ana.id)).rejects.toBeInstanceOf(
				AuthIntegrityError,
			);
		});

		it("ignora id inexistente", async () => {
			expect(await signing.sign([999])).toBe(0);
		});
	});
});
