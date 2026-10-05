import "server-only";
import { Pool } from "pg";

/**
 * Pool do database optare3 (LogDash).
 * Separado do pool do optare4: Postgres não faz query entre databases.
 */
const globalForPool = globalThis as unknown as { logDashPool?: Pool };

function createPool(): Pool | null {
  const connectionString = process.env.LOGDASH_DATABASE_URL;
  // Sem URL, não cria pool: evita o pg cair no fallback para localhost/variáveis PG*
  if (!connectionString) return null;

  return new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 5_000,
    // KingHost não suporta SSL no Postgres: tráfego Render → KingHost vai em texto puro.
    // Por isso nada sensível é gravado em claro (ver plano: cifragem + HMAC de sessão).
    ssl: false,
  });
}

// Singleton no globalThis: o hot reload do Next.js em dev recriaria o pool a cada edição
export const logDashPool: Pool | null = globalForPool.logDashPool ?? createPool();
if (process.env.NODE_ENV !== "production" && logDashPool) {
  globalForPool.logDashPool = logDashPool;
}
