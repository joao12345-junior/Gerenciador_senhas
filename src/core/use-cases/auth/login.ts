// src/core/use-cases/auth/login.ts

import type { UserAuthRecord } from "@/core/domain/user";
import type { Clock } from "../../ports/clock";
import type { Logger } from "../../ports/logger-port";
import type { PasswordHasher } from "../../ports/password-hasher";
import type { SessionRepository } from "../../ports/session-repository";
import type { TokenGenerator } from "../../ports/token-generator";
import type { TokenHasher } from "../../ports/token-hasher";
import type { UserRepository } from "../../ports/user-repository";
import { AuthIntegrityError } from "@/core/errors";
import { isLocked, MAX_FAILED_ATTEMPTS } from "@/core/domain/lockout-policy";
import { PENDING_MFA_TIMEOUT_MS } from "@/core/domain/session-policy";

export interface LoginInput {
	readonly email: string;
	readonly password: string;
	readonly ip: string | null;
	readonly userAgent: string | null;
}

/**
 * Resultado do login. União discriminada: a tela decide a mensagem a partir de `kind`.
 * `invalid-credentials` cobre senha errada, e-mail inexistente, conta desativada e conta
 * com MAC inválido: quem chama não deve conseguir distinguir os casos.
 */
export type LoginResult =
	| {
			readonly kind: "authenticated";
			/** Token em claro, só para o cookie. Nunca vai ao banco nem ao log. */
			readonly sessionToken: string;
			readonly sessionExpiresAt: Date;
			/** Próximo passo: conferir o código TOTP ou configurar o 2FA pela primeira vez. */
			readonly next: "verify-mfa" | "setup-2fa";
			readonly mustChangePassword: boolean;
	  }
	| { readonly kind: "invalid-credentials" }
	| { readonly kind: "locked" };

export interface LoginDependencies {
	readonly users: UserRepository;
	readonly passwords: PasswordHasher;
	readonly tokens: TokenGenerator;
	readonly tokenHasher: TokenHasher;
	readonly sessions: SessionRepository;
	readonly clock: Clock;
	readonly logger: Logger;
	/** Hash de uma senha descartável, para gastar o mesmo tempo quando o usuário não existe. */
	readonly dummyPasswordHash: string;
}

/** Senha correta cria uma sessão com 2FA pendente (`mfaVerifiedAt = null`); ainda NÃO é login. */
export class LoginUseCase {
	constructor(private readonly deps: LoginDependencies) {}

	async execute(input: LoginInput): Promise<LoginResult> {
		const email = input.email.trim().toLowerCase();
		const now = this.deps.clock.now();

		let user: UserAuthRecord | null;
		try {
			user = await this.deps.users.findAuthByEmail(email);
		} catch (err: unknown) {
			if (!(err instanceof AuthIntegrityError)) throw err;
			await this.deps.logger.warn({
				category: "AuthLogin",
				message: "Integridade da conta não confere",
				details: { userId: err.userId },
				occurredAt: now,
			});
			user = null; // cai no portão 3 como se não existisse
		}

		if (
			user === null ||
			user.deactivatedAt !== null ||
			user.deletedAt !== null
		) {
			await this.deps.passwords.verify(
				this.deps.dummyPasswordHash,
				input.password,
			);
			return { kind: "invalid-credentials" };
		}
		if (isLocked(user, now)) {
			await this.deps.logger.warn({
				category: "AuthLockout",
				message: "Usuário bloqueado",
				details: { userId: user.id },
				occurredAt: now,
			});
			return { kind: "locked" };
		}

		const attempts = await this.deps.users.registerFailedLogin(user.id, null);
		if (attempts > MAX_FAILED_ATTEMPTS) {
			return { kind: "locked" };
		}

		const passwordOk = await this.deps.passwords.verify(
			user.passwordHash,
			input.password,
		);
		if (!passwordOk) {
			if (attempts >= MAX_FAILED_ATTEMPTS) {
				await this.deps.logger.warn({
					category: "AuthLockout",
					message: "Conta bloqueada após erros",
					details: { userId: user.id },
					occurredAt: now,
				});
				return { kind: "locked" };
			}
			return { kind: "invalid-credentials" };
		}

		await this.deps.users.refundLoginAttempt(user.id);
		if (this.deps.passwords.needsRehash(user.passwordHash))
			await this.deps.users.updatePasswordHash(
				user.id,
				await this.deps.passwords.hash(input.password),
				user.mustChangePassword,
			);

		const token = this.deps.tokens.sessionToken();
		const tokenHash = this.deps.tokenHasher.hash(token);
		const expiresAt = new Date(now.getTime() + PENDING_MFA_TIMEOUT_MS);
		const next = user.totpEnabled ? "verify-mfa" : "setup-2fa";
		await this.deps.sessions.create({
			userId: user.id,
			tokenHash,
			mfaVerifiedAt: null,
			expiresAt,
			ip: input.ip,
			userAgent: input.userAgent,
		});

		await this.deps.logger.info({
			category: "AuthLogin",
			message: "Usuário logado",
			details: { userId: user.id, next },
			occurredAt: now,
		});

		return {
			kind: "authenticated",
			sessionToken: token,
			sessionExpiresAt: expiresAt,
			next,
			mustChangePassword: user.mustChangePassword,
		};
	}
}
