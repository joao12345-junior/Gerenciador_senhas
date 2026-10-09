// tests/fakes/fake-password-hasher.ts

import type { PasswordHasher } from "@/core/ports/password-hasher";

/** Hash fictício determinístico: `hashed:<senha>`. Registra cada verificação. */
export class FakePasswordHasher implements PasswordHasher {
	readonly verifyCalls: { hash: string; plain: string }[] = [];
	readonly outdated = new Set<string>();

	static hashOf(plain: string): string {
		return "hashed:" + plain;
	}

	async hash(plain: string): Promise<string> {
		return "rehashed:" + plain;
	}

	async verify(hash: string, plain: string): Promise<boolean> {
		this.verifyCalls.push({ hash, plain });
		return hash === FakePasswordHasher.hashOf(plain);
	}

	needsRehash(hash: string): boolean {
		return this.outdated.has(hash);
	}
}
