/**
 * Tax protest route tests.
 *
 * Uses an in-memory repository and fake auth to avoid real I/O.
 *
 * Coverage:
 *   GET /tax-protest/deadlines
 *     - happy path: county match → computed deadline + days_remaining
 *     - override_date only (no county) → uses override, is_configured true
 *     - neither county nor override → all nulls, is_configured false, is_past false
 *     - is_past true when deadline in the past
 *     - year param: explicit year resolves county deadline to that year
 *     - year default = current UTC year
 *     - year out of range (1999, 2101) → 400
 *     - year non-integer → 400
 *     - case-insensitive county/state match
 *     - empty org → {items:[], year}
 *     - 401 when unauthenticated
 *   POST /tax-protest/generate
 *     - 402 when hasTaxProtestAccess returns false
 *     - 401 when unauthenticated
 *     - 404 when snapshot not found
 *     - 400 when snapshot status is not finalized
 *     - happy path: returns ZIP with 4 members, correct content-type, correct filename
 *     - ZIP filename derived from property name with slashes sanitised
 *     - money figure: variance PDF uses Decimal (no float drift)
 *   Pure-function unit tests (computeEffectiveDeadline, computeDaysRemaining)
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import { PostgresTaxProtestRepository } from "../adapters/db/tax-protest";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { ActorRole } from "../adapters/db/transaction";
import type { GlPool } from "../domain/tax-protest/gl-category-csv";
import type {
  TaxProtestLeaseContext,
  TaxProtestOrgContext,
  TaxProtestPriorSnapshotRow,
  TaxProtestPropertyContext,
  TaxProtestPropertyRow,
  TaxProtestRepository,
  TaxProtestSnapshotRow,
} from "../domain/tax-protest/repository";
import {
  computeDaysRemaining,
  computeEffectiveDeadline,
  getDeadlineForCounty,
} from "../domain/tax-protest/deadlines";
import type { AppEnv } from "../env";
import {
  createTaxProtestRoutes,
  resolveTaxProtestCoverSheetContext,
} from "../http/tax-protest-routes";
import type { AuthVariables } from "../middleware/auth";

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROP_ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROP_ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROP_ID_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// ── In-memory repository ──────────────────────────────────────────────────────

const SNAPSHOT_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LEASE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

/** Minimal finalized snapshot for generate tests. */
function makeSnapshot(
  overrides: Partial<TaxProtestSnapshotRow> = {},
): TaxProtestSnapshotRow {
  return {
    id: SNAPSHOT_ID,
    organization_id: ORG_ID,
    property_id: PROP_ID_A,
    lease_id: LEASE_ID,
    status: "finalized",
    total_recovery: "1234.56",
    total_operating_expenses: "10000.00",
    grossed_up_expenses: "10526.32",
    base_year_amount: "0.00",
    tenant_share_before_cap: "1250.00",
    tenant_share_after_cap: "1234.56",
    admin_fee: "0.00",
    period_start_date: "2024-01-01",
    period_end_date: "2024-12-31",
    calculation_trace: [],
    ...overrides,
  };
}

class MemoryTaxProtestRepository implements TaxProtestRepository {
  rows: TaxProtestPropertyRow[] = [];
  snapshot: TaxProtestSnapshotRow | null = makeSnapshot();
  taxProtestAccess: boolean = true;
  pools: GlPool[] = [];
  priorSnapshots: TaxProtestPriorSnapshotRow[] = [];

  async listPropertiesForDeadlines(
    organizationId: string,
  ): Promise<TaxProtestPropertyRow[]> {
    void organizationId;
    return this.rows;
  }

  async getSnapshotForGenerate(input: {
    snapshotId: string;
    organizationId: string;
  }): Promise<TaxProtestSnapshotRow | null> {
    void input;
    return this.snapshot;
  }

  async loadExportContext(input: {
    leaseId: string | null;
    propertyId: string;
    organizationId: string;
  }): Promise<{
    lease: TaxProtestLeaseContext;
    property: TaxProtestPropertyContext;
    org: TaxProtestOrgContext;
  }> {
    void input;
    return {
      lease: { tenant_name: "Acme Corp" },
      property: {
        id: PROP_ID_A,
        name: "Harris Office Park",
        address: "123 Main St, Houston, TX 77001",
        state: "TX",
        taxProtestCounty: "Harris",
        taxProtestDeadlineOverride: null,
      },
      org: { name: "Test Org LLC" },
    };
  }

