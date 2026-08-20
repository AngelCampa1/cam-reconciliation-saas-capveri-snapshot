/**
 * Audit-trail route tests.
 *
 * Uses in-memory repository to avoid real DB calls.
 *
 * Coverage:
 *   - Happy path: returns mapped entries + correct 7-field envelope
 *   - Admin gate: 403 for tenant party, 403 for landlord member role
 *   - Filters: each filter argument reaches the repository correctly
 *     (incl. operation uppercased, end_date end-of-day)
 *   - Pagination math: empty → total_pages 0 / has_next false / has_previous false
 *                      middle page → has_next true & has_previous true
 *                      last page  → has_next false
 *   - Invalid uuid for row_id / changed_by → 400
 *   - page_size > 100 → 400
 *   - JSONB old_data / new_data returned as objects, not strings
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
  AuditLogEntry,
  AuditTrailRepository,
  ListAuditLogInput,
  ListAuditLogResult,
} from "../domain/audit-trail/repository";
import type { AppEnv } from "../env";
import { createAuditTrailRoutes } from "../http/audit-trail-routes";
import type { AuthVariables } from "../middleware/auth";

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const ROW_UUID = "33333333-3333-4333-8333-333333333333";
const USER_UUID = "44444444-4444-4444-8444-444444444444";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<AuditLogEntry> = {}): AuditLogEntry {
  return {
    id: 1,
    table_name: "leases",
    operation: "UPDATE",
    row_id: ROW_UUID,
    old_data: { foo: "bar" },
    new_data: { foo: "baz" },
    changed_by: USER_UUID,
    changed_at: "2026-06-13T12:00:00",
    organization_id: ORG_ID,
    session_info: null,
    ...overrides,
  };
}

// ── In-memory repository ──────────────────────────────────────────────────────

class MemoryAuditTrailRepository implements AuditTrailRepository {
  rows: AuditLogEntry[] = [makeEntry()];
  total = 1;
  lastInput: ListAuditLogInput | null = null;

  async listAuditLog(input: ListAuditLogInput): Promise<ListAuditLogResult> {
    this.lastInput = input;
    return { rows: this.rows, total: this.total };
  }
}

// ── Auth / test-app helpers ───────────────────────────────────────────────────

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
  party: "landlord" | "tenant" = "landlord",
  role: "owner" | "admin" | "member" | "viewer" | "tenant" = "owner",
): DbAdapter["auth"] & AuthRepository {
  return {
    async resolveUserContext(): Promise<AuthenticatedUserContext> {
      const ctx: AuthenticatedUserContext = {
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
      if (party === "tenant") {
        ctx.tenantUser = {
          id: "tenant-profile-id",
          userId: USER_ID,
          organizationId: ORG_ID,
          contactName: "Tenant User",
          contactEmail: "tenant@example.com",
          createdAt: "2026-06-13T00:00:00Z",
        };
      }
      return ctx;
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

function createTestApp(
  repo: AuditTrailRepository,
  party: "landlord" | "tenant" = "landlord",
  role: "owner" | "admin" | "member" | "viewer" | "tenant" = "owner",
): Hono<{ Bindings: AppEnv; Variables: AuthVariables }> {
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createAuditTrailRoutes({
      repository: repo,
      auth: {
        verifier: jwtVerifier(),
        db: {
          mode: "postgrest-compat",
          auth: authRepository(party, role),
          protectedRecords,
        },
      },
    }),
  );
  return app;
}

function authHeaders(): Record<string, string> {
  return { Authorization: "Bearer valid-token" };
}

type AuditEnvelope = {
  items: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
};

// ── Happy path ────────────────────────────────────────────────────────────────

describe("GET /api/v1/audit-trail", () => {
  it("returns mapped entries with correct 7-field envelope", async () => {
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-trail",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = await res.json<AuditEnvelope>();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.id).toBe(1);
    expect(body.items[0]?.table_name).toBe("leases");
    expect(body.items[0]?.operation).toBe("UPDATE");
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.page_size).toBe(50);
    expect(body.total_pages).toBe(1);
    expect(body.has_next).toBe(false);
    expect(body.has_previous).toBe(false);
  });

  it("rejects a page beyond MAX_SAFE_INTEGER with 400 (no opaque OFFSET 500)", async () => {
    // A page >= 1e21 stringifies as exponent notation ("1e+21") that Postgres
    // cannot parse into OFFSET (22P02). The Zod ceiling fails it closed — this
    // route maps every query validation error to 400 (not an opaque 500).
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-trail?page=999999999999999999999",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(res.status).toBe(400);
  });

  // ── Admin gate ──────────────────────────────────────────────────────────────

  it("returns 403 for tenant party (denied at the auth party guard)", async () => {
    // Audit trail is a landlord-only namespace. A tenant JWT carries the
    // landlord org id, so it must be rejected by the auth party guard before
    // the handler — never reaching the admin role gate.
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo, "tenant", "tenant");

    const res = await app.request(
      "/api/v1/audit-trail",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("forbidden");
  });

  it("returns 403 for landlord member role", async () => {
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo, "landlord", "member");

    const res = await app.request(
      "/api/v1/audit-trail",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(res.status).toBe(403);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("insufficient_permissions");
  });

  it("allows landlord admin role", async () => {
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo, "landlord", "admin");

    const res = await app.request(
      "/api/v1/audit-trail",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(res.status).toBe(200);
  });

  // ── Filters ─────────────────────────────────────────────────────────────────

  it("passes start_date and end_date to repository", async () => {
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo);

    await app.request(
      "/api/v1/audit-trail?start_date=2026-01-01&end_date=2026-01-31",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(repo.lastInput?.startDate).toBe("2026-01-01");
    expect(repo.lastInput?.endDate).toBe("2026-01-31");
  });

  it("uppercases the operation filter before passing to repository", async () => {
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo);

    await app.request(
      "/api/v1/audit-trail?operation=insert",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(repo.lastInput?.operation).toBe("INSERT");
  });

  it("passes table_name filter", async () => {
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo);

    await app.request(
      "/api/v1/audit-trail?table_name=gl_entries",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(repo.lastInput?.tableName).toBe("gl_entries");
  });

  it("passes row_id filter", async () => {
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo);

    await app.request(
      `/api/v1/audit-trail?row_id=${ROW_UUID}`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(repo.lastInput?.rowId).toBe(ROW_UUID);
  });

  it("passes changed_by filter", async () => {
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo);

    await app.request(
      `/api/v1/audit-trail?changed_by=${USER_UUID}`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(repo.lastInput?.changedBy).toBe(USER_UUID);
  });

  // ── Pagination math ──────────────────────────────────────────────────────────

  it("total=0 → total_pages 0, has_next false, has_previous false", async () => {
    const repo = new MemoryAuditTrailRepository();
    repo.rows = [];
    repo.total = 0;
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-trail",
      { headers: authHeaders() },
      testEnv(),
    );

    const body = await res.json<AuditEnvelope>();
    expect(body.total_pages).toBe(0);
    expect(body.has_next).toBe(false);
    expect(body.has_previous).toBe(false);
  });

  it("middle page → has_next true & has_previous true", async () => {
    const repo = new MemoryAuditTrailRepository();
    repo.total = 300; // 300 items, page_size=100 → 3 pages
    repo.rows = [makeEntry()];
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-trail?page=2&page_size=100",
      { headers: authHeaders() },
      testEnv(),
    );

    const body = await res.json<AuditEnvelope>();
    expect(body.total_pages).toBe(3);
    expect(body.has_next).toBe(true);
    expect(body.has_previous).toBe(true);
  });

  it("last page → has_next false, has_previous true", async () => {
    const repo = new MemoryAuditTrailRepository();
    repo.total = 200;
    repo.rows = [makeEntry()];
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-trail?page=2&page_size=100",
      { headers: authHeaders() },
      testEnv(),
    );

    const body = await res.json<AuditEnvelope>();
    expect(body.total_pages).toBe(2);
    expect(body.has_next).toBe(false);
    expect(body.has_previous).toBe(true);
  });

  // ── Validation errors ────────────────────────────────────────────────────────

  it("returns 400 for invalid row_id uuid", async () => {
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-trail?row_id=not-a-uuid",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid changed_by uuid", async () => {
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-trail?changed_by=not-a-uuid",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for page_size > 100", async () => {
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-trail?page_size=101",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid start_date format", async () => {
    const repo = new MemoryAuditTrailRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-trail?start_date=01-01-2026",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(res.status).toBe(400);
  });

  // ── JSONB columns returned as objects ───────────────────────────────────────

  it("returns old_data and new_data as parsed objects, not strings", async () => {
    const repo = new MemoryAuditTrailRepository();
    repo.rows = [
      makeEntry({
        old_data: { amount: 100 },
        new_data: { amount: 200 },
      }),
    ];
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-trail",
      { headers: authHeaders() },
      testEnv(),
    );

    const body = await res.json<AuditEnvelope>();
    const entry = body.items[0];
    expect(typeof entry?.old_data).toBe("object");
    expect(typeof entry?.new_data).toBe("object");
    expect(entry?.old_data).toEqual({ amount: 100 });
    expect(entry?.new_data).toEqual({ amount: 200 });
  });

  it("returns null old_data / new_data as null", async () => {
    const repo = new MemoryAuditTrailRepository();
    repo.rows = [makeEntry({ old_data: null, new_data: null })];
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/audit-trail",
      { headers: authHeaders() },
      testEnv(),
    );

    const body = await res.json<AuditEnvelope>();
    expect(body.items[0]?.old_data).toBeNull();
    expect(body.items[0]?.new_data).toBeNull();
  });
});
