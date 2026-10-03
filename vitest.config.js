import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		coverage: {
			provider: "v8",
			include: ["sort-cli.js", "lib/**/*.js"],
			exclude: ["**/*.test.js"],
		},
	},
});
