import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  {
    ignores: [
      "dist/**",
      "coverage/**",
      "worker-configuration.d.ts",
      ".wrangler/**",
      ".wrangler-dry-run-*/**",
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "vitest.config.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        Request: "readonly",
        Response: "readonly",
        console: "readonly",
      },
    },
    rules: {
      "no-console": "warn",
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        Blob: "readonly",
        FormData: "readonly",
        URL: "readonly",
        console: "readonly",
        fetch: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
  },
];
