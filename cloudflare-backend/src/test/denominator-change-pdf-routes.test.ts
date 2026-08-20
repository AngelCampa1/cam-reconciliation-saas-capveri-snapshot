/**
 * EP-18 route tests: POST /api/v1/reports/denominator-change/pdf
 *
 * Uses in-memory repository to avoid real DB calls.
 *
 * Coverage:
 *   - happy path: valid PDF bytes, correct Content-Type, correct filename
 *   - no-changes path: "No denominator changes detected" in summary
 *   - missing current snapshots → 400
 *   - missing prior snapshots → 400
 *   - auto-detect prior: prior_period_start/end omitted → latest-before used
 *   - tenant auth → 403
 *   - no full access → 402
 *   - unit: detectors produce Python-matching strings
 *   - unit: summary generation matches Python
 *   - unit: tenant impact calculation (share+recovery change → impact row)
 *   - unit: RSF-delta percent with ROUND_HALF_UP
 */

import { PDFDocument } from "pdf-lib";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import Decimal from "decimal.js";
import { unzlibSync } from "fflate";
import {
  buildDenominatorChangePdf,
  formatPeriodLabel,
} from "../domain/denominator-change/pdf";
import type { DenominatorChangeReport } from "../domain/denominator-change/service";
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
import {
  detectRsfChange,
  detectTenantRosterChanges,
  detectExclusionChanges,
  detectBomaStandardChanges,
  detectShareRecalculations,
  calculateTenantImpacts,
  extractDenominatorComponents,
  generateSummary,
  DenominatorChangeType,
} from "../domain/denominator-change/service";
import type { AppEnv } from "../env";
import { createDenominatorChangePdfRoutes } from "../http/denominator-change-pdf-routes";
import type { AuthVariables } from "../middleware/auth";

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const LEASE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEASE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LEASE_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// ── Snapshot factories ────────────────────────────────────────────────────────

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
    // beforeDate used to filter in real impl; memory repo ignores it
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
    createDenominatorChangePdfRoutes({
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

// ── Standard request body ─────────────────────────────────────────────────────

const HAPPY_BODY = {
  property_id: PROPERTY_ID,
  current_period_start: "2024-01-01",
  current_period_end: "2024-12-31",
  prior_period_start: "2023-01-01",
  prior_period_end: "2023-12-31",
};

// ── Route tests ───────────────────────────────────────────────────────────────

describe("EP-18 POST /api/v1/reports/denominator-change/pdf", () => {
  it("returns 403 for tenant auth", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    const app = createTestApp(repo, "tenant");

    const res = await app.request(
      "/api/v1/reports/denominator-change/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(HAPPY_BODY),
      },
      testEnv(),
    );

    expect(res.status).toBe(403);
  });

  it("returns 402 when org lacks full access", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    repo.fullAccess = false;
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/reports/denominator-change/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(HAPPY_BODY),
      },
      testEnv(),
    );

    expect(res.status).toBe(402);
  });

  it("returns 400 when current snapshots are missing", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    // current period key not populated; prior also empty
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/reports/denominator-change/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(HAPPY_BODY),
      },
      testEnv(),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("no_comparable_snapshots");
  });

  it("returns 400 when prior snapshots are missing (explicit prior)", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    // Only current period present; prior explicitly set but empty
    repo.snapshotsInPeriod.set("2024-01-01/2024-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
      }),
    ]);
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/reports/denominator-change/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(HAPPY_BODY),
      },
      testEnv(),
    );

    expect(res.status).toBe(400);
  });

  it("auto-detects prior period when prior_period_start/end omitted", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    // Current period snapshots
    repo.snapshotsInPeriod.set("2024-01-01/2024-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        tenantName: "Alpha Corp",
        totalRecovery: "1200.00",
      }),
    ]);
    // Auto-detect returns latest-before
    repo.snapshotsBefore = [
      makeSnapshot(LEASE_A, {
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
        tenantName: "Alpha Corp",
        totalRecovery: "1000.00",
      }),
    ];
    const app = createTestApp(repo);

    const bodyNoExplicitPrior = {
      property_id: PROPERTY_ID,
      current_period_start: "2024-01-01",
      current_period_end: "2024-12-31",
    };

    const res = await app.request(
      "/api/v1/reports/denominator-change/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(bodyNoExplicitPrior),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("happy path: valid PDF with RSF change + roster change + exclusion + BOMA + share recalc + tenant impacts", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    // Current: Tenant A (with RSF+share change), Tenant B (new), no Tenant C
    repo.snapshotsInPeriod.set("2024-01-01/2024-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        tenantName: "Alpha Corp",
        proRataShare: "0.30",
        rsf: "3000",
        totalRecovery: "1500.00",
        excludedPools: ["Security"],
        bomaStandard: "BOMA 2017",
      }),
      makeSnapshot(LEASE_B, {
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
        tenantName: "Beta LLC",
        proRataShare: "0.20",
        rsf: "2000",
        totalRecovery: "800.00",
      }),
    ]);
    // Prior: Tenant A (original), Tenant C (removed)
    repo.snapshotsInPeriod.set("2023-01-01/2023-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
        tenantName: "Alpha Corp",
        proRataShare: "0.25",
        rsf: "2500",
        totalRecovery: "1000.00",
        excludedPools: [],
        bomaStandard: "BOMA 1996",
      }),
      makeSnapshot(LEASE_C, {
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
        tenantName: "Gamma Inc",
        proRataShare: "0.15",
        rsf: "1500",
        totalRecovery: "600.00",
      }),
    ]);
    // Use explicit RSF values to trigger RSF change
    repo.property = {
      id: PROPERTY_ID,
      name: "Test Tower",
      total_rentable_sqft: "10000",
    };
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/reports/denominator-change/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          ...HAPPY_BODY,
          prior_total_rsf: 9500,
          current_total_rsf: 10200,
        }),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    const cd = res.headers.get("Content-Disposition");
    expect(cd).toContain(
      `denominator_change_${PROPERTY_ID}_2024-01-01_2024-12-31.pdf`,
    );

    // Validate PDF is well-formed
    const pdfBytes = new Uint8Array(await res.arrayBuffer());
    const textDecoder = new TextDecoder();
    const pdfHeader = textDecoder.decode(pdfBytes.slice(0, 5));
    expect(pdfHeader).toBe("%PDF-");

    // Load with pdf-lib and verify at least 1 page
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("happy path: no-changes path produces valid PDF", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    // Identical snapshots — no denominator changes
    const snap = makeSnapshot(LEASE_A, {
      tenantName: "Stable Corp",
      proRataShare: "0.25",
      rsf: "2500",
      totalRecovery: "1000.00",
    });
    repo.snapshotsInPeriod.set("2024-01-01/2024-12-31", [
      {
        ...snap,
        period_start_date: "2024-01-01",
        period_end_date: "2024-12-31",
      },
    ]);
    repo.snapshotsInPeriod.set("2023-01-01/2023-12-31", [snap]);
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/reports/denominator-change/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(HAPPY_BODY),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const pdfBytes = new Uint8Array(await res.arrayBuffer());
    const doc = await PDFDocument.load(pdfBytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("correct filename when Content-Disposition is set", async () => {
    const repo = new MemoryDenominatorChangeRepository();
    repo.snapshotsInPeriod.set("2024-01-01/2024-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2024-01-01",
        periodEnd: "2024-12-31",
      }),
    ]);
    repo.snapshotsInPeriod.set("2023-01-01/2023-12-31", [
      makeSnapshot(LEASE_A, {
        periodStart: "2023-01-01",
        periodEnd: "2023-12-31",
      }),
    ]);
    const app = createTestApp(repo);

    const res = await app.request(
      "/api/v1/reports/denominator-change/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(HAPPY_BODY),
      },
      testEnv(),
    );

    const cd = res.headers.get("Content-Disposition");
    expect(cd).toContain("attachment;");
    expect(cd).toContain(
      `denominator_change_${PROPERTY_ID}_2024-01-01_2024-12-31.pdf`,
    );
  });
});

