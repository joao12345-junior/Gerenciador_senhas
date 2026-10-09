-- 013_session_activity.sql
-- Última atividade da sessão, para o limite de inatividade (30 min) além do teto absoluto
-- (`expires_at`, 8 h). O app só atualiza esta coluna se a anterior tiver mais de ~1 min,
-- para não gravar no banco a cada requisição.
-- O migrate.ts já roda cada arquivo em uma transação: não usar BEGIN/COMMIT aqui.

-- DEFAULT now(): sessões que já existirem começam "ativas agora" e expiram pelo teto normal.
ALTER TABLE session ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
