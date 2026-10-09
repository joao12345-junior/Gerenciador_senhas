// tests/fakes/fake-token-hasher.ts

import type { TokenHasher } from "@/core/ports/token-hasher";

export class FakeTokenHasher implements TokenHasher {
	hash(token: string): string {
		return "hmac(" + token + ")";
	}
}
