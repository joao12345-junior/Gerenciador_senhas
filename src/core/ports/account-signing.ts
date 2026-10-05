// src/core/ports/account-signing.ts

import type { Role } from "../domain/role";

export interface UnsignedAccount {
	readonly id: number;
	readonly name: string;
	readonly email: string;
	readonly role: Role;
	readonly createdAt: Date;
}

/**
 * port de manutenção, usada só por scripts e fora do fluxo de login
 */
export interface AccountSigning {
	/**
	 * listUnsigned devolve só contas com auth_mac nulo, incluindo desativadas e apagadas, nunca carrega hash nem segredo.
	 */
	listUnsigned(): Promise<readonly UnsignedAccount[]>;
	/**
	 * sign assina apenas contas ainda sem MAC. Conta com MAC, mesmo inválido, é ignorada, porque está adulterada e assinar de novo a legitimaria.
	 * @param ids ids das contas que o operador confirmou
	 * @returns O retorno é a quantidade realmente assinada e pode ser menor que ids.length; isso não é erro.
	 */
	sign(ids: readonly number[]): Promise<number>;
}