// ── Unit tests: computation (Python-matching strings and rounding) ─────────────

describe("detectRsfChange", () => {
  it("no change when RSF is equal", () => {
    const changes = detectRsfChange(new Decimal("10000"), new Decimal("10000"));
    expect(changes).toHaveLength(0);
  });

  it("increase: matches Python f-string output byte-for-byte", () => {
    const [change] = detectRsfChange(new Decimal("9500"), new Decimal("10200"));
    expect(change?.change_type).toBe(DenominatorChangeType.RSF_REMEASUREMENT);
    // Python: f"Total rentable square footage increased by {abs(delta):,.0f} RSF"
    // delta = 700; abs(700):,.0f = "700"
    expect(change?.description).toBe(
      "Total rentable square footage increased by 700 RSF",
    );
    expect(change?.prior_value).toBe("9,500 RSF");
    expect(change?.current_value).toBe("10,200 RSF");
    // Python: f"Total RSF increased by {abs(pct)}%, affecting all..."
    // pct = (700/9500*100).quantize("0.01", HALF_UP) = 7.37%
    expect(change?.impact_description).toBe(
      "Total RSF increased by 7.37%, affecting all tenant pro-rata share calculations",
    );
  });

  it("decrease: correct direction word", () => {
    const [change] = detectRsfChange(new Decimal("10000"), new Decimal("9500"));
    expect(change?.description).toContain("decreased");
    expect(change?.impact_description).toContain("decreased");
  });

  it("ROUND_HALF_UP: 5.005% rounds to 5.01% (not 5.00% HALF_EVEN)", () => {
    // delta=500.5, prior=10000 → 500.5/10000*100 = 5.005 → ROUND_HALF_UP → 5.01
    const [change] = detectRsfChange(
      new Decimal("10000"),
      new Decimal("10500.5"),
    );
    expect(change?.impact_description).toContain("5.01%");
  });
});