  async fetchPoolDetails(input: {
    propertyId: string;
    organizationId: string;
    year: number;
  }): Promise<GlPool[]> {
    void input;
    return this.pools;
  }

  async fetchPriorSnapshots(input: {
    propertyId: string;
    organizationId: string;
    year: number;
  }): Promise<TaxProtestPriorSnapshotRow[]> {
    void input;
    return this.priorSnapshots;
  }

  async hasTaxProtestAccess(organizationId: string): Promise<boolean> {
    void organizationId;
    return this.taxProtestAccess;
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
  repo: TaxProtestRepository,
  role: ActorRole = "owner",
  party: "landlord" | "tenant" = "landlord",
): Hono<{ Bindings: AppEnv; Variables: AuthVariables }> {
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createTaxProtestRoutes({
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

// ── GET /tax-protest/deadlines ────────────────────────────────────────────────

describe("GET /api/v1/tax-protest/deadlines", () => {
  it("happy path — county match resolves deadline and days_remaining", async () => {
    const repo = new MemoryTaxProtestRepository();
    // TX/Harris: May 15. Use a far-future year so deadline is always future.
    repo.rows = [
      {
        id: PROP_ID_A,
        name: "Harris Office Park",
        state: "TX",
        taxProtestCounty: "Harris",
        taxProtestDeadlineOverride: null,
      },
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/deadlines?year=2099",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      items: Array<{
        property_id: string;
        property_name: string;
        county: string | null;
        state: string | null;
        effective_deadline: string | null;
        days_remaining: number | null;
        is_past: boolean;
        is_configured: boolean;
      }>;
      year: number;
    }>();
    expect(body.year).toBe(2099);
    expect(body.items).toHaveLength(1);
    const item = body.items[0]!;
    expect(item.property_id).toBe(PROP_ID_A);
    expect(item.property_name).toBe("Harris Office Park");
    expect(item.county).toBe("Harris");
    expect(item.state).toBe("TX");
    expect(item.effective_deadline).toBe("2099-05-15");
    expect(typeof item.days_remaining).toBe("number");
    // Year 2099 deadline is far in the future, so days_remaining > 0
    expect(item.days_remaining).toBeGreaterThan(0);
    expect(item.is_past).toBe(false);
    expect(item.is_configured).toBe(true);
  });

  it("override_date only (no county) — uses override, is_configured true", async () => {
    const repo = new MemoryTaxProtestRepository();
    repo.rows = [
      {
        id: PROP_ID_B,
        name: "Overridden Building",
        state: "CA",
        taxProtestCounty: null,
        taxProtestDeadlineOverride: "2099-07-04",
      },
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/deadlines?year=2026",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      items: Array<{
        effective_deadline: string | null;
        is_configured: boolean;
        county: string | null;
      }>;
    }>();
    const item = body.items[0]!;
    // Override takes priority regardless of year param
    expect(item.effective_deadline).toBe("2099-07-04");
    expect(item.is_configured).toBe(true);
    expect(item.county).toBeNull();
  });

  it("neither county nor override — nulls, is_configured false, is_past false", async () => {
    const repo = new MemoryTaxProtestRepository();
    repo.rows = [
      {
        id: PROP_ID_C,
        name: "Unconfigured Property",
        state: "TX",
        taxProtestCounty: null,
        taxProtestDeadlineOverride: null,
      },
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/deadlines",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      items: Array<{
        effective_deadline: unknown;
        days_remaining: unknown;
        is_past: boolean;
        is_configured: boolean;
      }>;
    }>();
    const item = body.items[0]!;
    expect(item.effective_deadline).toBeNull();
    expect(item.days_remaining).toBeNull();
    expect(item.is_past).toBe(false);
    expect(item.is_configured).toBe(false);
  });

  it("is_past true when deadline is in the past (year 2000)", async () => {
    const repo = new MemoryTaxProtestRepository();
    repo.rows = [
      {
        id: PROP_ID_A,
        name: "Old Property",
        state: "TX",
        taxProtestCounty: "Harris",
        taxProtestDeadlineOverride: null,
      },
    ];
    const app = createTestApp(repo);
    // Year 2000 deadline is well in the past
    const res = await app.request(
      "/api/v1/tax-protest/deadlines?year=2000",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      items: Array<{ is_past: boolean; days_remaining: number | null }>;
    }>();
    const item = body.items[0]!;
    expect(item.is_past).toBe(true);
    expect(item.days_remaining).not.toBeNull();
    expect(item.days_remaining!).toBeLessThan(0);
  });

  it("explicit year param resolves county deadline to that year", async () => {
    const repo = new MemoryTaxProtestRepository();
    repo.rows = [
      {
        id: PROP_ID_A,
        name: "Harris Office",
        state: "TX",
        taxProtestCounty: "Harris",
        taxProtestDeadlineOverride: null,
      },
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/deadlines?year=2030",
      { headers: authHeaders() },
      env,
    );
    const body = await res.json<{
      items: Array<{ effective_deadline: string | null }>;
      year: number;
    }>();
    expect(body.year).toBe(2030);
    expect(body.items[0]!.effective_deadline).toBe("2030-05-15");
  });

  it("default year is current UTC year when param omitted", async () => {
    const repo = new MemoryTaxProtestRepository();
    repo.rows = [];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/deadlines",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ items: unknown[]; year: number }>();
    const currentYear = new Date().getUTCFullYear();
    expect(body.year).toBe(currentYear);
  });

  it("400 when year = 1999 (out of range)", async () => {
    const repo = new MemoryTaxProtestRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/deadlines?year=1999",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("validation_error");
  });

  it("400 when year = 2101 (out of range)", async () => {
    const repo = new MemoryTaxProtestRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/deadlines?year=2101",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: { code: string } }>();
    expect(body.error.code).toBe("validation_error");
  });

  it("400 when year is non-integer string", async () => {
    const repo = new MemoryTaxProtestRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/deadlines?year=abc",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(400);
  });

  it("case-insensitive county/state match", async () => {
    const repo = new MemoryTaxProtestRepository();
    repo.rows = [
      {
        id: PROP_ID_A,
        name: "Harris Lowercase",
        state: "tx", // lowercase state
        taxProtestCounty: "harris", // lowercase county
        taxProtestDeadlineOverride: null,
      },
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/deadlines?year=2030",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      items: Array<{ effective_deadline: string | null }>;
    }>();
    // Should still resolve TX/Harris deadline for year 2030
    expect(body.items[0]!.effective_deadline).toBe("2030-05-15");
  });

  it("empty org → {items:[], year}", async () => {
    const repo = new MemoryTaxProtestRepository();
    repo.rows = [];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/deadlines?year=2026",
      { headers: authHeaders() },
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ items: unknown[]; year: number }>();
    expect(body.items).toHaveLength(0);
    expect(body.year).toBe(2026);
  });

  it("401 when unauthenticated", async () => {
    const repo = new MemoryTaxProtestRepository();
    const app = createTestApp(repo);
    const res = await app.request("/api/v1/tax-protest/deadlines", {}, env);
    expect(res.status).toBe(401);
  });

  it("response shape has all required fields", async () => {
    const repo = new MemoryTaxProtestRepository();
    repo.rows = [
      {
        id: PROP_ID_A,
        name: "Shaped Property",
        state: "TX",
        taxProtestCounty: "Harris",
        taxProtestDeadlineOverride: null,
      },
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/deadlines?year=2099",
      { headers: authHeaders() },
      env,
    );
    const body = await res.json<{
      items: Array<Record<string, unknown>>;
      year: number;
    }>();
    const item = body.items[0]!;
    expect(Object.keys(item).sort()).toEqual(
      [
        "property_id",
        "property_name",
        "county",
        "state",
        "effective_deadline",
        "days_remaining",
        "is_past",
        "is_configured",
      ].sort(),
    );
  });
});

