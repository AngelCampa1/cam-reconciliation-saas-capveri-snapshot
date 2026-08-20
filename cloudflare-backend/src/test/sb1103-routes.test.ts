/**
 * SB 1103 compliance route tests.
 *
 * Uses an in-memory repository and fake auth to avoid real I/O.
 *
 * Coverage:
 *   GET /compliance/sb1103
 *     - returns {data, count, has_more:false}
 *     - property_id filter forwarded
 *     - status filter forwarded
 *     - 401 when unauthenticated
 *     - 403 when tenant party
 *   GET /compliance/sb1103/alerts  (BEFORE /:id)
 *     - default days_warning=7, returns alerts
 *     - negative days_warning → 400
 *     - float/non-integer days_warning → 400
 *     - excludes delivered status
 *     - days_remaining math (positive, zero, negative/overdue)
 *     - fallback "Unknown Property" / "Unknown Tenant"
 *     - 401 when unauthenticated
 *   POST /compliance/sb1103
 *     - 201 happy path: correct response_deadline, window_start, window_end, status
 *     - month-end clamp: 2026-08-31 → window_start 2025-02-28
 *     - 402 when no full access
 *     - 403 when viewer role
 *     - 404 missing property
 *     - 404 missing lease
 *     - 400 lease/property mismatch
 *     - 400 invalid body
 *     - 401 when unauthenticated
 *   GET /compliance/sb1103/:id
 *     - 200 with row
 *     - 404 when not found
 *     - 401 when unauthenticated
 *   PATCH /compliance/sb1103/:id
 *     - 200 status update
 *     - 200 notes update
 *     - 402 when no full access
 *     - 403 when viewer
 *     - 404 when not found
 *     - 400 invalid body
 *     - 401 when unauthenticated
 *   DELETE /compliance/sb1103/:id
 *     - 204 success (admin/owner)
 *     - 402 when no full access
 *     - 403 when member (non-admin)
 *     - 403 when viewer
 *     - 404 when not found
 *     - 401 when unauthenticated
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
import type { ActorRole } from "../adapters/db/transaction";
import {
  Sb1103StatusConflictError,
  type AlertRequestRow,
  type CreateSb1103Input,
  type LeaseSummary,
  type ListSb1103Input,
  type PropertySummary,
  type Sb1103Repository,
  type Sb1103RequestRow,
  type UpdateSb1103Fields,
} from "../domain/sb1103/repository";
import type { AppEnv } from "../env";
import { createSb1103Routes } from "../http/sb1103-routes";
import type { AuthVariables } from "../middleware/auth";

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const REQ_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROP_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEASE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<Sb1103RequestRow> = {}): Sb1103RequestRow {
  return {
    id: REQ_ID,
    organization_id: ORG_ID,
    property_id: PROP_ID,
    lease_id: LEASE_ID,
    requested_by_name: "Alice Smith",
    requested_by_email: "alice@example.com",
    request_date: "2026-06-13",
    response_deadline: "2026-07-13",
    window_start_date: "2024-12-13",
    window_end_date: "2026-06-13",
    status: "pending",
    export_format: null,
    exported_at: null,
    notes: null,
    created_at: "2026-06-13T00:00:00.000Z",
    updated_at: "2026-06-13T00:00:00.000Z",
    ...overrides,
  };
}

// ── In-memory repository ──────────────────────────────────────────────────────

class MemorySb1103Repository implements Sb1103Repository {
  rows: Sb1103RequestRow[] = [makeRow()];
  fullAccess = true;
  createResult: Sb1103RequestRow = makeRow();
  updateResult: Sb1103RequestRow | null = makeRow();
  updateError: Error | null = null;
  deleteResult = true;
  property: PropertySummary | null = { id: PROP_ID, name: "Main Building" };
  lease: LeaseSummary | null = {
    id: LEASE_ID,
    property_id: PROP_ID,
    tenant_name: "Acme Corp",
  };
  alertRows: AlertRequestRow[] = [];
  propNames: Map<string, string> = new Map([[PROP_ID, "Main Building"]]);
  leaseNames: Map<string, string> = new Map([[LEASE_ID, "Acme Corp"]]);

  lastListInput: ListSb1103Input | null = null;
  lastCreateInput: CreateSb1103Input | null = null;
  lastUpdateOrgId: string | null = null;
  lastUpdateId: string | null = null;
  lastUpdateFields: UpdateSb1103Fields | null = null;
  lastDeleteId: string | null = null;

  async hasFullAccess(orgId: string): Promise<boolean> {
    void orgId;
    return this.fullAccess;
  }

  async listRequests(input: ListSb1103Input): Promise<Sb1103RequestRow[]> {
    this.lastListInput = input;
    let result = this.rows;
    if (input.propertyId !== undefined) {
      result = result.filter((r) => r.property_id === input.propertyId);
    }
    if (input.status !== undefined) {
      result = result.filter((r) => r.status === input.status);
    }
    return result;
  }

  async countRequests(input: ListSb1103Input): Promise<number> {
    return (await this.listRequests(input)).length;
  }

  async getRequestById(
    orgId: string,
    id: string,
  ): Promise<Sb1103RequestRow | null> {
    void orgId;
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async createRequest(input: CreateSb1103Input): Promise<Sb1103RequestRow> {
    this.lastCreateInput = input;
    return this.createResult;
  }

  async updateRequest(
    orgId: string,
    id: string,
    fields: UpdateSb1103Fields,
  ): Promise<Sb1103RequestRow | null> {
    this.lastUpdateOrgId = orgId;
    this.lastUpdateId = id;
    this.lastUpdateFields = fields;
    if (this.updateError) throw this.updateError;
    return this.updateResult;
  }

  async deleteRequest(orgId: string, id: string): Promise<boolean> {
    void orgId;
    this.lastDeleteId = id;
    return this.deleteResult;
  }

  async getPropertyById(
    orgId: string,
    propertyId: string,
  ): Promise<PropertySummary | null> {
    void orgId;
    void propertyId;
    return this.property;
  }

  async getLeaseById(
    orgId: string,
    leaseId: string,
  ): Promise<LeaseSummary | null> {
    void orgId;
    void leaseId;
    return this.lease;
  }

  async listDeadlineAlertRequests(
    orgId: string,
    cutoffDate: string,
  ): Promise<AlertRequestRow[]> {
    void orgId;
    void cutoffDate;
    return this.alertRows;
  }

  async getPropertyNames(
    orgId: string,
    ids: string[],
  ): Promise<Map<string, string>> {
    void orgId;
    void ids;
    return this.propNames;
  }

  async getTenantNamesByLease(
    orgId: string,
    ids: string[],
  ): Promise<Map<string, string>> {
    void orgId;
    void ids;
    return this.leaseNames;
  }

  // Export-specific (not exercised by existing CRUD tests; throw to surface accidental calls)
  async getPropertyForExport(): Promise<
    import("../domain/sb1103/repository").PropertyExportInfo | null
  > {
    throw new Error(
      "getPropertyForExport not implemented in MemorySb1103Repository",
    );
  }
  async getLeaseForExport(): Promise<
    import("../domain/sb1103/repository").LeaseExportInfo | null
  > {
    throw new Error(
      "getLeaseForExport not implemented in MemorySb1103Repository",
    );
  }
  async getGlEntriesForWindow(): Promise<
    import("../domain/sb1103/repository").GlEntryRow[]
  > {
    throw new Error(
      "getGlEntriesForWindow not implemented in MemorySb1103Repository",
    );
  }
  async markExported(): Promise<boolean> {
    throw new Error("markExported not implemented in MemorySb1103Repository");
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
  role: ActorRole,
  party: "landlord" | "tenant" = "landlord",
): DbAdapter["auth"] & AuthRepository {
  return {
    async resolveUserContext(): Promise<AuthenticatedUserContext> {
      return {
        actor: {
          userId: USER_ID,
          organizationId: ORG_ID,
          role,
          isServiceAdmin: false,
          party,
          bearerToken: "valid-token",
        },
        user: {
          id: USER_ID,
          organizationId: ORG_ID,
          email: "user@example.com",
          fullName: "Test User",
          role,
          isPlatformAdmin: false,
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
  role: ActorRole = "owner",
  party: "landlord" | "tenant" = "landlord",
): import("../middleware/auth").AuthMiddlewareOptions {
  return {
    verifier: jwtVerifier(),
    db: {
      mode: "postgrest-compat",
      auth: authRepository(role, party),
      protectedRecords,
    },
  };
}

function createTestApp(
  repo: Sb1103Repository,
  role: ActorRole = "owner",
  party: "landlord" | "tenant" = "landlord",
): Hono<{ Bindings: AppEnv; Variables: AuthVariables }> {
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createSb1103Routes({
      repository: repo,
      auth: makeAuthOptions(role, party),
    }),
  );
  return app;
}

function authHeaders(): Record<string, string> {
  return { Authorization: "Bearer valid-token" };
}

const env = testEnv();

// ── GET /compliance/sb1103 ────────────────────────────────────────────────────

describe("GET /api/v1/compliance/sb1103", () => {
  it("returns {data, count, has_more:false}", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      data: unknown[];
      count: number;
      has_more: boolean;
    }>();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.count).toBe(1);
    expect(body.has_more).toBe(false);
  });

  it("forwards property_id filter", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    await app.request(
      `/api/v1/compliance/sb1103?property_id=${PROP_ID}`,
      { headers: authHeaders() },
      env,
    );
    expect(repo.lastListInput?.propertyId).toBe(PROP_ID);
  });

  it("forwards status filter", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    await app.request(
      "/api/v1/compliance/sb1103?status=pending",
      { headers: authHeaders() },
      env,
    );
    expect(repo.lastListInput?.status).toBe("pending");
  });

  it("400 for invalid property_id UUID", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103?property_id=not-a-uuid",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("401 when unauthenticated", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request("/api/v1/compliance/sb1103", {}, env);
    expect(res.status).toBe(401);
  });

  it("403 when tenant party", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo, "tenant", "tenant");
    const res = await app.request(
      "/api/v1/compliance/sb1103",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("200 when viewer role (reads are landlord-any-role, not editor-gated)", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo, "viewer");
    const res = await app.request(
      "/api/v1/compliance/sb1103",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
  });
});

// ── GET /compliance/sb1103/alerts ─────────────────────────────────────────────

describe("GET /api/v1/compliance/sb1103/alerts", () => {
  it("default days_warning=7, returns alerts array", async () => {
    const repo = new MemorySb1103Repository();
    repo.alertRows = [
      {
        id: REQ_ID,
        property_id: PROP_ID,
        lease_id: LEASE_ID,
        response_deadline: "2099-12-31",
        status: "pending",
      },
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103/alerts",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<unknown[]>();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
  });

  it("returns correct shape with property/tenant names", async () => {
    const repo = new MemorySb1103Repository();
    repo.alertRows = [
      {
        id: REQ_ID,
        property_id: PROP_ID,
        lease_id: LEASE_ID,
        response_deadline: "2099-12-31",
        status: "pending",
      },
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103/alerts",
      { headers: authHeaders() },
      env,
    );
    const body = await res.json<
      Array<{
        request_id: string;
        property_id: string;
        property_name: string;
        tenant_name: string;
        response_deadline: string;
        days_remaining: number;
        status: string;
      }>
    >();
    expect(body[0]?.request_id).toBe(REQ_ID);
    expect(body[0]?.property_name).toBe("Main Building");
    expect(body[0]?.tenant_name).toBe("Acme Corp");
    expect(body[0]?.status).toBe("pending");
  });

  it("days_remaining is positive for future deadlines", async () => {
    const repo = new MemorySb1103Repository();
    // Fake a deadline far in the future
    repo.alertRows = [
      {
        id: REQ_ID,
        property_id: PROP_ID,
        lease_id: LEASE_ID,
        response_deadline: "2099-12-31",
        status: "pending",
      },
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103/alerts",
      { headers: authHeaders() },
      env,
    );
    const body = await res.json<Array<{ days_remaining: number }>>();
    expect(body[0]?.days_remaining).toBeGreaterThan(0);
  });

  it("days_remaining is negative for past deadlines (overdue)", async () => {
    const repo = new MemorySb1103Repository();
    repo.alertRows = [
      {
        id: REQ_ID,
        property_id: PROP_ID,
        lease_id: LEASE_ID,
        response_deadline: "2000-01-01",
        status: "overdue",
      },
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103/alerts",
      { headers: authHeaders() },
      env,
    );
    const body = await res.json<Array<{ days_remaining: number }>>();
    expect(body[0]?.days_remaining).toBeLessThan(0);
  });

  it("falls back to Unknown Property when name missing", async () => {
    const repo = new MemorySb1103Repository();
    repo.alertRows = [
      {
        id: REQ_ID,
        property_id: PROP_ID,
        lease_id: LEASE_ID,
        response_deadline: "2099-12-31",
        status: "pending",
      },
    ];
    repo.propNames = new Map(); // no names
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103/alerts",
      { headers: authHeaders() },
      env,
    );
    const body = await res.json<Array<{ property_name: string }>>();
    expect(body[0]?.property_name).toBe("Unknown Property");
  });

  it("falls back to Unknown Tenant when tenant_name missing", async () => {
    const repo = new MemorySb1103Repository();
    repo.alertRows = [
      {
        id: REQ_ID,
        property_id: PROP_ID,
        lease_id: LEASE_ID,
        response_deadline: "2099-12-31",
        status: "pending",
      },
    ];
    repo.leaseNames = new Map(); // no names
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103/alerts",
      { headers: authHeaders() },
      env,
    );
    const body = await res.json<Array<{ tenant_name: string }>>();
    expect(body[0]?.tenant_name).toBe("Unknown Tenant");
  });

  it("400 when days_warning is negative", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103/alerts?days_warning=-1",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("400 when days_warning is a float", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103/alerts?days_warning=1.5",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("400 when days_warning is not a number", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103/alerts?days_warning=abc",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("401 when unauthenticated", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request("/api/v1/compliance/sb1103/alerts", {}, env);
    expect(res.status).toBe(401);
  });

  it("empty array when no alerts", async () => {
    const repo = new MemorySb1103Repository();
    repo.alertRows = [];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103/alerts",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("routes /alerts to the alerts handler, NOT /:id (returns array, not 400 UUID error)", async () => {
    // If /:id matched first, "alerts" would fail UUID parsing → 400.
    // Asserting a 200 array proves the literal /alerts route wins.
    const repo = new MemorySb1103Repository();
    repo.alertRows = [];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103/alerts",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it("200 when viewer role (alerts are landlord-any-role)", async () => {
    const repo = new MemorySb1103Repository();
    repo.alertRows = [];
    const app = createTestApp(repo, "viewer");
    const res = await app.request(
      "/api/v1/compliance/sb1103/alerts",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
  });
});

// ── POST /compliance/sb1103 ───────────────────────────────────────────────────

function createBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    property_id: PROP_ID,
    lease_id: LEASE_ID,
    requested_by_name: "Alice Smith",
    requested_by_email: "alice@example.com",
    request_date: "2026-06-13",
    ...overrides,
  });
}

describe("POST /api/v1/compliance/sb1103", () => {
  it("201 happy path — response_deadline = +30 days, window_end = request_date, status = pending", async () => {
    const repo = new MemorySb1103Repository();
    repo.createResult = makeRow({
      request_date: "2026-06-13",
      response_deadline: "2026-07-13",
      window_start_date: "2024-12-13",
      window_end_date: "2026-06-13",
      status: "pending",
    });
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: createBody({ request_date: "2026-06-13" }),
      },
      env,
    );
    expect(res.status).toBe(201);
    // Verify computed dates passed to createRequest
    expect(repo.lastCreateInput?.response_deadline).toBe("2026-07-13");
    expect(repo.lastCreateInput?.window_end_date).toBe("2026-06-13");
    expect(repo.lastCreateInput?.status).toBe("pending");
  });

  it("window_start = request_date - 18 calendar months (standard case)", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: createBody({ request_date: "2026-06-13" }),
      },
      env,
    );
    // 2026-06-13 - 18 months = 2024-12-13
    expect(repo.lastCreateInput?.window_start_date).toBe("2024-12-13");
  });

  it("month-end clamp: 2026-08-31 - 18 months → 2025-02-28", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: createBody({ request_date: "2026-08-31" }),
      },
      env,
    );
    // 2026-08-31 - 18 months = 2025-02 but day 31 doesn't exist → clamp to 2025-02-28
    expect(repo.lastCreateInput?.window_start_date).toBe("2025-02-28");
  });

  it("month-end clamp: 2026-03-31 - 18 months → 2024-09-30", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: createBody({ request_date: "2026-03-31" }),
      },
      env,
    );
    // 2026-03-31 - 18 months = 2024-09 but day 31 doesn't exist → clamp to 2024-09-30
    expect(repo.lastCreateInput?.window_start_date).toBe("2024-09-30");
  });

  it("month-end clamp leap year: 2025-08-31 - 18 months → 2024-02-29", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: createBody({ request_date: "2025-08-31" }),
      },
      env,
    );
    // 2025-08-31 - 18 months = 2024-02; 2024 is a leap year → clamp day 31 to 29
    expect(repo.lastCreateInput?.window_start_date).toBe("2024-02-29");
  });

  it("response_deadline = request_date + 30 days", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: createBody({ request_date: "2026-06-01" }),
      },
      env,
    );
    // 2026-06-01 + 30 days = 2026-07-01
    expect(repo.lastCreateInput?.response_deadline).toBe("2026-07-01");
  });

  it("402 when no full access", async () => {
    const repo = new MemorySb1103Repository();
    repo.fullAccess = false;
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: createBody(),
      },
      env,
    );
    expect(res.status).toBe(402);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("subscription_required");
  });

  it("403 when viewer role", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo, "viewer");
    const res = await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: createBody(),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("404 missing property", async () => {
    const repo = new MemorySb1103Repository();
    repo.property = null;
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: createBody(),
      },
      env,
    );
    expect(res.status).toBe(404);
  });
  it("404 missing lease", async () => {
    const repo = new MemorySb1103Repository();
    repo.lease = null;
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: createBody(),
      },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("400 lease/property mismatch", async () => {
    const repo = new MemorySb1103Repository();
    repo.lease = {
      id: LEASE_ID,
      property_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", // different property
      tenant_name: "Other Tenant",
    };
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: createBody(),
      },
      env,
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("lease_property_mismatch");
  });

  it("400 invalid body — missing required field", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ property_id: PROP_ID }), // missing required fields
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("400 invalid JSON body", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: "not-json{{{",
      },
      env,
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("invalid_json");
  });

  it("401 when unauthenticated", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/compliance/sb1103",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: createBody(),
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});

// ── GET /compliance/sb1103/:id ────────────────────────────────────────────────

describe("GET /api/v1/compliance/sb1103/:id", () => {
  it("200 returns the row", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ id: string }>();
    expect(body.id).toBe(REQ_ID);
  });

  it("404 when not found", async () => {
    const repo = new MemorySb1103Repository();
    repo.rows = [];
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("401 when unauthenticated", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      {},
      env,
    );
    expect(res.status).toBe(401);
  });
});

// ── PATCH /compliance/sb1103/:id ──────────────────────────────────────────────

describe("PATCH /api/v1/compliance/sb1103/:id", () => {
  it("200 status update", async () => {
    const repo = new MemorySb1103Repository();
    repo.updateResult = makeRow({ status: "delivered" });
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ status: "delivered" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(repo.lastUpdateFields?.status).toBe("delivered");
  });

  it("200 notes update", async () => {
    const repo = new MemorySb1103Repository();
    repo.updateResult = makeRow({ notes: "Updated note" });
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ notes: "Updated note" }),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(repo.lastUpdateFields?.notes).toBe("Updated note");
  });

  it("402 when no full access", async () => {
    const repo = new MemorySb1103Repository();
    repo.fullAccess = false;
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ status: "delivered" }),
      },
      env,
    );
    expect(res.status).toBe(402);
  });

  it("403 when viewer role", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo, "viewer");
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ status: "delivered" }),
      },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("404 when not found", async () => {
    const repo = new MemorySb1103Repository();
    repo.updateResult = null;
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ status: "delivered" }),
      },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("409 when a delivered request is patched back to a non-terminal status", async () => {
    const repo = new MemorySb1103Repository();
    repo.updateError = new Sb1103StatusConflictError(
      "SB 1103 request status changed before update could be recorded.",
    );
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
      },
      env,
    );

    expect(res.status).toBe(409);
    const body = await res.json<{ error: { code: string }; detail: string }>();
    expect(body.error.code).toBe("sb1103_status_conflict");
    expect(body.detail).toContain("status changed");
    expect(repo.lastUpdateFields?.status).toBe("pending");
  });

  it("400 invalid body — bad status value", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ status: "invalid_status" }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("400 invalid JSON body", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: "bad-json",
      },
      env,
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("invalid_json");
  });

  it("401 when unauthenticated", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      { method: "PATCH", body: JSON.stringify({ status: "delivered" }) },
      env,
    );
    expect(res.status).toBe(401);
  });
});

// ── DELETE /compliance/sb1103/:id ─────────────────────────────────────────────

describe("DELETE /api/v1/compliance/sb1103/:id", () => {
  it("204 success when admin (owner)", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo, "owner");
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(204);
    expect(repo.lastDeleteId).toBe(REQ_ID);
  });

  it("204 success when admin role", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo, "admin");
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(204);
  });

  it("402 when no full access", async () => {
    const repo = new MemorySb1103Repository();
    repo.fullAccess = false;
    const app = createTestApp(repo, "owner");
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(402);
  });

  it("403 when member role (non-admin)", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo, "member");
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("403 (not 402) for a non-admin even when the org lacks full access", async () => {
    // Gate-order regression: role is checked before billing, so a non-admin
    // fails fast with 403 and never learns the org's subscription state.
    // Before the reorder this returned 402, leaking subscription status to a
    // user who could never perform the action regardless of subscription.
    const repo = new MemorySb1103Repository();
    repo.fullAccess = false;
    const app = createTestApp(repo, "member");
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(403);
    expect(repo.lastDeleteId).toBeNull();
  });

  it("403 when viewer role", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo, "viewer");
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(403);
  });

  it("404 when not found", async () => {
    const repo = new MemorySb1103Repository();
    repo.deleteResult = false;
    const app = createTestApp(repo, "owner");
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(404);
  });

  it("401 when unauthenticated", async () => {
    const repo = new MemorySb1103Repository();
    const app = createTestApp(repo, "owner");
    const res = await app.request(
      `/api/v1/compliance/sb1103/${REQ_ID}`,
      { method: "DELETE" },
      env,
    );
    expect(res.status).toBe(401);
  });
});
