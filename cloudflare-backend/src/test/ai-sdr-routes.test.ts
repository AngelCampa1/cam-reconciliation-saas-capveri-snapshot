import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import {
  buildHmacPayload,
  signHmacPayload,
  stableJson,
  type StableJsonValue,
} from "../domain/ai-context/signing";
import type { AppEnv } from "../env";
import { createAiSdrRoutes } from "../http/ai-sdr-routes";
import type { AuthVariables } from "../middleware/auth";

const secret = "test-ai-sdr-context-secret";

class MemoryNonceConsumer {
  consumed = new Set<string>();

  async consume(input: { nonce: string; timestamp: string }): Promise<boolean> {
    if (this.consumed.has(input.nonce)) {
      return false;
    }

    this.consumed.add(input.nonce);

    return true;
  }
}

function createTestApp(nonceConsumer = new MemoryNonceConsumer()) {
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();

  app.route("/api/v1", createAiSdrRoutes({ nonceConsumer }));

  return { app, nonceConsumer };
}

function env(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
    AI_SDR_PRODUCT_CONTEXT_SECRET: secret,
    ...overrides,
  } as unknown as AppEnv;
}

async function signedHeaders(
  path: string,
  options: { productId?: string; timestamp?: string; nonce?: string } = {},
): Promise<Record<string, string>> {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const nonce = options.nonce ?? crypto.randomUUID().replace(/-/gu, "");
  const payload = await buildHmacPayload({
    timestamp,
    nonce,
    method: "GET",
    path,
    body: { productId: options.productId ?? "capveri" },
  });

  return {
    "X-Ventora-Timestamp": timestamp,
    "X-Ventora-Nonce": nonce,
    "X-Ventora-Signature": await signHmacPayload(payload, secret),
  };
}

