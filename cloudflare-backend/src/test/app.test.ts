import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app";

describe("cloudflare backend app", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("serves health without touching external services", async () => {
    const app = createApp();
    const res = await app.request("/health", {}, env);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      status: "healthy",
      version: "0.1.0",
      environment: "development",
      runtime: "cloudflare-workers",
      capabilities: {
        terminal_document_delete: true,
      },
    });
  });

  it("returns JSON 404 errors", async () => {
    const app = createApp();
    const res = await app.request("/missing", {}, env);

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "not_found",
      },
    });
  });

  it("mounts core authenticated data routes", async () => {
    const app = createApp();
    const res = await app.request("/api/v1/properties", {}, env);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "authorization_required",
      },
    });
  });

  it("mounts authenticated bootstrap routes", async () => {
    const app = createApp();
    const res = await app.request("/api/v1/dashboard", {}, env);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "authorization_required",
      },
    });
  });

  it("mounts authenticated billing routes", async () => {
    const app = createApp();
    const res = await app.request("/api/v1/billing/plan-selection", {}, env);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "authorization_required",
      },
    });
  });

  it("mounts authenticated auth lifecycle routes", async () => {
    const app = createApp();
    const res = await app.request(
      "/api/v1/auth/legal-acceptance/current",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accepted_terms: true,
          terms_version: "2026-06-03",
          terms_hash:
            "sha256:4b8757a98ddfb7da6d079abbe3dc9d639e6aebd98feaa8a09c2f2f2f8fb48f4a",
        }),
      },
      env,
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "authorization_required",
      },
    });
  });

  it("mounts public billing launch offer route", async () => {
    // The launch promo carries a real endsAt (2026-07-04T07:00:00Z). This route
    // reads wall-clock time, so pin the clock inside the offer window — otherwise
    // the assertion silently flips to the expired shape once the date passes and
    // stops exercising the live-offer path it exists to cover.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T00:00:00Z"));

    const app = createApp();
    const res = await app.request(
      "/api/v1/billing/launch-offer/active",
      {},
      env,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      code: "80OFF",
      discount_percent: 80,
      all_exhausted: false,
    });
  });

  it("mounts authenticated ingestion routes", async () => {
    const app = createApp();
    const res = await app.request("/api/v1/ingestion/batches", {}, env);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "authorization_required",
      },
    });
  });

  it("mounts authenticated organization routes", async () => {
    const app = createApp();
    const res = await app.request("/api/v1/organization/usage", {}, env);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "authorization_required",
      },
    });
  });

  it("keeps tenant invitation validation public ahead of tenant portal auth", async () => {
    const app = createApp();
    const res = await app.request(
      "/api/v1/tenant/invitations/short/validate",
      {},
      env,
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      valid: false,
      error_reason: "not_found",
    });
  });

  it("authenticates tenant portal dashboard routes", async () => {
    const app = createApp();
    const res = await app.request("/api/v1/tenant/dashboard", {}, env);

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: {
        code: "authorization_required",
      },
    });
  });

  it("answers CORS preflight for app origin without requiring auth", async () => {
    const app = createApp();
    const res = await app.request(
      "/api/v1/dashboard",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://app.capveri.com",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "authorization,x-correlation-id",
        },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.capveri.com",
    );
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    // The frontend sends X-Correlation-ID on every request; the preflight
    // must allow it (reflected) or the browser blocks the real request.
    expect(
      res.headers.get("Access-Control-Allow-Headers")?.toLowerCase(),
    ).toContain("x-correlation-id");
  });

  it("sets CORS headers on responses to the marketing origin", async () => {
    const app = createApp();
    const res = await app.request(
      "/api/v1/billing/launch-offer/active",
      { headers: { Origin: "https://www.capveri.com" } },
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://www.capveri.com",
    );
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain(
      "Content-Disposition",
    );
  });

  it("does not emit CORS allow-origin for a disallowed origin", async () => {
    const app = createApp();
    const res = await app.request(
      "/health",
      { headers: { Origin: "https://evil.example.com" } },
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).not.toBe(
      "https://evil.example.com",
    );
  });

  it("allows localhost CORS in development for browser-local testing", async () => {
    const app = createApp();
    const res = await app.request(
      "/api/v1/dashboard",
      {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "authorization,x-correlation-id",
        },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173",
    );
  });

  it("does not allow localhost CORS outside development", async () => {
    const app = createApp();
    const res = await app.request(
      "/api/v1/dashboard",
      {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "GET",
        },
      },
      { ...env, ENVIRONMENT: "production" },
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
