-- 009_rotation_flags.sql
-- Trocas de senha pendentes: alguém que abriu a senha de uma credencial perdeu o acesso
-- (desligamento ou mudança de visibilidade) e a senha precisa ser alterada no site de origem.
-- Uma linha = uma causa em uma credencial. A lista `pending_fields` diminui conforme os
-- campos são trocados; lista vazia = resolvido (o servidor define as duas colunas juntas).

CREATE TABLE credential_rotation_flag (
	id                integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	-- Excluir a credencial leva os avisos dela junto: não há o que trocar.
	credential_id     uuid        NOT NULL REFERENCES credential (id) ON DELETE CASCADE,
	-- 'user_offboarded' = a pessoa foi desligada; 'visibility_revoked' = Compartilhada virou Privada.
	reason            text        NOT NULL,
	-- Quem causou: o desligado (user_offboarded) ou quem mudou a visibilidade (visibility_revoked).
	-- SET NULL + cópia do nome: o aviso continua legível se a conta sumir (mesmo critério do audit_log).
	caused_by_user_id integer     REFERENCES app_user (id) ON DELETE SET NULL,
	caused_by_name    text,
	-- Campos ainda não trocados. Guarda IDENTIFICADORES, não rótulos: 'login', 'password', 'notes'
	-- ou o id do campo extra. O rótulo ("PIN") mora cifrado em `fields_enc` e não pode vazar aqui.
	pending_fields    text[]      NOT NULL,
	created_at        timestamptz NOT NULL DEFAULT now(),
	resolved_at       timestamptz,

	CONSTRAINT credential_rotation_flag_reason_valid
		CHECK (reason IN ('user_offboarded', 'visibility_revoked')),
	-- Aberto <=> ainda há campo pendente. Impede aviso aberto "vazio" (nunca sairia do painel)
	-- e aviso resolvido com campos sobrando (a tela mostraria como pendente).
	CONSTRAINT credential_rotation_flag_open_iff_pending
		CHECK ((resolved_at IS NULL) = (cardinality(pending_fields) > 0))
);

-- No máximo um aviso ABERTO por credencial + causa. Uma segunda ocorrência da mesma causa
-- não cria linha nova: o app soma os campos à linha aberta (INSERT ... ON CONFLICT DO UPDATE).
-- Resolvidos ficam como histórico e não entram neste índice.
CREATE UNIQUE INDEX credential_rotation_flag_open_key
	ON credential_rotation_flag (credential_id, reason, caused_by_user_id)
	WHERE resolved_at IS NULL;

-- Painel e contagem de "Rotações pendentes" (só os abertos, mais antigos primeiro)
CREATE INDEX credential_rotation_flag_open_idx
	ON credential_rotation_flag (created_at)
	WHERE resolved_at IS NULL;

-- Selo "Troca necessária" na credencial e histórico por credencial
CREATE INDEX credential_rotation_flag_credential_idx
	ON credential_rotation_flag (credential_id);
