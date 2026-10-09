// scripts/mutation/configs/subgroup.mjs
//
// Mutações do postgres-subgroup-repository.ts.
// Rode com:  npm run mutate -- subgroup

import { inFile, inMethod } from "../helpers.mjs";

export default {
	target: "src/adapters/persistence/postgres-subgroup-repository.ts",
	testFile: "tests/integration/postgres-subgroup-repository.test.ts",
	/** "integration" usa o banco (.env); "unit" roda o vitest padrão. */
	kind: "integration",
	get mutations() {
		return MUTATIONS;
	},
};

const NOT_FOUND_IF = 'if ((result.rowCount ?? 0) === 0) throw new NotFoundError("subgroup", id);';
const DUP_IF = 'if (isUniqueViolation(err)) throw new DuplicateNameError("subgroup");';

const MUTATIONS = [
	["M01 create sem assertScopeNotEmpty", inMethod("create", "assertScopeNotEmpty(data.scope);", "")],
	["M02 código 23505 trocado por 23506", inFile('codeOf(err) === "23505"', 'codeOf(err) === "23506"')],
	["M03 withTransaction sem ROLLBACK", inFile('await client.query("ROLLBACK");', "")],
	["M04 listByGroup ordena por name (sem norm_name)", inFile("ORDER BY norm_name(name), id", "ORDER BY name, id")],
	["M05 listByGroup sem checar se o grupo existe", inMethod("listByGroup", 'if ((group.rowCount ?? 0) === 0) throw new NotFoundError("group", groupId);', "")],
	["M06 listByGroup sem filtrar por group_id", inFile("WHERE group_id = $1", "WHERE $1::int IS NOT NULL")],
	["M07 findById ignora os vínculos", inMethod("findById", "row, links.get(id) ?? []", "row, []")],
	["M08 findById não devolve null", inMethod("findById", "if (row === undefined) return null;", "")],
	["M09 listByGroup ignora os vínculos", inMethod("listByGroup", "rows.map((r) => r.id),", "[],")],
	["M10 create sem converter 23505", inMethod("create", DUP_IF, "")],
	["M11 create sem converter FK de grupo", inMethod("create", 'if (isMissingGroup(err)) throw new NotFoundError("group", data.groupId);', "")],
	["M12 isMissingGroup converte qualquer 23503", inFile(' && constraintOf(err) === GROUP_FK', "")],
	["M13 create troca url e logoUrl", inMethod("create", "data.url ?? null, data.logoUrl ?? null", "data.logoUrl ?? null, data.url ?? null")],
	["M14 insertLinks general sem WHERE is_universal", inFile('FROM discipline WHERE is_universal",', 'FROM discipline",')],
	["M15 insertLinks specific ignora scope.ids", inFile("[subgroupId, [...scope.ids]]", "[subgroupId, []]")],
	["M16 update ignora groupId", inMethod("update", "sets.push(`group_id = $${values.length}`);", "")],
	["M17 update url só se truthy", inMethod("update", "if (data.url !== undefined) {", "if (data.url) {")],
	["M18 update logoUrl só se truthy", inMethod("update", "if (data.logoUrl !== undefined) {", "if (data.logoUrl) {")],
	["M19 update sem checar id no ramo vazio", inMethod("update", 'if ((exists.rowCount ?? 0) === 0) throw new NotFoundError("subgroup", id);', "")],
	["M20 update sem NotFoundError após UPDATE", inMethod("update", NOT_FOUND_IF, "")],
	["M21 update sem converter 23505", inMethod("update", DUP_IF, "")],
	["M22 update sem converter FK de grupo", inMethod("update", "if (isMissingGroup(err) && data.groupId !== undefined)", "if (false)")],
	["M23 setActive sem NotFoundError", inMethod("setActive", NOT_FOUND_IF, "")],
	["M24 setActive grava sempre true", inMethod("setActive", "[id, active]", "[id, true]")],
	["M25 setScope sem assertScopeNotEmpty", inMethod("setScope", "assertScopeNotEmpty(scope);", "")],
	["M26 setScope sem DELETE dos vínculos antigos", inFile('"DELETE FROM subgroup_discipline WHERE subgroup_id = $1"', '"SELECT $1::int"')],
	["M27 setScope sem NotFoundError", inMethod("setScope", NOT_FOUND_IF, "")],
];