describe("detectTenantRosterChanges", () => {
  it("tenant added: description matches Python f-string", () => {
    // Use snapshots to build maps
    const priorMap = extractDenominatorComponents([]);
    const currMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, {
        tenantName: "Beta LLC",
        rsf: "2000",
        proRataShare: "0.20",
      }),
    ]);

    const changes = detectTenantRosterChanges(priorMap, currMap);
    expect(changes).toHaveLength(1);
    const c = changes[0]!;
    expect(c.change_type).toBe(DenominatorChangeType.TENANT_ADDED);
    // Python: f"{name} added to property ({rsf:,.0f} RSF, {share*100:.2f}% share)"
    expect(c.description).toBe(
      "Beta LLC added to property (2,000 RSF, 20.00% share)",
    );
    expect(c.prior_value).toBe("Not present");
    expect(c.current_value).toBe("Beta LLC - 2,000 RSF");
  });

  it("tenant removed: description matches Python f-string", () => {
    const priorMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, {
        tenantName: "Gamma Inc",
        rsf: "1500",
        proRataShare: "0.15",
      }),
    ]);
    const currMap = extractDenominatorComponents([]);

    const changes = detectTenantRosterChanges(priorMap, currMap);
    const c = changes[0]!;
    expect(c.change_type).toBe(DenominatorChangeType.TENANT_REMOVED);
    expect(c.description).toBe(
      "Gamma Inc removed from property (1,500 RSF, 15.00% share)",
    );
    expect(c.current_value).toBe("Not present");
  });
});

describe("detectExclusionChanges", () => {
  it("added and removed pools produce correct description", () => {
    const priorMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, {
        tenantName: "Alpha Corp",
        excludedPools: ["Parking"],
      }),
    ]);
    const currMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, {
        tenantName: "Alpha Corp",
        excludedPools: ["Security", "Utilities"],
      }),
    ]);

    const changes = detectExclusionChanges(priorMap, currMap);
    expect(changes).toHaveLength(1);
    const c = changes[0]!;
    expect(c.change_type).toBe(DenominatorChangeType.EXCLUSION_CHANGE);
    // "now excludes Security, Utilities; no longer excludes Parking"
    expect(c.description).toContain("now excludes Security, Utilities");
    expect(c.description).toContain("no longer excludes Parking");
    // Prior sorted: "Parking"; Current sorted: "Security, Utilities"
    expect(c.prior_value).toBe("Parking");
    expect(c.current_value).toBe("Security, Utilities");
  });

  it("no change when excluded_pools identical", () => {
    const priorMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, { excludedPools: ["Parking"] }),
    ]);
    const currMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, { excludedPools: ["Parking"] }),
    ]);
    expect(detectExclusionChanges(priorMap, currMap)).toHaveLength(0);
  });
});

