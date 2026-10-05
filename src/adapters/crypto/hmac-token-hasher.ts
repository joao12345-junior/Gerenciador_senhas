// src/adapters/crypto/hmac-token-hasher.ts

import "server-only";
import { createHmac } from "node:crypto";
import type { TokenHasher } from "@/core/ports/token-hasher";

/** {@link TokenHasher} com HMAC-SHA256. O pepper vem de fora (env), nunca fica no código. */
export class HmacTokenHasher implements TokenHasher {
	constructor(private readonly pepper: Buffer) {}

	hash(token: string): string {
		return createHmac("sha256", this.pepper)
			.update(token, "utf-8")
			.digest("hex");
	}
}
