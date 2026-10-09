// src/adapters/persistence/postgres-user-repository.ts

import type { Pool, PoolClient } from "pg";
import type { AuthIntegrity } from "../../core/ports/auth-integrity";
import type { UserRepository } from "../../core/ports/user-repository";
import type { NewUser, User, UserAuthRecord } from "../../core/domain/user";
import { isRole } from "../../core/domain/role";
import { AuthIntegrityError } from "../../core/errors";
import { USER_COLUMNS, toAuthFields } from "./auth-row";
import type { AuthRow, UserRow } from "./auth-row";

function toUser(row: UserRow): User {
	if (!isRole(row.role))
		throw new Error("Papel inválido no banco para o usuário " + row.id);
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		role: row.role,
		mustChangePassword: row.must_change_password,
		totpEnabled: row.totp_enabled_at !== null,
		deactivatedAt: row.deactivated_at,
		deletedAt: row.deleted_at,
		deletedBy: row.deleted_by,
		createdAt: row.created_at,
	};
}

/** Adaptador PostgreSQL do `UserRepository`. Toda leitura de conta confere o MAC. */
export class PostgresUserRepository implements UserRepository {
	constructor(
		private readonly pool: Pool,
		private readonly integrity: AuthIntegrity,
	) {}

	async findById(id: number): Promise<User | null> {
		const row = await this.queryVerifiedRow("id = $1", id);
		return row === null ? null : toUser(row);
	}

	async findAuthByEmail(email: string): Promise<UserAuthRecord | null> {
		return this.queryAuth("email = $1", email);
	}

	async findAuthById(id: number): Promise<UserAuthRecord | null> {
		return this.queryAuth("id = $1", id);
	}

	async create(data: NewUser): Promise<User> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			const { rows } = await client.query<UserRow>(
				`INSERT INTO app_user (name, email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4, $5) RETURNING ${USER_COLUMNS}`,
				[
					data.name,
					data.email,
					data.passwordHash,
					data.role,
					data.mustChangePassword,
				],
			);
			const row = rows[0];

			if (row === undefined)
				throw new Error("INSERT não devolveu a linha criada");

			const mac = this.integrity.sign(toAuthFields(row));
			await client.query("UPDATE app_user SET auth_mac = $1 WHERE id = $2", [
				mac,
				row.id,
			]);
			await client.query("COMMIT");
			return toUser(row);
		} catch (err: unknown) {
			await client.query("ROLLBACK");
			throw err;
		} finally {
			client.release();
		}
	}

	async updatePasswordHash(
		id: number,
		hash: string,
		mustChange: boolean,
	): Promise<void> {
		await this.withLockedAccount(id, async (client, row) => {
			const mac = this.integrity.sign({
				...toAuthFields(row),
				passwordHash: hash,
				mustChangePassword: mustChange,
			});
			await client.query(
				"UPDATE app_user SET password_hash = $1, must_change_password = $2, auth_mac = $3, updated_at = now() WHERE id = $4",
				[hash, mustChange, mac, id],
			);
		});
	}

	async saveTotpSecret(id: number, secretEnc: string): Promise<void> {
		const enabledAt = new Date();
		await this.withLockedAccount(id, async (client, row) => {
			const mac = this.integrity.sign({
				...toAuthFields(row),
				totpSecretEnc: secretEnc,
				totpEnabledAt: enabledAt,
			});
			await client.query(
				"UPDATE app_user SET totp_secret_enc = $1, totp_enabled_at = $2, auth_mac = $3, updated_at = now() WHERE id = $4",
				[secretEnc, enabledAt, mac, id],
			);
		});
	}

	async advanceTotpStep(id: number, step: number): Promise<boolean> {
		const result = await this.pool.query(
			`UPDATE app_user SET totp_last_step = $1 WHERE id = $2 AND (totp_last_step IS NULL OR totp_last_step < $1)`,
			[step, id],
		);
		return result.rowCount === 1;
	}

	async registerFailedLogin(
		id: number,
		lockUntil: Date | null,
	): Promise<number> {
		const { rows } = await this.pool.query<{ failed_attempts: number }>(
			`UPDATE app_user SET failed_attempts = failed_attempts + 1,
			locked_until = COALESCE($1, locked_until)
	 		WHERE id = $2 RETURNING failed_attempts`,
			[lockUntil, id],
		);
		const row = rows[0];
		if (row === undefined) throw new Error("Usuário não encontrado: " + id);
		return row.failed_attempts;
	}

	async refundLoginAttempt(id: number): Promise<void> {
		await this.pool.query(
			`UPDATE app_user SET failed_attempts = GREATEST(failed_attempts - 1, 0) WHERE id = $1`,
			[id],
		);
	}

	async resetFailedLogins(id: number): Promise<void> {
		await this.pool.query(
			`UPDATE app_user SET failed_attempts = 0, locked_until = NULL WHERE id = $1`,
			[id],
		);
	}

	/**
	 * Busca uma conta pela condição e confere o MAC antes de devolvê-la.
	 * `where` só aceita literais (união de strings): nunca texto vindo de fora.
	 */
	private async queryAuth(
		where: "email = $1" | "id = $1",
		value: string | number,
	): Promise<UserAuthRecord | null> {
		const row = await this.queryVerifiedRow(where, value);
		if (row === null) return null;

		return {
			...toUser(row),
			passwordHash: row.password_hash,
			totpSecretEnc: row.totp_secret_enc,
			totpLastStep: row.totp_last_step,
			failedLoginAttempts: row.failed_attempts,
			lockedUntil: row.locked_until,
		};
	}

	private async queryVerifiedRow(
		where: "email = $1" | "id = $1",
		value: string | number,
	): Promise<AuthRow | null> {
		// Leitura única: pool.query basta, não precisa de transação.
		const { rows } = await this.pool.query<AuthRow>(
			`SELECT ${USER_COLUMNS}, auth_mac, totp_last_step, failed_attempts, locked_until
			 FROM app_user WHERE ${where}`,
			[value],
		);
		const row = rows[0];
		if (row === undefined) return null;

		// Conta sem MAC ou com MAC que não bate: não entrega os dados (falha fechada).
		this.assertMac(row);

		return row;
	}

	private assertMac(row: AuthRow): void {
		if (
			row.auth_mac === null ||
			!this.integrity.verify(toAuthFields(row), row.auth_mac)
		)
			throw new AuthIntegrityError(row.id);
	}

	/**
	 * Abre uma transação, trava a linha da conta (FOR UPDATE), confere o MAC atual
	 * e chama `apply`; depois faz COMMIT (ou ROLLBACK em erro) e devolve a conexão.
	 * @param id id da conta a alterar
	 * @param apply faz o UPDATE e grava o MAC novo, usando a conexão da transação
	 */
	private async withLockedAccount(
		id: number,
		apply: (client: PoolClient, row: AuthRow) => Promise<void>,
	): Promise<void> {
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			const { rows } = await client.query<AuthRow>(
				`SELECT ${USER_COLUMNS}, auth_mac FROM app_user WHERE id = $1 FOR UPDATE`,
				[id],
			);
			const row = rows[0];
			if (row === undefined) throw new Error("Usuário não encontrado: " + id);
			this.assertMac(row);

			await apply(client, row);

			await client.query("COMMIT");
		} catch (err: unknown) {
			await client.query("ROLLBACK");
			throw err;
		} finally {
			client.release();
		}
	}
}
