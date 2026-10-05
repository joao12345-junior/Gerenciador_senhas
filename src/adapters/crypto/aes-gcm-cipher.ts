import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { CipherError, type Cipher } from "@/core/ports/cipher";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12; // tamanho recomendado para GCM
const TAG_BYTES = 16;
const VERSION_PATTERN = /^v(\d+)$/;

/** Converte uma chave em base64 para bytes, exigindo exatamente 32 bytes (AES-256). */
export function parseKey(base64: string): Buffer {
	const key = Buffer.from(base64, "base64");
	if (key.length !== KEY_BYTES) {
		throw new CipherError(`A chave precisa ter ${KEY_BYTES} bytes (em base64)`);
	}
	return key;
}

/**
 * Cifra com AES-256-GCM. Formato do payload: `v<versão>.<iv>.<tag>.<texto>` (base64url).
 * A versão indica qual chave foi usada, o que permite rotacionar chaves sem migrar tudo de uma vez.
 */
export class AesGcmCipher implements Cipher {
	/**
	 * @param keys Chaves por versão (todas de 32 bytes). Mantenha as antigas para ler dados antigos.
	 * @param currentVersion Versão usada para cifrar dados novos.
	 */
	constructor(
		private readonly keys: ReadonlyMap<number, Buffer>,
		private readonly currentVersion: number,
	) {
		for (const key of keys.values()) {
			if (key.length !== KEY_BYTES) {
				throw new CipherError(`Toda chave precisa ter ${KEY_BYTES} bytes`);
			}
		}
		if (!keys.has(currentVersion)) {
			throw new CipherError(`Não há chave para a versão atual v${currentVersion}`);
		}
	}

	encrypt(plaintext: string, context: string): string {
		const key = this.requireKey(this.currentVersion);
		// IV novo e aleatório a cada cifragem: repetir IV com a mesma chave destrói a segurança do GCM
		const iv = randomBytes(IV_BYTES);
		const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
		// AAD: não é cifrado, mas entra na verificação. Trocar o contexto invalida o payload.
		cipher.setAAD(Buffer.from(context, "utf8"));
		const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
		const tag = cipher.getAuthTag();

		return [
			`v${this.currentVersion}`,
			iv.toString("base64url"),
			tag.toString("base64url"),
			ciphertext.toString("base64url"),
		].join(".");
	}

	decrypt(payload: string, context: string): string {
		const parts = payload.split(".");
		if (parts.length !== 4) {
			throw new CipherError("Formato de payload inválido");
		}
		const [versionPart, ivPart, tagPart, dataPart] = parts as [string, string, string, string];

		const match = VERSION_PATTERN.exec(versionPart);
		if (match === null) {
			throw new CipherError("Versão de chave inválida no payload");
		}
		const key = this.requireKey(Number(match[1]));

		const iv = Buffer.from(ivPart, "base64url");
		const tag = Buffer.from(tagPart, "base64url");
		// Exigir os tamanhos exatos evita aceitar tags curtas (ataque conhecido contra GCM)
		if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
			throw new CipherError("IV ou tag com tamanho inválido");
		}

		try {
			const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
			decipher.setAAD(Buffer.from(context, "utf8"));
			decipher.setAuthTag(tag);
			const data = Buffer.from(dataPart, "base64url");
			return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
		} catch (cause) {
			// Mensagem genérica de propósito: não revela se falhou a chave, o contexto ou o dado
			throw new CipherError("Falha ao decifrar", { cause });
		}
	}

	private requireKey(version: number): Buffer {
		const key = this.keys.get(version);
		if (key === undefined) {
			throw new CipherError(`Chave v${version} não disponível`);
		}
		return key;
	}
}
