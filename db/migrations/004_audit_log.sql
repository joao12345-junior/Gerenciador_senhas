-- 004_audit_log.sql
-- Auditoria do cofre: quem revelou/copiou/alterou o quê. Só o admin lê (regra no app).
-- NUNCA gravar senha, login em claro, token ou segredo TOTP aqui.

CREATE TABLE audit_log (
	id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	-- SET NULL: excluir o usuário não pode apagar o rastro do que ele fez.
	actor_user_id integer     REFERENCES app_user (id) ON DELETE SET NULL,
	-- Cópia do nome no momento da ação: continua legível mesmo se o usuário for excluído ou renomeado.
	actor_name    text,
	-- Ex.: 'auth.login', 'auth.login_failed', 'credential.reveal', 'credential.copy',
	-- 'credential.update', 'user.role_change'. Sem CHECK de propósito: a lista evolui,
	-- então quem valida é o tipo AuditAction no código.
	action        text        NOT NULL,
	target_type   text,
	-- text porque o alvo pode ser uuid (credencial) ou integer (usuário/plataforma).
	target_id     text,
	-- Nome legível do alvo no momento da ação (ex.: "CREA-RS · ART").
	target_label  text,
	ip            text,
	-- Metadados que NÃO são segredo (ex.: motivo da falha de login).
	details       jsonb,
	created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);
CREATE INDEX audit_log_actor_idx ON audit_log (actor_user_id);
CREATE INDEX audit_log_action_idx ON audit_log (action);

-- Log é append-only: o app só faz INSERT. Este gatilho barra UPDATE/DELETE por engano ou bug.
-- Limite: quem é dono da tabela pode remover o gatilho, então isto protege de erro, não de invasor.
CREATE FUNCTION audit_log_block_changes() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'audit_log é append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update_delete
	BEFORE UPDATE OR DELETE ON audit_log
	FOR EACH ROW EXECUTE FUNCTION audit_log_block_changes();
