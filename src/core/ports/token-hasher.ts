// src/core/ports/token-hasher.ts

export interface TokenHasher {
	/** Hash determinístico (HMAC) de um token. Mesma entrada, mesma saída. */
	hash(token: string): string;
}
