// src/adapters/crypto/hmac-auth-integrity.ts

import "server-only";
import type { AuthFields, AuthIntegrity } from "@/core/ports/auth-integrity";
import { createHmac, timingSafeEqual } from "node:crypto";

export class HmacAuthIntegrity implements AuthIntegrity {
	constructor(private readonly key: Buffer) {}

	sign(fields: AuthFields): string {
		return createHmac("sha256", this.key)
			.update(this.canonical(fields), "utf-8")
			.digest("hex");
	}
	verify(fields: AuthFields, mac: string): boolean {
		const macExpect = this.sign(fields);
		const bufferRecebido = Buffer.from(mac);
		const bufferEsperado = Buffer.from(macExpect);

		if (bufferRecebido.length !== bufferEsperado.length) return false;
		return timingSafeEqual(bufferEsperado, bufferRecebido);
	}

	/** A ORDEM dos campos é parte do formato. Mudar a ordem invalida todos os MACs já gravados. */
	private canonical(fields: AuthFields): string {
		return JSON.stringify([
			"auth-mac-v1",
			fields.id,
			fields.email,
			fields.role,
			fields.passwordHash,
			fields.totpSecretEnc,
			fields.totpEnabledAt?.toISOString() ?? null,
			fields.mustChangePassword,
			fields.deactivatedAt?.toISOString() ?? null,
			fields.deletedAt?.toISOString() ?? null,
		]);
	}
}
