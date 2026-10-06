import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { canonicalChecksum, matchesStoredChecksum } from "./migration-checksum";

/** Pasta com os arquivos .sql, relativa a este script. */
const MIGRATIONS_DIR = fileURLToPath(new URL("../db/migrations", import.meta.url));
const FILE_PATTERN = /^\d{3}_.+\.sql$/;
// Número fixo qualquer: impede duas execuções simultâneas do migrate
const ADVISORY_LOCK_ID = 727_001;

interface AppliedMigration {
	readonly name: string;
	readonly checksum: string;
}

async function main(): Promise<void> {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) {
		throw new Error("DATABASE_URL não definida (use: npm run migrate)");
	}

	// KingHost não suporta SSL no Postgres
	const client = new Client({ connectionString, ssl: false });
	await client.connect();

	try {
		await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_ID]);

		await client.query(`
			CREATE TABLE IF NOT EXISTS schema_migrations (
				name       text PRIMARY KEY,
				checksum   text        NOT NULL,
				applied_at timestamptz NOT NULL DEFAULT now()
			)`);

		const { rows } = await client.query<AppliedMigration>(
			"SELECT name, checksum FROM schema_migrations",
		);
		const applied = new Map(rows.map((row) => [row.name, row.checksum]));

		const files = (await readdir(MIGRATIONS_DIR)).filter((f) => FILE_PATTERN.test(f)).sort();

		for (const file of files) {
			const sql = await readFile(`${MIGRATIONS_DIR}/${file}`, "utf8");
			const previous = applied.get(file);

			if (previous !== undefined) {
				// Migration já aplicada não pode ser editada: crie uma nova (005_...) em vez disso
				// Compara ignorando só LF/CRLF (ver migration-checksum.ts); mudança de conteúdo continua barrada
				if (!matchesStoredChecksum(sql, previous)) {
					throw new Error(`${file} foi alterada depois de aplicada. Crie uma nova migration.`);
				}
				console.log(`= ${file} (já aplicada)`);
				continue;
			}

			// Transação: ou a migration inteira entra, ou nada entra
			await client.query("BEGIN");
			try {
				await client.query(sql);
				await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [
					file,
					canonicalChecksum(sql),
				]);
				await client.query("COMMIT");
				console.log(`+ ${file} aplicada`);
			} catch (error) {
				await client.query("ROLLBACK");
				throw new Error(`Falha em ${file}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
	} finally {
		await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_ID]);
		await client.end();
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
