-- 012_normalized_names.sql
-- Nome único sem diferenciar caixa, inclusive em letras acentuadas.
-- O banco do KingHost usa lc_ctype = 'C': lower() só reconhece caixa ASCII, então
-- 'Elétrica' e 'ELÉTRICA' passavam como nomes diferentes nos índices únicos
-- (lower('ELÉTRICA') = 'elÉtrica'). A função abaixo troca as maiúsculas acentuadas do
-- português por minúsculas e depois aplica lower(), sem depender de locale ou de ICU.
-- O migrate.ts já roda cada arquivo em uma transação: não usar BEGIN/COMMIT aqui.

CREATE FUNCTION norm_name(text) RETURNS text
	LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
	AS $$ SELECT lower(translate($1, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'áàâãäéèêëíìîïóòôõöúùûüçñ')) $$;

-- Mesmos índices das migrations 008 e 010, agora sobre o nome normalizado
DROP INDEX vault_group_name_key;
CREATE UNIQUE INDEX vault_group_name_key ON vault_group (norm_name(name));

DROP INDEX vault_subgroup_group_name_key;
CREATE UNIQUE INDEX vault_subgroup_group_name_key ON vault_subgroup (group_id, norm_name(name));

DROP INDEX discipline_name_key;
CREATE UNIQUE INDEX discipline_name_key ON discipline (norm_name(name));
