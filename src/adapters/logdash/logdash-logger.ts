import "server-only";
import type { Pool } from "pg";
import type { LogEntry, Logger } from "@/core/ports/logger-port";

type LogDashLevel = "debug" | "info" | "aviso" | "erro";

const PROGRAM = "Gerenciador_senhas";
const INSERT_QUERY = `INSERT INTO optsislog.app_logs (classe, tipo, mensagem, detalhes, ocorrido_em, programa)
VALUES ($1, $2, $3, $4, $5, $6)`;

const LEVEL_RANK: Readonly<Record<LogDashLevel, number>> = { debug: 0, info: 1, aviso: 2, erro: 3 };

/** Adapter que grava logs na tabela optsislog.app_logs do LogDash (optare3). */
export class LogDashLogger implements Logger {
  /**
   * @param pool Pool do optare3; null desativa a gravação (só console).
   * @param minLevel Nível mínimo gravado.
   */
  constructor(
    private readonly pool: Pool | null,
    private readonly minLevel: LogDashLevel = "info",
  ) {}

  debug(entry: LogEntry): Promise<void> { return this.persist("debug", entry); }
  info(entry: LogEntry): Promise<void> { return this.persist("info", entry); }
  warn(entry: LogEntry): Promise<void> { return this.persist("aviso", entry); }
  error(entry: LogEntry): Promise<void> { return this.persist("erro", entry); }

  /** Nunca lança exceção: falha de log não pode derrubar o login. */
  private async persist(level: LogDashLevel, entry: LogEntry): Promise<void> {
    if (LEVEL_RANK[level] < LEVEL_RANK[this.minLevel]) return;

    if (this.pool === null) {
      console.warn("[logdash-logger] LOGDASH_DATABASE_URL ausente:", level, entry.message);
      return;
    }

    try {
      await this.pool.query(INSERT_QUERY, [
        entry.category,
        level,
        entry.message,
        entry.details === null ? null : JSON.stringify(entry.details),
        entry.occurredAt,
        PROGRAM,
      ]);
    } catch (err: unknown) {
      console.error("[logdash-logger] Falha ao gravar log:", err);
    }
  }
}
