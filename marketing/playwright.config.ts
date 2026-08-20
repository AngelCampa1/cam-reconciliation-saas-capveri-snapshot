import { defineConfig, devices } from "@playwright/test";

const e2eBaseUrl = process.env.E2E_BASE_URL || "http://127.0.0.1:3008";
const e2eBaseHost = new URL(e2eBaseUrl).hostname;
const e2eBasePort = new URL(e2eBaseUrl).port || "3008";
const allowedE2EHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

if (!allowedE2EHosts.has(e2eBaseHost)) {
  throw new Error(
    `Marketing E2E tests must run against a local server. Received E2E_BASE_URL=${e2eBaseUrl}`,
  );
}

if (process.env.CI && process.env.RUN_PRODUCTION_TESTS) {
  throw new Error(
    "RUN_PRODUCTION_TESTS is manual-only and must not be set in CI.",
  );
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: e2eBaseUrl,
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      testIgnore: /mobile-.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-iphone",
      testMatch: /mobile-.*\.spec\.ts/,
      use: { ...devices["iPhone 13"] },
    },
    {
      name: "mobile-android",
      testMatch: /mobile-.*\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],

  ...(process.env.RUN_PRODUCTION_TESTS
    ? {}
    : {
        webServer: {
          command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${e2eBasePort}`,
          url: e2eBaseUrl,
          reuseExistingServer: false,
          timeout: 120000,
        },
      }),
});
