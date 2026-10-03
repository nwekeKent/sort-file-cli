import js from "@eslint/js";
import globals from "globals";

export default [
	{ ignores: ["coverage/", "node_modules/"] },
	js.configs.recommended,
	{
		languageOptions: {
			ecmaVersion: 2023,
			sourceType: "module",
			globals: globals.node,
		},
		rules: {
			"no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			eqeqeq: ["error", "always"],
			"prefer-const": "error",
			"no-var": "error",
		},
	},
];
