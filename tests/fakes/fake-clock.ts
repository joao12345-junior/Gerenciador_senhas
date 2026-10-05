// tests/fakes/fake-clock.ts

import type { Clock } from "@/core/ports/clock";

export class FakeClock implements Clock {
	constructor(private current: Date) {}

	now(): Date {
		return this.current;
	}

	advance(seconds: number): void {
		this.current = new Date(this.current.getTime() + seconds * 1000);
	}
}
