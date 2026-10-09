// scripts/mutation/configs/session.mjs
//
// Mutações do postgres-session-repository.ts.
// Rode com:  npm run mutate -- session

import { inFile, inMethod } from "../helpers.mjs";

export default {
	target: "src/adapters/persistence/postgres-session-repository.ts",
	testFile: "tests/integration/postgres-session-repository.test.ts",
	/** "integration" usa o banco (.env); "unit" roda o vitest padrão. */
	kind: "integration",
	get mutations() {
		return MUTATIONS;
	},
};

const MUTATIONS = [
	["M01 findByTokenHash sem WHERE (devolve a 1ª sessão)", inMethod("findByTokenHash", "WHERE token_hmac = $1", "WHERE $1::text IS NOT NULL")],
	["M02 findByTokenHash não devolve null", inMethod("findByTokenHash", "if (row === undefined) return null;", "")],
	["M03 insertSession grava ip no lugar do user_agent", inFile("data.ip,\n\t\t\t\tdata.userAgent,", "data.userAgent,\n\t\t\t\tdata.ip,")],
	["M04 insertSession grava mfaVerifiedAt nulo", inFile("data.mfaVerifiedAt,", "null,")],
	["M05 insertSession grava expiresAt errado (+1 s)", inFile("data.expiresAt,", "new Date(data.expiresAt.getTime() + 1000),")],
	["M06 rotate sem checar se o DELETE apagou algo", inMethod("rotate", "if (rows.length === 0) return null;", "")],
	["M07 rotate checa rows.length === 1 invertido", inMethod("rotate", "rows.length === 0", "rows.length !== 0")],
	["M08 withTransaction sem BEGIN (cada comando vira commit próprio)", inFile('await client.query("BEGIN");', "")],
	["M09 rotate apaga por user_id em vez de id", inMethod("rotate", "DELETE FROM session WHERE id = $1 RETURNING id", "DELETE FROM session WHERE user_id = $1 RETURNING id")],
	["M10 rotate insere antes de apagar", inMethod("rotate", "const { rows } = await client.query(\n\t\t\t\t`DELETE FROM session WHERE id = $1 RETURNING id`,\n\t\t\t\t[oldId],\n\t\t\t);", "const created = await this.insertSession(client, data);\n\t\t\tconst { rows } = await client.query(\n\t\t\t\t`DELETE FROM session WHERE id = $1 RETURNING id`,\n\t\t\t\t[oldId],\n\t\t\t);\n\t\t\tif (rows.length > 0) return created;")],
	["M11 withTransaction sem ROLLBACK", inFile('await client.query("ROLLBACK");', "")],
	["M12 withTransaction sem release", inFile("client.release();", "")],
	["M13 withTransaction sem COMMIT", inFile('await client.query("COMMIT");', "")],
	["M14 touch sem a guarda last_seen_at < $2", inFile(" AND last_seen_at < $2", "")],
	["M15 touch com < trocado por >", inMethod("touch", "last_seen_at < $2", "last_seen_at > $2")],
	["M16 touch sem filtrar por id", inFile("WHERE id = $1 AND last_seen_at < $2", "WHERE $1::int IS NOT NULL AND last_seen_at < $2")],
	["M17 touch com parâmetros trocados", inMethod("touch", "[id, at],", "[at, id],")],
	["M18 delete sem filtrar por id", inMethod("delete", "DELETE FROM session WHERE id = $1", "DELETE FROM session WHERE $1::int IS NOT NULL")],
	["M19 deleteAllForUser sem filtrar por usuário", inMethod("deleteAllForUser", "WHERE user_id = $1", "WHERE $1::int IS NOT NULL")],
	["M20 deleteAllForUser devolve sempre 0", inMethod("deleteAllForUser", "return rowCount ?? 0;", "return 0;")],
	["M21 deleteExpired com < em vez de <=", inMethod("deleteExpired", "expires_at <= $1", "expires_at < $1")],
	["M22 deleteExpired com sentido invertido", inMethod("deleteExpired", "expires_at <= $1", "expires_at >= $1")],
	["M23 deleteExpired devolve sempre 0", inMethod("deleteExpired", "return rowCount ?? 0;", "return 0;")],
	["M24 deleteExpired olha last_seen_at em vez de expires_at", inMethod("deleteExpired", "expires_at <= $1", "last_seen_at <= $1")],
	["M25 insertSession ignora o client da transação (usa sempre o pool)", inFile("const { rows } = await db.query<SessionRow>(", "const { rows } = await this.pool.query<SessionRow>(")],
];
