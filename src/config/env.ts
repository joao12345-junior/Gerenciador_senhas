// src/config/env.ts

import { z } from "zod";

/**
 * Chave/pepper de 32 bytes em base64 padrão. 32 bytes viram sempre 43 caracteres
 * mais um "=". O formato rígido evita que `Buffer.from` aceite lixo em silêncio
 * (ele ignora caracteres inválidos) e que a mesma chave apareça com codificações diferentes.
 */
const base64Bytes32 = z.string().regex(/^[A-Za-z0-9+/]{43}=$/, {
	message: "deve ser base64 de exatamente 32 bytes",
});

const EnvSchema = z
	.object({
		DATABASE_URL: z.string().min(1),
		LOGDASH_DATABASE_URL: z.string().min(1),
		LOGDASH_DB_SSL: z
			.enum(["true", "false"])
			.default("false")
			.transform((value) => value === "true"),
		MASTER_KEY_V1: base64Bytes32,
		SESSION_PEPPER: base64Bytes32,
		RECOVERY_PEPPER: base64Bytes32,
		AUTH_MAC_KEY: base64Bytes32,
	})
	.superRefine((env, ctx) => {
		// As chaves precisam ser todas diferentes: se duas forem iguais, a
		// separação de funções (sessão, recuperação, MAC, cifra) deixa de existir.
		const chaves: [string, string][] = [
			["MASTER_KEY_V1", env.MASTER_KEY_V1],
			["SESSION_PEPPER", env.SESSION_PEPPER],
			["RECOVERY_PEPPER", env.RECOVERY_PEPPER],
			["AUTH_MAC_KEY", env.AUTH_MAC_KEY],
		];
		// Compara os BYTES decodificados (não o texto), guardando quem já usou cada valor.
		const donoDoValor = new Map<string, string>();

		for (const [nome, valor] of chaves) {
			const bytes = Buffer.from(valor, "base64").toString("hex");
			const anterior = donoDoValor.get(bytes);

			if (anterior !== undefined) {
				// Só NOMES vão para o erro; o valor da chave nunca.
				ctx.addIssue({
					code: "custom",
					path: [nome],
					message: `igual a ${anterior}`,
				});
			} else {
				donoDoValor.set(bytes, nome);
			}
		}
	});

/** Variáveis de ambiente validadas e tipadas. */
export type Env = Readonly<z.infer<typeof EnvSchema>>;

let cached: Env | undefined;

/**
 * Valida um objeto de variáveis (puro, sem cache). É o que os testes usam.
 * Lança erro listando APENAS o nome das variáveis inválidas, nunca os valores
 * (um valor pode ser URL com senha ou chave, e erro de app vai parar em log).
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
	const result = EnvSchema.safeParse(source);
	if (!result.success) {
		const problems = result.error.issues
			.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
			.join("; ");
		throw new Error(`Configuração de ambiente inválida -> ${problems}`);
	}
	return Object.freeze(result.data);
}

/** Lê e valida `process.env` na primeira chamada; as seguintes reaproveitam o cache. */
export function getEnv(): Env {
	cached ??= parseEnv(process.env);
	return cached;
}