describe("AI SDR product context routes", () => {
  it("returns signed CapVeri product context for valid signed requests", async () => {
    const { app } = createTestApp();
    const path = "/api/v1/ai-sdr/product-context?productId=capveri";
    const response = await app.request(
      path,
      {
        headers: await signedHeaders(path),
      },
      env(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      productId: string;
      name: string;
      description: string;
      sources: Array<{ id: string; excerpt: string; url: string }>;
      plans: Array<{
        ctaUrl: string;
        defaultCadence: string;
        trialDays: number;
        features: string[];
      }>;
      meetingLinks: Array<{
        id: string;
        label: string;
        url: string;
        description: string;
      }>;
    };
    expect(body.productId).toBe("capveri");
    expect(body.name).toBe("CapVeri");
    expect(body.description).toContain("CAM");
    expect(body.sources[0]?.id).toBe("pricing");
    expect(
      body.sources.some((source) => source.id === "compliance-claims"),
    ).toBe(true);
    // Sources are surfaced to prospects as clickable citations, so every URL
    // must resolve on the live marketing site. /security 404s (only
    // /.well-known/security.txt exists); the public compliance page is /sources.
    expect(
      body.sources.find((source) => source.id === "compliance-claims")?.url,
    ).toBe("https://www.capveri.com/sources");
    expect(
      body.sources.every((source) => !source.url.endsWith("/security")),
    ).toBe(true);
    expect(body.plans[0]).toMatchObject({
      defaultCadence: "year",
    });
    expect(body.plans[0]?.ctaUrl).toContain("offer=80OFF");
    // Converged SDR context: the sales chat needs BOTH product capabilities and
    // prospect-fit positioning, identical to the marketing endpoint. Capability
    // labels come first, then tagline / unit limit / audience / portfolio sizing.
    const features = body.plans[0]?.features ?? [];
    expect(features).toContain("CAM reconciliation");
    // The prospect-fit positioning block must be the exact final four entries,
    // in order, after the capability labels. Membership-only checks would miss a
    // reordered, dropped, or duplicated entry; pin the suffix and the ordering.
    expect(features.slice(-4)).toEqual([
      "Run lease-accurate CAM reconciliation without spreadsheet drift.",
      "Minimum subscription includes up to 25 active rentable units",
      "Audience: Commercial landlords and property managers",
      "Portfolio: Starts at $4,990/year for up to 25 rentable units",
    ]);
    // Capability labels come before the positioning block, with no duplicates.
    expect(features.indexOf("CAM reconciliation")).toBeLessThan(
      features.length - 4,
    );
    expect(new Set(features).size).toBe(features.length);
    expect(body.meetingLinks).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/cal\.com|calendly\.com/iu);
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");

    await expectResponseSignature(response, path, body);
  });

  it("supports the product_id query alias", async () => {
    const { app } = createTestApp();
    const path = "/api/v1/ai-sdr/product-context?product_id=capveri";
    const response = await app.request(
      path,
      {
        headers: await signedHeaders(path),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      productId: "capveri",
    });
  });

  it("rejects unknown products before signature checks", async () => {
    const { app } = createTestApp();
    const path = "/api/v1/ai-sdr/product-context?productId=other";
    const response = await app.request(
      path,
      {
        headers: await signedHeaders(path, { productId: "other" }),
      },
      env(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Unknown product",
    });
  });

  it("rejects missing and invalid signatures", async () => {
    const { app } = createTestApp();
    const path = "/api/v1/ai-sdr/product-context?productId=capveri";
    const missing = await app.request(path, undefined, env());
    const invalid = await app.request(
      path,
      {
        headers: {
          ...(await signedHeaders(path)),
          "X-Ventora-Signature": "0".repeat(64),
        },
      },
      env(),
    );

    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toMatchObject({
      detail: "Missing signature",
    });
    expect(invalid.status).toBe(401);
    await expect(invalid.json()).resolves.toMatchObject({
      detail: "Invalid signature",
    });
  });

  it("rejects stale signatures and nonce replays", async () => {
    const { app } = createTestApp();
    const path = "/api/v1/ai-sdr/product-context?productId=capveri";
    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const stale = await app.request(
      path,
      {
        headers: await signedHeaders(path, { timestamp: staleTimestamp }),
      },
      env(),
    );
    const replayHeaders = await signedHeaders(path, { nonce: "same-nonce" });
    const first = await app.request(path, { headers: replayHeaders }, env());
    const replay = await app.request(path, { headers: replayHeaders }, env());

    expect(stale.status).toBe(401);
    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
  });

  it("returns unavailable when no context secret is configured", async () => {
    const { app } = createTestApp();
    const path = "/api/v1/ai-sdr/product-context?productId=capveri";
    const response = await app.request(
      path,
      {
        headers: await signedHeaders(path),
      },
      env({ AI_SDR_PRODUCT_CONTEXT_SECRET: "" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Product context unavailable",
    });
  });

  it("falls back to the legacy AI_SDR_CONTEXT_SECRET alias", async () => {
    const { app } = createTestApp();
    const path = "/api/v1/ai-sdr/product-context?productId=capveri";
    const response = await app.request(
      path,
      {
        headers: await signedHeaders(path),
      },
      env({ AI_SDR_PRODUCT_CONTEXT_SECRET: "", AI_SDR_CONTEXT_SECRET: secret }),
    );

    expect(response.status).toBe(200);
  });
});

async function expectResponseSignature(
  response: Response,
  path: string,
  body: StableJsonValue,
): Promise<void> {
  const timestamp = response.headers.get("x-ventora-timestamp");
  const nonce = response.headers.get("x-ventora-nonce");
  const signature = response.headers.get("x-ventora-signature");

  expect(timestamp).toBeTruthy();
  expect(nonce).toBeTruthy();
  expect(signature).toBeTruthy();

  const payload = await buildHmacPayload({
    timestamp: timestamp ?? "",
    nonce: nonce ?? "",
    method: "GET",
    path,
    body,
  });

  expect(signature).toBe(await signHmacPayload(payload, secret));
  expect(stableJson(body)).toContain("CapVeri");
}