describe("detectBomaStandardChanges", () => {
  it("detects BOMA transition byte-for-byte", () => {
    const priorMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, { bomaStandard: "BOMA 1996" }),
    ]);
    const currMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, { bomaStandard: "BOMA 2017" }),
    ]);
    const changes = detectBomaStandardChanges(priorMap, currMap);
    expect(changes).toHaveLength(1);
    const c = changes[0]!;
    expect(c.description).toBe(
      "BOMA measurement standard changed from BOMA 1996 to BOMA 2017",
    );
    expect(c.prior_value).toBe("BOMA 1996");
    expect(c.current_value).toBe("BOMA 2017");
  });

  it("deduplicates identical transitions across multiple leases", () => {
    const priorMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, { bomaStandard: "BOMA 1996" }),
      makeSnapshot(LEASE_B, { bomaStandard: "BOMA 1996" }),
    ]);
    const currMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, { bomaStandard: "BOMA 2017" }),
      makeSnapshot(LEASE_B, { bomaStandard: "BOMA 2017" }),
    ]);
    // Same transition "BOMA 1996 → BOMA 2017" for both leases → deduplicated to 1
    expect(detectBomaStandardChanges(priorMap, currMap)).toHaveLength(1);
  });

  it("no change when standard is unchanged", () => {
    const priorMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, { bomaStandard: "BOMA 2017" }),
    ]);
    const currMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, { bomaStandard: "BOMA 2017" }),
    ]);
    expect(detectBomaStandardChanges(priorMap, currMap)).toHaveLength(0);
  });
});

describe("detectShareRecalculations", () => {
  it("share change description matches Python f-string", () => {
    const priorMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, {
        tenantName: "Alpha Corp",
        proRataShare: "0.25",
      }),
    ]);
    const currMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, {
        tenantName: "Alpha Corp",
        proRataShare: "0.30",
      }),
    ]);
    const changes = detectShareRecalculations(priorMap, currMap);
    expect(changes).toHaveLength(1);
    const c = changes[0]!;
    expect(c.change_type).toBe(DenominatorChangeType.SHARE_RECALCULATION);
    // Python: f"{name} pro-rata share changed from {prior*100:.2f}% to {curr*100:.2f}% ({delta:+.2f} pct points)"
    expect(c.description).toBe(
      "Alpha Corp pro-rata share changed from 25.00% to 30.00% (+5.00 pct points)",
    );
    expect(c.prior_value).toBe("25.00%");
    expect(c.current_value).toBe("30.00%");
    expect(c.impact_description).toContain("increased");
  });

  it("negative delta shows minus sign", () => {
    const priorMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, { proRataShare: "0.30" }),
    ]);
    const currMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, { proRataShare: "0.25" }),
    ]);
    const changes = detectShareRecalculations(priorMap, currMap);
    expect(changes[0]?.description).toContain("-5.00 pct points");
    expect(changes[0]?.impact_description).toContain("decreased");
  });
});

