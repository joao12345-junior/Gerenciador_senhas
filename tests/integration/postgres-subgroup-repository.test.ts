// tests/integration/postgres-subgroup-repository.test.ts

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./helpers/test-database";
import { PostgresSubgroupRepository } from "../../src/adapters/persistence/postgres-subgroup-repository";
import type { DisciplineScope } from "../../src/core/domain/discipline";
import type { NewVaultSubgroup } from "../../src/core/domain/vault-subgroup";
import { DuplicateNameError, NotFoundError } from "../../src/core/errors";

const MISSING_ID = 999_999;
const MISSING_DISCIPLINE_ID = 999_999;

const specificScope = (...ids: number[]): DisciplineScope => ({
	kind: "specific",
	ids: new Set(ids),
});

/** Espera a promessa ser rejeitada e devolve o erro (falha se ela resolver). */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (err: unknown) {
		return err;
	}
	throw new Error("a promessa deveria ter sido rejeitada, mas resolveu");
}

describe("PostgresSubgroupRepository", () => {
	let db: TestDatabase;
	let subgroups: PostgresSubgroupRepository;

	let universalId: number;
	let specificIds: number[];

	/** Id do grupo "A" e do grupo "B" (recriados a cada teste). */
	let groupA: number;
	let groupB: number;

	function disc(index: number): number {
		const id = specificIds[index];
		if (id === undefined) throw new Error(`disciplina específica ${index} ausente do seed`);
		return id;
	}

	/** Insere um grupo direto no SQL (não depende do repositório de grupos). */
	async function insertGroup(name: string): Promise<number> {
		const { rows } = await db.pool.query<{ id: number }>(
			"INSERT INTO vault_group (name) VALUES ($1) RETURNING id",
			[name],
		);
		const row = rows[0];
		if (row === undefined) throw new Error("INSERT de grupo não devolveu id");
		return row.id;
	}

	/** Subgrupo base no grupo A; cada teste sobrescreve só o que exercita. */
	function newSubgroup(overrides: Partial<NewVaultSubgroup> = {}): NewVaultSubgroup {
		return {
			groupId: groupA,
			name: "Prefeitura POA",
			scope: { kind: "general" },
			...overrides,
		};
	}

	async function linkedIds(subgroupId: number): Promise<number[]> {
		const { rows } = await db.pool.query<{ discipline_id: number }>(
			"SELECT discipline_id FROM subgroup_discipline WHERE subgroup_id = $1 ORDER BY discipline_id",
			[subgroupId],
		);
		return rows.map((r) => r.discipline_id);
	}

	async function countRows(table: "vault_subgroup" | "subgroup_discipline"): Promise<number> {
		const { rows } = await db.pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`);
		return Number(rows[0]?.n);
	}

	async function rawRow(id: number) {
		const { rows } = await db.pool.query<{
			group_id: number;
			name: string;
			url: string | null;
			logo_url: string | null;
			active: boolean;
		}>("SELECT group_id, name, url, logo_url, active FROM vault_subgroup WHERE id = $1", [id]);
		return rows[0];
	}

	beforeAll(async () => {
		db = await createTestDatabase();
		subgroups = new PostgresSubgroupRepository(db.pool);

		const { rows } = await db.pool.query<{ id: number; is_universal: boolean }>(
			"SELECT id, is_universal FROM discipline ORDER BY position, id",
		);
		const universal = rows.find((r) => r.is_universal);
		if (universal === undefined) throw new Error("seed sem disciplina universal");
		universalId = universal.id;
		specificIds = rows.filter((r) => !r.is_universal).map((r) => r.id);
		if (specificIds.length < 3) throw new Error("seed com menos de 3 disciplinas específicas");
	});

	beforeEach(async () => {
		// CASCADE leva vault_subgroup e subgroup_discipline; discipline não é tocada
		await db.pool.query("TRUNCATE vault_group RESTART IDENTITY CASCADE");
		groupA = await insertGroup("A");
		groupB = await insertGroup("B");
	});

	afterAll(async () => {
		await db.drop();
	});

	// ---------------------------------------------------------------- create

	describe("create", () => {
		it("devolve id gerado pelo banco e active = true", async () => {
			const created = await subgroups.create(newSubgroup());

			expect(created.id).toBeGreaterThan(0);
			expect(created.active).toBe(true);
		});

		it("devolve groupId, name, url e logoUrl iguais aos enviados", async () => {
			const created = await subgroups.create(
				newSubgroup({
					groupId: groupB,
					name: "Sema",
					url: "https://sema.gov.br",
					logoUrl: "https://sema.gov.br/logo.png",
				}),
			);

			expect(created).toMatchObject({
				groupId: groupB,
				name: "Sema",
				url: "https://sema.gov.br",
				logoUrl: "https://sema.gov.br/logo.png",
			});
		});

		it("url e logoUrl ausentes → null (não undefined)", async () => {
			const created = await subgroups.create(newSubgroup());

			expect(created.url).toBeNull();
			expect(created.logoUrl).toBeNull();
		});

		it("url e logoUrl null explícitos → null", async () => {
			const created = await subgroups.create(newSubgroup({ url: null, logoUrl: null }));

			expect(created.url).toBeNull();
			expect(created.logoUrl).toBeNull();
		});

		it("grava no banco os mesmos valores devolvidos", async () => {
			const created = await subgroups.create(
				newSubgroup({ name: "Sema", url: "https://s.com", logoUrl: null }),
			);

			expect(await rawRow(created.id)).toEqual({
				group_id: groupA,
				name: "Sema",
				url: "https://s.com",
				logo_url: null,
				active: true,
			});
		});

		it("devolve o scope enviado (general)", async () => {
			const created = await subgroups.create(newSubgroup({ scope: { kind: "general" } }));

			expect(created.scope).toEqual({ kind: "general" });
		});

		it("devolve o scope enviado (specific)", async () => {
			const created = await subgroups.create(
				newSubgroup({ scope: specificScope(disc(0), disc(2)) }),
			);

			expect(created.scope).toEqual(specificScope(disc(0), disc(2)));
		});

		it("scope general → uma linha em subgroup_discipline, apontando para a universal", async () => {
			const created = await subgroups.create(newSubgroup({ scope: { kind: "general" } }));

			expect(await linkedIds(created.id)).toEqual([universalId]);
		});

		it("scope specific → uma linha por disciplina", async () => {
			const created = await subgroups.create(
				newSubgroup({ scope: specificScope(disc(2), disc(0)) }),
			);

			expect(await linkedIds(created.id)).toEqual([disc(0), disc(2)].sort((a, b) => a - b));
		});

		it("dois subgrupos recebem ids diferentes e vínculos separados", async () => {
			const a = await subgroups.create(newSubgroup({ name: "A1", scope: specificScope(disc(0)) }));
			const b = await subgroups.create(newSubgroup({ name: "B1", scope: specificScope(disc(1)) }));

			expect(a.id).not.toBe(b.id);
			expect(await linkedIds(a.id)).toEqual([disc(0)]);
			expect(await linkedIds(b.id)).toEqual([disc(1)]);
		});

		describe("grupo inexistente", () => {
			it("lança NotFoundError('group') com o id do grupo", async () => {
				const err = await rejection(subgroups.create(newSubgroup({ groupId: MISSING_ID })));

				expect(err).toBeInstanceOf(NotFoundError);
				expect(err).toMatchObject({ entity: "group", id: MISSING_ID });
			});

			it("não grava subgrupo nem vínculos", async () => {
				await rejection(subgroups.create(newSubgroup({ groupId: MISSING_ID })));

				expect(await countRows("vault_subgroup")).toBe(0);
				expect(await countRows("subgroup_discipline")).toBe(0);
			});
		});

		describe("nome duplicado", () => {
			it("mesmo nome no mesmo grupo → DuplicateNameError('subgroup')", async () => {
				await subgroups.create(newSubgroup({ name: "Sema" }));

				const err = await rejection(subgroups.create(newSubgroup({ name: "Sema" })));

				expect(err).toBeInstanceOf(DuplicateNameError);
				expect(err).toMatchObject({ entity: "subgroup" });
			});

			it("ignora maiúsculas e minúsculas", async () => {
				await subgroups.create(newSubgroup({ name: "Sema" }));

				expect(await rejection(subgroups.create(newSubgroup({ name: "SEMA" })))).toBeInstanceOf(
					DuplicateNameError,
				);
			});

			it("ignora maiúsculas acentuadas (norm_name)", async () => {
				await subgroups.create(newSubgroup({ name: "licitações" }));

				expect(
					await rejection(subgroups.create(newSubgroup({ name: "LICITAÇÕES" }))),
				).toBeInstanceOf(DuplicateNameError);
			});

			it("o mesmo nome em OUTRO grupo é permitido", async () => {
				await subgroups.create(newSubgroup({ groupId: groupA, name: "Sema" }));

				const other = await subgroups.create(newSubgroup({ groupId: groupB, name: "Sema" }));

				expect(other.groupId).toBe(groupB);
			});

			it("a duplicata não deixa linha nem vínculo a mais", async () => {
				await subgroups.create(newSubgroup({ name: "Sema", scope: specificScope(disc(0)) }));

				await rejection(
					subgroups.create(newSubgroup({ name: "Sema", scope: specificScope(disc(1), disc(2)) })),
				);

				expect(await countRows("vault_subgroup")).toBe(1);
				expect(await countRows("subgroup_discipline")).toBe(1);
			});
		});

		describe("escopo inválido", () => {
			it("specific vazio → Error com 'escopo'", async () => {
				const err = await rejection(subgroups.create(newSubgroup({ scope: specificScope() })));

				expect(err).toBeInstanceOf(Error);
				expect((err as Error).message).toMatch(/escopo/i);
			});

			it("specific vazio não grava nada", async () => {
				await rejection(subgroups.create(newSubgroup({ scope: specificScope() })));

				expect(await countRows("vault_subgroup")).toBe(0);
			});

			it("disciplina inexistente → erro original do pg (23503), sem converter", async () => {
				const err = await rejection(
					subgroups.create(newSubgroup({ scope: specificScope(MISSING_DISCIPLINE_ID) })),
				);

				expect(err).not.toBeInstanceOf(NotFoundError);
				expect(err).toMatchObject({ code: "23503" });
			});

			it("disciplina inexistente desfaz o subgrupo (rollback)", async () => {
				await rejection(
					subgroups.create(newSubgroup({ scope: specificScope(disc(0), MISSING_DISCIPLINE_ID) })),
				);

				expect(await countRows("vault_subgroup")).toBe(0);
				expect(await countRows("subgroup_discipline")).toBe(0);
			});
		});
	});

	// -------------------------------------------------------------- findById

	describe("findById", () => {
		it("id inexistente → null", async () => {
			expect(await subgroups.findById(MISSING_ID)).toBeNull();
		});

		it("devolve exatamente o que create devolveu", async () => {
			const created = await subgroups.create(
				newSubgroup({
					url: "https://a.com",
					logoUrl: "https://a.com/l.png",
					scope: specificScope(disc(0), disc(1)),
				}),
			);

			expect(await subgroups.findById(created.id)).toEqual(created);
		});

		it("devolve subgrupo inativo", async () => {
			const created = await subgroups.create(newSubgroup());
			await subgroups.setActive(created.id, false);

			expect(await subgroups.findById(created.id)).toMatchObject({ id: created.id, active: false });
		});

		it("escopo general volta como general", async () => {
			const created = await subgroups.create(newSubgroup({ scope: { kind: "general" } }));

			expect((await subgroups.findById(created.id))?.scope).toEqual({ kind: "general" });
		});

		it("não mistura vínculos de outro subgrupo", async () => {
			const a = await subgroups.create(newSubgroup({ name: "A1", scope: specificScope(disc(0)) }));
			await subgroups.create(newSubgroup({ name: "B1", scope: specificScope(disc(1), disc(2)) }));

			expect((await subgroups.findById(a.id))?.scope).toEqual(specificScope(disc(0)));
		});

		describe("dados corrompidos", () => {
			it("sem vínculos → Error com o id do subgrupo", async () => {
				const created = await subgroups.create(newSubgroup());
				await db.pool.query("DELETE FROM subgroup_discipline WHERE subgroup_id = $1", [created.id]);

				const err = await rejection(subgroups.findById(created.id));

				expect((err as Error).message).toContain(`subgrupo ${created.id}`);
			});

			it("Geral misturada com específica → Error com o id do subgrupo", async () => {
				const created = await subgroups.create(newSubgroup({ scope: { kind: "general" } }));
				await db.pool.query(
					"INSERT INTO subgroup_discipline (subgroup_id, discipline_id) VALUES ($1, $2)",
					[created.id, disc(0)],
				);

				const err = await rejection(subgroups.findById(created.id));

				expect((err as Error).message).toContain(`subgrupo ${created.id}`);
			});
		});
	});

	// ----------------------------------------------------------- listByGroup

	describe("listByGroup", () => {
		it("grupo inexistente → NotFoundError('group') com o id", async () => {
			const err = await rejection(subgroups.listByGroup(MISSING_ID));

			expect(err).toBeInstanceOf(NotFoundError);
			expect(err).toMatchObject({ entity: "group", id: MISSING_ID });
		});

		it("grupo sem subgrupos → lista vazia", async () => {
			expect(await subgroups.listByGroup(groupA)).toEqual([]);
		});

		it("devolve só os subgrupos do grupo pedido", async () => {
			await subgroups.create(newSubgroup({ groupId: groupA, name: "Do A" }));
			await subgroups.create(newSubgroup({ groupId: groupB, name: "Do B" }));

			const list = await subgroups.listByGroup(groupA);

			expect(list.map((s) => s.name)).toEqual(["Do A"]);
		});

		it("ordena por nome sem diferenciar maiúsculas", async () => {
			await subgroups.create(newSubgroup({ name: "Charlie" }));
			await subgroups.create(newSubgroup({ name: "alfa" }));
			await subgroups.create(newSubgroup({ name: "Bravo" }));

			const list = await subgroups.listByGroup(groupA);

			expect(list.map((s) => s.name)).toEqual(["alfa", "Bravo", "Charlie"]);
		});

		it("a ordem independe da ordem de criação", async () => {
			await subgroups.create(newSubgroup({ name: "b" }));
			await subgroups.create(newSubgroup({ name: "c" }));
			await subgroups.create(newSubgroup({ name: "a" }));

			expect((await subgroups.listByGroup(groupA)).map((s) => s.name)).toEqual(["a", "b", "c"]);
		});

		it("inclui os inativos", async () => {
			const a = await subgroups.create(newSubgroup({ name: "a" }));
			await subgroups.create(newSubgroup({ name: "b" }));
			await subgroups.setActive(a.id, false);

			const list = await subgroups.listByGroup(groupA);

			expect(list.map((s) => [s.name, s.active])).toEqual([
				["a", false],
				["b", true],
			]);
		});

		it("monta o escopo certo de cada subgrupo", async () => {
			const a = await subgroups.create(newSubgroup({ name: "a", scope: { kind: "general" } }));
			const b = await subgroups.create(newSubgroup({ name: "b", scope: specificScope(disc(0), disc(1)) }));
			const c = await subgroups.create(newSubgroup({ name: "c", scope: specificScope(disc(2)) }));

			const list = await subgroups.listByGroup(groupA);

			expect(list).toEqual([a, b, c]);
		});

		it("dado corrompido em um subgrupo → Error com o id dele", async () => {
			await subgroups.create(newSubgroup({ name: "ok" }));
			const bad = await subgroups.create(newSubgroup({ name: "ruim" }));
			await db.pool.query("DELETE FROM subgroup_discipline WHERE subgroup_id = $1", [bad.id]);

			const err = await rejection(subgroups.listByGroup(groupA));

			expect((err as Error).message).toContain(`subgrupo ${bad.id}`);
		});
	});

	// ---------------------------------------------------------------- update

	describe("update", () => {
		it("id inexistente → NotFoundError('subgroup') com o id", async () => {
			const err = await rejection(subgroups.update(MISSING_ID, { name: "x" }));

			expect(err).toBeInstanceOf(NotFoundError);
			expect(err).toMatchObject({ entity: "subgroup", id: MISSING_ID });
		});

		it("data vazio com id inexistente → NotFoundError('subgroup')", async () => {
			const err = await rejection(subgroups.update(MISSING_ID, {}));

			expect(err).toMatchObject({ entity: "subgroup", id: MISSING_ID });
		});

		it("data vazio com id existente → resolve e não altera nada", async () => {
			const created = await subgroups.create(
				newSubgroup({ url: "https://a.com", scope: specificScope(disc(0)) }),
			);

			await subgroups.update(created.id, {});

			expect(await subgroups.findById(created.id)).toEqual(created);
		});

		it("altera o nome e preserva o resto", async () => {
			const created = await subgroups.create(
				newSubgroup({ url: "https://a.com", logoUrl: "https://a.com/l.png" }),
			);

			await subgroups.update(created.id, { name: "Novo" });

			expect(await subgroups.findById(created.id)).toEqual({ ...created, name: "Novo" });
		});

		it("altera url e logoUrl juntos", async () => {
			const created = await subgroups.create(newSubgroup());

			await subgroups.update(created.id, { url: "https://u.com", logoUrl: "https://u.com/l.png" });

			expect(await subgroups.findById(created.id)).toMatchObject({
				url: "https://u.com",
				logoUrl: "https://u.com/l.png",
			});
		});

		it("url null limpa a url e mantém o logo", async () => {
			const created = await subgroups.create(
				newSubgroup({ url: "https://a.com", logoUrl: "https://a.com/l.png" }),
			);

			await subgroups.update(created.id, { url: null });

			expect(await subgroups.findById(created.id)).toMatchObject({
				url: null,
				logoUrl: "https://a.com/l.png",
			});
		});

		it("logoUrl null limpa o logo e mantém a url", async () => {
			const created = await subgroups.create(
				newSubgroup({ url: "https://a.com", logoUrl: "https://a.com/l.png" }),
			);

			await subgroups.update(created.id, { logoUrl: null });

			expect(await subgroups.findById(created.id)).toMatchObject({
				url: "https://a.com",
				logoUrl: null,
			});
		});

		it("campo ausente mantém o valor (url não é apagada ao mudar só o nome)", async () => {
			const created = await subgroups.create(newSubgroup({ url: "https://a.com" }));

			await subgroups.update(created.id, { name: "Outro" });

			expect((await subgroups.findById(created.id))?.url).toBe("https://a.com");
		});

		it("não mexe em active nem no escopo", async () => {
			const created = await subgroups.create(newSubgroup({ scope: specificScope(disc(0), disc(1)) }));
			await subgroups.setActive(created.id, false);

			await subgroups.update(created.id, { name: "Novo", url: "https://x.com" });

			const after = await subgroups.findById(created.id);
			expect(after?.active).toBe(false);
			expect(after?.scope).toEqual(specificScope(disc(0), disc(1)));
		});

		it("não mexe em outros subgrupos", async () => {
			const a = await subgroups.create(newSubgroup({ name: "A1" }));
			const b = await subgroups.create(newSubgroup({ name: "B1" }));

			await subgroups.update(a.id, { name: "A2", url: "https://x.com" });

			expect(await subgroups.findById(b.id)).toEqual(b);
		});

		describe("nome duplicado", () => {
			it("nome de outro subgrupo do mesmo grupo → DuplicateNameError('subgroup')", async () => {
				await subgroups.create(newSubgroup({ name: "Sema" }));
				const other = await subgroups.create(newSubgroup({ name: "Outro" }));

				const err = await rejection(subgroups.update(other.id, { name: "Sema" }));

				expect(err).toBeInstanceOf(DuplicateNameError);
				expect(err).toMatchObject({ entity: "subgroup" });
			});

			it("ignora maiúsculas acentuadas", async () => {
				await subgroups.create(newSubgroup({ name: "licitações" }));
				const other = await subgroups.create(newSubgroup({ name: "Outro" }));

				expect(
					await rejection(subgroups.update(other.id, { name: "LICITAÇÕES" })),
				).toBeInstanceOf(DuplicateNameError);
			});

			it("a falha não altera os outros campos enviados juntos", async () => {
				await subgroups.create(newSubgroup({ name: "Sema" }));
				const other = await subgroups.create(newSubgroup({ name: "Outro", url: "https://a.com" }));

				await rejection(subgroups.update(other.id, { name: "Sema", url: "https://b.com" }));

				expect(await subgroups.findById(other.id)).toEqual(other);
			});

			it("mudar só a caixa do próprio nome é permitido", async () => {
				const created = await subgroups.create(newSubgroup({ name: "sema" }));

				await subgroups.update(created.id, { name: "SEMA" });

				expect((await subgroups.findById(created.id))?.name).toBe("SEMA");
			});

			it("regravar o próprio nome não conta como duplicata", async () => {
				const created = await subgroups.create(newSubgroup({ name: "Sema" }));

				await subgroups.update(created.id, { name: "Sema" });

				expect((await subgroups.findById(created.id))?.name).toBe("Sema");
			});

			it("nome que existe em OUTRO grupo é permitido", async () => {
				await subgroups.create(newSubgroup({ groupId: groupB, name: "Sema" }));
				const mine = await subgroups.create(newSubgroup({ groupId: groupA, name: "Outro" }));

				await subgroups.update(mine.id, { name: "Sema" });

				expect((await subgroups.findById(mine.id))?.name).toBe("Sema");
			});
		});

		describe("mover para outro grupo (groupId)", () => {
			it("muda o groupId e preserva o resto, inclusive o escopo", async () => {
				const created = await subgroups.create(
					newSubgroup({ url: "https://a.com", scope: specificScope(disc(0), disc(2)) }),
				);

				await subgroups.update(created.id, { groupId: groupB });

				expect(await subgroups.findById(created.id)).toEqual({ ...created, groupId: groupB });
			});

			it("aparece na lista do grupo novo e some da do antigo", async () => {
				const created = await subgroups.create(newSubgroup({ name: "Mover" }));

				await subgroups.update(created.id, { groupId: groupB });

				expect((await subgroups.listByGroup(groupA)).map((s) => s.id)).toEqual([]);
				expect((await subgroups.listByGroup(groupB)).map((s) => s.id)).toEqual([created.id]);
			});

			it("grupo de destino inexistente → NotFoundError('group') com o id do destino", async () => {
				const created = await subgroups.create(newSubgroup());

				const err = await rejection(subgroups.update(created.id, { groupId: MISSING_ID }));

				expect(err).toBeInstanceOf(NotFoundError);
				expect(err).toMatchObject({ entity: "group", id: MISSING_ID });
			});

			it("destino inexistente não altera o subgrupo", async () => {
				const created = await subgroups.create(newSubgroup());

				await rejection(subgroups.update(created.id, { groupId: MISSING_ID, name: "Novo" }));

				expect(await subgroups.findById(created.id)).toEqual(created);
			});

			it("nome já usado no grupo de destino → DuplicateNameError('subgroup')", async () => {
				await subgroups.create(newSubgroup({ groupId: groupB, name: "Sema" }));
				const mine = await subgroups.create(newSubgroup({ groupId: groupA, name: "Sema" }));

				const err = await rejection(subgroups.update(mine.id, { groupId: groupB }));

				expect(err).toBeInstanceOf(DuplicateNameError);
				expect((await subgroups.findById(mine.id))?.groupId).toBe(groupA);
			});

			it("mover E renomear: a unicidade vale para o estado final", async () => {
				await subgroups.create(newSubgroup({ groupId: groupB, name: "Sema" }));
				const mine = await subgroups.create(newSubgroup({ groupId: groupA, name: "Sema" }));

				await subgroups.update(mine.id, { groupId: groupB, name: "Sema 2" });

				expect(await subgroups.findById(mine.id)).toMatchObject({ groupId: groupB, name: "Sema 2" });
			});

			it("mover para o próprio grupo não é duplicata", async () => {
				const created = await subgroups.create(newSubgroup({ name: "Sema" }));

				await subgroups.update(created.id, { groupId: groupA });

				expect((await subgroups.findById(created.id))?.groupId).toBe(groupA);
			});
		});
	});

	// ------------------------------------------------------------- setActive

	describe("setActive", () => {
		it("desativa", async () => {
			const created = await subgroups.create(newSubgroup());

			await subgroups.setActive(created.id, false);

			expect((await subgroups.findById(created.id))?.active).toBe(false);
		});

		it("reativa", async () => {
			const created = await subgroups.create(newSubgroup());
			await subgroups.setActive(created.id, false);

			await subgroups.setActive(created.id, true);

			expect((await subgroups.findById(created.id))?.active).toBe(true);
		});

		it("idempotente: ativar quem já está ativo não lança", async () => {
			const created = await subgroups.create(newSubgroup());

			await subgroups.setActive(created.id, true);

			expect((await subgroups.findById(created.id))?.active).toBe(true);
		});

		it("idempotente: desativar duas vezes não lança", async () => {
			const created = await subgroups.create(newSubgroup());
			await subgroups.setActive(created.id, false);

			await subgroups.setActive(created.id, false);

			expect((await subgroups.findById(created.id))?.active).toBe(false);
		});

		it("id inexistente → NotFoundError('subgroup') com o id", async () => {
			const err = await rejection(subgroups.setActive(MISSING_ID, false));

			expect(err).toBeInstanceOf(NotFoundError);
			expect(err).toMatchObject({ entity: "subgroup", id: MISSING_ID });
		});

		it("não afeta outros subgrupos nem o escopo", async () => {
			const a = await subgroups.create(newSubgroup({ name: "A1", scope: specificScope(disc(0)) }));
			const b = await subgroups.create(newSubgroup({ name: "B1" }));

			await subgroups.setActive(a.id, false);

			expect(await subgroups.findById(b.id)).toEqual(b);
			expect((await subgroups.findById(a.id))?.scope).toEqual(specificScope(disc(0)));
		});
	});

	// -------------------------------------------------------------- setScope

	describe("setScope", () => {
		it("general → specific", async () => {
			const created = await subgroups.create(newSubgroup({ scope: { kind: "general" } }));

			await subgroups.setScope(created.id, specificScope(disc(0), disc(1)));

			expect((await subgroups.findById(created.id))?.scope).toEqual(specificScope(disc(0), disc(1)));
			expect(await linkedIds(created.id)).toEqual([disc(0), disc(1)].sort((a, b) => a - b));
		});

		it("specific → general (a antiga some)", async () => {
			const created = await subgroups.create(newSubgroup({ scope: specificScope(disc(0), disc(1)) }));

			await subgroups.setScope(created.id, { kind: "general" });

			expect((await subgroups.findById(created.id))?.scope).toEqual({ kind: "general" });
			expect(await linkedIds(created.id)).toEqual([universalId]);
		});

		it("specific → specific substitui por inteiro, não soma", async () => {
			const created = await subgroups.create(newSubgroup({ scope: specificScope(disc(0), disc(1)) }));

			await subgroups.setScope(created.id, specificScope(disc(2)));

			expect(await linkedIds(created.id)).toEqual([disc(2)]);
		});

		it("o mesmo escopo de novo não duplica nem lança", async () => {
			const created = await subgroups.create(newSubgroup({ scope: specificScope(disc(0)) }));

			await subgroups.setScope(created.id, specificScope(disc(0)));

			expect(await linkedIds(created.id)).toEqual([disc(0)]);
		});

		it("não altera os outros campos do subgrupo", async () => {
			const created = await subgroups.create(newSubgroup({ url: "https://a.com" }));

			await subgroups.setScope(created.id, specificScope(disc(0)));

			expect(await subgroups.findById(created.id)).toEqual({
				...created,
				scope: specificScope(disc(0)),
			});
		});

		it("não afeta o escopo de outro subgrupo", async () => {
			const a = await subgroups.create(newSubgroup({ name: "A1", scope: specificScope(disc(0)) }));
			const b = await subgroups.create(newSubgroup({ name: "B1", scope: specificScope(disc(1)) }));

			await subgroups.setScope(a.id, specificScope(disc(2)));

			expect(await linkedIds(b.id)).toEqual([disc(1)]);
		});

		it("id inexistente → NotFoundError('subgroup') com o id", async () => {
			const err = await rejection(subgroups.setScope(MISSING_ID, { kind: "general" }));

			expect(err).toBeInstanceOf(NotFoundError);
			expect(err).toMatchObject({ entity: "subgroup", id: MISSING_ID });
		});

		it("id inexistente não grava vínculos", async () => {
			await rejection(subgroups.setScope(MISSING_ID, specificScope(disc(0))));

			expect(await countRows("subgroup_discipline")).toBe(0);
		});

		describe("escopo inválido preserva o escopo antigo", () => {
			it("specific vazio → Error com 'escopo'", async () => {
				const created = await subgroups.create(newSubgroup({ scope: specificScope(disc(0)) }));

				const err = await rejection(subgroups.setScope(created.id, specificScope()));

				expect((err as Error).message).toMatch(/escopo/i);
			});

			it("specific vazio não mexe nos vínculos", async () => {
				const created = await subgroups.create(newSubgroup({ scope: specificScope(disc(0), disc(1)) }));

				await rejection(subgroups.setScope(created.id, specificScope()));

				expect((await subgroups.findById(created.id))?.scope).toEqual(specificScope(disc(0), disc(1)));
			});

			it("disciplina inexistente → erro original do pg (23503)", async () => {
				const created = await subgroups.create(newSubgroup({ scope: specificScope(disc(0)) }));

				const err = await rejection(
					subgroups.setScope(created.id, specificScope(disc(1), MISSING_DISCIPLINE_ID)),
				);

				expect(err).not.toBeInstanceOf(NotFoundError);
				expect(err).toMatchObject({ code: "23503" });
			});

			it("disciplina inexistente desfaz tudo (rollback): escopo antigo intacto", async () => {
				const created = await subgroups.create(newSubgroup({ scope: specificScope(disc(0)) }));

				await rejection(subgroups.setScope(created.id, specificScope(disc(1), MISSING_DISCIPLINE_ID)));

				expect(await linkedIds(created.id)).toEqual([disc(0)]);
			});
		});
	});
});
