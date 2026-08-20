import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../env";
import { errorResponse } from "../http/errors";
import {
  requireRuntimeSecret,
  validateRuntimeEnvironment,
} from "../platform/cloudflare";

function createSecretProbeApp(): Hono<{ Bindings: Partial<AppEnv> }> {
  const app = new Hono<{ Bindings: Partial<AppEnv> }>();

  app.onError((error, c) => errorResponse(c, error));

  app.get("/needs-openrouter", (c) => {
    const apiKey = requireRuntimeSecret(c.env, "OPENROUTER_API_KEY");

    return c.json({ configured: apiKey.length > 0 });
  });

  return app;
}

describe("runtime binding contract", () => {
  it("returns a structured config error when a route uses a missing secret", async () => {
    const app = createSecretProbeApp();
    const res = await app.request("/needs-openrouter", {}, {});

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      detail: "Missing required runtime secret: OPENROUTER_API_KEY",
      error: {
        code: "config_error",
        message: "Missing required runtime secret: OPENROUTER_API_KEY",
      },
    });
  });

  it("allows a route to use a configured runtime secret without exposing it", async () => {
    const app = createSecretProbeApp();
    const res = await app.request(
      "/needs-openrouter",
      {},
      { OPENROUTER_API_KEY: "test-secret" },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ configured: true });
  });

  it("requires production-only runtime secrets in production", () => {
    expect(() =>
      validateRuntimeEnvironment({ ENVIRONMENT: "production" }),
    ).toThrow(
      "Missing required runtime secret: DOCUMENT_ACCESS_SIGNING_SECRET",
    );

    expect(() =>
      validateRuntimeEnvironment({
        ENVIRONMENT: "production",
        DOCUMENT_ACCESS_SIGNING_SECRET: "configured",
      }),
    ).toThrow("Missing required runtime secret: CHECKOUT_OFFER_TOKEN_SECRET");

    expect(() =>
      validateRuntimeEnvironment({
        ENVIRONMENT: "production",
        DOCUMENT_ACCESS_SIGNING_SECRET: "configured",
        CHECKOUT_OFFER_TOKEN_SECRET: "configured",
        UNSUBSCRIBE_HMAC_SECRET: "configured",
      }),
    ).not.toThrow();
  });
});
