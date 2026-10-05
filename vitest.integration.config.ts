import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Config dos testes de integração (banco real, em schema temporário). */
export default defineConfig({
	resolve: {
		alias: [
			{ find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
			{
				find: "server-only",
				replacement: fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
			},
		],
	},
	test: {
		include: ["tests/integration/**/*.test.ts"],
		// A KingHost fica na rede: criar schema e aplicar migrations leva alguns segundos.
		testTimeout: 20_000,
		hookTimeout: 30_000,
	},
});
