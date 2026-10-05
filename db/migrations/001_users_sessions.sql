-- 001_users_sessions.sql
-- Usuários e sessões do Cofre Optare (database optare4).
-- IDs são `integer`: o driver `pg` devolve bigint como string em JS, o que gera bugs sutis.
-- Faixa de 2 bilhões é mais que suficiente para uma ferramenta interna.

CREATE TABLE app_user (
	id                   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	name                 text        NOT NULL,
	email                text        NOT NULL,
	-- Hash argon2id completo (já inclui salt e parâmetros). Nunca a senha.
	password_hash        text        NOT NULL,
	-- Última defesa: o app valida com isRole(), o banco recusa o resto.
	-- Manter esta lista sincronizada com ROLES em src/core/domain/role.ts.
	role                 text        NOT NULL,
	-- Segredo TOTP CIFRADO (AES-GCM), nunca em claro. NULL até a pessoa configurar o 2FA.
	totp_secret_enc      text,
	-- NULL = 2FA pendente ("Pendente" na tela de usuários); preenchido = ativo.
	totp_enabled_at      timestamptz,
	-- Conta nova ou senha redefinida por admin: obriga a trocar a senha no próximo login.
	must_change_password boolean     NOT NULL DEFAULT true,
	-- Bloqueio por tentativas erradas (o rate limit em memória não funciona na Vercel).
	failed_attempts      integer     NOT NULL DEFAULT 0,
	locked_until         timestamptz,
	last_login_at        timestamptz,
	created_at           timestamptz NOT NULL DEFAULT now(),
	updated_at           timestamptz NOT NULL DEFAULT now(),

	CONSTRAINT app_user_role_valid CHECK (role IN ('admin', 'coordenacao', 'usuario')),
	-- O app grava sempre em minúsculo; o banco garante, para o índice único valer.
	CONSTRAINT app_user_email_lower CHECK (email = lower(email)),
	CONSTRAINT app_user_failed_attempts_nonneg CHECK (failed_attempts >= 0)
);

CREATE UNIQUE INDEX app_user_email_key ON app_user (email);

CREATE TABLE session (
	id              integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	user_id         integer     NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
	-- HMAC-SHA256(SESSION_PEPPER, token). O token em si só existe no cookie.
	-- Sem o pepper (env da Vercel), quem escreve no banco não consegue forjar sessão.
	token_hmac      text        NOT NULL,
	-- NULL = senha correta, mas 2FA ainda não confirmado: a sessão NÃO vale como login.
	mfa_verified_at timestamptz,
	expires_at      timestamptz NOT NULL,
	ip              text,
	user_agent      text,
	created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX session_token_hmac_key ON session (token_hmac);
CREATE INDEX session_user_id_idx ON session (user_id);
-- Para a limpeza periódica de sessões vencidas
CREATE INDEX session_expires_at_idx ON session (expires_at);
