// src/adapters/persistence/postgres-subgroup-repository.ts

import type { Pool, PoolClient } from "pg";
import type { DisciplineScope } from "../../core/domain/discipline";
import type {
	NewVaultSubgroup,
	UpdateVaultSubgroup,
	VaultSubgroup,
} from "../../core/domain/vault-subgroup";
import type { SubgroupRepository } from "../../core/ports/subgroup-repository";
import { DuplicateNameError, NotFoundError } from "../../core/errors";
import {
	toVaultSubgroup,
	type SubgroupDisciplineLink,
	type SubgroupRow,
} from "./subgroup-row";

// ---------- auxiliares do módulo ----------

/** Linha da consulta de vínculos (com o id do subgrupo para agrupar). */
type LinkRow = {
	subgroup_id: number;
	discipline_id: number;
	is_universal: boolean;
};

/** Colunas de `vault_subgroup` que viram `SubgroupRow`. */
const SUBGROUP_COLUMNS = "id, group_id, name, url, logo_url, active";

/**
 * Nome da FK de `group_id` (criada por `ADD COLUMN ... REFERENCES` na migration 008,
 * então o Postgres usa o nome padrão). Confirme com:
 * SELECT conname FROM pg_constraint WHERE conrelid = 'vault_subgroup'::regclass AND contype = 'f';
 */
const GROUP_FK = "vault_subgroup_group_id_fkey";

/** Lê o campo `code` de um erro do pg (ou undefined). */
function codeOf(err: unknown): string | undefined {
	return typeof err === "object" &&
		err !== null &&
		"code" in err &&
		typeof err.code === "string"
		? err.code
		: undefined;
}

/** Lê o campo `constraint` de um erro do pg (ou undefined). */
function constraintOf(err: unknown): string | undefined {
	return typeof err === "object" &&
		err !== null &&
		"constraint" in err &&
		typeof err.constraint === "string"
		? err.constraint
		: undefined;
}

/** True se o erro é violação de unicidade do Postgres (código 23505). */
function isUniqueViolation(err: unknown): boolean {
	return codeOf(err) === "23505";
}

/**
 * True se for 23503 (chave estrangeira) da FK de `group_id`: o grupo não existe.
 * FK de DISCIPLINA também é 23503, mas com outra constraint: essa NÃO se converte
 * (o erro original do pg sobe).
 */
