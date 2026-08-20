/**
 * Audit-request route tests.
 *
 * Uses in-memory repository and fake Turnstile verifier to avoid real I/O.
 *
 * Coverage:
 *   POST /audit-requests
 *     - happy path → 201, inserts row
 *     - honeypot (company_website set) → 201, NO createAuditRequest call
 *     - turnstile fail → 403
 *     - rate limit (count >= 3) → 429
 *     - insert returns null → 500
 *     - invalid JSON body → 400
 *     - zod validation failure → 400
 *   GET /audit-requests
 *     - 200 returns bare array of rows
 *     - status filter forwarded to repository
 *     - pagination offset/limit calculated from page + per_page
 *     - 403 when not service admin
 *     - 401 when unauthenticated
 *   GET /audit-requests/:id
 *     - 200 with matching row
 *     - 404 when repository returns null
 *     - 400 for invalid uuid
 *     - 403 when not service admin
 *   PATCH /audit-requests/:id
 *     - status update sets correct timestamp field
 *     - notes-only update
 *     - empty body → 400 no_updates
 *     - 404 when repository returns null
 *     - 400 for invalid uuid
 *     - 403 when not service admin
 *     - invalid JSON body → 400
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  AuditRequestRow,
  AuditRequestsRepository,
  CreateAuditRequestInput,
  ListAuditRequestsInput,
  UpdateAuditRequestFields,
} from "../domain/audit-requests/repository";
import type { AppEnv } from "../env";
import {
  createAuditRequestRoutes,
  type TurnstileVerifier,
} from "../http/audit-request-routes";
import type { AuthVariables } from "../middleware/auth";

// ── Constants ─────────────────────────────────────────────────────────────────

const USER_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const REQ_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<AuditRequestRow> = {}): AuditRequestRow {
  return {
    id: REQ_ID,
    name: "Alice",
    email: "alice@example.com",
    company: "Acme",
    building_count: 5,
    phone: null,
    portfolio_sqft: null,
    current_system: null,
    message: null,
    source: null,
    status: "pending",
    notes: null,
    estimated_recovery: null,
    assigned_to: null,
    organization_id: null,
    contacted_at: null,
    scheduled_at: null,
    completed_at: null,
    converted_at: null,
    created_at: "2026-06-13T00:00:00.000Z",
    updated_at: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

// ── In-memory repository ──────────────────────────────────────────────────────

class MemoryAuditRequestsRepository implements AuditRequestsRepository {
  rows: AuditRequestRow[] = [makeRow()];
  recentCount = 0;
  createResult: AuditRequestRow | null = makeRow();
  updateResult: AuditRequestRow | null = makeRow();

  lastCreateInput: CreateAuditRequestInput | null = null;
  lastListInput: ListAuditRequestsInput | null = null;
  lastUpdateId: string | null = null;
  lastUpdateFields: UpdateAuditRequestFields | null = null;
  createCallCount = 0;

  async createAuditRequest(
    input: CreateAuditRequestInput,
  ): Promise<AuditRequestRow | null> {
    this.createCallCount++;
    this.lastCreateInput = input;
    return this.createResult;
  }

  async countRecentByEmail(
    email: string,
    windowStartIso: string,
  ): Promise<number> {
    void email;
    void windowStartIso;
    return this.recentCount;
  }

  async listAuditRequests(
    input: ListAuditRequestsInput,
  ): Promise<AuditRequestRow[]> {
    this.lastListInput = input;
    return this.rows;
  }

  async getAuditRequestById(id: string): Promise<AuditRequestRow | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async updateAuditRequest(
    id: string,
    fields: UpdateAuditRequestFields,
  ): Promise<AuditRequestRow | null> {
    this.lastUpdateId = id;
    this.lastUpdateFields = fields;
    return this.updateResult;
  }
}

// ── Fake Turnstile verifier ───────────────────────────────────────────────────

class FakeTurnstileVerifier implements TurnstileVerifier {
  constructor(private readonly result: boolean) {}
  async verify(input: {
    token: string | null;
    remoteIp: string | null;
  }): Promise<boolean> {
    void input;
    return this.result;
  }
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

function jwtVerifier(): JwtVerifier {
  return {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
}

function authRepository(
  isServiceAdmin: boolean,
): DbAdapter["auth"] & AuthRepository {
  return {
    async resolveUserContext(): Promise<AuthenticatedUserContext> {
      return {
        actor: {
          userId: USER_ID,
          organizationId: ORG_ID,
          role: "owner",
          isServiceAdmin,
          party: "landlord",
          bearerToken: "valid-token",
        },
        user: {
          id: USER_ID,
          organizationId: ORG_ID,
          email: "admin@example.com",
          fullName: "Admin User",
          role: "owner",
          isPlatformAdmin: isServiceAdmin,
          createdAt: "2026-06-13T00:00:00Z",
          updatedAt: "2026-06-13T00:00:00Z",
        },
      };
    },
  };
}

function testEnv(): AppEnv {
  return {
    ENVIRONMENT: "development",
    APP_VERSION: "0.1.0",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    SUPABASE_JWT_SECRET: "jwt-secret",
    DATABASE_URL: "postgres://example",
    PROTECTED_RECORDS: protectedRecords,
    OPENROUTER_API_KEY: "openrouter",
    RESEND_API_KEY: "resend",
    STRIPE_SECRET_KEY: "stripe",
    STRIPE_WEBHOOK_SECRET: "webhook",
    PUBLIC_APP_URL: "https://app.capveri.com",
    FEEDBACK_SCREENSHOTS_BUCKET: {} as R2Bucket,
    FEEDBACK_HMAC_SECRET: "feedback-secret",
  } as unknown as AppEnv;
}

function makeAuthOptions(
  isServiceAdmin: boolean,
): import("../middleware/auth").AuthMiddlewareOptions {
  return {
    verifier: jwtVerifier(),
    db: {
      mode: "postgrest-compat",
      auth: authRepository(isServiceAdmin),
      protectedRecords,
    },
  };
}

function createTestApp(
  repo: AuditRequestsRepository,
  turnstile: TurnstileVerifier = new FakeTurnstileVerifier(true),
  isServiceAdmin = true,
): Hono<{ Bindings: AppEnv; Variables: AuthVariables }> {
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createAuditRequestRoutes({
      repository: repo,
      turnstile,
      auth: makeAuthOptions(isServiceAdmin),
    }),
  );
  return app;
}

function authHeaders(): Record<string, string> {
  return { Authorization: "Bearer valid-token" };
}

function postBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: "Alice",
    email: "Alice@Example.com",
    company: "Acme",
    building_count: 5,
    turnstile_token: "token",
    ...overrides,
  });
}

const env = testEnv();

// ── POST /api/v1/audit-requests ───────────────────────────────────────────────

describe("POST /api/v1/audit-requests", () => {
  it("happy path → 201, calls createAuditRequest, email lowercased", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: postBody({ email: "Alice@Example.com" }),
      },
      env,
    );

    expect(res.status).toBe(201);
    expect(repo.createCallCount).toBe(1);
    expect(repo.lastCreateInput?.email).toBe("alice@example.com");
    expect(repo.lastCreateInput?.status).toBe("pending");
  });

  it("honeypot (company_website set) → 201, NO createAuditRequest call", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: postBody({ company_website: "https://spam.example.com" }),
      },
      env,
    );

    expect(res.status).toBe(201);
    expect(repo.createCallCount).toBe(0);
    const body = await res.json<{ status: string; email: string }>();
    expect(body.status).toBe("pending");
    expect(body.email).toBe("alice@example.com");
  });

  it("turnstile fail → 403 verification_failed", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo, new FakeTurnstileVerifier(false));

    const res = await app.request(
      "/api/v1/audit-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: postBody(),
      },
      env,
    );

    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("verification_failed");
  });

  it("rate limit (count >= 3) → 429 rate_limit_exceeded", async () => {
    const repo = new MemoryAuditRequestsRepository();
    repo.recentCount = 3;
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: postBody(),
      },
      env,
    );

    expect(res.status).toBe(429);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("rate_limit_exceeded");
  });

  it("insert returns null → 500 create_failed", async () => {
    const repo = new MemoryAuditRequestsRepository();
    repo.createResult = null;
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: postBody(),
      },
      env,
    );

    expect(res.status).toBe(500);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("create_failed");
  });

  it("invalid JSON → 400 invalid_json", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      },
      env,
    );

    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("invalid_json");
  });

  it("zod validation failure → 400 validation_error", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "",
          email: "not-an-email",
          company: "Acme",
          building_count: 1,
        }),
      },
      env,
    );

    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("validation_error");
  });
});

// ── GET /api/v1/audit-requests ────────────────────────────────────────────────

describe("GET /api/v1/audit-requests", () => {
  it("200 returns bare array of rows", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-requests",
      { headers: authHeaders() },
      env,
    );

    expect(res.status).toBe(200);
    const body = await res.json<AuditRequestRow[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0]?.id).toBe(REQ_ID);
  });

  it("status filter forwarded to repository", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    await app.request(
      "/api/v1/audit-requests?status=contacted",
      { headers: authHeaders() },
      env,
    );

    expect(repo.lastListInput?.statusFilter).toBe("contacted");
  });

  it("pagination: page=2 per_page=10 → offset=10, limit=10", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    await app.request(
      "/api/v1/audit-requests?page=2&per_page=10",
      { headers: authHeaders() },
      env,
    );

    expect(repo.lastListInput?.offset).toBe(10);
    expect(repo.lastListInput?.limit).toBe(10);
  });

  it("403 when not service admin", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo, new FakeTurnstileVerifier(true), false);

    const res = await app.request(
      "/api/v1/audit-requests",
      { headers: authHeaders() },
      env,
    );

    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("platform_admin_required");
  });

  it("401 when unauthenticated", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    const res = await app.request("/api/v1/audit-requests", {}, env);

    expect(res.status).toBe(401);
  });
});

// ── GET /api/v1/audit-requests/:id ───────────────────────────────────────────

describe("GET /api/v1/audit-requests/:id", () => {
  it("200 with matching row", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      `/api/v1/audit-requests/${REQ_ID}`,
      { headers: authHeaders() },
      env,
    );

    expect(res.status).toBe(200);
    const body = await res.json<AuditRequestRow>();
    expect(body.id).toBe(REQ_ID);
  });

  it("404 when row not found", async () => {
    const repo = new MemoryAuditRequestsRepository();
    repo.rows = [];
    const app = createTestApp(repo);

    const res = await app.request(
      `/api/v1/audit-requests/${REQ_ID}`,
      { headers: authHeaders() },
      env,
    );

    expect(res.status).toBe(404);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("not_found");
  });

  it("400 for invalid uuid", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-requests/not-a-uuid",
      { headers: authHeaders() },
      env,
    );

    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("validation_error");
  });

  it("403 when not service admin", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo, new FakeTurnstileVerifier(true), false);

    const res = await app.request(
      `/api/v1/audit-requests/${REQ_ID}`,
      { headers: authHeaders() },
      env,
    );

    expect(res.status).toBe(403);
  });
});

// ── PATCH /api/v1/audit-requests/:id ─────────────────────────────────────────

describe("PATCH /api/v1/audit-requests/:id", () => {
  it("status=contacted sets contacted_at timestamp", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      `/api/v1/audit-requests/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ status: "contacted" }),
      },
      env,
    );

    expect(res.status).toBe(200);
    expect(repo.lastUpdateFields?.status).toBe("contacted");
    expect(repo.lastUpdateFields?.contacted_at).toBeDefined();
    expect(typeof repo.lastUpdateFields?.contacted_at).toBe("string");
  });

  it("status=scheduled sets scheduled_at, not contacted_at", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    await app.request(
      `/api/v1/audit-requests/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ status: "scheduled" }),
      },
      env,
    );

    expect(repo.lastUpdateFields?.scheduled_at).toBeDefined();
    expect(repo.lastUpdateFields?.contacted_at).toBeUndefined();
  });

  it("status=completed sets completed_at", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    await app.request(
      `/api/v1/audit-requests/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      },
      env,
    );

    expect(repo.lastUpdateFields?.completed_at).toBeDefined();
  });

  it("status=converted sets converted_at", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    await app.request(
      `/api/v1/audit-requests/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ status: "converted" }),
      },
      env,
    );

    expect(repo.lastUpdateFields?.converted_at).toBeDefined();
  });

  it("status=pending sets no extra timestamp", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    await app.request(
      `/api/v1/audit-requests/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
      },
      env,
    );

    expect(repo.lastUpdateFields?.contacted_at).toBeUndefined();
    expect(repo.lastUpdateFields?.scheduled_at).toBeUndefined();
    expect(repo.lastUpdateFields?.completed_at).toBeUndefined();
    expect(repo.lastUpdateFields?.converted_at).toBeUndefined();
  });

  it("notes-only update", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    await app.request(
      `/api/v1/audit-requests/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ notes: "Important note" }),
      },
      env,
    );

    expect(repo.lastUpdateFields?.notes).toBe("Important note");
    expect(repo.lastUpdateFields?.status).toBeUndefined();
  });

  it("empty body → 400 no_updates", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      `/api/v1/audit-requests/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({}),
      },
      env,
    );

    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("no_updates");
  });

  it("repository returns null → 404 not_found", async () => {
    const repo = new MemoryAuditRequestsRepository();
    repo.updateResult = null;
    const app = createTestApp(repo);

    const res = await app.request(
      `/api/v1/audit-requests/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ notes: "x" }),
      },
      env,
    );

    expect(res.status).toBe(404);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("not_found");
  });

  it("400 for invalid uuid in path", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-requests/not-a-uuid",
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ notes: "x" }),
      },
      env,
    );

    expect(res.status).toBe(400);
  });

  it("403 when not service admin", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo, new FakeTurnstileVerifier(true), false);

    const res = await app.request(
      `/api/v1/audit-requests/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ notes: "x" }),
      },
      env,
    );

    expect(res.status).toBe(403);
  });

  it("invalid JSON body → 400 invalid_json", async () => {
    const repo = new MemoryAuditRequestsRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      `/api/v1/audit-requests/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: "not-json",
      },
      env,
    );

    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("invalid_json");
  });
});
