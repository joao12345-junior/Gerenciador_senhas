// src/core/ports/user-repository.ts
import type { User, UserAuthRecord, NewUser } from "../domain/user";

export interface UserRepository {
	findById(id: number): Promise<User | null>;
	findAuthByEmail(email: string): Promise<UserAuthRecord | null>;
	findAuthById(id: number): Promise<UserAuthRecord | null>;
	create(data: NewUser): Promise<User>;

	updatePasswordHash(
		id: number,
		hash: string,
		mustChange: boolean,
	): Promise<void>;
	saveTotpSecret(id: number, secretEnc: string): Promise<void>;

	/** Anti-replay: true só se o step for MAIOR que o último usado. */
	advanceTotpStep(id: number, step: number): Promise<boolean>;

	registerFailedLogin(id: number, lockUntil: Date | null): Promise<void>;
	resetFailedLogins(id: number): Promise<void>;
}
