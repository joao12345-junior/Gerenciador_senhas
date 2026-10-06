-- 010_disciplines.sql
-- Disciplinas (Elétrica, Gás, Hidro...) e as tabelas que ligam usuários, grupos, subgrupos e
-- credenciais a elas. Acesso final = visibilidade E disciplina. "Geral" é a disciplina
-- universal: o que é Geral é visível a todas as disciplinas.
-- O migrate.ts já roda cada arquivo em uma transação: não usar BEGIN/COMMIT aqui.

CREATE TABLE discipline (
	id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	name         text        NOT NULL,
	-- true só para "Geral". Automática: não se edita, não se desativa, não se exclui.
	is_universal boolean     NOT NULL DEFAULT false,
	-- Disciplina nunca é excluída (há usuários e credenciais ligados): desativa-se.
	-- Desativada some das opções novas, mas os vínculos existentes continuam valendo.
	active       boolean     NOT NULL DEFAULT true,
	position     integer     NOT NULL DEFAULT 0,
	created_at   timestamptz NOT NULL DEFAULT now(),
	updated_at   timestamptz NOT NULL DEFAULT now(),

	-- A universal não pode ser desativada
	CONSTRAINT discipline_universal_is_active CHECK (NOT is_universal OR active),
	-- Necessário para a chave estrangeira composta de user_discipline (ver abaixo)
	CONSTRAINT discipline_id_universal_key UNIQUE (id, is_universal)
);

CREATE UNIQUE INDEX discipline_name_key ON discipline (lower(name));
-- No máximo UMA disciplina universal em todo o banco
CREATE UNIQUE INDEX discipline_one_universal_key ON discipline (is_universal) WHERE is_universal;

-- Nomes oficiais ainda a confirmar com a Raisa; renomear depois é ação do admin, não migration.
INSERT INTO discipline (name, is_universal, position) VALUES
	('Geral',         true,  0),
	('Elétrica',      false, 1),
	('Gás',           false, 2),
	('Hidro',         false, 3),
	('Gás medicinal', false, 4),
	('PPCI',          false, 5),
	('Óleo',          false, 6);

-- Disciplinas de cada usuário. "Geral" NÃO é gravada aqui: todo usuário a tem implicitamente.
-- Dono (chefe) e Admin também não têm linhas: veem todas as disciplinas pelo papel.
-- A chave estrangeira composta (discipline_id, is_universal) com is_universal sempre false
-- só deixa referenciar disciplinas NÃO universais: o banco recusa "Geral" aqui.
CREATE TABLE user_discipline (
	user_id       integer NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
	discipline_id integer NOT NULL,
	is_universal  boolean NOT NULL DEFAULT false CHECK (NOT is_universal),
	PRIMARY KEY (user_id, discipline_id),
	FOREIGN KEY (discipline_id, is_universal) REFERENCES discipline (id, is_universal) ON DELETE RESTRICT
);
-- Quantos usuários têm cada disciplina (tela de disciplinas) e checagem de uso
CREATE INDEX user_discipline_discipline_id_idx ON user_discipline (discipline_id);

-- Disciplinas dos contêineres e das credenciais. Aqui "Geral" PODE aparecer: é como
-- "visível a todas" é representado. Mínimo de 1 linha por item e a regra de que as
-- disciplinas do subgrupo cabem nas do grupo (e as da credencial, nas do subgrupo) são
-- validadas pelo servidor: o banco não consegue expressar isso sem gatilho.
CREATE TABLE group_discipline (
	group_id      integer NOT NULL REFERENCES vault_group (id) ON DELETE CASCADE,
	discipline_id integer NOT NULL REFERENCES discipline (id) ON DELETE RESTRICT,
	PRIMARY KEY (group_id, discipline_id)
);
CREATE INDEX group_discipline_discipline_id_idx ON group_discipline (discipline_id);

CREATE TABLE subgroup_discipline (
	subgroup_id   integer NOT NULL REFERENCES vault_subgroup (id) ON DELETE CASCADE,
	discipline_id integer NOT NULL REFERENCES discipline (id) ON DELETE RESTRICT,
	PRIMARY KEY (subgroup_id, discipline_id)
);
CREATE INDEX subgroup_discipline_discipline_id_idx ON subgroup_discipline (discipline_id);

CREATE TABLE credential_discipline (
	credential_id uuid    NOT NULL REFERENCES credential (id) ON DELETE CASCADE,
	discipline_id integer NOT NULL REFERENCES discipline (id) ON DELETE RESTRICT,
	PRIMARY KEY (credential_id, discipline_id)
);
-- O filtro de disciplina roda no SQL por aqui, antes de decifrar qualquer coisa
CREATE INDEX credential_discipline_discipline_id_idx ON credential_discipline (discipline_id);

-- Backfill: tudo o que já existe vira Geral, então ninguém perde acesso a nada.
-- Usuários existentes NÃO recebem disciplina específica (decisão de 2026-10-06): continuam
-- vendo o que é Geral e só passam a ver credenciais restritas quando o admin atribuir.
INSERT INTO group_discipline (group_id, discipline_id)
	SELECT g.id, d.id FROM vault_group g CROSS JOIN discipline d WHERE d.is_universal;
INSERT INTO subgroup_discipline (subgroup_id, discipline_id)
	SELECT s.id, d.id FROM vault_subgroup s CROSS JOIN discipline d WHERE d.is_universal;
INSERT INTO credential_discipline (credential_id, discipline_id)
	SELECT c.id, d.id FROM credential c CROSS JOIN discipline d WHERE d.is_universal;
