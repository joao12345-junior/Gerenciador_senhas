import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

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
		include: ["tests/**/*.test.ts"],
		// Testes de integração usam o banco de verdade: rodam só com `npm run test:integration`.
		exclude: [...configDefaults.exclude, "tests/integration/**"],
	},
});
