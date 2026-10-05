-- 003_platforms_credentials.sql
-- Plataformas de publicação de projetos e as credenciais de acesso a elas.

CREATE TABLE platform (
	id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	name       text        NOT NULL,
	url        text,
	logo_url   text,
	-- Plataforma com credenciais não se exclui: desativa-se (histórico e auditoria continuam válidos).
	active     boolean     NOT NULL DEFAULT true,
	created_at timestamptz NOT NULL DEFAULT now(),
	updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX platform_name_key ON platform (lower(name));

CREATE TABLE credential (
	-- UUID gerado pelo app ANTES do INSERT: o id entra como AAD na cifragem AES-GCM,
	-- então precisa existir antes de cifrar. Também não é enumerável pela URL.
	id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
	platform_id    integer     NOT NULL REFERENCES platform (id) ON DELETE RESTRICT,
	-- 'shared' = conta geral da empresa; 'personal' = conta de um funcionário.
	kind           text        NOT NULL,
	-- Dono da conta pessoal. RESTRICT: ao remover um funcionário, o admin precisa decidir
	-- o que fazer com as credenciais dele (reatribuir ou excluir), em vez de sumirem sozinhas.
	owner_user_id  integer     REFERENCES app_user (id) ON DELETE RESTRICT,
	label          text,
	-- Campos CIFRADOS (AES-256-GCM) na forma autodescritiva: "v1.<iv>.<tag>.<texto>" em base64.
	-- O prefixo é a versão da chave, para permitir rotação sem coluna extra.
	login_enc      text        NOT NULL,
	password_enc   text        NOT NULL,
	notes_enc      text,
	created_by     integer     REFERENCES app_user (id) ON DELETE SET NULL,
	updated_by     integer     REFERENCES app_user (id) ON DELETE SET NULL,
	created_at     timestamptz NOT NULL DEFAULT now(),
	updated_at     timestamptz NOT NULL DEFAULT now(),

	CONSTRAINT credential_kind_valid CHECK (kind IN ('shared', 'personal')),
	-- Geral não tem dono; pessoal sempre tem.
	CONSTRAINT credential_owner_matches_kind CHECK (
		(kind = 'shared'   AND owner_user_id IS NULL) OR
		(kind = 'personal' AND owner_user_id IS NOT NULL)
	)
);

CREATE INDEX credential_platform_id_idx ON credential (platform_id);
CREATE INDEX credential_owner_user_id_idx ON credential (owner_user_id);
