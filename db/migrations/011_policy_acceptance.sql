-- 011_policy_acceptance.sql
-- Aceite da política de uso do cofre. Depois do login e do 2FA, quem não aceitou a versão
-- vigente é levado à tela de aceite (o gate fica no app). Cada versão nova da política
-- exige um aceite novo; os anteriores ficam como registro.
-- O migrate.ts já roda cada arquivo em uma transação: não usar BEGIN/COMMIT aqui.

CREATE TABLE policy_acceptance (
	-- RESTRICT: o aceite é registro de que a pessoa leu; não some junto com a conta
	-- (contas nunca são apagadas de verdade, só desligadas/excluídas logicamente).
	user_id        integer     NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
	-- Número da versão vigente da política, definido no código (v1 = 1, v2 = 2...).
	policy_version integer     NOT NULL,
	accepted_at    timestamptz NOT NULL DEFAULT now(),

	-- Uma linha por pessoa e versão. Também protege de duplo clique: o app grava com
	-- INSERT ... ON CONFLICT DO NOTHING e o segundo envio simplesmente não faz nada.
	PRIMARY KEY (user_id, policy_version),
	CONSTRAINT policy_acceptance_version_positive CHECK (policy_version >= 1)
);
