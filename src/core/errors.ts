// src/core/errors.ts

/** A conta de autenticação foi alterada fora do app (o MAC não confere). */
export class AuthIntegrityError extends Error {
	/**
	 * @param userId Conta afetada. Fica fora da mensagem; o caso de uso o
	 * usa para registrar o alerta.
	 */
	constructor(readonly userId: number) {
		super("Integridade da conta de autenticação não confere");
		this.name = "AuthIntegrityError";
	}
}

/** Entidades cujo nome é único e pode colidir. */
export type NamedEntity = "group" | "subgroup" | "discipline";

/**
 * Já existe uma entidade com esse nome (índice único do banco). O adaptador
 * converte o erro 23505 do Postgres nesta classe; o caso de uso escolhe a
 * mensagem para o admin a partir de `entity`.
 */
export class DuplicateNameError extends Error {
	/**
	 * @param entity Qual entidade repetiu. Fica fora da mensagem para não
	 * repassar texto digitado pelo usuário ao log.
	 */
	constructor(readonly entity: NamedEntity) {
		super("Nome da entidade duplicado");
		this.name = "DuplicateNameError";
	}
}

/**
 * O registro pedido não existe. O adaptador lança quando um comando
 * (update, setActive, setScope) não afeta nenhuma linha; consultas como
 * `findById` devolvem `null` em vez de lançar.
 */
export class NotFoundError extends Error {
	/**
	 * @param entity Tipo da entidade que não foi encontrada. Fica fora da
	 * mensagem, que é genérica.
	 * @param id Id procurado. Também fica fora da mensagem; serve ao log do
	 * caso de uso.
	 */
	constructor(
		readonly entity: NamedEntity,
		readonly id: number,
	) {
		super("Registro não encontrado");
		this.name = "NotFoundError";
	}
}
