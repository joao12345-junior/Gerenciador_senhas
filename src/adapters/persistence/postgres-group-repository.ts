// src/adapters/persistence/postgres-group-repository.ts

import type { Pool, PoolClient } from "pg";
import type { DisciplineScope } from "../../core/domain/discipline";
import type {
	NewVaultGroup,
	UpdateVaultGroup,
	VaultGroup,
} from "../../core/domain/vault-group";
import type { GroupRepository } from "../../core/ports/group-repository";
import { DuplicateNameError, NotFoundError } from "../../core/errors";
import {
	toVaultGroup,
	type GroupDisciplineLink,
	type GroupRow,
} from "./group-row";

// ---------- auxiliares do módulo ----------

type LinkRow = {
	group_id: number;
	discipline_id: number;
	is_universal: boolean;
};

/** Colunas de `vault_group` que viram `GroupRow`. */
const GROUP_COLUMNS = "id, name, icon, position, active, field_template";

/** True se o erro é violação de unicidade do Postgres (código 23505). */
function isUniqueViolation(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"code" in err &&
		err.code === "23505"
	);
}

/** Lança Error (mensagem com "escopo") se o escopo for `specific` e vazio. */
function assertScopeNotEmpty(scope: DisciplineScope): void {
	if (scope.kind === "specific" && scope.ids.size === 0) {
		throw new Error(
			"escopo de disciplinas vazio: informe ao menos uma disciplina",
		);
	}
}

/**
 * Grava os vínculos de um grupo com um único INSERT.
 * general:  INSERT INTO group_discipline (group_id, discipline_id)
 *           SELECT $1, id FROM discipline WHERE is_universal
 * specific: INSERT INTO group_discipline (group_id, discipline_id)
 *           SELECT $1, unnest($2::int[])        -- parâmetros: [groupId, [...scope.ids]]
 */
async function insertLinks(
	client: PoolClient,
	groupId: number,
	scope: DisciplineScope,
): Promise<void> {
	// TODO: um if/else sobre scope.kind, cada ramo com sua query
	if (scope.kind === "general") {
		await client.query(
			"INSERT INTO group_discipline (group_id, discipline_id) SELECT $1, id FROM discipline WHERE is_universal",
			[groupId],
		);
		return;
	}
	await client.query(
		"INSERT INTO group_discipline (group_id, discipline_id) SELECT $1, unnest($2::int[])",
		[groupId, [...scope.ids]],
	);
}

/** Pool ou client: as consultas de leitura servem para os dois. */
type Queryable = Pick<Pool, "query">;

/**
 * Lê os vínculos de vários grupos e agrupa por group_id.
 * SELECT gd.group_id, gd.discipline_id, d.is_universal
 *   FROM group_discipline gd
 *   JOIN discipline d ON d.id = gd.discipline_id
 *  WHERE gd.group_id = ANY($1::int[])
 */
async function loadLinks(
	db: Queryable,
	groupIds: readonly number[],
): Promise<Map<number, GroupDisciplineLink[]>> {
	// TODO: rodar a query, montar o Map; para cada linha, empurrar { discipline_id, is_universal }

	const result = await db.query<LinkRow>(
		"SELECT gd.group_id, gd.discipline_id, d.is_universal FROM group_discipline gd JOIN discipline d ON d.id = gd.discipline_id WHERE gd.group_id = ANY($1::int[])",
		[groupIds],
	);
	const { rows } = result;

	const linksByGroup = new Map<number, GroupDisciplineLink[]>();
	for (const row of rows) {
		const list = linksByGroup.get(row.group_id) ?? [];
		list.push({
			discipline_id: row.discipline_id,
			is_universal: row.is_universal,
		});
		linksByGroup.set(row.group_id, list);
	}
	return linksByGroup;
}

// ---------- adaptador ----------

/** Adaptador PostgreSQL do `GroupRepository` (tabelas `vault_group` e `group_discipline`). */
export class PostgresGroupRepository implements GroupRepository {
	constructor(private readonly pool: Pool) {}

	/** BEGIN → work(client) → COMMIT; em erro, ROLLBACK e relança; sempre release(). */
	private async withTransaction<T>(
		work: (client: PoolClient) => Promise<T>,
	): Promise<T> {
		// TODO: mesmo padrão do PostgresUserRepository (connect / BEGIN / try / COMMIT / catch ROLLBACK / finally release)
		const client = await this.pool.connect();
		try {
			await client.query("BEGIN");
			const result = await work(client);
			await client.query("COMMIT");
			return result;
		} catch (err: unknown) {
			await client.query("ROLLBACK");
			throw err;
		} finally {
			client.release();
		}
	}

	async findById(id: number): Promise<VaultGroup | null> {
		// 1. SELECT ${GROUP_COLUMNS} FROM vault_group WHERE id = $1
		// 2. sem linha → return null
		// 3. links = await loadLinks(this.pool, [id])
		// 4. return toVaultGroup(row, links.get(id) ?? [])
		const result = await this.pool.query(
			`SELECT ${GROUP_COLUMNS} FROM vault_group WHERE id = $1`,
			[id],
		);
		if (result.rowCount === null || result.rowCount === 0) return null;

		const links = await loadLinks(this.pool, [id]);
		return toVaultGroup(result.rows[0], links.get(id) ?? []);
	}

