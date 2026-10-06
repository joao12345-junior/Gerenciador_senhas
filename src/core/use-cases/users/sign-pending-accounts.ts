// src/core/use-cases/users/sign-pending-accounts.ts

import type {
	AccountSigning,
	UnsignedAccount,
} from "../../ports/account-signing";

/** Resultado de uma execução de `signPendingAccounts`. */
export interface SignPendingResult {
	readonly listed: number;
	readonly signed: number;
}

/**
 * Assina as contas que ainda não têm MAC (`auth_mac`), mas só depois de o operador confirmar.
 *
 * Fluxo: lista as pendentes; se não houver nenhuma, termina sem chamar `confirm`;
 * se `confirm` devolver `false`, termina sem assinar; senão assina exatamente as contas listadas.
 * Assinar diz "o estado atual desta conta está correto": por isso `confirm` é o único ponto
 * de autorização, e `sign` nunca roda sem um `true` explícito dele.
 *
 * @param signing port de manutenção que lista e assina as contas
 * @param confirm recebe as contas listadas e decide se a assinatura segue (`true`) ou não (`false`)
 * @returns `listed` = quantas contas estavam pendentes; `signed` = quantas foram de fato assinadas
 *          (pode ser menor que `listed`, e é 0 se não houve confirmação)
 */
export async function signPendingAccounts(
	signing: AccountSigning,
	confirm: (accounts: readonly UnsignedAccount[]) => Promise<boolean>,
): Promise<SignPendingResult> {
	const accounts = await signing.listUnsigned();
	if (accounts.length === 0) return { listed: 0, signed: 0 };
	if (!(await confirm(accounts))) return { listed: accounts.length, signed: 0 };
	const signed = await signing.sign(accounts.map((a) => a.id));
	return { listed: accounts.length, signed };
}
