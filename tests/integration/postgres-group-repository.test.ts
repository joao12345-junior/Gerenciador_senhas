// tests/integration/postgres-group-repository.test.ts

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "./helpers/test-database";
import { PostgresGroupRepository } from "../../src/adapters/persistence/postgres-group-repository";
import type { DisciplineScope } from "../../src/core/domain/discipline";
import type {
	NewVaultGroup,
	UpdateVaultGroup,
} from "../../src/core/domain/vault-group";
import { DuplicateNameError, NotFoundError } from "../../src/core/errors";

const MISSING_ID = 999_999;
const MISSING_DISCIPLINE_ID = 999_999;

/** Escopo específico a partir de ids soltos. */
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

describe("PostgresGroupRepository", () => {
	let db: TestDatabase;
	let groups: PostgresGroupRepository;

	/** Id da disciplina universal (Geral) semeada pela migration 010. */
	let universalId: number;
	/** Ids das disciplinas específicas semeadas, em ordem crescente. */
	let specificIds: number[];

	/** Id da n-ésima disciplina específica (falha alto se o seed mudar). */
	function disc(index: number): number {
		const id = specificIds[index];
		if (id === undefined) throw new Error(`disciplina específica ${index} ausente do seed`);
		return id;
	}

	/** Grupo base; cada teste sobrescreve só o que exercita. */
	function newGroup(overrides: Partial<NewVaultGroup> = {}): NewVaultGroup {
		return {
			name: "Obras",
			icon: "hammer",
			position: 1,
			fieldTemplate: [],
			scope: { kind: "general" },
			...overrides,
		};
	}

	/** Disciplinas vinculadas a um grupo, lidas direto do banco (ordem crescente). */
	async function linkedIds(groupId: number): Promise<number[]> {
		const { rows } = await db.pool.query<{ discipline_id: number }>(
			"SELECT discipline_id FROM group_discipline WHERE group_id = $1 ORDER BY discipline_id",
			[groupId],
		);
		return rows.map((r) => r.discipline_id);
	}

	async function countRows(table: "vault_group" | "group_discipline"): Promise<number> {
		const { rows } = await db.pool.query<{ n: string }>(
			`SELECT count(*) AS n FROM ${table}`,
		);
		return Number(rows[0]?.n);
	}

	beforeAll(async () => {
		db = await createTestDatabase();
		groups = new PostgresGroupRepository(db.pool);

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
		// CASCADE leva group_discipline junto; a tabela discipline não é tocada
		await db.pool.query("TRUNCATE vault_group RESTART IDENTITY CASCADE");
	});

	afterAll(async () => {
		await db.drop();
	});

	// ---------------------------------------------------------------- create

	describe("create", () => {
		it("devolve id gerado pelo banco e active = true", async () => {
			const created = await groups.create(newGroup());

			expect(created.id).toBeGreaterThan(0);
			expect(created.active).toBe(true);
		});

		it("devolve name, icon, position e fieldTemplate iguais aos enviados", async () => {
			const template = [
				{ label: "PIN", secret: true },
				{ label: "Matrícula", secret: false },
			];
			const created = await groups.create(
				newGroup({ name: "Licitações", icon: "gavel", position: 7, fieldTemplate: template }),
			);

			expect(created).toMatchObject({
				name: "Licitações",
				icon: "gavel",
				position: 7,
				fieldTemplate: template,
			});
		});

		it("devolve o scope enviado (general)", async () => {
			const created = await groups.create(newGroup({ scope: { kind: "general" } }));

			expect(created.scope).toEqual({ kind: "general" });
		});

		it("devolve o scope enviado (specific)", async () => {
			const created = await groups.create(
				newGroup({ scope: specificScope(disc(0), disc(2)) }),
			);

			expect(created.scope).toEqual(specificScope(disc(0), disc(2)));
		});

		it("dois grupos recebem ids diferentes", async () => {
			const a = await groups.create(newGroup({ name: "A" }));
			const b = await groups.create(newGroup({ name: "B" }));

			expect(a.id).not.toBe(b.id);
		});

		it("scope general → uma linha em group_discipline, apontando para a universal", async () => {
			const created = await groups.create(newGroup({ scope: { kind: "general" } }));

			expect(await linkedIds(created.id)).toEqual([universalId]);
		});

		it("scope specific → uma linha por disciplina", async () => {
			const created = await groups.create(
				newGroup({ scope: specificScope(disc(2), disc(0)) }),
			);

			expect(await linkedIds(created.id)).toEqual([disc(0), disc(2)].sort((a, b) => a - b));
		});

		it("fieldTemplate com entradas fica gravado idêntico no banco", async () => {
			const template = [
				{ label: "PIN", secret: true },
				{ label: "Matrícula", secret: false },
			];
			const created = await groups.create(newGroup({ fieldTemplate: template }));

			const { rows } = await db.pool.query<{ field_template: unknown }>(
				"SELECT field_template FROM vault_group WHERE id = $1",
				[created.id],
			);
			expect(rows[0]?.field_template).toEqual(template);
		});

		describe("nome duplicado", () => {
			it.each([
				["mesmo nome", "Obras"],
				["outra caixa", "OBRAS"],
				["minúsculas", "obras"],
			])("%s → DuplicateNameError('group')", async (_label, secondName) => {
				await groups.create(newGroup({ name: "Obras" }));

				const err = await rejection(groups.create(newGroup({ name: secondName })));

				expect(err).toBeInstanceOf(DuplicateNameError);
				expect(err).toMatchObject({ entity: "group" });
			});

			it("letra acentuada em outra caixa ('Elétrica' vs 'ELÉTRICA') → DuplicateNameError('group')", async () => {
				await groups.create(newGroup({ name: "Elétrica" }));

				const err = await rejection(groups.create(newGroup({ name: "ELÉTRICA" })));

				expect(err).toBeInstanceOf(DuplicateNameError);
				expect(err).toMatchObject({ entity: "group" });
			});

			it("a tentativa duplicada não deixa linha extra nem vínculos", async () => {
				await groups.create(newGroup({ name: "Obras", scope: specificScope(disc(0)) }));

				await rejection(groups.create(newGroup({ name: "obras", scope: specificScope(disc(1), disc(2)) })));

				expect(await countRows("vault_group")).toBe(1);
				expect(await countRows("group_discipline")).toBe(1);
			});
		});

		describe("atomicidade", () => {
			it("disciplina inexistente → rejeita com a violação de FK e não deixa o grupo gravado", async () => {
				const err = await rejection(
					groups.create(newGroup({ scope: specificScope(disc(0), MISSING_DISCIPLINE_ID) })),
				);

				// 23503 = foreign_key_violation: o erro original sai, não vira DuplicateNameError
				expect(err).toMatchObject({ code: "23503" });
				expect(err).not.toBeInstanceOf(DuplicateNameError);
				expect(await countRows("vault_group")).toBe(0);
				expect(await countRows("group_discipline")).toBe(0);
			});
		});

		describe("escopo vazio", () => {
			it("specific com Set vazio → Error citando o escopo e nada gravado", async () => {
				const err = await rejection(groups.create(newGroup({ scope: specificScope() })));

				expect(err).toBeInstanceOf(Error);
				expect(err).not.toBeInstanceOf(DuplicateNameError);
				expect((err as Error).message).toMatch(/escopo/i);
				expect(await countRows("vault_group")).toBe(0);
				expect(await countRows("group_discipline")).toBe(0);
			});
		});
	});

	// ---------------------------------------------------------------- findById

	describe("findById", () => {
		it("id inexistente → null", async () => {
			expect(await groups.findById(MISSING_ID)).toBeNull();
		});

		it("devolve todos os campos de um grupo general", async () => {
			const template = [{ label: "PIN", secret: true }];
			const created = await groups.create(
				newGroup({ name: "Obras", icon: "hammer", position: 4, fieldTemplate: template }),
			);

			expect(await groups.findById(created.id)).toEqual({
				id: created.id,
				name: "Obras",
				icon: "hammer",
				position: 4,
				active: true,
				scope: { kind: "general" },
				fieldTemplate: template,
			});
		});

		it("monta o scope specific a partir dos vínculos", async () => {
			const created = await groups.create(
				newGroup({ scope: specificScope(disc(1), disc(2)) }),
			);

			const found = await groups.findById(created.id);

			expect(found?.scope).toEqual(specificScope(disc(1), disc(2)));
		});

		it("devolve também grupo inativo", async () => {
			const created = await groups.create(newGroup());
			await db.pool.query("UPDATE vault_group SET active = false WHERE id = $1", [created.id]);

			expect((await groups.findById(created.id))?.active).toBe(false);
		});

		it("não mistura vínculos de outros grupos", async () => {
			const a = await groups.create(newGroup({ name: "A", scope: specificScope(disc(0)) }));
			await groups.create(newGroup({ name: "B", scope: specificScope(disc(1), disc(2)) }));

			expect((await groups.findById(a.id))?.scope).toEqual(specificScope(disc(0)));
		});

		it("vínculos corrompidos (nenhum) → Error com o id do grupo", async () => {
			const created = await groups.create(newGroup());
			await db.pool.query("DELETE FROM group_discipline WHERE group_id = $1", [created.id]);

			const err = await rejection(groups.findById(created.id));

			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toContain(String(created.id));
		});
	});

	// ---------------------------------------------------------------- listAll

	describe("listAll", () => {
		it("sem grupos → lista vazia", async () => {
			expect(await groups.listAll()).toEqual([]);
		});

		it("inclui grupos inativos", async () => {
			const a = await groups.create(newGroup({ name: "A" }));
			const b = await groups.create(newGroup({ name: "B" }));
			await db.pool.query("UPDATE vault_group SET active = false WHERE id = $1", [b.id]);

			const all = await groups.listAll();

			expect(all.map((g) => g.id).sort()).toEqual([a.id, b.id].sort());
			expect(all.find((g) => g.id === b.id)?.active).toBe(false);
		});

		it("ordena por position e, em empate, por id", async () => {
			const b = await groups.create(newGroup({ name: "B", position: 2 }));
			const a = await groups.create(newGroup({ name: "A", position: 1 }));
			const c = await groups.create(newGroup({ name: "C", position: 1 }));

			const all = await groups.listAll();

			expect(all.map((g) => g.id)).toEqual([a.id, c.id, b.id]);
		});

		it("cada grupo vem com o próprio scope", async () => {
			const general = await groups.create(newGroup({ name: "G", position: 1 }));
			const some = await groups.create(
				newGroup({ name: "S", position: 2, scope: specificScope(disc(0), disc(1)) }),
			);
			const one = await groups.create(
				newGroup({ name: "U", position: 3, scope: specificScope(disc(2)) }),
			);

			const all = await groups.listAll();

			expect(all.find((g) => g.id === general.id)?.scope).toEqual({ kind: "general" });
			expect(all.find((g) => g.id === some.id)?.scope).toEqual(specificScope(disc(0), disc(1)));
			expect(all.find((g) => g.id === one.id)?.scope).toEqual(specificScope(disc(2)));
		});

		it("devolve o mesmo que findById para cada grupo", async () => {
			await groups.create(newGroup({ name: "A", position: 1, fieldTemplate: [{ label: "x", secret: true }] }));
			await groups.create(newGroup({ name: "B", position: 2, scope: specificScope(disc(1)) }));

			const all = await groups.listAll();

			for (const group of all) {
				expect(await groups.findById(group.id)).toEqual(group);
			}
		});
	});

	// ---------------------------------------------------------------- update

	describe("update", () => {
		const PARTIALS: ReadonlyArray<[string, UpdateVaultGroup]> = [
			["name", { name: "Renomeado" }],
			["icon", { icon: "star" }],
			["position", { position: 9 }],
			["fieldTemplate", { fieldTemplate: [{ label: "PIN", secret: true }] }],
		];

		async function createBase() {
			return groups.create(
				newGroup({
					name: "Obras",
					icon: "hammer",
					position: 1,
					fieldTemplate: [{ label: "Antigo", secret: false }],
					scope: specificScope(disc(0)),
				}),
			);
		}

		it.each(PARTIALS)("altera só %s e preserva o resto", async (_field, partial) => {
			const created = await createBase();

			await groups.update(created.id, partial);

			expect(await groups.findById(created.id)).toEqual({ ...created, ...partial });
		});

		it("altera vários campos de uma vez", async () => {
			const created = await createBase();

			await groups.update(created.id, { name: "Novo", icon: "star", position: 5 });

			expect(await groups.findById(created.id)).toEqual({
				...created,
				name: "Novo",
				icon: "star",
				position: 5,
			});
		});

		it("não mexe em active nem nos vínculos", async () => {
			const created = await createBase();

			await groups.update(created.id, { name: "Novo" });

			expect(await linkedIds(created.id)).toEqual([disc(0)]);
			expect((await groups.findById(created.id))?.active).toBe(true);
		});

		it("{} em grupo existente → resolve sem alterar nada", async () => {
			const created = await createBase();

			await expect(groups.update(created.id, {})).resolves.toBeUndefined();

			expect(await groups.findById(created.id)).toEqual(created);
		});

		it("{} em id inexistente → NotFoundError('group', id)", async () => {
			const err = await rejection(groups.update(MISSING_ID, {}));

			expect(err).toBeInstanceOf(NotFoundError);
			expect(err).toMatchObject({ entity: "group", id: MISSING_ID });
		});

		it("com dados em id inexistente → NotFoundError('group', id)", async () => {
			const err = await rejection(groups.update(MISSING_ID, { name: "X" }));

			expect(err).toBeInstanceOf(NotFoundError);
			expect(err).toMatchObject({ entity: "group", id: MISSING_ID });
		});

		it("nome de outro grupo (qualquer caixa) → DuplicateNameError e nada muda", async () => {
			await groups.create(newGroup({ name: "Licitações", position: 2 }));
			const created = await createBase();

			const err = await rejection(groups.update(created.id, { name: "LICITAÇÕES", icon: "star" }));

			expect(err).toBeInstanceOf(DuplicateNameError);
			expect(err).toMatchObject({ entity: "group" });
			expect(await groups.findById(created.id)).toEqual(created);
		});

		it("mudar só a caixa do próprio nome é permitido", async () => {
			const created = await createBase();

			await expect(groups.update(created.id, { name: "OBRAS" })).resolves.toBeUndefined();

			expect((await groups.findById(created.id))?.name).toBe("OBRAS");
		});

		it("não altera os outros grupos", async () => {
			const other = await groups.create(newGroup({ name: "Outro", position: 8 }));
			const created = await createBase();

			await groups.update(created.id, { name: "Novo", position: 3 });

			expect(await groups.findById(other.id)).toEqual(other);
		});
	});

	// ---------------------------------------------------------------- setActive

	describe("setActive", () => {
		it("desativa e reativa", async () => {
			const created = await groups.create(newGroup());

			await groups.setActive(created.id, false);
			expect((await groups.findById(created.id))?.active).toBe(false);

			await groups.setActive(created.id, true);
			expect((await groups.findById(created.id))?.active).toBe(true);
		});

		it.each([true, false])("repetir o mesmo valor (%s) resolve sem lançar", async (value) => {
			const created = await groups.create(newGroup());
			await groups.setActive(created.id, value);

			await expect(groups.setActive(created.id, value)).resolves.toBeUndefined();

			expect((await groups.findById(created.id))?.active).toBe(value);
		});

		it("id inexistente → NotFoundError('group', id)", async () => {
			const err = await rejection(groups.setActive(MISSING_ID, false));

			expect(err).toBeInstanceOf(NotFoundError);
			expect(err).toMatchObject({ entity: "group", id: MISSING_ID });
		});

		it("só o grupo pedido muda", async () => {
			const target = await groups.create(newGroup({ name: "A" }));
			const other = await groups.create(newGroup({ name: "B" }));

			await groups.setActive(target.id, false);

			expect((await groups.findById(other.id))?.active).toBe(true);
		});

		it("não altera os demais campos nem os vínculos", async () => {
			const created = await groups.create(
				newGroup({ fieldTemplate: [{ label: "x", secret: true }], scope: specificScope(disc(1)) }),
			);

			await groups.setActive(created.id, false);

			expect(await groups.findById(created.id)).toEqual({ ...created, active: false });
		});
	});

	// ---------------------------------------------------------------- setScope

	describe("setScope", () => {
		it("troca specific por outro specific sem deixar vínculo antigo", async () => {
			const created = await groups.create(newGroup({ scope: specificScope(disc(0), disc(1)) }));

			await groups.setScope(created.id, specificScope(disc(1), disc(2)));

			expect(await linkedIds(created.id)).toEqual([disc(1), disc(2)].sort((a, b) => a - b));
			expect((await groups.findById(created.id))?.scope).toEqual(specificScope(disc(1), disc(2)));
		});

		it("specific → general: só a universal fica vinculada", async () => {
			const created = await groups.create(newGroup({ scope: specificScope(disc(0), disc(1)) }));

			await groups.setScope(created.id, { kind: "general" });

			expect(await linkedIds(created.id)).toEqual([universalId]);
		});

		it("general → specific: a universal sai", async () => {
			const created = await groups.create(newGroup({ scope: { kind: "general" } }));

			await groups.setScope(created.id, specificScope(disc(0)));

			expect(await linkedIds(created.id)).toEqual([disc(0)]);
		});

		it("repetir o mesmo escopo resolve e mantém o resultado", async () => {
			const created = await groups.create(newGroup({ scope: specificScope(disc(0), disc(2)) }));

			await expect(
				groups.setScope(created.id, specificScope(disc(0), disc(2))),
			).resolves.toBeUndefined();

			expect(await linkedIds(created.id)).toEqual([disc(0), disc(2)].sort((a, b) => a - b));
		});

		it("id inexistente → NotFoundError('group', id) e nenhum vínculo criado", async () => {
			const err = await rejection(groups.setScope(MISSING_ID, specificScope(disc(0))));

			expect(err).toBeInstanceOf(NotFoundError);
			expect(err).toMatchObject({ entity: "group", id: MISSING_ID });
			expect(await countRows("group_discipline")).toBe(0);
		});

		it("escopo vazio → Error citando o escopo e o escopo antigo é preservado", async () => {
			const created = await groups.create(newGroup({ scope: specificScope(disc(0), disc(1)) }));

			const err = await rejection(groups.setScope(created.id, specificScope()));

			expect(err).toBeInstanceOf(Error);
			expect((err as Error).message).toMatch(/escopo/i);
			expect(await linkedIds(created.id)).toEqual([disc(0), disc(1)].sort((a, b) => a - b));
		});

		it("disciplina inexistente → FK violada e o escopo antigo é preservado (rollback)", async () => {
			const created = await groups.create(newGroup({ scope: specificScope(disc(0), disc(1)) }));

			const err = await rejection(
				groups.setScope(created.id, specificScope(disc(2), MISSING_DISCIPLINE_ID)),
			);

			expect(err).toMatchObject({ code: "23503" });
			expect(await linkedIds(created.id)).toEqual([disc(0), disc(1)].sort((a, b) => a - b));
		});

		it("não mexe nos vínculos de outros grupos", async () => {
			const target = await groups.create(newGroup({ name: "A", scope: specificScope(disc(0)) }));
			const other = await groups.create(newGroup({ name: "B", scope: specificScope(disc(1), disc(2)) }));

			await groups.setScope(target.id, { kind: "general" });

			expect(await linkedIds(other.id)).toEqual([disc(1), disc(2)].sort((a, b) => a - b));
		});

		it("não altera os demais campos do grupo", async () => {
			const created = await groups.create(
				newGroup({ fieldTemplate: [{ label: "x", secret: true }], scope: specificScope(disc(0)) }),
			);

			await groups.setScope(created.id, specificScope(disc(1)));

			expect(await groups.findById(created.id)).toEqual({
				...created,
				scope: specificScope(disc(1)),
			});
		});
	});
});
