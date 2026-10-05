-- Ciclo de vida do usuário (Ativo -> Desligado -> Excluído) e novo papel "chefe".
-- Excluir NUNCA apaga a linha: só preenche deleted_at. Os dados ficam no banco.

ALTER TABLE app_user
	-- Desligado: não loga, sessões encerradas, continua listado para admin/coordenação.
	ADD COLUMN deactivated_at timestamptz,
	-- Excluído: some para todos, menos admin. A linha e as credenciais permanecem.
	ADD COLUMN deleted_at     timestamptz,
	ADD COLUMN deleted_by     integer REFERENCES app_user (id);

-- Excluir só vale para quem já foi desligado
ALTER TABLE app_user
	ADD CONSTRAINT app_user_deleted_requires_deactivated
	CHECK (deleted_at IS NULL OR deactivated_at IS NOT NULL);

-- Novo papel (rótulo na tela: "Dono"). Manter sincronizado com ROLES em src/core/domain/role.ts.
ALTER TABLE app_user DROP CONSTRAINT app_user_role_valid;
ALTER TABLE app_user
	ADD CONSTRAINT app_user_role_valid
	CHECK (role IN ('usuario', 'coordenacao', 'chefe', 'admin'));
