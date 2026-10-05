// src/adapters/persistence/vault-pool.ts

import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import { getEnv } from "@/config/env";

const globalForPool = globalThis as unknown as { vaultPool?: Pool };

/**
 * Pool único (por instância da função) para o banco do cofre (`optare4`).
 * No ambiente serverless cada instância tem o seu pool, então `max` é baixo:
 * várias instâncias × max conexões não podem estourar o limite do KingHost.
 */
export function getVaultPool(): Pool {
	if (globalForPool.vaultPool) return globalForPool.vaultPool;

	const pool = new Pool({
		connectionString: getEnv().DATABASE_URL,
		ssl: false,
		max: 5,
		idleTimeoutMillis: 5_000,
		connectionTimeoutMillis: 5_000,
	});

	// Sem este handler, um erro em conexão ociosa derruba o processo
	pool.on("error", () => {});

	// Na Vercel, avisa o runtime para esperar o pool encerrar antes de suspender a função.
	if (process.env.VERCEL) attachDatabasePool(pool);

	globalForPool.vaultPool = pool;
	return pool;
}