function isMissingGroup(err: unknown): boolean {
	return codeOf(err) === "23503" && constraintOf(err) === GROUP_FK;
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
 * Grava os vínculos de um subgrupo com um único INSERT.
 * general:  usa a disciplina universal (Geral); specific: uma linha por id.
 */
async function insertLinks(
	client: PoolClient,
	subgroupId: number,
	scope: DisciplineScope,
): Promise<void> {
	if (scope.kind === "general") {
		await client.query(
			"INSERT INTO subgroup_discipline (subgroup_id, discipline_id) SELECT $1, id FROM discipline WHERE is_universal",
			[subgroupId],
		);
		return;
	}
	await client.query(
		"INSERT INTO subgroup_discipline (subgroup_id, discipline_id) SELECT $1, unnest($2::int[])",
		[subgroupId, [...scope.ids]],
	);
}

/** Pool ou client: as consultas de leitura servem para os dois. */
type Queryable = Pick<Pool, "query">;

/** Lê os vínculos de vários subgrupos numa só consulta e agrupa por subgroup_id. */
async function loadLinks(
	db: Queryable,
	subgroupIds: readonly number[],
): Promise<Map<number, SubgroupDisciplineLink[]>> {
	const { rows } = await db.query<LinkRow>(
		`SELECT sd.subgroup_id, sd.discipline_id, d.is_universal
		   FROM subgroup_discipline sd
		   JOIN discipline d ON d.id = sd.discipline_id
		  WHERE sd.subgroup_id = ANY($1::int[])`,
		[subgroupIds],
	);

	const linksBySubgroup = new Map<number, SubgroupDisciplineLink[]>();
	for (const row of rows) {
		const list = linksBySubgroup.get(row.subgroup_id) ?? [];
		list.push({
			discipline_id: row.discipline_id,
			is_universal: row.is_universal,
		});
		linksBySubgroup.set(row.subgroup_id, list);
	}
	return linksBySubgroup;
}

// ---------- adaptador ----------

/** Adaptador PostgreSQL do `SubgroupRepository` (`vault_subgroup` + `subgroup_discipline`). */
export class PostgresSubgroupRepository implements SubgroupRepository {
	constructor(private readonly pool: Pool) {}

	/** BEGIN → work(client) → COMMIT; em erro, ROLLBACK e relança; sempre release(). */
	private async withTransaction<T>(
		work: (client: PoolClient) => Promise<T>,
	): Promise<T> {
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

	async findById(id: number): Promise<VaultSubgroup | null> {
		const { rows } = await this.pool.query<SubgroupRow>(
			`SELECT ${SUBGROUP_COLUMNS} FROM vault_subgroup WHERE id = $1`,
			[id],
		);
		const row = rows[0];
		if (row === undefined) return null;

		const links = await loadLinks(this.pool, [id]);
		return toVaultSubgroup(row, links.get(id) ?? []);
	}

	async listByGroup(groupId: number): Promise<readonly VaultSubgroup[]> {
		const group = await this.pool.query(
			"SELECT 1 FROM vault_group WHERE id = $1",
			[groupId],
		);
		if ((group.rowCount ?? 0) === 0) throw new NotFoundError("group", groupId);

		// norm_name: o banco está em lc_ctype C, então ORDER BY name separaria maiúsculas de minúsculas
		const { rows } = await this.pool.query<SubgroupRow>(
			`SELECT ${SUBGROUP_COLUMNS} FROM vault_subgroup
			  WHERE group_id = $1
			  ORDER BY norm_name(name), id`,
			[groupId],
		);
		const links = await loadLinks(
			this.pool,
			rows.map((r) => r.id),
		);
		return rows.map((row) => toVaultSubgroup(row, links.get(row.id) ?? []));
	}

	async create(data: NewVaultSubgroup): Promise<VaultSubgroup> {
		assertScopeNotEmpty(data.scope);
		try {
			return await this.withTransaction(async (client) => {
				const { rows } = await client.query<SubgroupRow>(
					`INSERT INTO vault_subgroup (group_id, name, url, logo_url)
					 VALUES ($1, $2, $3, $4)
					 RETURNING ${SUBGROUP_COLUMNS}`,
					[data.groupId, data.name, data.url ?? null, data.logoUrl ?? null],
				);
				const row = rows[0];
				if (row === undefined) throw new Error("INSERT não devolveu linha");

				await insertLinks(client, row.id, data.scope);
				const links = await loadLinks(client, [row.id]);
				return toVaultSubgroup(row, links.get(row.id) ?? []);
			});
		} catch (err: unknown) {
			if (isUniqueViolation(err)) throw new DuplicateNameError("subgroup");
			if (isMissingGroup(err)) throw new NotFoundError("group", data.groupId);
			throw err;
		}
	}

	async update(id: number, data: UpdateVaultSubgroup): Promise<void> {
		// Colunas montadas só com nomes FIXOS; os valores entram sempre por $n.
		// `!== undefined` (e não truthy): null é valor válido e limpa a coluna.
		const sets: string[] = [];
		const values: unknown[] = [id]; // $1 é sempre o id

		if (data.groupId !== undefined) {
			values.push(data.groupId);
			sets.push(`group_id = $${values.length}`);
		}
		if (data.name !== undefined) {
			values.push(data.name);
			sets.push(`name = $${values.length}`);
		}
		if (data.url !== undefined) {
			values.push(data.url);
			sets.push(`url = $${values.length}`);
		}
		if (data.logoUrl !== undefined) {
			values.push(data.logoUrl);
			sets.push(`logo_url = $${values.length}`);
		}

		if (sets.length === 0) {
			// Nada a alterar: só confere que o subgrupo existe
			const exists = await this.pool.query(
				"SELECT 1 FROM vault_subgroup WHERE id = $1",
				[id],
			);
			if ((exists.rowCount ?? 0) === 0) throw new NotFoundError("subgroup", id);
			return;
		}

		try {
			const result = await this.pool.query(
				`UPDATE vault_subgroup SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`,
				values,
			);
			if ((result.rowCount ?? 0) === 0) throw new NotFoundError("subgroup", id);
		} catch (err: unknown) {
			// O índice (group_id, norm_name(name)) valida o ESTADO FINAL (mover + renomear)
			if (isUniqueViolation(err)) throw new DuplicateNameError("subgroup");
			if (isMissingGroup(err) && data.groupId !== undefined)
				throw new NotFoundError("group", data.groupId);
			throw err;
		}
	}

	async setActive(id: number, active: boolean): Promise<void> {
		const result = await this.pool.query(
			"UPDATE vault_subgroup SET active = $2, updated_at = now() WHERE id = $1",
			[id, active],
		);
		if ((result.rowCount ?? 0) === 0) throw new NotFoundError("subgroup", id);
	}

	async setScope(id: number, scope: DisciplineScope): Promise<void> {
		assertScopeNotEmpty(scope);
		await this.withTransaction(async (client) => {
			// Confere a existência ANTES de mexer nos vínculos
			const result = await client.query(
				"UPDATE vault_subgroup SET updated_at = now() WHERE id = $1",
				[id],
			);
			if ((result.rowCount ?? 0) === 0) throw new NotFoundError("subgroup", id);

			await client.query(
				"DELETE FROM subgroup_discipline WHERE subgroup_id = $1",
				[id],
			);
			await insertLinks(client, id, scope);
		});
	}
}
