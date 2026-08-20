import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type {
  AuthenticatedUserContext,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type { JwtVerifier } from "../adapters/auth/verifier";
import { buildAiCsAppContext } from "../domain/ai-context/public-knowledge";
import {
  buildHmacPayload,
  signHmacPayload,
  stableJson,
  type StableJsonValue,
} from "../domain/ai-context/signing";
import type { AppEnv } from "../env";
import { createAiCsRoutes } from "../http/ai-cs-routes";
import type { AuthVariables } from "../middleware/auth";

const secret = "test-ai-cs-context-secret";
const assertionSecret = "test-ai-cs-client-assertion-secret";
const userId = "11111111-1111-1111-1111-111111111111";
const orgId = "22222222-2222-2222-2222-222222222222";

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

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

function createTestApp(
  options: {
    context?: AuthenticatedUserContext;
    nonceConsumer?: MemoryNonceConsumer;
  } = {},
) {
  const nonceConsumer = options.nonceConsumer ?? new MemoryNonceConsumer();
  const verifier: JwtVerifier = {
    async verify() {
      return {
        subject: userId,
        payload: { sub: userId },
        isActive: true,
      };
    },
  };
  const db: DbAdapter = {
    mode: "postgrest-compat",
    protectedRecords,
    auth: {
      async resolveUserContext() {
        return options.context ?? userContext();
      },
    },
  };
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();

  app.route(
    "/api/v1",
    createAiCsRoutes({
      nonceConsumer,
      auth: { verifier, db },
    }),
  );

  return { app, nonceConsumer };
}

function userContext(
  overrides: Partial<AuthenticatedUserContext["user"]> = {},
): AuthenticatedUserContext {
  const user = {
    id: userId,
    organizationId: orgId,
    email: "owner@example.com",
    fullName: "Owner",
    role: "owner" as const,
    isPlatformAdmin: false,
    createdAt: "2026-06-13T00:00:00Z",
    updatedAt: "2026-06-13T00:00:00Z",
    ...overrides,
  };

  return {
    user,
    actor: {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      isServiceAdmin: user.isPlatformAdmin,
      party: "landlord",
      bearerToken: "valid-token",
    },
  };
}

function env(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
    AI_CS_CONTEXT_SECRET: secret,
    AI_CS_CLIENT_ASSERTION_SECRET: assertionSecret,
    ...overrides,
  } as unknown as AppEnv;
}

async function signedHeaders(
  path: string,
  options: {
    appId?: string;
    signedUserId?: string;
    timestamp?: string;
    nonce?: string;
  } = {},
): Promise<Record<string, string>> {
  const timestamp = options.timestamp ?? new Date().toISOString();
  const nonce = options.nonce ?? crypto.randomUUID().replace(/-/gu, "");
  // Mirror the ai-cs-worker: the signed body is {appId, userId} ONLY. The
  // current page rides in the URL query (already part of `path`), never the body.
  const body: Record<string, string> = {
    appId: options.appId ?? "capveri",
    userId: options.signedUserId ?? userId,
  };

  const payload = await buildHmacPayload({
    timestamp,
    nonce,
    method: "GET",
    path,
    body,
  });

  return {
    authorization: "Bearer valid-token",
    "X-Ventora-Timestamp": timestamp,
    "X-Ventora-Nonce": nonce,
    "X-Ventora-Signature": await signHmacPayload(payload, secret),
  };
}

