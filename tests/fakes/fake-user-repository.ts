// tests/fakes/fake-user-repository.ts

import type { NewUser, User, UserAuthRecord } from "@/core/domain/user";
import { AuthIntegrityError } from "@/core/errors";
import type { UserRepository } from "@/core/ports/user-repository";

/** Repositório em memória. Só implementa o que os casos de uso de auth usam. */
export class FakeUserRepository implements UserRepository {
	private readonly users = new Map<number, UserAuthRecord>();
	private readonly tampered = new Set<number>();

	/** Chamadas a updatePasswordHash, na ordem. */
	readonly passwordUpdates: {
		id: number;
		hash: string;
		mustChange: boolean;
	}[] = [];
	/** Quantas vezes registerFailedLogin / refundLoginAttempt / resetFailedLogins rodaram. */
	registerCalls = 0;
	refundCalls = 0;
	resetCalls = 0;
	/** Se definido, findAuthByEmail lança este erro. */
	failOnFind: Error | null = null;

	add(user: UserAuthRecord): void {
		this.users.set(user.id, user);
	}

	/** Simula uma conta cujo MAC não confere. */
	tamper(id: number): void {
		this.tampered.add(id);
	}

	get(id: number): UserAuthRecord {
		const user = this.users.get(id);
		if (user === undefined) throw new Error("fake: usuário ausente " + id);
		return user;
	}

	async findAuthByEmail(email: string): Promise<UserAuthRecord | null> {
		if (this.failOnFind !== null) throw this.failOnFind;
		for (const user of this.users.values()) {
			if (user.email !== email) continue;
			if (this.tampered.has(user.id)) throw new AuthIntegrityError(user.id);
			return user;
		}
		return null;
	}

	async findAuthById(id: number): Promise<UserAuthRecord | null> {
		return this.users.get(id) ?? null;
	}

	async registerFailedLogin(id: number, lockUntil: Date | null): Promise<number> {
		this.registerCalls++;
		const user = this.get(id);
		const updated = {
			...user,
			failedLoginAttempts: user.failedLoginAttempts + 1,
			lockedUntil: lockUntil ?? user.lockedUntil,
		};
		this.users.set(id, updated);
		return updated.failedLoginAttempts;
	}

	async refundLoginAttempt(id: number): Promise<void> {
		this.refundCalls++;
		const user = this.get(id);
		this.users.set(id, {
			...user,
			failedLoginAttempts: Math.max(user.failedLoginAttempts - 1, 0),
		});
	}

	async resetFailedLogins(id: number): Promise<void> {
		this.resetCalls++;
		this.users.set(id, { ...this.get(id), failedLoginAttempts: 0, lockedUntil: null });
	}

	async updatePasswordHash(id: number, hash: string, mustChange: boolean): Promise<void> {
		this.passwordUpdates.push({ id, hash, mustChange });
		this.users.set(id, { ...this.get(id), passwordHash: hash, mustChangePassword: mustChange });
	}

	async findById(): Promise<User | null> {
		throw new Error("fake: não implementado");
	}
	async create(_data: NewUser): Promise<User> {
		throw new Error("fake: não implementado");
	}
	async saveTotpSecret(): Promise<void> {
		throw new Error("fake: não implementado");
	}
	async advanceTotpStep(): Promise<boolean> {
		throw new Error("fake: não implementado");
	}
}

/** Fábrica de usuário válido com sobrescritas. */
export function makeUser(overrides: Partial<UserAuthRecord> = {}): UserAuthRecord {
	return {
		id: 1,
		name: "Ana",
		email: "ana@optare.com.br",
		role: "usuario",
		mustChangePassword: false,
		totpEnabled: true,
		deactivatedAt: null,
		deletedAt: null,
		deletedBy: null,
		createdAt: new Date("2026-01-01T00:00:00Z"),
		passwordHash: "hashed:correct-password",
		totpSecretEnc: null,
		totpLastStep: null,
		failedLoginAttempts: 0,
		lockedUntil: null,
		...overrides,
	};
}