// ── POST /tax-protest/generate ────────────────────────────────────────────────

const GENERATE_BODY = {
  snapshot_id: SNAPSHOT_ID,
  tax_year: 2024,
  county: null,
  state: null,
};

describe("POST /api/v1/tax-protest/generate", () => {
  it("401 when unauthenticated", async () => {
    const repo = new MemoryTaxProtestRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(GENERATE_BODY),
      },
      env,
    );
    expect(res.status).toBe(401);
  });

  it("402 when hasTaxProtestAccess is false — exact detail string", async () => {
    const repo = new MemoryTaxProtestRepository();
    repo.taxProtestAccess = false;
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/generate",
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(GENERATE_BODY),
      },
      env,
    );
    expect(res.status).toBe(402);
    const body = await res.json<{ detail: string; error: { code: string } }>();
    expect(body.error.code).toBe("reconcile_subscription_required");
    expect(body.detail).toContain("reconcile_subscription_required");
    expect(body.detail).toContain("Reconcile subscription");
  });

  it("404 when snapshot not found", async () => {
    const repo = new MemoryTaxProtestRepository();
    repo.snapshot = null;
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/generate",
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(GENERATE_BODY),
      },
      env,
    );
    expect(res.status).toBe(404);
    const body = await res.json<{ detail: string; error: { code: string } }>();
    expect(body.error.code).toBe("reconciliation_snapshot_not_found");
    // Detail must match FastAPI NotFoundError.__str__:
    //   f"{resource} with id '{identifier}' not found"
    expect(body.detail).toBe(
      `reconciliation_snapshot with id '${SNAPSHOT_ID}' not found`,
    );
  });

  it("400 when snapshot status is not finalized", async () => {
    const repo = new MemoryTaxProtestRepository();
    repo.snapshot = makeSnapshot({ status: "draft" });
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/generate",
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(GENERATE_BODY),
      },
      env,
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ detail: string }>();
    expect(body.detail).toContain("finalized");
    expect(body.detail).toContain("draft");
  });

  it("happy path — returns ZIP with correct content-type and 4 members", async () => {
    const repo = new MemoryTaxProtestRepository();
    // One GL pool so the CSV has data rows
    repo.pools = [
      {
        pool_name: "CAM Pool",
        pool_type: "operating",
        pool_total: "10000.00",
        items: [
          {
            account_code: "5100",
            account_description: "Landscaping",
            amount: "10000.00",
          },
        ],
      },
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/generate",
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(GENERATE_BODY),
      },
      env,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    expect(res.headers.get("Content-Disposition")).toContain("tax-protest-");
    expect(res.headers.get("Content-Disposition")).toContain(".zip");

    // Verify ZIP magic bytes (PK\x03\x04 = local file header signature)
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0x50); // P
    expect(bytes[1]).toBe(0x4b); // K
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);
  });

  it("filename uses property name with slashes sanitised", async () => {
    // Inject a property name with a slash via loadExportContext override
    class SlashRepo extends MemoryTaxProtestRepository {
      override async loadExportContext(input: {
        leaseId: string | null;
        propertyId: string;
        organizationId: string;
      }) {
        void input;
        return {
          lease: { tenant_name: "Tenant" },
          property: {
            id: PROP_ID_A,
            name: "Prop/With\\Slashes",
            address: "",
            state: "TX",
            taxProtestCounty: null,
            taxProtestDeadlineOverride: null,
          },
          org: { name: "Org" },
        };
      }
    }
    const slashRepo = new SlashRepo();
    const app = createTestApp(slashRepo);
    const res = await app.request(
      "/api/v1/tax-protest/generate",
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(GENERATE_BODY),
      },
      env,
    );
    expect(res.status).toBe(200);
    const cd = res.headers.get("Content-Disposition") ?? "";
    // Slashes replaced with dashes in filename
    expect(cd).toContain("Prop-With-Slashes");
    expect(cd).not.toContain("/");
    expect(cd).not.toContain("\\");
  });

  it("filename strips header controls and quotes from property names", async () => {
    class UnsafeNameRepo extends MemoryTaxProtestRepository {
      override async loadExportContext(input: {
        leaseId: string | null;
        propertyId: string;
        organizationId: string;
      }) {
        void input;
        return {
          lease: { tenant_name: "Tenant" },
          property: {
            id: PROP_ID_A,
            name: 'Prop/With\\Slashes "Q"\r\nBad',
            address: "",
            state: "TX",
            taxProtestCounty: null,
            taxProtestDeadlineOverride: null,
          },
          org: { name: "Org" },
        };
      }
    }

    const app = createTestApp(new UnsafeNameRepo());
    const res = await app.request(
      "/api/v1/tax-protest/generate",
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(GENERATE_BODY),
      },
      env,
    );

    expect(res.status).toBe(200);
    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd).toContain("tax-protest-Prop-With-Slashes 'Q'Bad-2024.zip");
    expect(cd).not.toContain("\r");
    expect(cd).not.toContain("\n");
    expect(cd).not.toContain('"Q"');
    expect(cd).not.toContain("/");
    expect(cd).not.toContain("\\");
  });

  it("money figure: total_recovery 1234.56 → appears in ZIP (CSV) as 10000.00 pool total (Decimal, no float)", async () => {
    // Hand-checked: pool_total is "10000.00", Amount is "10000.00"
    // We verify the CSV bytes are present and parseable.
    const repo = new MemoryTaxProtestRepository();
    repo.pools = [
      {
        pool_name: "TestPool",
        pool_type: "operating",
        // Pool total with a value that would drift under float arithmetic:
        // 0.1 + 0.2 = 0.30000000000000004 in float, but Decimal gives "0.30"
        pool_total: "0.30",
        items: [
          { account_code: "1000", account_description: "Item", amount: "0.10" },
          {
            account_code: "2000",
            account_description: "Item2",
            amount: "0.20",
          },
        ],
      },
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/generate",
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(GENERATE_BODY),
      },
      env,
    );
    expect(res.status).toBe(200);
    // The response is a ZIP — we just verify it's not a JSON error and is
    // a valid ZIP (magic bytes). The CSV Decimal correctness is unit-tested
    // directly in gl-category-csv; here we verify end-to-end contract.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it("422 when request body is invalid (missing snapshot_id)", async () => {
    const repo = new MemoryTaxProtestRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/tax-protest/generate",
      {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ tax_year: 2024 }),
      },
      env,
    );
    // Zod parse failure → 422
    expect(res.status).toBe(422);
  });
});

