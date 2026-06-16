import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    // Build output, dependencies, and emitter output are never linted.
    ignores: ["dist/**", "node_modules/**", "**/tsp-output/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Allow intentional `_`-prefixed unused args/vars (e.g. ignored params).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Node scripts (build/emit helpers) run on the Node global object.
    files: ["**/*.mjs", "*.config.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  // Keep ESLint out of formatting concerns; Prettier owns those.
  prettier,
);
