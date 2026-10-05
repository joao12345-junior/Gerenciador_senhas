// src/core/domain/user.ts

import type { Role } from "./role";

/** Usuário seguro para expor: nunca contém hash nem segredo. */
export interface User {
	readonly id: number;
	readonly name: string;
	readonly email: string;
	readonly role: Role;
	readonly mustChangePassword: boolean;
	readonly totpEnabled: boolean;
	readonly deactivatedAt: Date | null;
	readonly deletedAt: Date | null;
	readonly deletedBy: number | null;
	readonly createdAt: Date;
}

/** Só os casos de uso de auth enxergam isto. Nunca vai para a resposta HTTP. */
export interface UserAuthRecord extends User {
	readonly passwordHash: string;
	readonly totpSecretEnc: string | null;
	readonly totpLastStep: number | null;
	readonly failedLoginAttempts: number;
	readonly lockedUntil: Date | null;
}

export interface NewUser {
	readonly name: string;
	readonly email: string;
	readonly role: Role;
	readonly passwordHash: string;
	readonly mustChangePassword: boolean;
}
