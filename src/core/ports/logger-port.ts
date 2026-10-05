/**
 * Categorias de log do Gerenciador de Senhas.
 * Aparecem na coluna `classe` do LogDash (optsislog.app_logs).
 */
export type LogCategory =
  | "AuthLogin"
  | "AuthMfa"
  | "AuthLockout"
  | "AuthSession"
  | "AdminAction"
  | "UnhandledError"
  | "ServerLifecycle";

/** Entrada de log imutável, independente de onde será persistida. */
export interface LogEntry {
  readonly category: LogCategory;
  readonly message: string;
  /** Dados estruturados; o adapter serializa para JSON. Nunca incluir senhas, tokens ou segredos TOTP. */
  readonly details: Readonly<Record<string, unknown>> | null;
  readonly occurredAt: Date;
}

/** Porta de logging (Hexagonal). O domínio só conhece este contrato, nunca o LogDash. */
export interface Logger {
  debug(entry: LogEntry): Promise<void>;
  info(entry: LogEntry): Promise<void>;
  warn(entry: LogEntry): Promise<void>;
  error(entry: LogEntry): Promise<void>;
}
