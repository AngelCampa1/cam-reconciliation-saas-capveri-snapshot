/**
 * Route tests for EP-15: POST /api/v1/export/detail-advisor
 *
 * Covers:
 *   - Auth gate: tenant → 403
 *   - Billing gate: no full access → 402
 *   - Happy path: seeded pools/mappings/gl → correct advisory JSON
 *   - Org isolation: different org sees SUGGESTION (no pools → empty advisory)
 *   - No pools → empty advisory (SUGGESTION)
 *   - JSON response shape matches FastAPI Pydantic output (Decimal fields as strings)
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AnalysisRepository,
  ExpensePool,
  GlEntry,
  PoolMapping,
} from "../domain/analysis/repository";
import type { AppEnv } from "../env";
import { createDetailAdvisorRoutes } from "../http/export-detail-advisor-routes";
import type { AuthVariables } from "../middleware/auth";

// ── constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID_B = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const PROPERTY_ID = "44444444-4444-4444-8444-444444444444";
const POOL_ID_CLEANING = "55555555-5555-4555-8555-555555555551";
const POOL_ID_SECURITY = "55555555-5555-4555-8555-555555555552";

// ── In-memory repository ──────────────────────────────────────────────────────

class MemoryAnalysisRepository implements AnalysisRepository {
  fullAccess = true;
  propertyName: string | null = "Downtown Tower";
  finalizedYears = [2024];
  featureUses: Array<{ organizationId: string; featureKey: string }> = [];

  pools: ExpensePool[] = [
    { id: POOL_ID_CLEANING, name: "Cleaning" },
    { id: POOL_ID_SECURITY, name: "Security" },
  ];

  mappings: PoolMapping[] = [
    {
      expense_pool_id: POOL_ID_CLEANING,
      gl_account_pattern: "6%",
      allocation_percentage: "1",
    },
    {
      expense_pool_id: POOL_ID_SECURITY,
      gl_account_pattern: "7%",
      allocation_percentage: "1",
    },
  ];

  glEntriesByYear = new Map<number, GlEntry[]>([
    [
      2024,
      [
        {
          account_code: "6001",
          account_description: "Cleaning Labor",
          amount: "5000.00",
          vendor_name: null,
          description: null,
          transaction_date: null,
        },
        {
          account_code: "6002",
          account_description: "Cleaning Supplies",
          amount: "200.00",
          vendor_name: null,
          description: null,
          transaction_date: null,
        },
        {
          account_code: "7001",
          account_description: "Security Guard",
          amount: "3000.00",
          vendor_name: null,
          description: null,
          transaction_date: null,
        },
      ],
    ],
  ]);

  async hasFullAccess(): Promise<boolean> {
    return this.fullAccess;
  }

  async getPropertyName(): Promise<string | null> {
    return this.propertyName;
  }

  async listAvailableYears(): Promise<number[]> {
    return this.finalizedYears;
  }

  async listFinalizedSnapshotYears(): Promise<number[]> {
    return this.finalizedYears;
  }

  async listExpensePools(input: {
    organizationId: string;
  }): Promise<ExpensePool[]> {
    // Simulate org isolation: only return pools for the known org
    if (input.organizationId !== ORG_ID) return [];
    return this.pools;
  }

  async listPoolMappings(): Promise<PoolMapping[]> {
    return this.mappings;
  }

  async listGlEntries(input: { year: number }): Promise<GlEntry[]> {
    return this.glEntriesByYear.get(input.year) ?? [];
  }

  async recordFeatureUse(input: {
    organizationId: string;
    featureKey: string;
  }): Promise<void> {
    this.featureUses.push(input);
  }
  async listExpensePoolsWithType(): Promise<
    Array<{ name: string; type: string }>
  > {
    return [];
  }
  async insertGlAnalysisResult(): Promise<
    import("../domain/analysis/repository").GlAnalysisResult
  > {
    throw new Error("not implemented in this test stub");
  }
  async getLatestGlAnalysis(): Promise<
    import("../domain/analysis/repository").GlAnalysisResult | null
  > {
    return null;
  }
  async dismissGlAnalysis(): Promise<
    import("../domain/analysis/repository").GlAnalysisResult
  > {
    throw new Error("not implemented in this test stub");
  }
}

// ── Auth helpers ──────────────────────────────────────────────────────────────

type AuthParty = "landlord" | "tenant";
type AuthRole = "owner" | "admin" | "member" | "viewer";

function makeAuthContext(
  organizationId: string = ORG_ID,
  party: AuthParty = "landlord",
  role: AuthRole = "owner",
): AuthenticatedUserContext {
  return {
    user: {
      id: USER_ID,
      organizationId,
      email: "owner@test.example",
      fullName: "Test Owner",
      role,
      isPlatformAdmin: false,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
    actor: {
      userId: USER_ID,
      organizationId,
      role,
      isServiceAdmin: false,
      party,
      bearerToken: "valid-token",
    },
  };
}

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

function makeTestApp(
  repo: AnalysisRepository,
  authContext: AuthenticatedUserContext = makeAuthContext(),
): Hono<{ Bindings: AppEnv; Variables: AuthVariables }> {
  const auth: AuthRepository = {
    async resolveUserContext() {
      return authContext;
    },
  };
  const verifier: JwtVerifier = {
    async verify() {
      return { subject: USER_ID, payload: {}, isActive: true };
    },
  };
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createDetailAdvisorRoutes({
      repository: repo,
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    }),
  );
  return app;
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

function jsonAuthHeaders(): Record<string, string> {
  return {
    Authorization: "Bearer valid-token",
    "Content-Type": "application/json",
  };
}

function postBody(propertyId = PROPERTY_ID, year = 2024): string {
  return JSON.stringify({ property_id: propertyId, year });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/v1/export/detail-advisor", () => {
  it("returns 403 for tenant party", async () => {
    const repo = new MemoryAnalysisRepository();
    const app = makeTestApp(repo, makeAuthContext(ORG_ID, "tenant"));

    const res = await app.request(
      "/api/v1/export/detail-advisor",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: postBody(),
      },
      testEnv(),
    );

    expect(res.status).toBe(403);
    // The auth middleware returns 403 with tenant_profile_not_found when
    // party === "tenant" and no tenantUser is resolved (no tenant profile set up)
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "tenant_profile_not_found" },
    });
  });

  it("returns 402 when org lacks full access", async () => {
    const repo = new MemoryAnalysisRepository();
    repo.fullAccess = false;
    const app = makeTestApp(repo);

    const res = await app.request(
      "/api/v1/export/detail-advisor",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: postBody(),
      },
      testEnv(),
    );

    expect(res.status).toBe(402);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "subscription_required" },
    });
  });

  it("returns 400 for invalid body (missing year)", async () => {
    const repo = new MemoryAnalysisRepository();
    const app = makeTestApp(repo);

    const res = await app.request(
      "/api/v1/export/detail-advisor",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID }),
      },
      testEnv(),
    );

    expect(res.status).toBe(422);
  });

  it("returns 400 invalid_json for malformed JSON", async () => {
    const repo = new MemoryAnalysisRepository();
    const app = makeTestApp(repo);

    const res = await app.request(
      "/api/v1/export/detail-advisor",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: "{",
      },
      testEnv(),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "invalid_json" },
    });
  });

  it("happy path: produces advisory with correct counts and pool names", async () => {
    const repo = new MemoryAnalysisRepository();
    const app = makeTestApp(repo);

    const res = await app.request(
      "/api/v1/export/detail-advisor",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: postBody(),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    // 2 pools, 3 total items (2 Cleaning + 1 Security)
    expect(body.total_line_items).toBe(3);
    expect(body.total_categories).toBe(2);
    // 3 items is well within 15–25 ideal range → OK
    expect(body.overall_severity).toBe("ok");
    expect(body.grouping_suggestions).toEqual([]);
    expect(body.immaterial_items).toEqual([]);
    expect(body.suggested_total_lines).toBe(3);
    expect(typeof body.summary).toBe("string");
    expect(body.summary).toContain("3 line items");
  });

  it("Decimal fields in immaterial_items are serialized as strings", async () => {
    // Create a repo where one item is immaterial
    const repo = new MemoryAnalysisRepository();
    // Cleaning pool: one big item + one tiny immaterial item
    repo.glEntriesByYear = new Map([
      [
        2024,
        [
          {
            account_code: "6001",
            account_description: "Main",
            amount: "9951.00",
            vendor_name: null,
            description: null,
            transaction_date: null,
          },
          {
            account_code: "6002",
            account_description: "Tiny",
            amount: "49.00",
            vendor_name: null,
            description: null,
            transaction_date: null,
          },
        ],
      ],
    ]);
    // Only Cleaning pool, no Security
    repo.pools = [{ id: POOL_ID_CLEANING, name: "Cleaning" }];
    repo.mappings = [
      {
        expense_pool_id: POOL_ID_CLEANING,
        gl_account_pattern: "6%",
        allocation_percentage: "1",
      },
    ];

    const app = makeTestApp(repo);
    const res = await app.request(
      "/api/v1/export/detail-advisor",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: postBody(),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const items = body.immaterial_items as Array<Record<string, unknown>>;

    expect(items).toHaveLength(1);
    const item = items[0]!;
    // Decimal fields are serialized as strings (matches FastAPI Pydantic v2)
    expect(typeof item["amount"]).toBe("string");
    expect(typeof item["percent_of_total"]).toBe("string");
    expect(item["account_code"]).toBe("6002");
    expect(item["pool_name"]).toBe("Cleaning");
    // 49/10000 * 100 = 0.49 — verify it's < 0.5
    expect(new Decimal(item["percent_of_total"] as string).lt("0.5")).toBe(
      true,
    );
  });

  it("org isolation: different org sees SUGGESTION (no pools found)", async () => {
    const repo = new MemoryAnalysisRepository();
    const app = makeTestApp(repo, makeAuthContext(ORG_ID_B));

    const res = await app.request(
      "/api/v1/export/detail-advisor",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: postBody(),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // No pools for org B → empty advisory → SUGGESTION
    expect(body.total_line_items).toBe(0);
    expect(body.overall_severity).toBe("suggestion");
  });

  it("returns grouping SUGGESTION when a pool has 6 items", async () => {
    const repo = new MemoryAnalysisRepository();
    // Override GL entries: 6 items matching Cleaning pool (6 > threshold=5)
    repo.glEntriesByYear = new Map([
      [
        2024,
        Array.from({ length: 6 }, (_, i) => ({
          account_code: `600${i}`,
          account_description: `Item ${i}`,
          amount: "1000.00",
          vendor_name: null as null,
          description: null as null,
          transaction_date: null as null,
        })),
      ],
    ]);
    repo.pools = [{ id: POOL_ID_CLEANING, name: "Cleaning" }];
    repo.mappings = [
      {
        expense_pool_id: POOL_ID_CLEANING,
        gl_account_pattern: "6%",
        allocation_percentage: "1",
      },
    ];

    const app = makeTestApp(repo);
    const res = await app.request(
      "/api/v1/export/detail-advisor",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: postBody(),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    const suggestions = body.grouping_suggestions as Array<
      Record<string, unknown>
    >;
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!["severity"]).toBe("suggestion");
    expect(suggestions[0]!["category_name"]).toBe("Cleaning");
  });

  it("response has all required fields from DetailLevelAdvisoryResponse", async () => {
    const repo = new MemoryAnalysisRepository();
    const app = makeTestApp(repo);

    const res = await app.request(
      "/api/v1/export/detail-advisor",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: postBody(),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;

    // Required fields from DetailLevelAdvisoryResponse
    expect(body).toHaveProperty("total_line_items");
    expect(body).toHaveProperty("total_categories");
    expect(body).toHaveProperty("overall_severity");
    expect(body).toHaveProperty("summary");
    expect(body).toHaveProperty("grouping_suggestions");
    expect(body).toHaveProperty("immaterial_items");
    expect(body).toHaveProperty("suggested_total_lines");

    expect(typeof body.total_line_items).toBe("number");
    expect(typeof body.total_categories).toBe("number");
    expect(typeof body.overall_severity).toBe("string");
    expect(typeof body.summary).toBe("string");
    expect(Array.isArray(body.grouping_suggestions)).toBe(true);
    expect(Array.isArray(body.immaterial_items)).toBe(true);
    expect(typeof body.suggested_total_lines).toBe("number");
  });
});
