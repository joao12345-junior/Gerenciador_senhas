-- 008_groups_visibility.sql
-- Grupos de cofre, subgrupos (a antiga `platform`), visibilidade e campos extras das credenciais.
-- Preserva os dados existentes: as plataformas viram subgrupos do grupo "Postagem" e as
-- credenciais continuam apontando para elas (os ids não mudam, só os nomes).
-- O migrate.ts já roda cada arquivo em uma transação: não usar BEGIN/COMMIT aqui.

-- 1) Grupos. Não se chama `group` porque é palavra reservada do SQL.
CREATE TABLE vault_group (
	id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	name           text        NOT NULL,
	-- Nome do ícone Lucide mostrado no bloco da home
	icon           text        NOT NULL DEFAULT 'folder',
	-- Ordem de exibição na home (editável pelo admin)
	position       integer     NOT NULL DEFAULT 0,
	-- Campos padrão sugeridos ao criar credencial do grupo: [{ "label": "...", "secret": bool }].
	-- São só sugestões: mudar aqui não altera credenciais que já existem.
	field_template jsonb       NOT NULL DEFAULT '[]'::jsonb,
	-- Grupo com subgrupos não se exclui: desativa-se.
	active         boolean     NOT NULL DEFAULT true,
	created_at     timestamptz NOT NULL DEFAULT now(),
	updated_at     timestamptz NOT NULL DEFAULT now(),

	CONSTRAINT vault_group_field_template_is_array CHECK (jsonb_typeof(field_template) = 'array')
);

CREATE UNIQUE INDEX vault_group_name_key ON vault_group (lower(name));

-- Todo o conteúdo atual (plataformas de postagem de projetos) vai para este grupo.
INSERT INTO vault_group (name, icon, position) VALUES ('Postagem', 'send', 0);

-- 2) `platform` vira `vault_subgroup`. RENAME mantém ids, dados e as chaves estrangeiras
-- que apontam para a tabela (credential continua ligada sem precisar de UPDATE).
ALTER TABLE platform RENAME TO vault_subgroup;
ALTER TABLE vault_subgroup RENAME CONSTRAINT platform_pkey TO vault_subgroup_pkey;
ALTER SEQUENCE platform_id_seq RENAME TO vault_subgroup_id_seq;

-- Nasce NULL para poder preencher as linhas existentes; depois vira obrigatório.
ALTER TABLE vault_subgroup ADD COLUMN group_id integer REFERENCES vault_group (id) ON DELETE RESTRICT;
UPDATE vault_subgroup SET group_id = (SELECT id FROM vault_group WHERE lower(name) = 'postagem');
ALTER TABLE vault_subgroup ALTER COLUMN group_id SET NOT NULL;

-- O nome deixa de ser único no cofre inteiro e passa a ser único dentro do grupo
DROP INDEX platform_name_key;
CREATE UNIQUE INDEX vault_subgroup_group_name_key ON vault_subgroup (group_id, lower(name));
CREATE INDEX vault_subgroup_group_id_idx ON vault_subgroup (group_id);

-- 3) Credenciais
ALTER TABLE credential RENAME COLUMN platform_id TO subgroup_id;
ALTER TABLE credential RENAME CONSTRAINT credential_platform_id_fkey TO credential_subgroup_id_fkey;
ALTER INDEX credential_platform_id_idx RENAME TO credential_subgroup_id_idx;

-- Login passa a ser opcional (há credenciais que só têm senha)
ALTER TABLE credential ALTER COLUMN login_enc DROP NOT NULL;

-- 'private' = só quem a regra de níveis permite; 'shared' = quem passa nas disciplinas.
-- Entra com default só para as linhas existentes receberem um valor; o default é removido
-- em seguida, para o app ser obrigado a informar a visibilidade em toda credencial nova.
ALTER TABLE credential ADD COLUMN visibility text NOT NULL DEFAULT 'private';
-- Plataforma (kind = 'shared') nunca é privada
UPDATE credential SET visibility = 'shared' WHERE kind = 'shared';
ALTER TABLE credential ALTER COLUMN visibility DROP DEFAULT;

-- Campos extras: JSON [{id, label, value, secret}] cifrado inteiro (AES-GCM), no mesmo
-- formato autodescritivo das outras colunas. A versão da chave vai no prefixo do texto cifrado.
ALTER TABLE credential ADD COLUMN fields_enc text;

ALTER TABLE credential ADD CONSTRAINT credential_visibility_valid
	CHECK (visibility IN ('private', 'shared'));
ALTER TABLE credential ADD CONSTRAINT credential_platform_is_shared
	CHECK (kind <> 'shared' OR visibility = 'shared');
