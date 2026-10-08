import type { DisciplineScope } from "../domain/discipline";
import type { NotFoundError } from "../errors";
import type {
	NewVaultGroup,
	UpdateVaultGroup,
	VaultGroup,
} from "../domain/vault-group";

/**
 * Porta de persistência dos grupos do cofre (Repository Pattern). O `core`
 * depende desta interface; a implementação (`PostgresGroupRepository`) fica
 * em `adapters/`. Não valida regra de negócio (subconjunto de disciplinas,
 * mínimo de uma disciplina, Geral exclusiva): isso é do caso de uso.
 *
 * Convenção do contrato: consulta que não acha devolve `null`; comando sobre
 * id inexistente lança {@link NotFoundError}.
 */
export interface GroupRepository {
	/**
	 * Busca um grupo pelo id, com o escopo de disciplinas já montado.
	 * @returns O grupo (ativo ou não), ou `null` se o id não existe.
	 */
	findById(id: number): Promise<VaultGroup | null>;

	/**
	 * Lista todos os grupos, **inclusive os inativos**: o filtro por `active`
	 * é regra do caso de uso (o admin precisa ver os inativos para reativá-los).
	 * @returns Ordenados por `position` crescente; empate desempata por `id`.
	 */
	listAll(): Promise<readonly VaultGroup[]>;

	/**
	 * Cria um grupo ativo, com o escopo de disciplinas informado.
	 * @returns O grupo criado, já com `id` e `active: true`.
	 * @throws {DuplicateNameError} (`"group"`) se já existe grupo com esse
	 * nome, ignorando maiúsculas e minúsculas.
	 */
	create(data: NewVaultGroup): Promise<VaultGroup>;

	/**
	 * Altera os campos informados; o que não vier em `data` não muda. `active`
	 * e `scope` não passam por aqui (ver {@link setActive} e {@link setScope}).
	 * Com `data` vazio não altera nada, mas ainda confere se o grupo existe.
	 * @throws {NotFoundError} (`"group"`) se o id não existe.
	 * @throws {DuplicateNameError} (`"group"`) se o novo nome colide com o de
	 * outro grupo.
	 */
	update(id: number, data: UpdateVaultGroup): Promise<void>;

	/**
	 * Ativa ou desativa o grupo. Idempotente: pedir o estado em que o grupo já
	 * está não lança erro e não tem efeito.
	 * @throws {NotFoundError} (`"group"`) se o id não existe.
	 */
	setActive(id: number, active: boolean): Promise<void>;

	/**
	 * Substitui por inteiro o escopo de disciplinas do grupo (não soma ao
	 * anterior).
	 * @throws {NotFoundError} (`"group"`) se o id não existe.
	 */
	setScope(id: number, scope: DisciplineScope): Promise<void>;
}
