// tests/fakes/fake-account-signing.ts

import type {
	AccountSigning,
	UnsignedAccount,
} from "@/core/ports/account-signing";

/** AccountSigning em memória: devolve a lista que recebeu e anota as chamadas a `sign`. */
export class FakeAccountSigning implements AccountSigning {
	/** Um item por chamada a `sign`, com os ids recebidos. */
	readonly signCalls: (readonly number[])[] = [];

	/**
	 * @param accounts o que `listUnsigned` devolve
	 * @param signedResult o que `sign` devolve; se omitido, devolve ids.length
	 */
	constructor(
		private readonly accounts: readonly UnsignedAccount[],
		private readonly signedResult?: number,
	) {}

	async listUnsigned(): Promise<readonly UnsignedAccount[]> {
		return this.accounts;
	}

	async sign(ids: readonly number[]): Promise<number> {
		this.signCalls.push(ids);
		return this.signedResult ?? ids.length;
	}
}
