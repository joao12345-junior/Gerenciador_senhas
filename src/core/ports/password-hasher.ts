// src/core/ports/password-hasher.ts

/**
 * Contrato para hash de senhas. O `core` depende só desta interface;
 * a implementação concreta (argon2id) fica em `adapters/crypto`.
 */
export interface PasswordHasher {
	/** Gera o hash (com salt embutido) de uma senha em texto puro. */
	hash(plain: string): Promise<string>;

	/** Compara a senha com o hash. Retorna `false` (nunca lança) se o hash for inválido. */
	verify(hash: string, plain: string): Promise<boolean>;

	/** Indica se o hash foi gerado com parâmetros antigos e deve ser refeito no próximo login. */
	needsRehash(hash: string): boolean;
}