	async listAll(): Promise<readonly VaultGroup[]> {
		// 1. SELECT ${GROUP_COLUMNS} FROM vault_group ORDER BY position, id
		// 2. links = await loadLinks(this.pool, rows.map(r => r.id))   -- UMA consulta para todos
		// 3. return rows.map(row => toVaultGroup(row, links.get(row.id) ?? []))
		const result = await this.pool.query(
			`SELECT ${GROUP_COLUMNS} FROM vault_group ORDER BY position, id`,
		);
		const links = await loadLinks(
			this.pool,
			result.rows.map((r) => r.id),
		);
		return result.rows.map((row) => toVaultGroup(row, links.get(row.id) ?? []));
	}

	async create(data: NewVaultGroup): Promise<VaultGroup> {
		assertScopeNotEmpty(data.scope);
		try {
			return await this.withTransaction(async (client) => {
				// 1. INSERT INTO vault_group (name, icon, position, field_template)
				//    VALUES ($1, $2, $3, $4::jsonb) RETURNING ${GROUP_COLUMNS}
				//    -- $4 = JSON.stringify(data.fieldTemplate)
				// 2. await insertLinks(client, row.id, data.scope)
				// 3. links = await loadLinks(client, [row.id])
				// 4. return toVaultGroup(row, links.get(row.id) ?? [])
				const result = await client.query(
					`INSERT INTO vault_group (name, icon, position, field_template) VALUES ($1, $2, $3, $4::jsonb) RETURNING ${GROUP_COLUMNS}`,
					[
						data.name,
						data.icon,
						data.position,
						JSON.stringify(data.fieldTemplate),
					],
				);
				const { rows } = result;
				const row = rows[0];

				await insertLinks(client, row.id, data.scope);
				const links = await loadLinks(client, [row.id]);

				return toVaultGroup(row, links.get(row.id) ?? []);
			});
		} catch (err: unknown) {
			// TODO: se isUniqueViolation(err) → throw new DuplicateNameError("group"); senão relança
			if (isUniqueViolation(err)) throw new DuplicateNameError("group");
			throw err;
		}
	}

	async update(id: number, data: UpdateVaultGroup): Promise<void> {
		// Colunas montadas só com nomes FIXOS; os valores entram sempre por $n
		const sets: string[] = [];
		const values: unknown[] = [id]; // $1 é sempre o id

		if (data.name !== undefined) {
			values.push(data.name);
			sets.push(`name = $${values.length}`);
		}
		if (data.icon !== undefined) {
			values.push(data.icon);
			sets.push(`icon = $${values.length}`);
		}
		if (data.position !== undefined) {
			values.push(data.position);
			sets.push(`position = $${values.length}`);
		}
		if (data.fieldTemplate !== undefined) {
			// jsonb: o pg converteria um array JS em array do Postgres, então vai como texto JSON
			values.push(JSON.stringify(data.fieldTemplate));
			sets.push(`field_template = $${values.length}::jsonb`);
		}

		if (sets.length === 0) {
			// Nada a alterar: só confere que o grupo existe
			const exists = await this.pool.query(
				"SELECT 1 FROM vault_group WHERE id = $1",
				[id],
			);
			if ((exists.rowCount ?? 0) === 0) throw new NotFoundError("group", id);
			return;
		}

		try {
			const result = await this.pool.query(
				`UPDATE vault_group SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`,
				values,
			);
			if ((result.rowCount ?? 0) === 0) throw new NotFoundError("group", id);
		} catch (err: unknown) {
			if (isUniqueViolation(err)) throw new DuplicateNameError("group");
			throw err;
		}
	}

	async setActive(id: number, active: boolean): Promise<void> {
		// UPDATE vault_group SET active = $2, updated_at = now() WHERE id = $1
		// (rowCount ?? 0) === 0 → throw new NotFoundError("group", id)
		const result = await this.pool.query(
			"UPDATE vault_group SET active = $2, updated_at = now() WHERE id = $1",
			[id, active],
		);
		if ((result.rowCount ?? 0) === 0) throw new NotFoundError("group", id);
	}

	async setScope(id: number, scope: DisciplineScope): Promise<void> {
		assertScopeNotEmpty(scope);
		await this.withTransaction(async (client) => {
			// 1. UPDATE vault_group SET updated_at = now() WHERE id = $1
			//    (rowCount ?? 0) === 0 → NotFoundError("group", id)   -- ANTES de mexer nos vínculos
			// 2. DELETE FROM group_discipline WHERE group_id = $1
			// 3. await insertLinks(client, id, scope)
			const result = await client.query(
				"UPDATE vault_group SET updated_at = now() WHERE id = $1",
				[id],
			);
			if ((result.rowCount ?? 0) === 0) throw new NotFoundError("group", id);
			await client.query("DELETE FROM group_discipline WHERE group_id = $1", [
				id,
			]);
			await insertLinks(client, id, scope);
		});
	}
}
