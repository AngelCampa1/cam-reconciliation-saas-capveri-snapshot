import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyEnvFiles,
  applyWranglerVars,
  getCommandPlan,
  validateRequiredEnv,
} from "./cloudflare-env-runner.mjs";

describe("cloudflare-env-runner", () => {
  it("deploy applies D1 migrations before OpenNext deploy", () => {
    expect(getCommandPlan("deploy").slice(-4)).toEqual([
      ["npx", ["next", "build", "--webpack"]],
      ["npx", ["opennextjs-cloudflare", "build", "--skipNextBuild"]],
      [
        "npx",
        [
          "wrangler",
          "d1",
          "migrations",
          "apply",
          "capveri-ai-sdr-nonces",
          "--remote",
        ],
      ],
      ["npx", ["opennextjs-cloudflare", "deploy"]],
    ]);
  });

  it("missing public env fails", () => {
    expect(() => validateRequiredEnv({})).toThrow(
      /Missing required Cloudflare marketing env variables/,
    );
  });

  it("production-shaped public env passes", () => {
    validateRequiredEnv({
      NEXT_PUBLIC_API_URL: "https://api.capveri.com",
      NEXT_PUBLIC_SITE_URL: "https://www.capveri.com",
      NEXT_PUBLIC_APP_URL: "https://app.capveri.com",
      NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
    });
  });

  it("wrangler vars load before local env files", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "capveri-cf-root-"));
    const marketingDir = path.join(rootDir, "marketing");
    await mkdir(marketingDir);
    const wranglerPath = path.join(marketingDir, "wrangler.jsonc");
    await writeFile(
      wranglerPath,
      JSON.stringify({
        vars: {
          NEXT_PUBLIC_API_URL: "https://api.capveri.com",
          NEXT_PUBLIC_SITE_URL: "https://www.capveri.com",
        },
      }),
    );
    await writeFile(
      path.join(marketingDir, ".env.local"),
      "NEXT_PUBLIC_API_URL=http://localhost:8000\nNEXT_PUBLIC_APP_URL=https://app.capveri.com\n",
    );

    const wranglerEnv = await applyWranglerVars({ wranglerPath, env: {} });
    const loaded = await applyEnvFiles({
      rootDir,
      marketingDir,
      env: wranglerEnv,
    });

    expect(loaded.NEXT_PUBLIC_API_URL).toBe("https://api.capveri.com");
    expect(loaded.NEXT_PUBLIC_SITE_URL).toBe("https://www.capveri.com");
    expect(loaded.NEXT_PUBLIC_APP_URL).toBe("https://app.capveri.com");
  });

  it("secrets are rejected from wrangler vars", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "capveri-cf-secret-"));
    const marketingDir = path.join(rootDir, "marketing");
    await mkdir(marketingDir);
    const wranglerPath = path.join(marketingDir, "wrangler.jsonc");
    await writeFile(
      wranglerPath,
      JSON.stringify({ vars: { SENTRY_AUTH_TOKEN: "must-not-live-here" } }),
    );

    await expect(applyWranglerVars({ wranglerPath, env: {} })).rejects.toThrow(
      /SENTRY_AUTH_TOKEN must not be stored in wrangler\.jsonc vars/,
    );
  });
});