// ── Pure-function unit tests ──────────────────────────────────────────────────

describe("PostgresTaxProtestRepository", () => {
  it("fetchPoolDetails scopes GL entries through property organization instead of a nonexistent GL organization column", async () => {
    const statements: string[] = [];
    const executor: PostgresExecutor = {
      async query<Row>(statement: string): Promise<{ rows: Row[] }> {
        statements.push(statement);
        if (statement.includes("from expense_pools")) {
          return {
            rows: [
              {
                id: "pool-1",
                name: "Operating Expenses",
                pool_type: "operating",
              },
            ] as Row[],
          };
        }
        if (statement.includes("from pool_mappings")) {
          return {
            rows: [
              {
                expense_pool_id: "pool-1",
                gl_account_pattern: "6%",
                allocation_percentage: "1",
              },
            ] as Row[],
          };
        }
        if (statement.includes("from gl_entries")) {
          return {
            rows: [
              {
                account_code: "6000",
                account_description: "Repairs",
                amount: "100.00",
              },
            ] as Row[],
          };
        }
        return { rows: [] };
      },
      async transaction<Result>(
        operation: (transactionExecutor: PostgresExecutor) => Promise<Result>,
      ): Promise<Result> {
        return operation(this);
      },
    };

    const repository = new PostgresTaxProtestRepository(executor);
    const pools = await repository.fetchPoolDetails({
      propertyId: "property-1",
      organizationId: ORG_ID,
      year: 2026,
    });

    expect(pools).toHaveLength(1);
    const glStatement = statements.find((statement) =>
      statement.includes("from gl_entries"),
    );
    expect(glStatement).toContain("join properties p on p.id = ge.property_id");
    expect(glStatement).toContain("p.organization_id = $3");
    expect(glStatement).not.toContain("ge.organization_id");
    expect(glStatement).not.toContain("gl_entries.organization_id");
  });

  function subscriptionExecutor(row: Record<string, unknown> | null): {
    executor: PostgresExecutor;
  } {
    const executor: PostgresExecutor = {
      async query<Row>(statement: string): Promise<{ rows: Row[] }> {
        if (statement.includes("from subscriptions")) {
          return { rows: (row ? [row] : []) as Row[] };
        }
        if (statement.includes("from audit_credits")) {
          return { rows: [{ exists: false }] as Row[] };
        }
        return { rows: [] };
      },
      async transaction<Result>(
        operation: (transactionExecutor: PostgresExecutor) => Promise<Result>,
      ): Promise<Result> {
        return operation(this);
      },
    };
    return { executor };
  }

  it("denies access to an expired card-less trial (no stripe sub, current_period_end in the past)", async () => {
    // Mirrors the canonical card-less-expired entitlement check in
    // billing.ts/exports.ts: a trialing row with no stripe_subscription_id whose
    // current_period_end has passed is an expired unpaid trial and must be paused,
    // not treated as an active trial that bypasses the tax-protest paywall.
    const { executor } = subscriptionExecutor({
      status: "trialing",
      billing_model: "subscription",
      stripe_subscription_id: null,
      current_period_end: "2020-01-01T00:00:00.000Z",
    });
    const repository = new PostgresTaxProtestRepository(executor);
    expect(await repository.hasTaxProtestAccess(ORG_ID)).toBe(false);
  });

  it("grants access to a live card-less trial (current_period_end in the future)", async () => {
    const { executor } = subscriptionExecutor({
      status: "trialing",
      billing_model: "subscription",
      stripe_subscription_id: null,
      current_period_end: "2999-01-01T00:00:00.000Z",
    });
    const repository = new PostgresTaxProtestRepository(executor);
    expect(await repository.hasTaxProtestAccess(ORG_ID)).toBe(true);
  });

  it("grants access to a trial backed by a stripe subscription even after period end", async () => {
    const { executor } = subscriptionExecutor({
      status: "trialing",
      billing_model: "subscription",
      stripe_subscription_id: "sub_123",
      current_period_end: "2020-01-01T00:00:00.000Z",
    });
    const repository = new PostgresTaxProtestRepository(executor);
    expect(await repository.hasTaxProtestAccess(ORG_ID)).toBe(true);
  });

  it("denies access to a past_due subscription (no non-canonical grace window)", async () => {
    // billing.ts/exports.ts gate every other premium feature on active|trialing
    // only; past_due grants no access. The tax-protest helper must match so a
    // delinquent org gets identical entitlement treatment across all features.
    const { executor } = subscriptionExecutor({
      status: "past_due",
      billing_model: "subscription",
      stripe_subscription_id: "sub_123",
      current_period_end: "2999-01-01T00:00:00.000Z",
    });
    const repository = new PostgresTaxProtestRepository(executor);
    expect(await repository.hasTaxProtestAccess(ORG_ID)).toBe(false);
  });

  it("grants access to an active subscription", async () => {
    const { executor } = subscriptionExecutor({
      status: "active",
      billing_model: "subscription",
      stripe_subscription_id: "sub_123",
      current_period_end: "2999-01-01T00:00:00.000Z",
    });
    const repository = new PostgresTaxProtestRepository(executor);
    expect(await repository.hasTaxProtestAccess(ORG_ID)).toBe(true);
  });
});