describe("calculateTenantImpacts", () => {
  it("produces impact for tenant with share+recovery change", () => {
    const priorMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, {
        tenantName: "Alpha Corp",
        proRataShare: "0.25",
        totalRecovery: "1000.00",
      }),
    ]);
    const currMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, {
        tenantName: "Alpha Corp",
        proRataShare: "0.30",
        totalRecovery: "1500.00",
      }),
    ]);
    const changes = detectShareRecalculations(priorMap, currMap);
    const impacts = calculateTenantImpacts(priorMap, currMap, changes);

    expect(impacts).toHaveLength(1);
    const imp = impacts[0]!;
    expect(imp.tenant_name).toBe("Alpha Corp");
    expect(imp.share_delta_pct_points.toFixed(2)).toBe("5.00");
    expect(imp.recovery_delta.toFixed(2)).toBe("500.00");
    expect(imp.contributing_changes).toContain(
      DenominatorChangeType.SHARE_RECALCULATION,
    );
  });

  it("skips new tenants (no prior) and unchanged tenants", () => {
    const priorMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, { totalRecovery: "1000.00", proRataShare: "0.25" }),
    ]);
    const currMap = extractDenominatorComponents([
      // LEASE_A unchanged
      makeSnapshot(LEASE_A, { totalRecovery: "1000.00", proRataShare: "0.25" }),
      // LEASE_B new (no prior)
      makeSnapshot(LEASE_B, {
        tenantName: "New Tenant",
        totalRecovery: "500.00",
        proRataShare: "0.10",
      }),
    ]);
    const impacts = calculateTenantImpacts(priorMap, currMap, []);
    expect(impacts).toHaveLength(0);
  });

  it("share_delta_pct_points uses ROUND_HALF_UP", () => {
    // delta = 0.00005 * 100 = 0.005 → ROUND_HALF_UP → 0.01
    const priorMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, {
        proRataShare: "0.25000",
        totalRecovery: "999.995",
      }),
    ]);
    const currMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, {
        proRataShare: "0.25005",
        totalRecovery: "1000.00",
      }),
    ]);
    const impacts = calculateTenantImpacts(priorMap, currMap, []);
    expect(impacts[0]?.share_delta_pct_points.toFixed(2)).toBe("0.01");
  });
});

describe("generateSummary", () => {
  it("no-changes case matches Python exactly", () => {
    const summary = generateSummary(
      new Decimal("10000"),
      new Decimal("10000"),
      new Decimal("0"),
      [],
      [],
    );
    expect(summary).toBe("No denominator changes detected between periods.");
  });

  it("RSF change + 1 change + 1 tenant", () => {
    const summary = generateSummary(
      new Decimal("9500"),
      new Decimal("10200"),
      new Decimal("7.37"),
      [
        {
          change_type: DenominatorChangeType.RSF_REMEASUREMENT,
          description: "",
          prior_value: "",
          current_value: "",
          impact_description: "",
        },
      ],
      [
        {
          lease_id: LEASE_A,
          tenant_name: "T",
          prior_pro_rata_share: new Decimal("0.25"),
          current_pro_rata_share: new Decimal("0.30"),
          share_delta_pct_points: new Decimal("5"),
          prior_estimated_recovery: new Decimal("1000"),
          current_estimated_recovery: new Decimal("1500"),
          recovery_delta: new Decimal("500"),
          contributing_changes: [],
        },
      ],
    );
    // Python: "Total RSF changed from 9,500 to 10,200 (7.37% increase). 1 denominator change detected. 1 tenant affected."
    expect(summary).toBe(
      "Total RSF changed from 9,500 to 10,200 (7.37% increase). 1 denominator change detected. 1 tenant affected.",
    );
  });

  it("plural: 2 changes, 2 tenants", () => {
    const changes = [
      {
        change_type: DenominatorChangeType.RSF_REMEASUREMENT,
        description: "",
        prior_value: "",
        current_value: "",
        impact_description: "",
      },
      {
        change_type: DenominatorChangeType.TENANT_ADDED,
        description: "",
        prior_value: "",
        current_value: "",
        impact_description: "",
      },
    ];
    const impacts = [
      {
        lease_id: LEASE_A,
        tenant_name: "A",
        prior_pro_rata_share: new Decimal("0"),
        current_pro_rata_share: new Decimal("0.1"),
        share_delta_pct_points: new Decimal("10"),
        prior_estimated_recovery: new Decimal("0"),
        current_estimated_recovery: new Decimal("100"),
        recovery_delta: new Decimal("100"),
        contributing_changes: [],
      },
      {
        lease_id: LEASE_B,
        tenant_name: "B",
        prior_pro_rata_share: new Decimal("0"),
        current_pro_rata_share: new Decimal("0.1"),
        share_delta_pct_points: new Decimal("10"),
        prior_estimated_recovery: new Decimal("0"),
        current_estimated_recovery: new Decimal("100"),
        recovery_delta: new Decimal("100"),
        contributing_changes: [],
      },
    ];
    const summary = generateSummary(
      new Decimal("10000"),
      new Decimal("10000"),
      new Decimal("0"),
      changes,
      impacts,
    );
    expect(summary).toContain("2 denominator changes detected.");
    expect(summary).toContain("2 tenants affected.");
  });
});

