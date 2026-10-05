import { describe, expect, it } from "vitest";
import { AesGcmCipher, parseKey } from "@/adapters/crypto/aes-gcm-cipher";
import { CipherError } from "@/core/ports/cipher";

const KEY_1 = Buffer.alloc(32, 1);
const KEY_2 = Buffer.alloc(32, 2);
const CONTEXT = "credential:11111111-1111-1111-1111-111111111111:password";

function makeCipher(version = 1): AesGcmCipher {
	return new AesGcmCipher(new Map([[1, KEY_1], [2, KEY_2]]), version);
}

describe("AesGcmCipher", () => {
	it.each(["senha", "", "Pm#Lic2026!vR8q", "açaí 🔐 日本語"])("cifra e decifra %j", (text) => {
		const cipher = makeCipher();
		expect(cipher.decrypt(cipher.encrypt(text, CONTEXT), CONTEXT)).toBe(text);
	});

	it("não deixa o texto em claro no payload", () => {
		expect(makeCipher().encrypt("segredo-visivel", CONTEXT)).not.toContain("segredo-visivel");
	});

	it("gera payload diferente a cada cifragem (IV aleatório)", () => {
		const cipher = makeCipher();
		expect(cipher.encrypt("igual", CONTEXT)).not.toBe(cipher.encrypt("igual", CONTEXT));
	});

	it("marca o payload com a versão da chave", () => {
		expect(makeCipher(1).encrypt("x", CONTEXT).startsWith("v1.")).toBe(true);
		expect(makeCipher(2).encrypt("x", CONTEXT).startsWith("v2.")).toBe(true);
	});

	it("recusa payload adulterado", () => {
		const cipher = makeCipher();
		const [version, iv, tag, data] = cipher.encrypt("segredo", CONTEXT).split(".") as [string, string, string, string];
		const bytes = Buffer.from(data, "base64url");
		bytes[0] = (bytes[0] ?? 0) ^ 0xff; // inverte os bits do primeiro byte
		const tampered = [version, iv, tag, bytes.toString("base64url")].join(".");
		expect(() => cipher.decrypt(tampered, CONTEXT)).toThrow(CipherError);
	});

	it("recusa contexto diferente (valor copiado para outra linha/coluna)", () => {
		const cipher = makeCipher();
		const payload = cipher.encrypt("segredo", CONTEXT);
		expect(() => cipher.decrypt(payload, "credential:outro-id:password")).toThrow(CipherError);
		expect(() => cipher.decrypt(payload, "credential:11111111-1111-1111-1111-111111111111:login")).toThrow(CipherError);
	});

	it("recusa chave errada", () => {
		const payload = makeCipher(1).encrypt("segredo", CONTEXT);
		const other = new AesGcmCipher(new Map([[1, KEY_2]]), 1);
		expect(() => other.decrypt(payload, CONTEXT)).toThrow(CipherError);
	});

	it("lê dado antigo (v1) depois da rotação para v2", () => {
		const old = makeCipher(1).encrypt("antigo", CONTEXT);
		const rotated = makeCipher(2);
		expect(rotated.decrypt(old, CONTEXT)).toBe("antigo");
		expect(rotated.encrypt("novo", CONTEXT).startsWith("v2.")).toBe(true);
	});

	it("recusa versão de chave desconhecida", () => {
		const payload = makeCipher(2).encrypt("x", CONTEXT);
		const onlyV1 = new AesGcmCipher(new Map([[1, KEY_1]]), 1);
		expect(() => onlyV1.decrypt(payload, CONTEXT)).toThrow(CipherError);
	});

	it.each(["", "abc", "v1.a.b", "x1.a.b.c", "v1.a.b.c.d", "v1.AAAA.AAAA.AAAA"])(
		"recusa payload malformado %j",
		(payload) => {
			expect(() => makeCipher().decrypt(payload, CONTEXT)).toThrow(CipherError);
		},
	);

	it("recusa construir sem a chave da versão atual", () => {
		expect(() => new AesGcmCipher(new Map([[1, KEY_1]]), 2)).toThrow(CipherError);
	});

	it("recusa chave que não tem 32 bytes", () => {
		expect(() => new AesGcmCipher(new Map([[1, Buffer.alloc(16)]]), 1)).toThrow(CipherError);
	});
});

describe("parseKey", () => {
	it("aceita 32 bytes em base64", () => {
		expect(parseKey(KEY_1.toString("base64")).equals(KEY_1)).toBe(true);
	});

	it.each(["", "curta", Buffer.alloc(16).toString("base64"), Buffer.alloc(33).toString("base64")])(
		"recusa tamanho errado %j",
		(value) => {
			expect(() => parseKey(value)).toThrow(CipherError);
		},
	);
});
