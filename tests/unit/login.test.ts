// tests/unit/login.test.ts

import { beforeEach, describe, expect, it } from "vitest";
import { PENDING_MFA_TIMEOUT_MS } from "@/core/domain/session-policy";
import { LoginUseCase, type LoginInput } from "@/core/use-cases/auth/login";
import { FakeClock } from "../fakes/fake-clock";
import { FakeLogger } from "../fakes/fake-logger";
import { FakePasswordHasher } from "../fakes/fake-password-hasher";
import { FakeSessionRepository } from "../fakes/fake-session-repository";
import { FakeTokenGenerator } from "../fakes/fake-token-generator";
import { FakeTokenHasher } from "../fakes/fake-token-hasher";
import { FakeUserRepository, makeUser } from "../fakes/fake-user-repository";

const NOW = new Date("2026-06-01T12:00:00Z");
const DUMMY = "hashed:dummy-password";
const RIGHT = "correct-password";

describe("LoginUseCase", () => {
	let users: FakeUserRepository;
	let sessions: FakeSessionRepository;
	let passwords: FakePasswordHasher;
	let logger: FakeLogger;
	let useCase: LoginUseCase;

	beforeEach(() => {
		users = new FakeUserRepository();
		sessions = new FakeSessionRepository();
		passwords = new FakePasswordHasher();
		logger = new FakeLogger();
		useCase = new LoginUseCase({
			users,
			passwords,
			tokens: new FakeTokenGenerator(),
			tokenHasher: new FakeTokenHasher(),
			sessions,
			clock: new FakeClock(NOW),
			logger,
			dummyPasswordHash: DUMMY,
		});
		users.add(makeUser());
	});

	const input = (overrides: Partial<LoginInput> = {}): LoginInput => ({
		email: "ana@optare.com.br",
		password: RIGHT,
		ip: "10.0.0.1",
		userAgent: "UA/1.0",
		...overrides,
	});

	describe("senha correta", () => {
		it("autentica e manda para verify-mfa quando o 2FA está ativo", async () => {
			const result = await useCase.execute(input());
			expect(result).toEqual({
				kind: "authenticated",
				sessionToken: "token-1",
				sessionExpiresAt: new Date(NOW.getTime() + PENDING_MFA_TIMEOUT_MS),
				next: "verify-mfa",
				mustChangePassword: false,
			});
		});

		it("manda para setup-2fa quando o 2FA ainda não foi configurado", async () => {
			users.add(makeUser({ totpEnabled: false }));
			const result = await useCase.execute(input());
			expect(result).toMatchObject({ kind: "authenticated", next: "setup-2fa" });
		});

		it("repassa mustChangePassword", async () => {
			users.add(makeUser({ mustChangePassword: true }));
			const result = await useCase.execute(input());
			expect(result).toMatchObject({ kind: "authenticated", mustChangePassword: true });
		});

		it("cria sessão pendente de 2FA, com hash do token, ip, user agent e prazo de 10 min", async () => {
			await useCase.execute(input());
			expect(sessions.created).toEqual([
				{
					userId: 1,
					tokenHash: "hmac(token-1)",
					mfaVerifiedAt: null,
					expiresAt: new Date(NOW.getTime() + 10 * 60_000),
					ip: "10.0.0.1",
					userAgent: "UA/1.0",
				},
			]);
		});

		it("aceita ip e user agent nulos", async () => {
			await useCase.execute(input({ ip: null, userAgent: null }));
			expect(sessions.created[0]).toMatchObject({ ip: null, userAgent: null });
		});

		it("normaliza o e-mail (espaços e maiúsculas)", async () => {
			const result = await useCase.execute(input({ email: "  ANA@Optare.com.br " }));
			expect(result.kind).toBe("authenticated");
		});

		it("devolve a tentativa reservada e NÃO zera o contador", async () => {
			users.add(makeUser({ failedLoginAttempts: 2 }));
			await useCase.execute(input());
			expect(users.refundCalls).toBe(1);
			expect(users.resetCalls).toBe(0);
			expect(users.get(1).failedLoginAttempts).toBe(2);
		});

		it("registra AuthLogin info sem senha nem token", async () => {
			await useCase.execute(input());
			expect(logger.entries).toHaveLength(1);
			expect(logger.entries[0]).toMatchObject({
				level: "info",
				category: "AuthLogin",
				details: { userId: 1, next: "verify-mfa" },
				occurredAt: NOW,
			});
			const dump = logger.dump();
			expect(dump).not.toContain(RIGHT);
			expect(dump).not.toContain("token-1");
			expect(dump).not.toContain("ana@optare.com.br");
		});
	});

	describe("rehash", () => {
		it("regrava o hash da senha digitada, preservando mustChange", async () => {
			passwords.outdated.add("hashed:correct-password");
			users.add(makeUser({ mustChangePassword: true }));
			await useCase.execute(input());
			expect(users.passwordUpdates).toEqual([
				{ id: 1, hash: "rehashed:correct-password", mustChange: true },
			]);
		});

		it("não regrava quando o hash está atualizado", async () => {
			await useCase.execute(input());
			expect(users.passwordUpdates).toEqual([]);
		});

		it("não regrava quando a senha está errada", async () => {
			passwords.outdated.add("hashed:correct-password");
			await useCase.execute(input({ password: "wrong" }));
			expect(users.passwordUpdates).toEqual([]);
		});
	});

	describe("senha errada", () => {
		it("devolve invalid-credentials, sem sessão e sem devolver a tentativa", async () => {
			const result = await useCase.execute(input({ password: "wrong" }));
			expect(result).toEqual({ kind: "invalid-credentials" });
			expect(sessions.count).toBe(0);
			expect(users.refundCalls).toBe(0);
			expect(users.get(1).failedLoginAttempts).toBe(1);
		});

		it("o segundo erro ainda é invalid-credentials", async () => {
			users.add(makeUser({ failedLoginAttempts: 1 }));
			const result = await useCase.execute(input({ password: "wrong" }));
			expect(result).toEqual({ kind: "invalid-credentials" });
			expect(users.get(1).failedLoginAttempts).toBe(2);
		});

		it("o terceiro erro trava a conta e registra AuthLockout", async () => {
			users.add(makeUser({ failedLoginAttempts: 2 }));
			const result = await useCase.execute(input({ password: "wrong" }));
			expect(result).toEqual({ kind: "locked" });
			expect(sessions.count).toBe(0);
			expect(logger.entries).toHaveLength(1);
			expect(logger.entries[0]).toMatchObject({
				level: "warn",
				category: "AuthLockout",
				details: { userId: 1 },
				occurredAt: NOW,
			});
		});

		it("depois de travada, a senha certa também é recusada", async () => {
			users.add(makeUser({ failedLoginAttempts: 2 }));
			await useCase.execute(input({ password: "wrong" }));
			const result = await useCase.execute(input());
			expect(result).toEqual({ kind: "locked" });
			expect(sessions.count).toBe(0);
		});

		it("não vaza a senha digitada no log", async () => {
			users.add(makeUser({ failedLoginAttempts: 2 }));
			await useCase.execute(input({ password: "senha-digitada-xyz" }));
			expect(logger.dump()).not.toContain("senha-digitada-xyz");
		});
	});

	describe("conta bloqueada", () => {
		it("com 3 tentativas: locked, sem conferir a senha nem incrementar", async () => {
			users.add(makeUser({ failedLoginAttempts: 3 }));
			const result = await useCase.execute(input());
			expect(result).toEqual({ kind: "locked" });
			expect(passwords.verifyCalls).toEqual([]);
			expect(users.registerCalls).toBe(0);
			expect(logger.entries[0]).toMatchObject({
				level: "warn",
				category: "AuthLockout",
				details: { userId: 1 },
			});
		});

		it("com lockedUntil no futuro: locked", async () => {
			users.add(makeUser({ lockedUntil: new Date(NOW.getTime() + 1000) }));
			expect(await useCase.execute(input())).toEqual({ kind: "locked" });
			expect(passwords.verifyCalls).toEqual([]);
		});

		it("com lockedUntil no passado e 0 tentativas: não bloqueia", async () => {
			users.add(makeUser({ lockedUntil: new Date(NOW.getTime() - 1000) }));
			expect((await useCase.execute(input())).kind).toBe("authenticated");
		});

		it("lockedUntil igual a agora não bloqueia (comparação estrita)", async () => {
			users.add(makeUser({ lockedUntil: NOW }));
			expect((await useCase.execute(input())).kind).toBe("authenticated");
		});
	});

	describe("requisições paralelas", () => {
		it("5 erros simultâneos: 2 invalid-credentials, 3 locked, só 3 conferências", async () => {
			const results = await Promise.all(
				Array.from({ length: 5 }, () => useCase.execute(input({ password: "wrong" }))),
			);
			const kinds = results.map((r) => r.kind);
			expect(kinds.filter((k) => k === "invalid-credentials")).toHaveLength(2);
			expect(kinds.filter((k) => k === "locked")).toHaveLength(3);
			const againstUser = passwords.verifyCalls.filter(
				(c) => c.hash === "hashed:correct-password",
			);
			expect(againstUser).toHaveLength(3);
			expect(users.get(1).failedLoginAttempts).toBe(5);
		});

		it("a senha certa depois do limite estourado não ganha sessão", async () => {
			users.add(makeUser({ failedLoginAttempts: 2 }));
			// a leitura do usuário acontece antes dos incrementos: simula corrida
			const [a, b] = await Promise.all([useCase.execute(input()), useCase.execute(input())]);
			const authenticated = [a, b].filter((r) => r.kind === "authenticated");
			expect(authenticated).toHaveLength(1);
			expect(sessions.count).toBe(1);
		});
	});

	describe("usuário inexistente, desativado ou excluído", () => {
		it("e-mail desconhecido: invalid-credentials e verify contra o hash fictício", async () => {
			const result = await useCase.execute(input({ email: "ninguem@optare.com.br" }));
			expect(result).toEqual({ kind: "invalid-credentials" });
			expect(passwords.verifyCalls).toEqual([{ hash: DUMMY, plain: RIGHT }]);
			expect(users.registerCalls).toBe(0);
			expect(sessions.count).toBe(0);
		});

		it("desativado: invalid-credentials mesmo com a senha certa", async () => {
			users.add(makeUser({ deactivatedAt: new Date("2026-05-01T00:00:00Z") }));
			expect(await useCase.execute(input())).toEqual({ kind: "invalid-credentials" });
			expect(passwords.verifyCalls).toEqual([{ hash: DUMMY, plain: RIGHT }]);
			expect(users.registerCalls).toBe(0);
		});

		it("excluído: invalid-credentials mesmo com a senha certa", async () => {
			users.add(makeUser({ deletedAt: new Date("2026-05-01T00:00:00Z") }));
			expect(await useCase.execute(input())).toEqual({ kind: "invalid-credentials" });
			expect(passwords.verifyCalls).toEqual([{ hash: DUMMY, plain: RIGHT }]);
		});

		it("desativado e travado: não revela o bloqueio", async () => {
			users.add(
				makeUser({ deactivatedAt: new Date("2026-05-01T00:00:00Z"), failedLoginAttempts: 3 }),
			);
			expect(await useCase.execute(input())).toEqual({ kind: "invalid-credentials" });
		});

		it("resultado idêntico ao de senha errada", async () => {
			const unknown = await useCase.execute(input({ email: "ninguem@optare.com.br" }));
			const wrong = await useCase.execute(input({ password: "wrong" }));
			expect(unknown).toEqual(wrong);
		});
	});

	describe("integridade e falhas", () => {
		it("MAC inválido: invalid-credentials, verify fictício e alerta sem e-mail", async () => {
			users.tamper(1);
			const result = await useCase.execute(input());
			expect(result).toEqual({ kind: "invalid-credentials" });
			expect(passwords.verifyCalls).toEqual([{ hash: DUMMY, plain: RIGHT }]);
			expect(sessions.count).toBe(0);
			expect(logger.entries).toHaveLength(1);
			expect(logger.entries[0]).toMatchObject({
				level: "warn",
				category: "AuthLogin",
				details: { userId: 1 },
				occurredAt: NOW,
			});
			expect(logger.dump()).not.toContain("ana@optare.com.br");
		});

		it("outros erros do repositório são propagados", async () => {
			users.failOnFind = new Error("banco fora do ar");
			await expect(useCase.execute(input())).rejects.toThrow("banco fora do ar");
			expect(sessions.count).toBe(0);
		});
	});
});
