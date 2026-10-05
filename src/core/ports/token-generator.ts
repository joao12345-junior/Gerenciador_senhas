// src/core/ports/token-generator.ts

export interface TokenGenerator {
	/** Token opaco para o cookie de sessão. */
	sessionToken(): string;
	/** Código de recuperação legível, formato XXXXX-XXXXX. */
	recoveryCode(): string;
}
