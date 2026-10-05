// src/adapters/crypto/argon2-password-hasher.ts

import "server-only";
import argon2 from "argon2";
import type { PasswordHasher } from "@/core/ports/password-hasher";

/**
 * Parâmetros argon2id seguindo o mínimo recomendado pela OWASP
 * (19 MiB, 2 iterações, 1 thread). Aumente `memoryCost` se o tempo
 * de hash medido na Vercel ficar abaixo de ~100 ms.
 */
const OPTIONS = {
	type: argon2.argon2id,
	memoryCost: 19_456, // KiB
	timeCost: 2,
	parallelism: 1,
} as const;

/** Implementação de {@link PasswordHasher} com argon2id. */
export class Argon2PasswordHasher implements PasswordHasher {
	async hash(plain: string): Promise<string> {
		return argon2.hash(plain, OPTIONS);
	}

	async verify(hash: string, plain: string): Promise<boolean> {
		try {
			return await argon2.verify(hash, plain);
		} catch {
			return false;
		}
	}

	needsRehash(hash: string): boolean {
		return argon2.needsRehash(hash, OPTIONS);
	}
}
