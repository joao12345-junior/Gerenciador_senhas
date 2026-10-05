-- 002_recovery_codes.sql
-- Códigos de recuperação do 2FA (uso único). Servem quando a pessoa perde o celular.

CREATE TABLE recovery_code (
	id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	user_id    integer     NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
	-- HMAC-SHA256(RECOVERY_PEPPER, código). O código é aleatório e longo, então HMAC basta
	-- (argon2 é para senhas escolhidas por humanos). O pepper impede forjar códigos com acesso só ao banco.
	code_hmac  text        NOT NULL,
	-- NULL = ainda disponível. Preenchido = já usado, nunca reaproveitar.
	used_at    timestamptz,
	created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX recovery_code_hmac_key ON recovery_code (code_hmac);
CREATE INDEX recovery_code_user_id_idx ON recovery_code (user_id);
