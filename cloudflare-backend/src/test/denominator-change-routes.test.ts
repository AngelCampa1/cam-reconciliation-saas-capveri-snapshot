/**
 * EP-18 route tests: POST /api/v1/analysis/denominator-change
 *
 * Uses in-memory repository to avoid real DB calls.
 *
 * Coverage:
 *   - happy path: response shape + key money/numeric fields
 *   - no-changes path: comparison_available=true, empty changes/tenant_impacts
 *   - NoComparableSnapshotsError (current) → 200 with comparison_available=false
 *   - NoComparableSnapshotsError (prior)   → 200 with comparison_available=false
 *   - 401 unauthenticated
 *   - 402 no full access (billing gate)
 *   - validation error → 400
 *   - tenant auth: no 403 (JSON route has no landlord gate)
 *   - auto-detect prior when prior_period_start/end omitted
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
  DenominatorChangeRepository,
  PropertyRow,
  SnapshotRow,
} from "../domain/denominator-change/repository";
import type { AppEnv } from "../env";
import { createDenominatorChangeRoutes } from "../http/denominator-change-routes";
import type { AuthVariables } from "../middleware/auth";

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const LEASE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEASE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// ── Snapshot factory ──────────────────────────────────────────────────────────

function makeSnapshot(
  leaseId: string,
  options: {
    periodStart?: string;
    periodEnd?: string;
    totalRecovery?: string;
    tenantName?: string;
    proRataShare?: string;
    rsf?: string;
    excludedPools?: string[];
    bomaStandard?: string | null;
  } = {},
): SnapshotRow {
  const {
    periodStart = "2023-01-01",
    periodEnd = "2023-12-31",
    totalRecovery = "1000.00",
    tenantName = "Tenant A",
    proRataShare = "0.25",
    rsf = "2500",
    excludedPools = [],
    bomaStandard = null,
  } = options;

  return {
    lease_id: leaseId,
    total_recovery: totalRecovery,
    period_start_date: periodStart,
    period_end_date: periodEnd,
    lease_terms_snapshot: {
      tenant_name: tenantName,
      pro_rata_share: proRataShare,
      rentable_square_feet: rsf,
      excluded_pools: excludedPools,
      rsf_measurement_standard: bomaStandard,
    },
  };
}

// ── In-memory repository ──────────────────────────────────────────────────────

class MemoryDenominatorChangeRepository implements DenominatorChangeRepository {
  fullAccess = true;
  property: PropertyRow | null = {
    id: PROPERTY_ID,
    name: "Test Tower",
    total_rentable_sqft: "10000",
  };

  snapshotsInPeriod: Map<string, SnapshotRow[]> = new Map();
  snapshotsBefore: SnapshotRow[] = [];

  async hasFullAccess(): Promise<boolean> {
    return this.fullAccess;
  }

  async listFinalizedSnapshotsInPeriod(input: {
    propertyId: string;
    organizationId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<SnapshotRow[]> {
    const key = `${input.periodStart}/${input.periodEnd}`;
    return this.snapshotsInPeriod.get(key) ?? [];
  }

  async listFinalizedSnapshotsBefore(input: {
    propertyId: string;
    organizationId: string;
    beforeDate: string;
  }): Promise<SnapshotRow[]> {
    void input.beforeDate;
    return this.snapshotsBefore;
  }

  async getProperty(): Promise<PropertyRow | null> {
    return this.property;
  }
}

// ── Auth / test app helpers ───────────────────────────────────────────────────

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
): DbAdapter["auth"] & AuthRepository {
  return {
    async resolveUserContext(): Promise<AuthenticatedUserContext> {
      return {
        actor: {
          userId: USER_ID,
          organizationId: ORG_ID,
          role: "owner",
          isServiceAdmin: false,
          party,
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

function authHeaders(): Record<string, string> {
  return { Authorization: "Bearer valid-token" };
}
function jsonAuthHeaders(): Record<string, string> {
  return { ...authHeaders(), "Content-Type": "application/json" };
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
  repo: DenominatorChangeRepository,
  party: "landlord" | "tenant" = "landlord",
): Hono<{ Bindings: AppEnv; Variables: AuthVariables }> {
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createDenominatorChangeRoutes({
      repository: repo,
      auth: {
        verifier: jwtVerifier(),
        db: {
          mode: "postgrest-compat",
          auth: authRepository(party),
          protectedRecords,
        },
      },
    }),
  );
  return app;
}

// ── Standard request bodies ───────────────────────────────────────────────────

const HAPPY_BODY = {
  property_id: PROPERTY_ID,
  current_period_start: "2024-01-01",
  current_period_end: "2024-12-31",
  prior_period_start: "2023-01-01",
  prior_period_end: "2023-12-31",
};

// ── Route tests ───────────────────────────────────────────────────────────────

describe("EP-18 POST /api/v1/analysis/denominator-change", () => {
  // ── Auth gates ─────────────────────────────────────────────────────────────

  it("returns 401 when no Authorization header", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/analysis/denominator-change",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(HAPPY_BODY),
      },
      testEnv(),
    );

    expect(res.status).toBe(401);
  });

  it("returns 402 when org lacks full access", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    repo.fullAccess = false;
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/analysis/denominator-change",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(HAPPY_BODY),
      },
      testEnv(),
    );

    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("subscription_required");
  });

  it("returns 403 for tenant party (auth middleware tenant-profile gate)", async () => {
    // The Worker auth middleware gates tenant party users with 403 when no
    // tenantUser is present (mirrors resolveUserContext returning no tenant
    // profile). The FastAPI route has no explicit party check but tenant users
    // are blocked by the Worker middleware (not the route handler).
    const repo = new MemoryDenominatorChangeRepository();
    const app = createTestApp(repo, "tenant");

    const res = await app.request(
      "/api/v1/analysis/denominator-change",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(HAPPY_BODY),
      },
      testEnv(),
    );

    expect(res.status).toBe(403);
  });

  // ── Validation ─────────────────────────────────────────────────────────────

  it("returns 400 for invalid UUID in property_id", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/analysis/denominator-change",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ ...HAPPY_BODY, property_id: "not-a-uuid" }),
      },
      testEnv(),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("validation_error");
  });

  // ── NoComparableSnapshotsError → 200 with comparison_available=false ────────

  it("returns 200 with comparison_available=false when current snapshots missing", async () => {
    // Empty repo → current period has no snapshots
    const repo = new MemoryDenominatorChangeRepository();
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/analysis/denominator-change",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(HAPPY_BODY),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      comparison_available: boolean;
      missing_period: string;
      property_id: string;
      changes: unknown[];
      tenant_impacts: unknown[];
    };
    expect(body.comparison_available).toBe(false);
    expect(body.missing_period).toBe("current");
    expect(body.property_id).toBe(PROPERTY_ID);
    expect(body.changes).toEqual([]);
    expect(body.tenant_impacts).toEqual([]);
  });

  it("returns 200 with comparison_available=false when prior snapshots missing", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    // Only current present; prior is empty
    repo.snapshotsInPeriod.set("2024-01-01/2024-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
      }),
    ]);
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/analysis/denominator-change",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(HAPPY_BODY),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      comparison_available: boolean;
      missing_period: string;
    };
    expect(body.comparison_available).toBe(false);
    expect(body.missing_period).toBe("prior");
  });

  it("sets prior_period to empty string in empty report when prior dates not provided", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    // Both snapshotsBefore and current empty — current missing first
    const app = createTestApp(repo);

    const bodyNoPrior = {
      property_id: PROPERTY_ID,
      current_period_start: "2024-01-01",
      current_period_end: "2024-12-31",
    };

    const res = await app.request(
      "/api/v1/analysis/denominator-change",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(bodyNoPrior),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      comparison_available: boolean;
      prior_period: string;
    };
    expect(body.comparison_available).toBe(false);
    expect(body.prior_period).toBe("");
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it("returns 200 with full report when both periods have snapshots (no changes)", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    // Same tenant, same share, same recovery → no changes detected
    repo.snapshotsInPeriod.set("2024-01-01/2024-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        tenantName: "Alpha Corp",
        proRataShare: "0.25",
        totalRecovery: "1500.00",
        rsf: "2500",
      }),
    ]);
    repo.snapshotsInPeriod.set("2023-01-01/2023-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
        tenantName: "Alpha Corp",
        proRataShare: "0.25",
        totalRecovery: "1500.00",
        rsf: "2500",
      }),
    ]);
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/analysis/denominator-change",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(HAPPY_BODY),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      comparison_available: boolean;
      missing_period: unknown;
      property_id: string;
      property_name: string;
      prior_period: string;
      current_period: string;
      prior_total_rsf: string;
      current_total_rsf: string;
      rsf_delta: string;
      rsf_delta_percent: string;
      changes: unknown[];
      tenant_impacts: unknown[];
      summary: string;
      generated_at: string;
    };

    expect(body.comparison_available).toBe(true);
    expect(body.missing_period).toBeNull();
    expect(body.property_id).toBe(PROPERTY_ID);
    expect(body.property_name).toBe("Test Tower");
    expect(body.prior_period).toBe("2023-01-01 to 2023-12-31");
    expect(body.current_period).toBe("2024-01-01 to 2024-12-31");
    // RSF unchanged (property total_rentable_sqft = 10000, no override)
    expect(body.prior_total_rsf).toBe("10000");
    expect(body.current_total_rsf).toBe("10000");
    expect(body.rsf_delta).toBe("0");
    expect(body.rsf_delta_percent).toBe("0");
    expect(body.changes).toEqual([]);
    expect(body.tenant_impacts).toEqual([]);
    expect(typeof body.summary).toBe("string");
    expect(typeof body.generated_at).toBe("string");
  });

  it("returns report with RSF change detected", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    repo.snapshotsInPeriod.set("2024-01-01/2024-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        tenantName: "Alpha Corp",
        proRataShare: "0.20",
        totalRecovery: "1600.00",
        rsf: "2000",
      }),
    ]);
    repo.snapshotsInPeriod.set("2023-01-01/2023-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
        tenantName: "Alpha Corp",
        proRataShare: "0.25",
        totalRecovery: "1000.00",
        rsf: "2500",
      }),
    ]);
    // Override total RSF to see RSF_REMEASUREMENT change
    const bodyWithRsf = {
      ...HAPPY_BODY,
      prior_total_rsf: "10000",
      current_total_rsf: "12000",
    };
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/analysis/denominator-change",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(bodyWithRsf),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      comparison_available: boolean;
      prior_total_rsf: string;
      current_total_rsf: string;
      rsf_delta: string;
      changes: Array<{ change_type: string }>;
      tenant_impacts: Array<{
        lease_id: string;
        tenant_name: string;
        prior_pro_rata_share: string;
        current_pro_rata_share: string;
        share_delta_pct_points: string;
        prior_estimated_recovery: string;
        current_estimated_recovery: string;
        recovery_delta: string;
        contributing_changes: string[];
      }>;
    };

    expect(body.comparison_available).toBe(true);
    expect(body.prior_total_rsf).toBe("10000");
    expect(body.current_total_rsf).toBe("12000");
    expect(body.rsf_delta).toBe("2000");
    // At least the RSF_REMEASUREMENT change present
    expect(
      body.changes.some((c) => c.change_type === "rsf_remeasurement"),
    ).toBe(true);
    // Tenant impact has share change (0.25 → 0.20)
    expect(body.tenant_impacts.length).toBeGreaterThan(0);
    const impact = body.tenant_impacts[0];
    expect(impact).toBeDefined();
    expect(impact?.lease_id).toBe(LEASE_A);
    expect(impact?.tenant_name).toBe("Alpha Corp");
    // Decimal fields are strings
    expect(typeof impact?.prior_pro_rata_share).toBe("string");
    expect(typeof impact?.current_pro_rata_share).toBe("string");
    expect(typeof impact?.share_delta_pct_points).toBe("string");
    expect(typeof impact?.prior_estimated_recovery).toBe("string");
    expect(typeof impact?.current_estimated_recovery).toBe("string");
    expect(typeof impact?.recovery_delta).toBe("string");
    // contributing_changes is an array of strings
    expect(Array.isArray(impact?.contributing_changes)).toBe(true);
  });

  it("auto-detects prior when prior_period_start/end omitted", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    repo.snapshotsInPeriod.set("2024-01-01/2024-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        tenantName: "Alpha Corp",
        totalRecovery: "1200.00",
      }),
    ]);
    repo.snapshotsBefore = [
      makeSnapshot(LEASE_A, {
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
        tenantName: "Alpha Corp",
        totalRecovery: "1000.00",
      }),
    ];
    const app = createTestApp(repo);

    const bodyNoPrior = {
      property_id: PROPERTY_ID,
      current_period_start: "2024-01-01",
      current_period_end: "2024-12-31",
    };

    const res = await app.request(
      "/api/v1/analysis/denominator-change",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(bodyNoPrior),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      comparison_available: boolean;
      prior_period: string;
    };
    expect(body.comparison_available).toBe(true);
    expect(body.prior_period).toBe("2023-01-01 to 2023-12-31");
  });

  it("includes tenant_added change when new tenant appears in current period", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    // Prior: only LEASE_A; Current: LEASE_A + LEASE_B (new tenant)
    repo.snapshotsInPeriod.set("2024-01-01/2024-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        tenantName: "Alpha Corp",
      }),
      makeSnapshot(LEASE_B, {
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        tenantName: "Beta Inc",
      }),
    ]);
    repo.snapshotsInPeriod.set("2023-01-01/2023-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
        tenantName: "Alpha Corp",
      }),
    ]);
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/analysis/denominator-change",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(HAPPY_BODY),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      changes: Array<{ change_type: string }>;
    };
    expect(body.changes.some((c) => c.change_type === "tenant_added")).toBe(
      true,
    );
  });
});
