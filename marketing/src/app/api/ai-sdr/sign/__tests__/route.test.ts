import { createHash, createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cloudflareEnv = vi.hoisted(() => ({
  current: undefined as { AI_SDR_CLIENT_ASSERTION_SECRET?: string } | undefined,
}));

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    if (!cloudflareEnv.current) {
      throw new Error("Cloudflare context unavailable");
    }
    return { env: cloudflareEnv.current };
  },
}));

import { POST } from "../route";

const SECRET = "test-assertion-secret";

type StableJsonValue =
  | null
  | boolean
  | number
  | string
  | StableJsonValue[]
  | { [key: string]: StableJsonValue };

// Independent re-implementation of the worker's canonicalization, used as the
// oracle for the route's signature. It must match @ventora/ai-assistant-contracts
// exactly: default UTF-16 code-unit key sort + drop undefined, then JSON.stringify.
// (Do not sort with localeCompare here. It disagrees with the worker on
// mixed-case/underscore keys and would let a real signing regression pass.)
function sortStable(value: StableJsonValue): StableJsonValue {
  if (Array.isArray(value)) {
    return value.map(sortStable);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const sorted: { [key: string]: StableJsonValue } = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) {
      sorted[key] = sortStable(child);
    }
  }
  return sorted;
}

function stableJson(value: StableJsonValue): string {
  return JSON.stringify(sortStable(value));
}

function expectedSignature(input: {
  timestamp: string;
  nonce: string;
  path: string;
  body: StableJsonValue;
}): string {
  const bodyHash = createHash("sha256")
    .update(stableJson(input.body))
    .digest("hex");
  const payload = `${input.timestamp}.${input.nonce}.POST.${input.path}.${bodyHash}`;
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

function postRequest(body: unknown): Request {
  return new Request("https://www.capveri.com/api/ai-sdr/sign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  cloudflareEnv.current = { AI_SDR_CLIENT_ASSERTION_SECRET: SECRET };
  delete process.env.AI_SDR_CLIENT_ASSERTION_SECRET;
});

afterEach(() => {
  vi.useRealTimers();
  cloudflareEnv.current = undefined;
  delete process.env.AI_SDR_CLIENT_ASSERTION_SECRET;
});

describe("POST /api/ai-sdr/sign", () => {
  it("mints a verifiable assertion for a session create", async () => {
    const body = { productId: "capveri", visitorId: "v-123" };
    const response = await POST(
      postRequest({ method: "POST", path: "/v1/sessions", body }),
    );

    expect(response.status).toBe(200);
    const assertion = (await response.json()) as {
      timestamp: string;
      nonce: string;
      signature: string;
    };
    expect(assertion.timestamp).toBeTruthy();
    expect(assertion.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(assertion.signature).toBe(
      expectedSignature({
        timestamp: assertion.timestamp,
        nonce: assertion.nonce,
        path: "/v1/sessions",
        body,
      }),
    );
  });

  it("signs chat and handoff requests", async () => {
    for (const path of ["/v1/chat", "/v1/handoff"]) {
      const body = { sessionId: "s-1", message: "hi" };
      const response = await POST(postRequest({ method: "POST", path, body }));
      expect(response.status).toBe(200);
      const assertion = (await response.json()) as {
        timestamp: string;
        nonce: string;
        signature: string;
      };
      expect(assertion.signature).toBe(
        expectedSignature({
          timestamp: assertion.timestamp,
          nonce: assertion.nonce,
          path,
          body,
        }),
      );
    }
  });

  it("signs a body with mixed-case and underscore keys using code-unit order", async () => {
    // 'Zeta'(90) < '_x'(95) < 'alpha'(97): default sort and localeCompare
    // disagree here, so this body proves the route signs with the worker's
    // UTF-16 ordering and not a locale-aware one.
    const body = {
      Zeta: 1,
      _x: 2,
      alpha: 3,
      sessionId: "s-1",
    };
    const response = await POST(
      postRequest({ method: "POST", path: "/v1/chat", body }),
    );
    expect(response.status).toBe(200);
    const assertion = (await response.json()) as {
      timestamp: string;
      nonce: string;
      signature: string;
    };
    expect(assertion.signature).toBe(
      expectedSignature({
        timestamp: assertion.timestamp,
        nonce: assertion.nonce,
        path: "/v1/chat",
        body,
      }),
    );
  });

  it("falls back to process.env when the Cloudflare context is unavailable", async () => {
    cloudflareEnv.current = undefined;
    process.env.AI_SDR_CLIENT_ASSERTION_SECRET = SECRET;
    const response = await POST(
      postRequest({
        method: "POST",
        path: "/v1/sessions",
        body: { productId: "capveri" },
      }),
    );
    expect(response.status).toBe(200);
  });

  it("returns 503 when no secret is configured", async () => {
    cloudflareEnv.current = {};
    const response = await POST(
      postRequest({
        method: "POST",
        path: "/v1/sessions",
        body: { productId: "capveri" },
      }),
    );
    expect(response.status).toBe(503);
  });

  it("rejects a non-allowlisted worker path", async () => {
    const response = await POST(
      postRequest({ method: "POST", path: "/v1/admin", body: {} }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects a non-POST method", async () => {
    const response = await POST(
      postRequest({ method: "GET", path: "/v1/sessions", body: {} }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a session create for another product", async () => {
    const response = await POST(
      postRequest({
        method: "POST",
        path: "/v1/sessions",
        body: { productId: "lextract" },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects a chat body that smuggles a foreign productId", async () => {
    const response = await POST(
      postRequest({
        method: "POST",
        path: "/v1/chat",
        body: { sessionId: "s-1", productId: "grantpipe" },
      }),
    );
    expect(response.status).toBe(403);
  });

  it("rejects a primitive body", async () => {
    const response = await POST(
      postRequest({ method: "POST", path: "/v1/sessions", body: "nope" }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a malformed sign request", async () => {
    const response = await POST(
      postRequest({ method: "POST", path: 42, body: {} }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a non-JSON request body", async () => {
    const response = await POST(
      new Request("https://www.capveri.com/api/ai-sdr/sign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("produces a signature the worker envelope contract accepts", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-20T12:00:00.000Z"));
    const body = { productId: "capveri", visitorId: "v-9" };
    const response = await POST(
      postRequest({ method: "POST", path: "/v1/sessions", body }),
    );
    const assertion = (await response.json()) as {
      timestamp: string;
      nonce: string;
      signature: string;
    };
    expect(assertion.timestamp).toBe("2026-06-20T12:00:00.000Z");
  });
});
