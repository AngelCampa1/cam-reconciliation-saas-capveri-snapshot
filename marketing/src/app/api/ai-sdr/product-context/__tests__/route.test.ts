import { createHash, createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { publicKnowledge } from "@/generated/public-knowledge";

const cloudflareEnv = vi.hoisted(() => ({
  current: undefined as
    | { AI_SDR_CONTEXT_SECRET?: string; AI_SDR_NONCE_DB?: NonceDatabase }
    | undefined,
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    if (!cloudflareEnv.current) {
      throw new Error("Cloudflare context unavailable");
    }
    return { env: cloudflareEnv.current };
  },
}));

const mockCaptureMarketingException = vi.hoisted(() => vi.fn());

vi.mock("@/lib/sentry", () => ({
  captureMarketingException: mockCaptureMarketingException,
}));

import { GET } from "../route";

const SECRET = "test-secret";

type NonceDatabase = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<{ success: boolean; meta: { changes?: number } }>;
    };
  };
};

function nonceDatabase(): NonceDatabase {
  const rows = new Map<string, number>();
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async run() {
              if (sql.startsWith("DELETE")) {
                const cutoff = Number(values[0]);
                let changes = 0;
                for (const [nonce, expiresAt] of rows.entries()) {
                  if (expiresAt <= cutoff) {
                    rows.delete(nonce);
                    changes += 1;
                  }
                }
                return { success: true, meta: { changes } };
              }

              const nonce = String(values[0]);
              const expiresAt = Number(values[1]);
              if (rows.has(nonce)) {
                return { success: true, meta: { changes: 0 } };
              }
              rows.set(nonce, expiresAt);
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

// Mirrors the production canonicalizer in src/lib/ai-sdr-hmac.ts and the worker
// contracts: object keys are ordered with the default Array.prototype.sort()
// (UTF-16 code-unit order), NOT localeCompare. A different collation here would
// make this oracle silently disagree with what the route actually signs.
function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${stableJson(entryValue)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function signedRequest(productId = "capveri", nonce = randomUUID()): Request {
  const timestamp = new Date().toISOString();
  const method = "GET";
  const path = `/api/ai-sdr/product-context?productId=${productId}`;
  const bodyHash = createHash("sha256")
    .update(stableJson({ productId }))
    .digest("hex");
  const signature = createHmac("sha256", SECRET)
    .update(`${timestamp}.${nonce}.${method}.${path}.${bodyHash}`)
    .digest("hex");

  return new Request(`https://www.capveri.com${path}`, {
    headers: {
      "X-Ventora-Timestamp": timestamp,
      "X-Ventora-Nonce": nonce,
      "X-Ventora-Signature": signature,
    },
  });
}

describe("GET /api/ai-sdr/product-context", () => {
  beforeEach(() => {
    cloudflareEnv.current = {
      AI_SDR_CONTEXT_SECRET: SECRET,
      AI_SDR_NONCE_DB: nonceDatabase(),
    };
  });

  afterEach(() => {
    cloudflareEnv.current = undefined;
    mockCaptureMarketingException.mockReset();
    vi.unstubAllEnvs();
  });

  it("returns signed CapVeri context with current first-year offer pricing", async () => {
    const reconcile = publicKnowledge.pricing.tiers.find(
      (tier) => tier.id === "reconcile",
    );
    expect(reconcile).toBeDefined();

    const response = await GET(signedRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Ventora-Product")).toBe("capveri");
    expect(response.headers.get("X-Ventora-Signature")).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(payload.productId).toBe("capveri");
    expect(payload.sources.map((source: { id: string }) => source.id)).toEqual(
      expect.arrayContaining(["plan-tiers", "marketing-help-center"]),
    );
    expect(payload.plans[0]).toMatchObject({
      id: "reconcile",
      name: "Reconcile",
      price: reconcile!.display.annualLabel,
      annualPrice: reconcile!.display.annualLabel,
      discount: "80OFF: 80% off the first year.",
      defaultCadence: "year",
      trialDays: 30,
      ctaUrl:
        "https://app.capveri.com/auth/register?utm_source=marketing_site&utm_medium=website&utm_campaign=free_trial&utm_content=ai_sdr_reconcile&plan=reconcile&offer=80OFF",
    });
  });

  it("signs the response body with the canonical HMAC envelope the worker verifies", async () => {
    const path = "/api/ai-sdr/product-context?productId=capveri";
    const response = await GET(signedRequest());
    const body = await response.json();

    const responseTimestamp = response.headers.get("X-Ventora-Timestamp");
    const responseNonce = response.headers.get("X-Ventora-Nonce");
    const responseSignature = response.headers.get("X-Ventora-Signature");
    expect(responseTimestamp).toBeTruthy();
    expect(responseNonce).toBeTruthy();
    expect(responseSignature).toBeTruthy();

    // Recompute the signature the worker would verify: HMAC over
    // `${ts}.${nonce}.GET.${path}.${sha256Hex(stableJson(body))}`.
    const bodyHash = createHash("sha256")
      .update(stableJson(body))
      .digest("hex");
    const expectedSignature = createHmac("sha256", SECRET)
      .update(`${responseTimestamp}.${responseNonce}.GET.${path}.${bodyHash}`)
      .digest("hex");

    expect(responseSignature).toBe(expectedSignature);
  });

  it("serves converged plan features: product capabilities plus prospect-fit positioning", async () => {
    const response = await GET(signedRequest());
    const payload = await response.json();

    const features: string[] = payload.plans[0].features;
    // Capability labels (shared with the cloudflare-backend endpoint).
    expect(features).toContain("CAM reconciliation");
    expect(features.length).toBeGreaterThan(20);
    // Prospect-fit positioning, appended after the capability labels.
    expect(features).toContain(
      "Run lease-accurate CAM reconciliation without spreadsheet drift.",
    );
    expect(features).toContain(
      "Audience: Commercial landlords and property managers",
    );
    expect(features).toContain(
      "Portfolio: Starts at $4,990/year for up to 25 rentable units",
    );
    // Capabilities come before positioning.
    expect(features.indexOf("CAM reconciliation")).toBeLessThan(
      features.indexOf("Audience: Commercial landlords and property managers"),
    );
  });

  it("does not serve booking links from the public product context", async () => {
    const response = await GET(signedRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.meetingLinks).toEqual([]);
    expect(JSON.stringify(payload)).not.toMatch(/cal\.com|calendly\.com/iu);
  });

  it("rejects replayed signed requests with the same nonce", async () => {
    const nonce = randomUUID();

    const first = await GET(signedRequest("capveri", nonce));
    const replay = await GET(signedRequest("capveri", nonce));

    expect(first.status).toBe(200);
    expect(replay.status).toBe(401);
    await expect(replay.json()).resolves.toEqual({
      error: "Invalid signature",
    });
  });

  it("reports missing production nonce DB while failing closed", async () => {
    cloudflareEnv.current = {
      AI_SDR_CONTEXT_SECRET: SECRET,
    };
    vi.stubEnv("NODE_ENV", "production");

    const response = await GET(signedRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid signature",
    });
    expect(mockCaptureMarketingException).toHaveBeenCalledTimes(1);
    expect(mockCaptureMarketingException).toHaveBeenCalledWith(
      expect.any(Error),
      {
        operation: "marketing.ai_sdr.product_context.nonce_db_unavailable",
        path: "/api/ai-sdr/product-context",
      },
    );
  });
});
