// tests/fakes/fake-token-generator.ts

import type { TokenGenerator } from "@/core/ports/token-generator";

export class FakeTokenGenerator implements TokenGenerator {
	private n = 0;
	sessionToken(): string {
		return "token-" + ++this.n;
	}
	recoveryCode(): string {
		return "AAAAA-" + String(++this.n).padStart(5, "0");
	}
}
