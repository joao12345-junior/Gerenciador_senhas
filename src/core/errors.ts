// src/core/errors.ts

export class AuthIntegrityError extends Error {
	constructor(readonly userId: number) {
		super("Integridade da conta de autenticação não confere");
		this.name = "AuthIntegrityError";
	}
}
