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
  AnalysisRepository,
  ExpensePool,
  GlEntry,
  PoolMapping,
} from "../domain/analysis/repository";
import type { AppEnv } from "../env";
import { createAnalysisRoutes } from "../http/analysis-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryAnalysisRepository implements AnalysisRepository {
  fullAccess = true;
  propertyName: string | null = "Downtown Tower";
  finalizedYears = [2024, 2025];
  featureUses: Array<{ organizationId: string; featureKey: string }> = [];
  pools: ExpensePool[] = [
    { id: "44444444-4444-4444-8444-444444444441", name: "Cleaning" },
    { id: "44444444-4444-4444-8444-444444444442", name: "Security" },
    { id: "44444444-4444-4444-8444-444444444443", name: "Insurance" },
  ];
  mappings: PoolMapping[] = [
    {
      expense_pool_id: "44444444-4444-4444-8444-444444444441",
      gl_account_pattern: "600*",
      allocation_percentage: "1",
    },
    {
      expense_pool_id: "44444444-4444-4444-8444-444444444442",
      gl_account_pattern: "700%",
      allocation_percentage: "1",
    },
    {
      expense_pool_id: "44444444-4444-4444-8444-444444444443",
      gl_account_pattern: "800%",
      allocation_percentage: "1",
    },
  ];
  glEntriesByYear = new Map<number, GlEntry[]>([
    [
      2024,
      [
        {
          account_code: "6000",
          account_description: null,
          amount: "1000.00",
          vendor_name: null,
          description: null,
          transaction_date: null,
        },
        {
          account_code: "7000",
          account_description: null,
          amount: "1000.00",
          vendor_name: null,
          description: null,
          transaction_date: null,
        },
      ],
    ],
    [
      2025,
      [
        {
          account_code: "6000",
          account_description: null,
          amount: "1250.00",
          vendor_name: null,
          description: null,
          transaction_date: null,
        },
        {
          account_code: "8000",
          account_description: null,
          amount: "300.00",
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

  async listExpensePools(): Promise<ExpensePool[]> {
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

describe("analysis routes", () => {
  it("returns available finalized years for an organization-scoped property", async () => {
    const repository = new MemoryAnalysisRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      `/api/v1/analysis/properties/${PROPERTY_ID}/available-years`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([2024, 2025]);
  });

  it("builds year-over-year comparisons with decimal strings", async () => {
    const repository = new MemoryAnalysisRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      "/api/v1/analysis/year-over-year",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          years: [2025, 2024],
          use_fuzzy_matching: true,
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      property_id: PROPERTY_ID,
      property_name: "Downtown Tower",
      years: [2024, 2025],
      base_year: 2024,
      total_amounts: { "2024": "2000", "2025": "1550" },
      total_variance_amount: "-450",
      total_variance_percent: "-22.5",
      pool_comparisons: expect.arrayContaining([
        expect.objectContaining({
          pool_name: "Cleaning",
          amounts: { "2024": "1000", "2025": "1250" },
          variance_level: "critical",
          variance_percent: "25",
        }),
      ]),
    });
  });

  it("uses repository mapping order so higher-priority GL mappings win", async () => {
    const repository = new MemoryAnalysisRepository();
    repository.pools = [
      { id: "44444444-4444-4444-8444-444444444441", name: "Cleaning" },
      { id: "44444444-4444-4444-8444-444444444442", name: "Security" },
    ];
    repository.mappings = [
      {
        expense_pool_id: "44444444-4444-4444-8444-444444444442",
        gl_account_pattern: "6000",
        allocation_percentage: "1",
      },
      {
        expense_pool_id: "44444444-4444-4444-8444-444444444441",
        gl_account_pattern: "6*",
        allocation_percentage: "1",
      },
    ];
    repository.glEntriesByYear = new Map<number, GlEntry[]>([
      [
        2024,
        [
          {
            account_code: "6000",
            account_description: null,
            amount: "1000.00",
            vendor_name: null,
            description: null,
            transaction_date: null,
          },
        ],
      ],
      [
        2025,
        [
          {
            account_code: "6000",
            account_description: null,
            amount: "1100.00",
            vendor_name: null,
            description: null,
            transaction_date: null,
          },
        ],
      ],
    ]);
    const app = createTestApp(repository);

    const response = await app.request(
      "/api/v1/analysis/year-over-year",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          years: [2024, 2025],
          use_fuzzy_matching: false,
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      pool_comparisons: [
        expect.objectContaining({
          pool_name: "Security",
          amounts: { "2024": "1000", "2025": "1100" },
        }),
      ],
    });
  });

  it("rejects comparison years without finalized snapshots", async () => {
    const repository = new MemoryAnalysisRepository();
    repository.finalizedYears = [2024];
    const app = createTestApp(repository);

    const response = await app.request(
      "/api/v1/analysis/year-over-year",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          years: [2024, 2025],
          use_fuzzy_matching: false,
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_analysis_request" },
    });
  });

  it("requires paid access for comparison and anomaly detection routes", async () => {
    const repository = new MemoryAnalysisRepository();
    repository.fullAccess = false;
    const app = createTestApp(repository);

    const response = await app.request(
      "/api/v1/analysis/year-over-year",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          years: [2024, 2025],
          use_fuzzy_matching: true,
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "subscription_required" },
    });
  });

  it("detects deterministic variance and category anomalies", async () => {
    const repository = new MemoryAnalysisRepository();
    const app = createTestApp(repository);

    const response = await app.request(
      "/api/v1/analysis/anomaly-detection",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          target_year: 2025,
          comparison_years: [2024],
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      property_id: PROPERTY_ID,
      target_year: 2025,
      total_anomalies: 3,
      critical_count: 1,
      warning_count: 1,
      info_count: 1,
      anomalies: expect.arrayContaining([
        expect.objectContaining({
          pool_name: "Cleaning",
          anomaly_type: "spike",
          severity: "critical",
          variance_percent: "25",
        }),
        expect.objectContaining({
          pool_name: "Security",
          anomaly_type: "missing_category",
          severity: "warning",
        }),
        expect.objectContaining({
          pool_name: "Insurance",
          anomaly_type: "new_category",
          severity: "info",
        }),
      ]),
    });
    expect(repository.featureUses).toEqual([
      { organizationId: ORG_ID, featureKey: "anomaly_alerts" },
    ]);
  });
});

function createTestApp(repository: AnalysisRepository): Hono<{
  Bindings: AppEnv;
  Variables: AuthVariables;
}> {
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createAnalysisRoutes({
      repository,
      auth: {
        verifier: jwtVerifier(),
        db: {
          mode: "postgrest-compat",
          auth: authRepository(),
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

function jsonAuthHeaders(): Record<string, string> {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

function jwtVerifier(): JwtVerifier {
  return {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
}

function authRepository(): DbAdapter["auth"] & AuthRepository {
  return {
    async resolveUserContext(): Promise<AuthenticatedUserContext> {
      return {
        actor: {
          userId: USER_ID,
          organizationId: ORG_ID,
          role: "owner",
          isServiceAdmin: false,
          party: "landlord",
          bearerToken: "valid-token",
        },
        user: {
          id: USER_ID,
          organizationId: ORG_ID,
          email: "owner@example.com",
          fullName: "Owner",
          role: "owner",
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
