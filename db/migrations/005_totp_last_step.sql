-- Último passo TOTP consumido por cada usuário (anti-replay do código de 2FA).
ALTER TABLE app_user ADD COLUMN totp_last_step integer;