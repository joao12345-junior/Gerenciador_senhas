import type { DisciplineScope } from "./discipline";

/**
 * Grupo do cofre (ex.: "Postagem"): agrupa subgrupos e aparece como um bloco
 * na home. Tabela `vault_group`.
 */
export interface VaultGroup {
	readonly id: number;
	readonly name: string;
	/** Nome do ícone Lucide mostrado no bloco da home. */
	readonly icon: string;
	/** Ordem de exibição na home (menor aparece primeiro). Editável pelo admin. */
	readonly position: number;
	/**
	 * Grupo desativado esconde todas as credenciais dele de todos, inclusive as
	 * Nominais do proprietário (o admin só as vê reativando o grupo).
	 */
	readonly active: boolean;
	/** Quem enxerga o grupo: Geral (todos) ou só as disciplinas listadas. */
	readonly scope: DisciplineScope;
	/**
	 * Campos padrão sugeridos ao criar uma credencial do grupo. São só
	 * sugestões: mudar o modelo não altera credenciais que já existem.
	 */
	readonly fieldTemplate: readonly FieldTemplateEntry[];
}

/**
 * Dados para criar um grupo. Fora daqui: `id` (gerado pelo banco) e `active`
 * (todo grupo nasce ativo).
 */
export interface NewVaultGroup {
	readonly name: string;
	readonly icon: string;
	readonly position: number;
	readonly fieldTemplate: readonly FieldTemplateEntry[];
	/** Obrigatório na criação: o banco exige ao menos uma disciplina (Geral conta). */
	readonly scope: DisciplineScope;
}

/**
 * Campos editáveis de um grupo, todos opcionais (só o que vier é alterado).
 * `active` e `scope` ficam de fora: têm métodos próprios (`setActive`, `setScope`)
 * porque cada um tem regras próprias no caso de uso.
 */
export type UpdateVaultGroup = Partial<Omit<NewVaultGroup, "scope">>;

/** Um campo padrão do modelo de credenciais de um grupo. */
export interface FieldTemplateEntry {
	/** Rótulo mostrado no formulário (ex.: "PIN"). */
	readonly label: string;
	/** Se verdadeiro, o valor só aparece quando a pessoa o revela (e é auditado). */
	readonly secret: boolean;
}