// ── Finding 6 regression tests: trailing-zero pct and ROUND_HALF_EVEN display ──

describe("EP-18 display-format parity regressions (Finding 6)", () => {
  /**
   * (a) Exact 5% RSF change: pct is already quantized to 2dp via ROUND_HALF_UP in
   * the arithmetic path, so the display must preserve trailing zeros: "5.00%",
   * not "5%". Covers both impact_description and the summary sentence.
   */
  it("(a) 5% RSF change emits '5.00%' in impact_description and summary", () => {
    // 10000 → 10500 = exactly 5.00%
    const priorRsf = new Decimal("10000");
    const currentRsf = new Decimal("10500");

    const changes = detectRsfChange(priorRsf, currentRsf);
    expect(changes).toHaveLength(1);
    const c = changes[0]!;

    // impact_description must end with "5.00%..."
    expect(c.impact_description).toContain("5.00%");
    // Confirm the exact suffix from the Python template
    expect(c.impact_description).toBe(
      "Total RSF increased by 5.00%, affecting all tenant pro-rata share calculations",
    );

    // summary must render "(5.00% increase)"
    const rsf_delta_percent = currentRsf
      .minus(priorRsf)
      .div(priorRsf)
      .times(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const summary = generateSummary(
      priorRsf,
      currentRsf,
      rsf_delta_percent,
      changes,
      [],
    );
    expect(summary).toContain("(5.00% increase)");
  });

  /**
   * (b) HALF_EVEN for :.2f — a share ratio whose ×100 lands exactly on a half-cent
   * at the 3rd decimal (12.265) must round to 12.26 (banker's rounding, ties-to-even),
   * not 12.27 (ROUND_HALF_UP).
   *
   * We verify via the detectShareRecalculations description which calls fmtPct2 on
   * the share ratio. Share = 0.12265 → ×100 = 12.265 → HALF_EVEN → 12.26.
   */
  it("(b) share ×100 = 12.265 formats to '12.26' (ROUND_HALF_EVEN, not 12.27)", () => {
    const priorMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, {
        tenantName: "Half-Even Corp",
        proRataShare: "0.10",
        totalRecovery: "1000.00",
      }),
    ]);
    // current share = 0.12265 → ×100 = 12.265 → HALF_EVEN rounds to 12.26
    const currMap = extractDenominatorComponents([
      makeSnapshot(LEASE_A, {
        tenantName: "Half-Even Corp",
        proRataShare: "0.12265",
        totalRecovery: "1226.50",
      }),
    ]);
    const changes = detectShareRecalculations(priorMap, currMap);
    expect(changes).toHaveLength(1);
    const c = changes[0]!;
    // current share display: "12.26%" (HALF_EVEN) not "12.27%" (HALF_UP)
    expect(c.current_value).toBe("12.26%");
    // description must also show "12.26%"
    expect(c.description).toContain("12.26%");
    expect(c.description).not.toContain("12.27%");
  });

  /**
   * (c) HALF_EVEN for :,.0f — an RSF value of 2500.5 must format to "2,500"
   * (banker's rounding, 0 is even), not "2,501" (ROUND_HALF_UP).
   * We drive this through detectRsfChange whose description uses fmtThousands.
   */
  it("(c) RSF 2500.5 formats to '2,500' via :,.0f ROUND_HALF_EVEN (not 2,501)", () => {
    // prior = 2500.5, current = 3000 — we test the prior_value display
    const priorRsf = new Decimal("2500.5");
    const currentRsf = new Decimal("3000");

    const changes = detectRsfChange(priorRsf, currentRsf);
    expect(changes).toHaveLength(1);
    const c = changes[0]!;

    // prior_value is formatted via fmtRsf → fmtThousands → :,.0f
    // 2500.5 with HALF_EVEN rounds to 2500 (0 is even)
    expect(c.prior_value).toBe("2,500 RSF");
    // must NOT round up to 2,501
    expect(c.prior_value).not.toBe("2,501 RSF");
  });
});

// ── Period date formatting (human-facing dates in the PDF body) ────────────────

