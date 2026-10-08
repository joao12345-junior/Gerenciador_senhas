import type { DisciplineScope } from "../domain/discipline";
import type {
	NewVaultSubgroup,
	UpdateVaultSubgroup,
	VaultSubgroup,
} from "../domain/vault-subgroup";
import type { DuplicateNameError, NotFoundError } from "../errors";

/**
 * Porta de persistência dos subgrupos do cofre (Repository Pattern). O `core`
 * depende desta interface; a implementação (`PostgresSubgroupRepository`)
 * fica em `adapters/`. Não valida regra de negócio (subgrupo contido no
 * grupo, mínimo de uma disciplina, Geral exclusiva): isso é do caso de uso.
 *
 * O nome do subgrupo é único **dentro do grupo**, não no cofre inteiro.
 * Convenção do contrato: consulta que não acha devolve `null`; comando sobre
 * id inexistente lança {@link NotFoundError}.
 */
export interface SubgroupRepository {
	/**
	 * Busca um subgrupo pelo id, com o escopo de disciplinas já montado.
	 * @returns O subgrupo (ativo ou não), ou `null` se o id não existe.
	 */
	findById(id: number): Promise<VaultSubgroup | null>;

	/**
	 * Lista os subgrupos de um grupo, **inclusive os inativos**: o filtro por
	 * `active` é regra do caso de uso.
	 * @returns Ordenados por nome (sem diferenciar maiúsculas); empate por `id`.
	 * @throws {NotFoundError} (`"group"`) se o grupo não existe. Grupo sem
	 * subgrupos devolve lista vazia.
	 */
	listByGroup(groupId: number): Promise<readonly VaultSubgroup[]>;

	/**
	 * Cria um subgrupo ativo no grupo informado, com o escopo de disciplinas
	 * dado.
	 * @returns O subgrupo criado, já com `id` e `active: true`.
	 * @throws {NotFoundError} (`"group"`) se o grupo não existe.
	 * @throws {DuplicateNameError} (`"subgroup"`) se o grupo já tem subgrupo
	 * com esse nome, ignorando maiúsculas e minúsculas.
	 */
	create(data: NewVaultSubgroup): Promise<VaultSubgroup>;

	/**
	 * Altera os campos informados; o que não vier em `data` não muda. Em `url`
	 * e `logoUrl`, `null` limpa o valor. `groupId` move o subgrupo para outro
	 * grupo. `active` e `scope` não passam por aqui (ver {@link setActive} e
	 * {@link setScope}). Com `data` vazio não altera nada, mas confere se o
	 * subgrupo existe.
	 * @throws {NotFoundError} (`"subgroup"`) se o id não existe.
	 * @throws {NotFoundError} (`"group"`) se o grupo de destino não existe.
	 * @throws {DuplicateNameError} (`"subgroup"`) se, no estado final (grupo
	 * e nome já aplicados), outro subgrupo do mesmo grupo tem esse nome.
	 */
	update(id: number, data: UpdateVaultSubgroup): Promise<void>;

	/**
	 * Ativa ou desativa o subgrupo. Idempotente: pedir o estado em que ele já
	 * está não lança erro e não tem efeito.
	 * @throws {NotFoundError} (`"subgroup"`) se o id não existe.
	 */
	setActive(id: number, active: boolean): Promise<void>;

	/**
	 * Substitui por inteiro o escopo de disciplinas do subgrupo (não soma ao
	 * anterior).
	 * @throws {NotFoundError} (`"subgroup"`) se o id não existe.
	 */
	setScope(id: number, scope: DisciplineScope): Promise<void>;
}