describe("AI CS app context routes", () => {
  it("requires authentication", async () => {
    const { app } = createTestApp();
    const path = `/api/v1/ai-cs/app-context?appId=capveri&userId=${userId}`;
    const headers = await signedHeaders(path);
    delete headers.authorization;
    const response = await app.request(path, { headers }, env());

    expect(response.status).toBe(401);
  });

  it("returns signed authenticated app context for valid requests", async () => {
    const { app } = createTestApp();
    const path = `/api/v1/ai-cs/app-context?appId=capveri&userId=${userId}`;
    const response = await app.request(
      path,
      { headers: await signedHeaders(path) },
      env(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      assistantId: string;
      appId: string;
      appName: string;
      authenticatedOnly: boolean;
      currentPath: string;
      navigation: Array<{ label: string; path: string; description: string }>;
      workflow: Array<{
        id: string;
        label: string;
        status: string;
        path?: string;
      }>;
      meetingLinks: Array<{
        id: string;
        label: string;
        url: string;
        description: string;
      }>;
    };
    expect(body).toMatchObject({
      assistantId: "ai-cs",
      appId: "capveri",
      appName: "CapVeri",
      authenticatedOnly: true,
      currentPath: "/",
    });
    expect(body.navigation[0]?.path).toMatch(/^\/.+/u);
    expect(body.workflow[0]).toMatchObject({ status: "current" });
    expect(body.meetingLinks).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/cal\.com|calendly\.com/iu);
    expect(response.headers.get("cache-control")).toBe("private, max-age=300");

    await expectResponseSignature(response, path, body);
  });

  it("rejects mismatched user context", async () => {
    const { app } = createTestApp();
    const path =
      "/api/v1/ai-cs/app-context?appId=capveri&userId=33333333-3333-3333-3333-333333333333";
    const response = await app.request(
      path,
      {
        headers: await signedHeaders(path, {
          signedUserId: "33333333-3333-3333-3333-333333333333",
        }),
      },
      env(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: "User context mismatch",
    });
  });

  it("rejects unknown apps and invalid signatures", async () => {
    const { app } = createTestApp();
    const unknownPath = `/api/v1/ai-cs/app-context?appId=other&userId=${userId}`;
    const validPath = `/api/v1/ai-cs/app-context?appId=capveri&userId=${userId}`;
    const unknown = await app.request(
      unknownPath,
      { headers: await signedHeaders(unknownPath, { appId: "other" }) },
      env(),
    );
    const invalid = await app.request(
      validPath,
      {
        headers: {
          ...(await signedHeaders(validPath)),
          "X-Ventora-Signature": "0".repeat(64),
        },
      },
      env(),
    );

    expect(unknown.status).toBe(404);
    expect(invalid.status).toBe(401);
  });

  it("rejects a signature computed over a body that includes currentPath", async () => {
    // Regression lock: the ai-cs-worker signs the request body as {appId, userId}
    // ONLY (currentPath rides in the URL query). A caller that folds currentPath
    // into the signed body must fail verification, otherwise every real chat 401s.
    const { app } = createTestApp();
    const rawCurrentPath = "/reconciliation";
    const path = `/api/v1/ai-cs/app-context?appId=capveri&userId=${userId}&currentPath=${encodeURIComponent(rawCurrentPath)}`;
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID().replace(/-/gu, "");
    const buggyPayload = await buildHmacPayload({
      timestamp,
      nonce,
      method: "GET",
      path,
      body: { appId: "capveri", userId, currentPath: rawCurrentPath },
    });
    const response = await app.request(
      path,
      {
        headers: {
          authorization: "Bearer valid-token",
          "X-Ventora-Timestamp": timestamp,
          "X-Ventora-Nonce": nonce,
          "X-Ventora-Signature": await signHmacPayload(buggyPayload, secret),
        },
      },
      env(),
    );

    expect(response.status).toBe(401);
  });

  it("rejects stale signatures and nonce replays", async () => {
    const { app } = createTestApp();
    const path = `/api/v1/ai-cs/app-context?appId=capveri&userId=${userId}`;
    const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const stale = await app.request(
      path,
      { headers: await signedHeaders(path, { timestamp: staleTimestamp }) },
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
    const path = `/api/v1/ai-cs/app-context?appId=capveri&userId=${userId}`;
    const response = await app.request(
      path,
      { headers: await signedHeaders(path) },
      env({ AI_CS_CONTEXT_SECRET: "" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      detail: "App context unavailable",
    });
  });

  it("sanitizes currentPath and selects the route workflow", async () => {
    const { app } = createTestApp();
    const rawCurrentPath =
      "https://app.capveri.com/reconciliation?token=secret";
    const path = `/api/v1/ai-cs/app-context?appId=capveri&userId=${userId}&currentPath=${encodeURIComponent(rawCurrentPath)}`;
    const response = await app.request(
      path,
      {
        headers: await signedHeaders(path),
      },
      env(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      currentPath: string;
      workflow: Array<{ id: string; label: string; path?: string }>;
    };

    expect(body.currentPath).toBe("/reconciliation");
    expect(body.workflow.slice(0, 2).map((step) => step.id)).toEqual([
      "run-reconciliation",
      "map-expense-pools",
    ]);
    expect(body.workflow[0]).toMatchObject({
      label: "Review and calculate CAM billing",
      path: "/reconciliations",
    });
  });

  it("maps property reconciliation paths to the reconciliation workflow", async () => {
    const { app } = createTestApp();
    const rawCurrentPath =
      "https://app.capveri.com/properties/33333333-3333-3333-3333-333333333333/reconciliations?period=2024";
    const path = `/api/v1/ai-cs/app-context?appId=capveri&userId=${userId}&currentPath=${encodeURIComponent(rawCurrentPath)}`;
    const response = await app.request(
      path,
      {
        headers: await signedHeaders(path),
      },
      env(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      currentPath: string;
      workflow: Array<{ id: string }>;
    };
    expect(body.currentPath).toBe(
      "/properties/33333333-3333-3333-3333-333333333333/reconciliations",
    );
    expect(body.workflow[0]?.id).toBe("run-reconciliation");
  });
});

describe("AI CS teaching layer (concepts / howtos / faqs)", () => {
  function navPaths(): Set<string> {
    const context = buildAiCsAppContext({ currentPath: "/" });
    return new Set(context.navigation.map((target) => target.path));
  }

  it("teaches domain concepts in plain language with real paths", () => {
    const context = buildAiCsAppContext({ currentPath: "/" });
    const paths = navPaths();

    expect(context.concepts.length).toBeGreaterThanOrEqual(8);

    const terms = context.concepts.map((concept) => concept.term.toLowerCase());
    for (const expected of ["gross-up", "pro-rata", "base year", "cap"]) {
      expect(
        terms.some((term) => term.includes(expected)),
        `expected a concept covering "${expected}"`,
      ).toBe(true);
    }

    for (const concept of context.concepts) {
      expect(concept.plainDefinition.length).toBeGreaterThan(0);
      if (concept.path !== undefined) {
        expect(paths.has(concept.path)).toBe(true);
      }
    }

    const grossUp = context.concepts.find((concept) =>
      concept.term.toLowerCase().includes("gross-up"),
    );
    expect(grossUp?.whyItMatters).toBeTruthy();
  });

  it("provides numbered how-tos grounded in the real UI", () => {
    const context = buildAiCsAppContext({ currentPath: "/" });
    const paths = navPaths();

    expect(context.howtos.length).toBeGreaterThanOrEqual(5);

    const ids = context.howtos.map((howto) => howto.id);
    expect(ids).toContain("run-reconciliation");
    expect(ids).toContain("start-here");

    for (const howto of context.howtos) {
      expect(howto.goal.length).toBeGreaterThan(0);
      expect(howto.steps.length).toBeGreaterThan(0);
      howto.steps.forEach((step, index) => {
        expect(step.n).toBe(index + 1);
        expect(step.instruction.length).toBeGreaterThan(0);
        if (step.path !== undefined) {
          expect(paths.has(step.path)).toBe(true);
        }
      });
    }
  });

  it("returns a well-formed faqs array with real paths", () => {
    const context = buildAiCsAppContext({ currentPath: "/" });
    const paths = navPaths();

    expect(Array.isArray(context.faqs)).toBe(true);
    expect(context.faqs.length).toBeGreaterThanOrEqual(8);
    for (const faq of context.faqs) {
      expect(faq.question.length).toBeGreaterThan(0);
      expect(faq.answer.length).toBeGreaterThan(0);
      if (faq.path !== undefined) {
        expect(paths.has(faq.path)).toBe(true);
      }
    }

    // A beginner's first objection — "do I have to integrate?" — must be answered.
    const integrationFaq = context.faqs.find((faq) =>
      faq.question.toLowerCase().includes("accounting software"),
    );
    expect(integrationFaq).toBeDefined();
    expect(integrationFaq?.answer.toLowerCase()).toContain("no");
  });

  it("serves the teaching layer over the signed HTTP context", async () => {
    const { app } = createTestApp();
    const path = `/api/v1/ai-cs/app-context?appId=capveri&userId=${userId}`;
    const response = await app.request(
      path,
      { headers: await signedHeaders(path) },
      env(),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      concepts: Array<{ term: string; plainDefinition: string }>;
      howtos: Array<{ id: string; steps: Array<{ n: number }> }>;
      faqs: Array<{ question: string; answer: string }>;
    };

    expect(body.concepts.length).toBeGreaterThanOrEqual(8);
    expect(body.howtos.length).toBeGreaterThanOrEqual(5);
    expect(body.faqs.length).toBeGreaterThanOrEqual(8);
    expect(body.howtos[0]?.steps[0]?.n).toBe(1);
  });
});

describe("AI CS sign BFF (POST /ai-cs/sign)", () => {
  const signPath = "/api/v1/ai-cs/sign";

  function signRequest(
    payload: unknown,
    options: { authorization?: string | null } = {},
  ): Request {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    const authorization =
      options.authorization === undefined
        ? "Bearer valid-token"
        : options.authorization;
    if (authorization !== null) {
      headers.authorization = authorization;
    }
    return new Request(`https://example.com${signPath}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  }

  it("mints an assertion the ai-cs-worker would accept for /v1/sessions", async () => {
    const { app } = createTestApp();
    const body = { appId: "capveri", userId, currentPath: "/dashboard" };
    const response = await app.request(
      signRequest({ method: "POST", path: "/v1/sessions", body }),
      undefined,
      env(),
    );

    expect(response.status).toBe(200);
    const assertion = (await response.json()) as {
      timestamp: string;
      nonce: string;
      signature: string;
    };
    expect(assertion.timestamp).toBeTruthy();
    expect(assertion.nonce).toBeTruthy();
    expect(assertion.signature).toMatch(/^[a-f0-9]{64}$/u);

    // The worker rebuilds the payload from method/pathname/body and verifies it
    // against AI_CS_CLIENT_ASSERTION_SECRET. Mirror that here exactly.
    const expectedPayload = await buildHmacPayload({
      timestamp: assertion.timestamp,
      nonce: assertion.nonce,
      method: "POST",
      path: "/v1/sessions",
      body: body as unknown as StableJsonValue,
    });
    expect(assertion.signature).toBe(
      await signHmacPayload(expectedPayload, assertionSecret),
    );
  });

  it("mints for /v1/chat where the body carries only an opaque sessionId", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      signRequest({
        method: "POST",
        path: "/v1/chat",
        body: { sessionId: "abc", message: "hi" },
      }),
      undefined,
      env(),
    );

    expect(response.status).toBe(200);
  });

  it("requires authentication", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      signRequest(
        { method: "POST", path: "/v1/sessions", body: { appId: "capveri", userId } },
        { authorization: null },
      ),
      undefined,
      env(),
    );

    expect(response.status).toBe(401);
  });

  it("rejects paths outside the worker allow-list", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      signRequest({ method: "POST", path: "/v1/admin", body: {} }),
      undefined,
      env(),
    );

    expect(response.status).toBe(403);
  });

  it("rejects non-POST methods", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      signRequest({ method: "GET", path: "/v1/sessions", body: {} }),
      undefined,
      env(),
    );

    expect(response.status).toBe(400);
  });

  it("refuses to sign for another tenant's app or user", async () => {
    const { app } = createTestApp();
    const wrongApp = await app.request(
      signRequest({
        method: "POST",
        path: "/v1/sessions",
        body: { appId: "other", userId },
      }),
      undefined,
      env(),
    );
    const wrongUser = await app.request(
      signRequest({
        method: "POST",
        path: "/v1/sessions",
        body: { appId: "capveri", userId: "99999999-9999-9999-9999-999999999999" },
      }),
      undefined,
      env(),
    );

    expect(wrongApp.status).toBe(403);
    expect(wrongUser.status).toBe(403);
  });

  it("refuses to mint an unbound /v1/sessions assertion (presence-requiring)", async () => {
    const { app } = createTestApp();
    // An empty body would otherwise yield a validly-signed session-create
    // assertion with no actor binding. The BFF is the trust boundary, so it
    // must not depend on the client always sending appId/userId.
    const emptyBody = await app.request(
      signRequest({ method: "POST", path: "/v1/sessions", body: {} }),
      undefined,
      env(),
    );
    const missingUser = await app.request(
      signRequest({
        method: "POST",
        path: "/v1/sessions",
        body: { appId: "capveri" },
      }),
      undefined,
      env(),
    );
    const missingApp = await app.request(
      signRequest({ method: "POST", path: "/v1/sessions", body: { userId } }),
      undefined,
      env(),
    );

    expect(emptyBody.status).toBe(403);
    expect(missingUser.status).toBe(403);
    expect(missingApp.status).toBe(403);
  });

  it("rejects a non-object sign body", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      signRequest({ method: "POST", path: "/v1/chat", body: "not-an-object" }),
      undefined,
      env(),
    );

    expect(response.status).toBe(400);
  });

  it("rejects malformed sign requests", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      signRequest({ method: "POST", path: "/v1/sessions" }),
      undefined,
      env(),
    );

    expect(response.status).toBe(400);
  });

  it("returns unavailable when no client-assertion secret is configured", async () => {
    const { app } = createTestApp();
    const response = await app.request(
      signRequest({
        method: "POST",
        path: "/v1/sessions",
        body: { appId: "capveri", userId },
      }),
      undefined,
      env({ AI_CS_CLIENT_ASSERTION_SECRET: "" }),
    );

    expect(response.status).toBe(503);
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
  expect(stableJson(body)).toContain("ai-cs");
}
