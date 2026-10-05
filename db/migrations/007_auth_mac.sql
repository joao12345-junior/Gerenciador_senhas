-- MAC de integridade das colunas de autenticação (ver AuthIntegrity).
-- Nullable de propósito: contas existentes ainda não foram assinadas.
-- Depois do script de assinatura inicial, uma migration futura aplica NOT NULL.
ALTER TABLE app_user ADD COLUMN auth_mac text;