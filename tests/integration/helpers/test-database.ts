// tests/integration/helpers/test-database.ts

import { randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client, Pool } from "pg";

const MIGRATIONS_DIR = fileURLToPath(
	new URL("../../../db/migrations", import.meta.url),
);
const SCHEMA_PATTERN = /^zz_test_[a-f0-9]{16}$/;

export interface TestDatabase {
	readonly pool: Pool;
	readonly schema: string;
	/** Fecha o pool e apaga o schema. Chamar no afterAll. */
	drop(): Promise<void>;
}

function databaseUrl(): string {
	const url = process.env.DATABASE_URL;
	if (!url)
		throw new Error(
			"DATABASE_URL não definida (use: npm run test:integration)",
		);
	return url;
}

/** Roda um comando com uma conexão de admin (fora do schema de teste) e fecha. */
async function runAsAdmin(sql: string): Promise<void> {
	const client = new Client({ connectionString: databaseUrl(), ssl: false });
	await client.connect();
	try {
		await client.query(sql);
	} finally {
		await client.end();
	}
}

async function dropSchema(schema: string): Promise<void> {
	if (!SCHEMA_PATTERN.test(schema))
		throw new Error("Nome de schema de teste inválido");
	await runAsAdmin(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}

/**
 * Cria um schema temporário no banco, aplica todas as migrations nele e devolve
 * um pool que enxerga só esse schema. Chame `drop()` no `afterAll`.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
	const schema = `zz_test_${randomBytes(8).toString("hex")}`;

	if (!SCHEMA_PATTERN.test(schema))
		throw new Error("Schema não bateu com o SCHEMA_PATTERN");

	await runAsAdmin(`CREATE SCHEMA ${schema}`);

	const pool = new Pool({
		connectionString: databaseUrl(),
		ssl: false,
		max: 2,
		options: `-c search_path=${schema}`,
	});

	try {
		const files = (await readdir(MIGRATIONS_DIR))
			.filter((file) => /^\d{3}_.+\.sql$/.test(file))
			.sort();
		for (const file of files) {
			const sql = await readFile(`${MIGRATIONS_DIR}/${file}`, "utf-8");
			await pool.query(sql);
		}
	} catch (err: unknown) {
		await pool.end();
		await dropSchema(schema).catch(() => undefined); // limpeza best-effort
		throw err;
	}

	return {
		pool,
		schema,
		drop: async () => {
			await pool.end();
			await dropSchema(schema);
		},
	};
}