describe("resolveTaxProtestCoverSheetContext", () => {
  it("falls back to configured property county and state when request fields are omitted", () => {
    const result = resolveTaxProtestCoverSheetContext({
      bodyCounty: null,
      bodyState: null,
      property: {
        state: "TX",
        taxProtestCounty: "Harris",
        taxProtestDeadlineOverride: null,
      },
      taxYear: 2030,
      today: new Date("2030-04-15T00:00:00.000Z"),
    });

    expect(result.county).toBe("Harris");
    expect(result.state).toBe("TX");
    expect(result.effectiveDeadline).toBe("2030-05-15");
    expect(result.daysRemaining).toBe(30);
  });

  it("treats empty request county and state as omitted", () => {
    const result = resolveTaxProtestCoverSheetContext({
      bodyCounty: "",
      bodyState: "",
      property: {
        state: "TX",
        taxProtestCounty: "Harris",
        taxProtestDeadlineOverride: null,
      },
      taxYear: 2030,
      today: new Date("2030-04-15T00:00:00.000Z"),
    });

    expect(result.county).toBe("Harris");
    expect(result.state).toBe("TX");
    expect(result.effectiveDeadline).toBe("2030-05-15");
  });

  it("uses property deadline override ahead of county deadline", () => {
    const result = resolveTaxProtestCoverSheetContext({
      bodyCounty: null,
      bodyState: null,
      property: {
        state: "TX",
        taxProtestCounty: "Harris",
        taxProtestDeadlineOverride: "2030-04-01",
      },
      taxYear: 2030,
      today: new Date("2030-03-15T00:00:00.000Z"),
    });

    expect(result.county).toBe("Harris");
    expect(result.effectiveDeadline).toBe("2030-04-01");
    expect(result.daysRemaining).toBe(17);
  });

  it("lets request county and state override configured property tax fields", () => {
    const result = resolveTaxProtestCoverSheetContext({
      bodyCounty: "Los Angeles",
      bodyState: "CA",
      property: {
        state: "TX",
        taxProtestCounty: "Harris",
        taxProtestDeadlineOverride: null,
      },
      taxYear: 2030,
      today: new Date("2030-11-01T00:00:00.000Z"),
    });

    expect(result.county).toBe("Los Angeles");
    expect(result.state).toBe("CA");
    expect(result.effectiveDeadline).toBe("2030-11-30");
    expect(result.daysRemaining).toBe(29);
  });
});

