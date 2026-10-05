// src/adapters/persistence/auth-row.ts

import type { AuthFields } from "@/core/ports/auth-integrity";
import { isRole } from "@/core/domain/role";

/** Linha crua de app_user, como o `pg` entrega (snake_case; timestamptz já vira Date). */
export interface UserRow {
	id: number;
	name: string;
	email: string;
	role: string; // vem do banco: não é confiável até passar por isRole()
	password_hash: string;
	totp_secret_enc: string | null;
	totp_enabled_at: Date | null;
	must_change_password: boolean;
	deactivated_at: Date | null;
	deleted_at: Date | null;
	deleted_by: number | null;
	created_at: Date;
}

/** Colunas que o INSERT devolve e o MAC precisa. */
export const USER_COLUMNS =
	"id, name, email, role, password_hash, totp_secret_enc, totp_enabled_at, " +
	"must_change_password, deactivated_at, deleted_at, deleted_by, created_at";

/** Linha de app_user com as colunas só de autenticação. */
export interface AuthRow extends UserRow {
	auth_mac: string | null;
	totp_last_step: number | null;
	failed_attempts: number;
	locked_until: Date | null;
}

/** Monta os campos cobertos pelo MAC a partir da linha crua; é a mesma forma para assinar e verificar. */
export function toAuthFields(row: UserRow): AuthFields {
	if (!isRole(row.role))
		throw new Error("Papel inválido no banco para o usuário " + row.id);
	return {
		id: row.id,
		email: row.email,
		role: row.role,
		passwordHash: row.password_hash,
		totpSecretEnc: row.totp_secret_enc,
		totpEnabledAt: row.totp_enabled_at,
		mustChangePassword: row.must_change_password,
		deactivatedAt: row.deactivated_at,
		deletedAt: row.deleted_at,
	};
}
