// src/core/use-cases/users/sign-pending-accounts.ts

import type {
	AccountSigning,
	UnsignedAccount,
} from "../../ports/account-signing";

export interface SignPendingResult {
	readonly listed: number;
	readonly signed: number;
}

const todo = (): never => {
	throw new Error("não implementado");
};

export async function signPendingAccounts(
	signing: AccountSigning,
	confirm: (accounts: readonly UnsignedAccount[]) => Promise<boolean>,
): Promise<SignPendingResult> {
	return todo();
}
