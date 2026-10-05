// src/core/ports/auth-integrity.ts

import type { Role } from "../domain/role";

export interface AuthFields {
	readonly id: number;
	readonly email: string;
	readonly role: Role;
	readonly passwordHash: string;
	readonly totpSecretEnc: string | null;
	readonly totpEnabledAt: Date | null;
	readonly mustChangePassword: boolean;
	readonly deactivatedAt: Date | null;
	readonly deletedAt: Date | null;
}

export interface AuthIntegrity {
	sign(fields: AuthFields): string;
	verify(fields: AuthFields, mac: string): boolean;
}
