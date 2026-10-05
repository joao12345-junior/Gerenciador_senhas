// src/adapters/crypto/otpauth-totp.ts

import "server-only";
import * as OTPAuth from "otpauth";
import type { Clock } from "@/core/ports/clock";
import type { TotpService } from "@/core/ports/totp";

const ISSUER = "Cofre Optare";
const PERIOD_SECONDS = 30;

// SHA1 / 6 dígitos / 30 s são os únicos valores que todos os apps
// (Google Authenticator, Microsoft, Authy) suportam de forma garantida.
const BASE = {
	issuer: ISSUER,
	algorithm: "SHA1",
	digits: 6,
	period: PERIOD_SECONDS,
};

/** Implementação de {@link TotpService} com a biblioteca `otpauth`. */
export class OtpauthTotpService implements TotpService {
	constructor(private readonly clock: Clock) {}

	generateSecret(): string {
		return new OTPAuth.Secret({ size: 20 }).base32;
	}

	buildOtpAuthUri(secret: string, accountName: string): string {
		return new OTPAuth.TOTP({
			...BASE,
			label: accountName,
			secret: OTPAuth.Secret.fromBase32(secret),
		}).toString();
	}

	verify(secret: string, code: string): number | null {
		// Rejeita antes de chamar a lib: só 6 dígitos numéricos são válidos
		if (!/^\d{6}$/.test(code)) return null;

		const timestamp = this.clock.now().getTime();
		const totp = new OTPAuth.TOTP({
			...BASE,
			secret: OTPAuth.Secret.fromBase32(secret),
		});

		// window: 1 tolera 1 passo (30 s) de diferença de relógio para cada lado.
		const delta = totp.validate({ token: code, timestamp, window: 1 });
		if (delta === null) return null;
		return Math.floor(timestamp / 1000 / PERIOD_SECONDS) + delta;
	}
}
