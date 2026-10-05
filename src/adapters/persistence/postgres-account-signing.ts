// src/adapters/persistence/postgres-account-signing.ts

import type { Pool } from "pg";
import type { AuthIntegrity } from "../../core/ports/auth-integrity";
import type {
	AccountSigning,
	UnsignedAccount,
} from "../../core/ports/account-signing";
import { isRole } from "@/core/domain/role";
import {
	toAuthFields,
	USER_COLUMNS,
	type AuthRow,
	type UserRow,
} from "./auth-row";

type UnsignedRow = Pick<
	UserRow,
	"id" | "name" | "email" | "role" | "created_at"
>;

function toUnsignedAccount(row: UnsignedRow): UnsignedAccount {
	if (!isRole(row.role))
		throw new Error("Papel inválido no banco para o usuário " + row.id);
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		role: row.role,
		createdAt: row.created_at,
	};
}

/** Adaptador PostgreSQL do `AccountSigning`: assina contas que ainda não têm MAC. */
export class PostgresAccountSigning implements AccountSigning {
	constructor(
		private readonly pool: Pool,
		private readonly integrity: AuthIntegrity,
	) {}

	async listUnsigned(): Promise<readonly UnsignedAccount[]> {
		const { rows } = await this.pool.query<UnsignedRow>(
			"SELECT id, name, email, role, created_at FROM app_user " +
				"WHERE auth_mac IS NULL ORDER BY id",
		);
		return rows.map(toUnsignedAccount);
	}

	async sign(ids: readonly number[]): Promise<number> {
		const client = await this.pool.connect();
		let signed = 0;
		try {
			await client.query("BEGIN");
			for (const id of ids) {
				const { rows } = await client.query<AuthRow>(
					`SELECT ${USER_COLUMNS}, auth_mac FROM app_user WHERE id = $1 FOR UPDATE`,
					[id],
				);
				const row = rows[0];

				if (row === undefined || row.auth_mac !== null) continue;

				const mac = this.integrity.sign(toAuthFields(row));
				await client.query(
					"UPDATE app_user SET auth_mac = $1 WHERE id = $2 AND auth_mac IS NULL",
					[mac, id],
				);
				signed++;
			}
			await client.query("COMMIT");
			return signed;
		} catch (err: unknown) {
			await client.query("ROLLBACK");
			throw err;
		} finally {
			client.release();
		}
	}
}
