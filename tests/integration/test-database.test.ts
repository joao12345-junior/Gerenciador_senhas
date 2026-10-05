// tests/integration/test-database.test.ts

import { afterAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./helpers/test-database";
import { Client } from "pg";

describe("createTestDatabase", () => {
	const criados: TestDatabase[] = [];
	/** Cria e registra, para o afterAll apagar tudo mesmo se um teste falhar. */
	async function criar(): Promise<TestDatabase> {
		const db = await createTestDatabase();
		criados.push(db);
		return db;
	}

	afterAll(async () => {
		await Promise.allSettled(criados.map((db) => db.drop()));
	});

	it("cria as tabelas das migrations no schema", async () => {
		const db = await criar();
		const { rows } = await db.pool.query(
			"SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'app_user'",
			[db.schema],
		);

		expect(rows).toHaveLength(1);
	});
	it("dois bancos de teste são isolados", async () => {
		const a = await criar();
		const b = await criar();

		await a.pool.query(
			"INSERT INTO app_user (name, email, password_hash, role) VALUES ($1, $2, $3, $4)",
			["Ana", "ana@optare.com.br", "hash", "usuario"],
		);

		const { rows: rowsA } = await a.pool.query(
			"SELECT count(*)::int AS total FROM app_user",
		);
		const { rows: rowsB } = await b.pool.query(
			"SELECT count(*)::int AS total FROM app_user",
		);

		expect(rowsA[0].total).toBe(1);
		expect(rowsB[0].total).toBe(0);
	});
	it("drop remove o schema", async () => {
		const db = await createTestDatabase();
		await db.drop();

		const client = new Client({
			connectionString: process.env.DATABASE_URL,
			ssl: false,
		});
		await client.connect();
		try {
			const { rows } = await client.query(
				"SELECT 1 FROM information_schema.schemata WHERE schema_name = $1",
				[db.schema],
			);
			expect(rows).toHaveLength(0);
		} finally {
			await client.end();
		}
	});
});
