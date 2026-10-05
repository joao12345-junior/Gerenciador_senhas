// src/adapters/crypto/crypto-token-generator.ts

import "server-only";
import { randomBytes } from "node:crypto";
import type { TokenGenerator } from "@/core/ports/token-generator";

// 32 símbolos, sem I/O/0/1 (confundem na leitura). Como 256 é múltiplo de 32,
// `byte % 32` não tem viés: cada símbolo tem exatamente a mesma probabilidade.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** {@link TokenGenerator} usando o CSPRNG do Node (`crypto.randomBytes`). */
export class CryptoTokenGenerator implements TokenGenerator {
	sessionToken(): string {
		// 32 bytes = 256 bits de entropia; base64url é seguro para cookie.
		return randomBytes(32).toString("base64url");
	}

	recoveryCode(): string {
		const chars = Array.from(randomBytes(10), (b) =>
			ALPHABET.charAt(b % 32),
		).join("");
		return `${chars.slice(0, 5)}-${chars.slice(5)}`;
	}
}
