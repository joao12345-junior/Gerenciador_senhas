// tests/fakes/fake-session-repository.ts

import type { NewSession, Session } from "@/core/domain/session";
import type { SessionRepository } from "@/core/ports/session-repository";

export class FakeSessionRepository implements SessionRepository {
	/** Tudo que foi passado a create, na ordem. */
	readonly created: NewSession[] = [];
	private readonly sessions = new Map<number, { session: Session; tokenHash: string }>();
	private nextId = 1;

	async create(data: NewSession): Promise<Session> {
		this.created.push(data);
		const session: Session = {
			id: this.nextId++,
			userId: data.userId,
			mfaVerifiedAt: data.mfaVerifiedAt,
			expiresAt: data.expiresAt,
			lastSeenAt: new Date(0),
			createdAt: new Date(0),
		};
		this.sessions.set(session.id, { session, tokenHash: data.tokenHash });
		return session;
	}

	async findByTokenHash(tokenHash: string): Promise<Session | null> {
		for (const entry of this.sessions.values()) {
			if (entry.tokenHash === tokenHash) return entry.session;
		}
		return null;
	}

	async rotate(oldId: number, data: NewSession): Promise<Session | null> {
		if (!this.sessions.delete(oldId)) return null;
		return this.create(data);
	}

	async touch(): Promise<void> {}

	async delete(id: number): Promise<void> {
		this.sessions.delete(id);
	}

	async deleteAllForUser(userId: number): Promise<number> {
		let count = 0;
		for (const [id, entry] of this.sessions) {
			if (entry.session.userId === userId) {
				this.sessions.delete(id);
				count++;
			}
		}
		return count;
	}

	async deleteExpired(): Promise<number> {
		return 0;
	}

	get count(): number {
		return this.sessions.size;
	}
}
