// src/core/ports/totp.ts

export interface TotpService {
	generateSecret(): string;
	buildOtpAuthUri(secret: string, accountName: string): string;

	/**
	 * Valida um código TOTP de 6 dígitos.
	 * @returns o passo de tempo (janelas de 30 s desde 1970) em que o código casou,
	 * ou `null` se inválido. O chamador deve rejeitar passos menores ou iguais ao
	 * último já consumido pelo usuário (proteção contra reuso do mesmo código).
	 */
	verify(secret: string, code: string): number | null;
}
