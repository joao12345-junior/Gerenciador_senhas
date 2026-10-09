// scripts/mutation/configs/login.mjs
//
// Mutações do LoginUseCase (login.ts). Rode com:  npm run mutate -- login
// É um teste de unidade (fakes em memória), então roda sem banco e em segundos.

import { inFile } from "../helpers.mjs";

export default {
	target: "src/core/use-cases/auth/login.ts",
	testFile: "tests/unit/login.test.ts",
	kind: "unit",
	get mutations() {
		return MUTATIONS;
	},
};

const MUTATIONS = [
	// 1. Normalização do e-mail
	["M01 e-mail sem toLowerCase", inFile(".trim().toLowerCase()", ".trim()")],
	["M02 e-mail sem trim", inFile(".trim().toLowerCase()", ".toLowerCase()")],

	// 2. Busca e integridade
	["M03 engole qualquer erro da busca", inFile("if (!(err instanceof AuthIntegrityError)) throw err;", "")],
	["M04 relança o AuthIntegrityError (condição invertida)", inFile("if (!(err instanceof AuthIntegrityError)) throw err;", "if (err instanceof AuthIntegrityError) throw err;")],
	["M05 integridade não zera o usuário", inFile("user = null; // cai", "// cai")],
	["M06 log de integridade vaza o e-mail", inFile("details: { userId: err.userId },", "details: { userId: err.userId, email },")],

	// 3. Usuário ausente, desativado ou excluído
	["M07 ignora usuário desativado", inFile("user.deactivatedAt !== null", "false")],
	["M08 ignora usuário excluído", inFile("user.deletedAt !== null", "false")],
	["M09 usuário nulo não cai no portão", inFile("user === null ||", "false ||")],
	["M10 verify fictício com a senha trocada", inFile("this.deps.dummyPasswordHash,", '"", ')],

	// 4. Conta bloqueada
	["M11 nunca checa isLocked", inFile("if (isLocked(user, now)) {", "if (false) {")],
	["M12 bloqueada devolve invalid-credentials", inFile('return { kind: "locked" };', 'return { kind: "invalid-credentials" };')],
	["M13 log de bloqueio com categoria errada", inFile('category: "AuthLockout",', 'category: "AuthLogin",')],

	// 5. Reserva da tentativa
	["M14 não reserva a tentativa", inFile("const attempts = await this.deps.users.registerFailedLogin(user.id, null);", "const attempts = 1;")],
	["M15 limite paralelo >= em vez de >", inFile("if (attempts > MAX_FAILED_ATTEMPTS)", "if (attempts >= MAX_FAILED_ATTEMPTS)")],
	["M16 limite paralelo nunca recusa", inFile("if (attempts > MAX_FAILED_ATTEMPTS)", "if (false)")],

	// 6. Conferência da senha
	["M17 condição da senha invertida", inFile("if (!passwordOk) {", "if (passwordOk) {")],
	["M18 trava só acima do limite (> em vez de >=)", inFile("if (attempts >= MAX_FAILED_ATTEMPTS) {", "if (attempts > MAX_FAILED_ATTEMPTS) {")],
	["M19 senha errada sempre trava", inFile("if (attempts >= MAX_FAILED_ATTEMPTS) {", "if (true) {")],
	["M20 senha errada nunca trava", inFile("if (attempts >= MAX_FAILED_ATTEMPTS) {", "if (false) {")],
	["M21 senha errada trava sem registrar AuthLockout", inFile('category: "AuthLockout",\n\t\t\t\t\tmessage: "Conta', 'category: "AuthLogin",\n\t\t\t\t\tmessage: "Conta')],

	// 7. Estorno da tentativa
	["M22 não devolve a tentativa", inFile("await this.deps.users.refundLoginAttempt(user.id);", "")],
	["M23 zera o contador em vez de devolver", inFile("refundLoginAttempt(user.id)", "resetFailedLogins(user.id)")],

	// 8. Rehash
	["M24 rehash sempre", inFile("if (this.deps.passwords.needsRehash(user.passwordHash))", "if (true)")],
	["M25 nunca rehash", inFile("if (this.deps.passwords.needsRehash(user.passwordHash))", "if (false)")],
	["M26 rehash grava o hash antigo", inFile("await this.deps.passwords.hash(input.password),", "user.passwordHash,")],
	["M27 rehash zera mustChange", inFile("user.mustChangePassword,", "false,")],

	// 9. Sessão
	["M28 guarda o token em claro no lugar do hash", inFile("const tokenHash = this.deps.tokenHasher.hash(token);", "const tokenHash = token;")],
	["M29 prazo pendente subtrai em vez de somar", inFile("now.getTime() + PENDING_MFA_TIMEOUT_MS", "now.getTime() - PENDING_MFA_TIMEOUT_MS")],
	["M30 sessão nasce com 2FA verificado", inFile("mfaVerifiedAt: null,", "mfaVerifiedAt: now,")],
	["M31 ip e user agent trocados", inFile("ip: input.ip,\n\t\t\tuserAgent: input.userAgent,", "ip: input.userAgent,\n\t\t\tuserAgent: input.ip,")],
	["M32 não grava o ip", inFile("ip: input.ip,", "ip: null,")],
	["M33 não grava o user agent", inFile("userAgent: input.userAgent,", "userAgent: null,")],

	// 10. Resultado e log final
	["M34 next invertido", inFile("const next = user.totpEnabled ?", "const next = !user.totpEnabled ?")],
	["M35 devolve o hash no lugar do token", inFile("sessionToken: token,", "sessionToken: tokenHash,")],
	["M36 sessionExpiresAt errado", inFile("sessionExpiresAt: expiresAt,", "sessionExpiresAt: now,")],
	["M37 mustChangePassword fixo em false", inFile("mustChangePassword: user.mustChangePassword,", "mustChangePassword: false,")],
	["M38 log final vaza a senha", inFile("details: { userId: user.id, next },", "details: { userId: user.id, next, password: input.password },")],
	["M39 log final como warn", inFile("await this.deps.logger.info({", "await this.deps.logger.warn({")],
];
