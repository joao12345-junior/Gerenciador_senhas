// scripts/sign-existing-users.ts
//
// Assina (auth_mac) as contas que ainda não têm MAC.
//   dry-run (padrão):  npm run sign-users            -> só lista
//   assinar de verdade: npm run sign-users -- --apply -> lista, pede confirmação e assina

import { createInterface } from "node:readline/promises";
import { Pool } from "pg";
import { getEnv } from "../src/config/env";
import { HmacAuthIntegrity } from "../src/adapters/crypto/hmac-auth-integrity";
import { PostgresAccountSigning } from "../src/adapters/persistence/postgres-account-signing";
import { signPendingAccounts } from "../src/core/use-cases/users/sign-pending-accounts";
import type { UnsignedAccount } from "../src/core/ports/account-signing";

/** Imprime uma linha por conta: id, e-mail, papel e data de criação. */
function printAccounts(accounts: readonly UnsignedAccount[]): void {
	for (const a of accounts) {
		console.log(
			`${a.id} | ${a.email} | ${a.role} | ${a.createdAt.toISOString()}`,
		);
	}
}

async function main(): Promise<void> {
	const apply = process.argv.includes("--apply");

	// 1) Ambiente: getEnv() valida tudo e, se faltar algo, lista só os NOMES.
	//    Use env.DATABASE_URL e env.AUTH_MAC_KEY (base64 -> Buffer.from(..., "base64")).
	const env = getEnv();

	// 2) Pool de 1 conexão, ssl: false (KingHost), igual ao migrate.ts.
	//    Depois: new HmacAuthIntegrity(chave) e new PostgresAccountSigning(pool, integrity).
	const pool = new Pool({
		connectionString: env.DATABASE_URL,
		ssl: false,
		max: 1,
	});
	const integrity = new HmacAuthIntegrity(
		Buffer.from(env.AUTH_MAC_KEY, "base64"),
	);

	const signing = new PostgresAccountSigning(pool, integrity);

	// 3) confirm (o "espião" do caso de uso):
	//    - sempre imprime a lista (printAccounts)
	//    - sem --apply: devolve false (dry-run)
	//    - com --apply: pergunta "Digite N para confirmar" (readline/promises)
	//      e devolve true só se a resposta, sem espaços, for igual a String(accounts.length)
	const confirm = async (
		accounts: readonly UnsignedAccount[],
	): Promise<boolean> => {
		printAccounts(accounts);
		if (!apply) return false;

		const rl = createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		try {
			const resposta = await rl.question(
				`Digite ${accounts.length} para assinar essas contas: `,
			);
			return resposta.trim() === String(accounts.length);
		} finally {
			rl.close();
		}
	};

	// 4) try { const result = await signPendingAccounts(signing, confirm); imprime listed e signed }
	//    finally { await pool.end() }
	try {
		const result = await signPendingAccounts(signing, confirm);

		if (result.listed === 0) {
			console.log("Nenhuma conta pendente.");
		} else if (!apply) {
			console.log("Dry-run: nada foi assinado. Use --apply para assinar.");
		} else if (result.signed === 0) {
			console.log("Confirmação não conferiu: nada foi assinado.");
		} else {
			console.log(`Assinadas ${result.signed} de ${result.listed}.`);
		}
	} finally {
		await pool.end();
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