// Extract readable text from a pdf-lib document. pdf-lib FlateDecodes content
// streams and emits one `<hex> Tj` show per drawText call, so decoding the hex
// back to latin1 reconstructs each drawn line. (Same helper the statement,
// historical, and demand-letter PDF tests use.)
function extractPdfStreamText(bytes: Uint8Array): string {
  const source = Buffer.from(bytes);
  const streamMarker = Buffer.from("stream");
  const endMarker = Buffer.from("endstream");
  let output = "";
  let offset = 0;

  while (offset < source.length) {
    const streamStart = source.indexOf(streamMarker, offset);
    if (streamStart === -1) break;

    let dataStart = streamStart + streamMarker.length;
    if (source[dataStart] === 0x0d && source[dataStart + 1] === 0x0a) {
      dataStart += 2;
    } else if (source[dataStart] === 0x0a) {
      dataStart += 1;
    }

    const streamEnd = source.indexOf(endMarker, dataStart);
    if (streamEnd === -1) break;

    let dataEnd = streamEnd;
    if (source[dataEnd - 2] === 0x0d && source[dataEnd - 1] === 0x0a) {
      dataEnd -= 2;
    } else if (source[dataEnd - 1] === 0x0a) {
      dataEnd -= 1;
    }

    const stream = source.subarray(dataStart, dataEnd);
    try {
      output += decodePdfTextOperators(
        Buffer.from(unzlibSync(stream)).toString("latin1"),
      );
    } catch {
      output += decodePdfTextOperators(stream.toString("latin1"));
    }
    output += "\n";
    offset = streamEnd + endMarker.length;
  }

  return output;
}

function decodePdfTextOperators(value: string): string {
  return value.replace(/<([0-9A-Fa-f]+)>\s*Tj/gu, (_match, hex: string) =>
    Buffer.from(hex, "hex").toString("latin1"),
  );
}

describe("formatPeriodLabel", () => {
  it("reformats both ISO bounds of a 'X to Y' period to friendly dates", () => {
    expect(formatPeriodLabel("2023-01-01 to 2023-12-31")).toBe(
      "January 1, 2023 to December 31, 2023",
    );
  });

  it("returns an empty string unchanged (empty prior period)", () => {
    expect(formatPeriodLabel("")).toBe("");
  });

  it("leaves a non-ISO bound unchanged while formatting the ISO one", () => {
    // formatDate passes through non-ISO parts, so a partial value is safe.
    expect(formatPeriodLabel("2024-01-01 to pending")).toBe(
      "January 1, 2024 to pending",
    );
  });
});

describe("buildDenominatorChangePdf period dates", () => {
  // Minimal report with ISO period bounds and a fixed generated_at.
  const REPORT: DenominatorChangeReport = {
    property_id: PROPERTY_ID,
    property_name: "Test Tower",
    prior_period: "2023-01-01 to 2023-12-31",
    current_period: "2024-01-01 to 2024-12-31",
    prior_total_rsf: new Decimal("9500"),
    current_total_rsf: new Decimal("10200"),
    rsf_delta: new Decimal("700"),
    rsf_delta_percent: new Decimal("7.37"),
    changes: [],
    tenant_impacts: [],
    summary: "No denominator changes detected between periods.",
    generated_at: new Date("2024-06-13T14:30:00Z"),
  };

  it("draws friendly period dates, never the raw ISO bounds", async () => {
    const bytes = await buildDenominatorChangePdf(REPORT);
    const text = extractPdfStreamText(bytes);

    // Both period fields render as "Month D, YYYY to Month D, YYYY".
    expect(text).toContain("January 1, 2023 to December 31, 2023");
    expect(text).toContain("January 1, 2024 to December 31, 2024");

    // The raw ISO period bounds must NOT survive into the human-facing text.
    // (The "Generated" timestamp keeps its YYYY-MM-DD HH:MM machine form by
    // design, so we assert against the specific period bounds, not all ISO.)
    expect(text).not.toContain("2023-01-01");
    expect(text).not.toContain("2023-12-31");
    expect(text).not.toContain("2024-01-01");
    expect(text).not.toContain("2024-12-31");
  });
});
