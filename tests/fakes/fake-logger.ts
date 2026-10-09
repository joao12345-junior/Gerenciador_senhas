// tests/fakes/fake-logger.ts

import type { LogEntry, Logger } from "@/core/ports/logger-port";

export type RecordedLog = LogEntry & { readonly level: "debug" | "info" | "warn" | "error" };

export class FakeLogger implements Logger {
	readonly entries: RecordedLog[] = [];

	async debug(entry: LogEntry): Promise<void> {
		this.entries.push({ ...entry, level: "debug" });
	}
	async info(entry: LogEntry): Promise<void> {
		this.entries.push({ ...entry, level: "info" });
	}
	async warn(entry: LogEntry): Promise<void> {
		this.entries.push({ ...entry, level: "warn" });
	}
	async error(entry: LogEntry): Promise<void> {
		this.entries.push({ ...entry, level: "error" });
	}

	/** Todo o log serializado, para checar que nada sensível vazou. */
	dump(): string {
		return JSON.stringify(this.entries);
	}
}
