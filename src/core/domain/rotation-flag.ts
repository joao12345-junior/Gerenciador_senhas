// src/core/domain/rotation-flag.ts

/**
 * Devolve os campos que ainda precisam de troca de senha depois que
 * `changed` foi alterado (diferença de conjuntos: `fields` menos `changed`).
 *
 * Serve às duas regras de rotação: resolver um aviso aberto (o que sobrou de
 * `pending_fields`) e decidir o que gera aviso quando uma credencial deixa de
 * ser compartilhada (campos revelados que o dono não trocou na mesma gravação).
 *
 * Trabalha só com identificadores (`login`, `password`, `notes` ou o id do campo
 * extra), nunca com rótulos nem valores. Quem compara valor antigo e novo é o
 * caso de uso; o domínio não vê segredo. Função pura: não altera as entradas.
 *
 * @param fields Campos pendentes (ou revelados), por identificador.
 * @param changed Campos que foram trocados, por identificador. Ids que não estão
 * em `fields` são ignorados.
 * @returns Novo conjunto com o que continua sem troca; vazio = nada mais a trocar.
 */
export function remainingFields(
	fields: ReadonlySet<string>,
	changed: ReadonlySet<string>,
): ReadonlySet<string> {
	return new Set([...fields].filter((field) => !changed.has(field)));
}
