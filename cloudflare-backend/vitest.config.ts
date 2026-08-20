import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ...(process.env.RUN_OPENROUTER_E2E
            ? { RUN_OPENROUTER_E2E: process.env.RUN_OPENROUTER_E2E }
            : {}),
          ...(process.env.OPENROUTER_E2E_LIMIT
            ? { OPENROUTER_E2E_LIMIT: process.env.OPENROUTER_E2E_LIMIT }
            : {}),
          ...(process.env.OPENROUTER_E2E_FILTER
            ? { OPENROUTER_E2E_FILTER: process.env.OPENROUTER_E2E_FILTER }
            : {}),
        },
      },
    }),
  ],
  test: {
    include: ["src/test/**/*.test.ts"],
  },
});