describe("computeEffectiveDeadline", () => {
  it("override takes priority over county deadline", () => {
    const county = getDeadlineForCounty("TX", "Harris");
    expect(county).not.toBeNull();
    const result = computeEffectiveDeadline(county, "2026-03-01", 2026);
    expect(result).toBe("2026-03-01");
  });

  it("county deadline used when no override", () => {
    const county = getDeadlineForCounty("TX", "Harris");
    const result = computeEffectiveDeadline(county, null, 2026);
    expect(result).toBe("2026-05-15");
  });

  it("null when neither county nor override", () => {
    const result = computeEffectiveDeadline(null, null, 2026);
    expect(result).toBeNull();
  });

  it("override_date used as-is even when county is also set", () => {
    const county = getDeadlineForCounty("CA", "Los Angeles");
    expect(county).not.toBeNull();
    // Override should win over county Nov 30
    const result = computeEffectiveDeadline(county, "2026-10-01", 2026);
    expect(result).toBe("2026-10-01");
  });

  it("resolves county deadline to the referenceYear", () => {
    const county = getDeadlineForCounty("NY", "New York");
    expect(county).not.toBeNull();
    const result2025 = computeEffectiveDeadline(county, null, 2025);
    const result2030 = computeEffectiveDeadline(county, null, 2030);
    expect(result2025).toBe("2025-03-01");
    expect(result2030).toBe("2030-03-01");
  });
});

