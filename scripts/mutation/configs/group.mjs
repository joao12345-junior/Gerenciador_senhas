// scripts/mutation/configs/group.mjs
//
// Mutações do postgres-group-repository.ts.
// Rode com:  npm run mutate -- group

import { inFile, inMethod } from "../helpers.mjs";

export default {
	target: "src/adapters/persistence/postgres-group-repository.ts",
	testFile: "tests/integration/postgres-group-repository.test.ts",
	/** "integration" usa o banco (.env); "unit" roda o vitest padrão. */
	kind: "integration",
	get mutations() {
		return MUTATIONS;
	},
};

const NOT_FOUND_IF = 'if ((result.rowCount ?? 0) === 0) throw new NotFoundError("group", id);';
const DUP_IF = 'if (isUniqueViolation(err)) throw new DuplicateNameError("group");';

const MUTATIONS = [
	["M01 create sem assertScopeNotEmpty", inMethod("create", "assertScopeNotEmpty(data.scope);", "")],
	["M02 código 23505 trocado por 23506", inFile('err.code === "23505"', 'err.code === "23506"')],
	["M03 withTransaction sem ROLLBACK", inFile('await client.query("ROLLBACK");', "")],
	["M04 listAll sem ordenar por position", inFile("vault_group ORDER BY position, id`", "vault_group ORDER BY id`")],
	["M05 findById ignora os vínculos", inMethod("findById", "result.rows[0], links.get(id) ?? []", "result.rows[0], []")],
	["M06 findById não devolve null", inMethod("findById", "=== 0) return null;", "=== 0) { /* mutação */ }")],
	["M07 listAll ignora os vínculos", inMethod("listAll", "result.rows.map((r) => r.id),", "[],")],
	["M08 create sem converter 23505", inMethod("create", DUP_IF, "")],
	["M09 insertLinks general sem WHERE is_universal", inFile('FROM discipline WHERE is_universal",', 'FROM discipline",')],
	["M10 setScope sem DELETE dos vínculos antigos", inFile('"DELETE FROM group_discipline WHERE group_id = $1"', '"SELECT $1::int"')],
	["M11 setScope sem NotFoundError", inMethod("setScope", NOT_FOUND_IF, "")],
	["M12 setActive sem NotFoundError", inMethod("setActive", NOT_FOUND_IF, "")],
	["M13 setActive grava sempre true", inMethod("setActive", "[id, active]", "[id, true]")],
	["M14 update sem checar id no ramo vazio", inMethod("update", 'if ((exists.rowCount ?? 0) === 0) throw new NotFoundError("group", id);', "")],
	["M15 update sem NotFoundError após UPDATE", inMethod("update", NOT_FOUND_IF, "")],
	["M16 update sem converter 23505", inMethod("update", DUP_IF, "")],
	["M17 update grava fieldTemplate sem JSON.stringify", inMethod("update", "values.push(JSON.stringify(data.fieldTemplate));", "values.push(data.fieldTemplate);")],
];
