/** Erro de cifragem/decifragem: payload malformado, chave desconhecida ou dado adulterado. */
export class CipherError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "CipherError";
	}
}

/**
 * Porta de criptografia reversível (usada para senhas, logins e notas das credenciais).
 * O núcleo só conhece este contrato; o algoritmo real fica no adapter.
 */
export interface Cipher {
	/**
	 * Cifra um texto.
	 * @param plaintext Texto em claro.
	 * @param context Amarra o resultado ao seu lugar (ex.: `credential:<uuid>:password`).
	 *   O mesmo contexto é exigido para decifrar, então um valor copiado para outra linha ou coluna falha.
	 */
	encrypt(plaintext: string, context: string): string;

	/** Decifra um payload produzido por `encrypt`. Lança `CipherError` se algo não bater. */
	decrypt(payload: string, context: string): string;
}