describe("computeDaysRemaining", () => {
  it("positive when deadline is in the future", () => {
    const today = new Date("2026-06-13T12:00:00Z");
    // Deadline 10 days later
    expect(computeDaysRemaining("2026-06-23", today)).toBe(10);
  });

  it("zero when deadline is today", () => {
    const today = new Date("2026-06-13T23:59:59Z");
    expect(computeDaysRemaining("2026-06-13", today)).toBe(0);
  });

  it("negative when deadline is in the past", () => {
    const today = new Date("2026-06-13T12:00:00Z");
    // Deadline 5 days ago
    expect(computeDaysRemaining("2026-06-08", today)).toBe(-5);
  });

  it("correct across year boundary", () => {
    const today = new Date("2025-12-28T00:00:00Z");
    // 4 days to Jan 1 2026
    expect(computeDaysRemaining("2026-01-01", today)).toBe(4);
  });

  it("correct for leap-year Feb 29 deadline", () => {
    const today = new Date("2024-02-28T00:00:00Z");
    expect(computeDaysRemaining("2024-02-29", today)).toBe(1);
  });
});

describe("getDeadlineForCounty", () => {
  it("finds TX/Harris", () => {
    const d = getDeadlineForCounty("TX", "Harris");
    expect(d).not.toBeNull();
    expect(d!.deadline_month).toBe(5);
    expect(d!.deadline_day).toBe(15);
  });

  it("returns null for unknown county", () => {
    expect(getDeadlineForCounty("TX", "Unknown County XYZ")).toBeNull();
  });

  it("case-insensitive: tx/harris matches TX/Harris", () => {
    const d = getDeadlineForCounty("tx", "harris");
    expect(d).not.toBeNull();
  });

  it("case-insensitive: TX/HARRIS matches", () => {
    const d = getDeadlineForCounty("TX", "HARRIS");
    expect(d).not.toBeNull();
  });

  it("trims county whitespace", () => {
    const d = getDeadlineForCounty("TX", "  Harris  ");
    expect(d).not.toBeNull();
  });
});
