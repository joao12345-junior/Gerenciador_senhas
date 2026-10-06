// tests/unit/sign-pending-accounts.test.ts

import { describe, expect, it } from "vitest";
import { signPendingAccounts } from "@/core/use-cases/users/sign-pending-accounts";
import type { UnsignedAccount } from "@/core/ports/account-signing";
import { FakeAccountSigning } from "../fakes/fake-account-signing";

/** Conta de teste; só o id muda entre elas. */
function account(id: number): UnsignedAccount {
	return {
		id,
		name: "Conta " + id,
		email: `conta${id}@optare.com.br`,
		role: "usuario",
		createdAt: new Date("2026-01-01T00:00:00Z"),
	};
}

describe("signPendingAccounts", () => {
	it("sem contas pendentes: não chama confirm nem sign", async () => {
		const signing = new FakeAccountSigning([]);
		let chamado = false;

		const result = await signPendingAccounts(signing, async () => {
			chamado = true;
			return true;
		});

		expect(result).toEqual({ listed: 0, signed: 0 });
		expect(chamado).toBe(false);
		expect(signing.signCalls).toHaveLength(0);
	});
	it("confirm recebe exatamente a lista de listUnsigned", async () => {
		const contas = [account(1), account(2)];
		const signing = new FakeAccountSigning(contas);
		let recebidas: readonly UnsignedAccount[] = [];

		await signPendingAccounts(signing, async (lista) => {
			recebidas = lista;
			return false;
		});

		expect(recebidas).toEqual(contas);
	});
	it("confirm devolve false: não chama sign", async () => {
		const contas = [account(1), account(2)];
		const signing = new FakeAccountSigning(contas);

		const result = await signPendingAccounts(signing, async () => {
			return false;
		});

		expect(result).toEqual({ listed: 2, signed: 0 });
		expect(signing.signCalls).toHaveLength(0);
	});
	it("confirm devolve true: chama sign com os ids, na ordem", async () => {
		const signing = new FakeAccountSigning([account(3), account(5)]);

		const result = await signPendingAccounts(signing, async () => true);

		expect(signing.signCalls).toEqual([[3, 5]]);
		expect(result).toEqual({ listed: 2, signed: 2 });
	});
	it("devolve o número que o sign devolveu, mesmo menor que listed", async () => {
		const signing = new FakeAccountSigning([account(1), account(2)], 1);

		const result = await signPendingAccounts(signing, async () => true);

		expect(result).toEqual({ listed: 2, signed: 1 });
	});
});
