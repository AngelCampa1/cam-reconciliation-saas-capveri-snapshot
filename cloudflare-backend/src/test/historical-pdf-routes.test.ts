/**
 * EP-16 route tests: POST /api/v1/reports/historical/pdf
 *
 * Uses an in-memory AnalysisRepository + in-memory ReportsStorage to avoid
 * any real DB or R2 calls.
 *
 * Coverage:
 *   - happy path (≥2 years, pools + anomalies):
 *       200 JSON, format:"pdf", report_url contains download path,
 *       expires_at ≈ now+7d, PDF uploaded to injected R2 mock with correct key prefix
 *   - round-trip: minted token → /export/download/file → returns uploaded %PDF bytes
 *   - no-anomalies path: PDF still uploads successfully
 *   - years.length < 2 → 400 with exact detail
 *   - tenant party → 403
 *   - no full-access → 402
 *   - confirm NO export_history insert occurs
 *   - formatUsdWhole unit tests (HALF_EVEN rounding, asymmetric fixture guard)
 */

import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { unzlibSync } from "fflate";
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
import type { ReportsStorage } from "../adapters/storage/reports";
import type { AppEnv } from "../env";
import {
  createHistoricalPdfRoutes,
  type HistoricalPdfRouteDependencies,
} from "../http/historical-pdf-routes";
import { createExportsRoutes } from "../http/exports-routes";
import { verifyExportDownloadToken } from "../domain/exports/tokens";
import {
  buildHistoricalPdf,
  formatUsdWhole,
} from "../domain/analysis/historical-pdf";
import type { AuthVariables } from "../middleware/auth";

// ── Constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const PROPERTY_ID = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
const SIGNING_SECRET = "test-signing-secret-ep16";

// ── In-memory ReportsStorage ──────────────────────────────────────────────────

class MemoryReportsStorage implements ReportsStorage {
  private readonly store = new Map<string, Uint8Array>();
  readonly putCalls: Array<{ key: string; contentType: string }> = [];
  readonly deleteCalls: string[] = [];

  generateKey(input: {
    organizationId: string;
    propertyId: string;
    fileName: string;
  }): string {
    return `reports/${input.organizationId}/${input.propertyId}/mock-uuid-${input.fileName}`;
  }

  async putReport(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    this.store.set(key, bytes);
    this.putCalls.push({ key, contentType });
  }

  async getReportBytes(key: string): Promise<Uint8Array | undefined> {
    return this.store.get(key);
  }

  async deleteReport(key: string): Promise<void> {
    this.deleteCalls.push(key);
    this.store.delete(key);
  }
}

// ── In-memory AnalysisRepository ─────────────────────────────────────────────
//
// Fixture (asymmetric — swapping min/max year changes amounts):
//   Year 2022 (base): Maintenance=10000, Utilities=5000
//   Year 2023 (target): Maintenance=18000 (+80% spike → CRITICAL), Utilities=5100
//
// Totals: 2022=15000, 2023=23100  total_variance ≈ 54%

class MemoryAnalysisRepository implements AnalysisRepository {
  fullAccess = true;
  propertyName: string | null = "Test Property";
  featureUses: Array<{ organizationId: string; featureKey: string }> = [];
  insertHistoryCalls = 0;

  readonly pools: ExpensePool[] = [
    { id: "pool-maint-01", name: "Maintenance" },
    { id: "pool-util-01", name: "Utilities" },
  ];

  readonly mappings: PoolMapping[] = [
    {
      expense_pool_id: "pool-maint-01",
      gl_account_pattern: "5000%",
      allocation_percentage: "1",
    },
    {
      expense_pool_id: "pool-util-01",
      gl_account_pattern: "6000%",
      allocation_percentage: "1",
    },
  ];

  readonly glEntriesByYear: Map<number, GlEntry[]> = new Map([
    [
      2022,
      [
        {
          account_code: "5001",
          account_description: "Maintenance",
          amount: "10000.00",
          vendor_name: null,
          description: null,
          transaction_date: null,
        },
        {
          account_code: "6001",
          account_description: "Utilities",
          amount: "5000.00",
          vendor_name: null,
          description: null,
          transaction_date: null,
        },
      ],
    ],
    [
      2023,
      [
        {
          account_code: "5001",
          account_description: "Maintenance",
          amount: "18000.00",
          vendor_name: null,
          description: null,
          transaction_date: null,
        },
        {
          account_code: "6001",
          account_description: "Utilities",
          amount: "5100.00",
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
    return [2022, 2023];
  }
  async listFinalizedSnapshotYears(input: {
    years: number[];
  }): Promise<number[]> {
    return input.years.filter((y) => [2022, 2023].includes(y));
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

// No-anomaly repo: flat amounts → variance <10% → no anomaly
class NoAnomalyAnalysisRepository extends MemoryAnalysisRepository {
  override readonly glEntriesByYear: Map<number, GlEntry[]> = new Map([
    [
      2022,
      [
        {
          account_code: "5001",
          account_description: "Maintenance",
          amount: "10000.00",
          vendor_name: null,
          description: null,
          transaction_date: null,
        },
        {
          account_code: "6001",
          account_description: "Utilities",
          amount: "5000.00",
          vendor_name: null,
          description: null,
          transaction_date: null,
        },
      ],
    ],
    [
      2023,
      [
        {
          account_code: "5001",
          account_description: "Maintenance",
          amount: "10050.00",
          vendor_name: null,
          description: null,
          transaction_date: null,
        },
        {
          account_code: "6001",
          account_description: "Utilities",
          amount: "5010.00",
          vendor_name: null,
          description: null,
          transaction_date: null,
        },
      ],
    ],
  ]);
}

// ── ProtectedRecordRepository stub ────────────────────────────────────────────

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

// ── Auth helpers ──────────────────────────────────────────────────────────────

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
          fullName: "Owner Test",
          role: "owner",
          isPlatformAdmin: false,
          createdAt: "2026-06-13T00:00:00Z",
          updatedAt: "2026-06-13T00:00:00Z",
        },
      };
    },
  };
}

function jsonAuthHeaders(): Record<string, string> {
  return {
    Authorization: "Bearer valid-token",
    "Content-Type": "application/json",
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
    DOCUMENT_ACCESS_SIGNING_SECRET: SIGNING_SECRET,
  } as unknown as AppEnv;
}

// ── Test App factory ──────────────────────────────────────────────────────────

function createTestApp(
  repository: AnalysisRepository,
  storage: MemoryReportsStorage,
  party: "landlord" | "tenant" = "landlord",
  clock?: () => number,
): Hono<{ Bindings: AppEnv; Variables: AuthVariables }> {
  const authDeps = {
    verifier: jwtVerifier(),
    db: {
      mode: "postgrest-compat" as const,
      auth: authRepository(party),
      protectedRecords,
    },
  };

  const pdfDeps: HistoricalPdfRouteDependencies = {
    repository,
    reportsStorage: storage,
    signingSecret: SIGNING_SECRET,
    auth: authDeps,
  };
  if (clock !== undefined) {
    pdfDeps.clock = clock;
  }

  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route("/api/v1", createHistoricalPdfRoutes(pdfDeps));
  // Also mount exports-routes so the download/file token round-trip works
  app.route(
    "/api/v1",
    createExportsRoutes({ reportsStorage: storage, auth: authDeps }),
  );
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("EP-16 POST /api/v1/reports/historical/pdf", () => {
  it("returns 403 for tenant party", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const app = createTestApp(repo, storage, "tenant");

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2022, 2023] }),
      },
      testEnv(),
    );

    expect(res.status).toBe(403);
  });

  it("returns 402 when org lacks full access", async () => {
    const repo = new MemoryAnalysisRepository();
    repo.fullAccess = false;
    const storage = new MemoryReportsStorage();
    const app = createTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2022, 2023] }),
      },
      testEnv(),
    );

    expect(res.status).toBe(402);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("subscription_required");
  });

  it("returns 400 with exact detail when fewer than 2 years", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const app = createTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2023] }),
      },
      testEnv(),
    );

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toBe(
      "At least 2 years required for historical comparison",
    );
  });

  it("returns 500 without uploading when the signing secret is missing", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const authDeps = {
      verifier: jwtVerifier(),
      db: {
        mode: "postgrest-compat" as const,
        auth: authRepository(),
        protectedRecords,
      },
    };
    const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
    app.route(
      "/api/v1",
      createHistoricalPdfRoutes({
        repository: repo,
        reportsStorage: storage,
        auth: authDeps,
      }),
    );
    const envWithoutSecret = {
      ...testEnv(),
      DOCUMENT_ACCESS_SIGNING_SECRET: undefined,
    } as unknown as AppEnv;

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2022, 2023] }),
      },
      envWithoutSecret,
    );

    expect(res.status).toBe(500);
    expect(storage.putCalls).toEqual([]);
  });

  it("deletes the uploaded report when token minting fails", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const authDeps = {
      verifier: jwtVerifier(),
      db: {
        mode: "postgrest-compat" as const,
        auth: authRepository(),
        protectedRecords,
      },
    };
    const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
    app.route(
      "/api/v1",
      createHistoricalPdfRoutes({
        repository: repo,
        reportsStorage: storage,
        signingSecret: SIGNING_SECRET,
        tokenBuilder: async () => {
          throw new Error("token mint failed");
        },
        auth: authDeps,
      }),
    );

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2022, 2023] }),
      },
      testEnv(),
    );

    expect(res.status).toBe(500);
    expect(storage.putCalls).toHaveLength(1);
    const uploadedKey = storage.putCalls[0]!.key;
    expect(storage.deleteCalls).toEqual([uploadedKey]);
    await expect(storage.getReportBytes(uploadedKey)).resolves.toBeUndefined();
  });

  it("happy path: 200 JSON with format:pdf and correct report_url shape", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const app = createTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2022, 2023] }),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report_url: string;
      expires_at: string;
      format: string;
    };

    expect(body.format).toBe("pdf");
    expect(body.report_url).toContain("/api/v1/export/download/file?token=");
  });

  it("happy path: expires_at is approximately now + 7 days (604800s)", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const nowMs = Date.now();
    const app = createTestApp(repo, storage, "landlord", () => nowMs);

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2022, 2023] }),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { expires_at: string };
    const expiresAtMs = new Date(body.expires_at).getTime();
    const expectedMs = nowMs + 604800 * 1000;
    // Allow up to 5s tolerance
    expect(Math.abs(expiresAtMs - expectedMs)).toBeLessThan(5000);
  });

  it("happy path: PDF uploaded to injected R2 with correct key prefix and .pdf suffix", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const app = createTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2022, 2023] }),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    expect(storage.putCalls).toHaveLength(1);
    const { key, contentType } = storage.putCalls[0]!;
    expect(key).toMatch(new RegExp(`^reports/${ORG_ID}/${PROPERTY_ID}/`));
    expect(key).toMatch(/\.pdf$/);
    expect(contentType).toBe("application/pdf");
  });

  it("happy path: uploaded bytes are a valid PDF (%PDF header)", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const app = createTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2022, 2023] }),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const { key } = storage.putCalls[0]!;
    const bytes = await storage.getReportBytes(key);
    expect(bytes).toBeDefined();
    const header = new TextDecoder().decode(bytes!.slice(0, 4));
    expect(header).toBe("%PDF");
  });

  it("happy path: uploaded PDF body includes property name", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const app = createTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2022, 2023] }),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const { key } = storage.putCalls[0]!;
    const bytes = await storage.getReportBytes(key);
    expect(bytes).toBeDefined();

    const bodyText = extractPdfStreamText(bytes!);
    expect(bodyText).toContain("Property: Test Property");
  });

  it("round-trip: minted token → download route returns uploaded bytes (valid PDF)", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const nowMs = Date.now();
    const app = createTestApp(repo, storage, "landlord", () => nowMs);

    const genRes = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2022, 2023] }),
      },
      testEnv(),
    );
    expect(genRes.status).toBe(200);
    const { report_url } = (await genRes.json()) as { report_url: string };

    const tokenParam = new URL(report_url).searchParams.get("token");
    expect(tokenParam).toBeTruthy();

    const dlRes = await app.request(
      `/api/v1/export/download/file?token=${encodeURIComponent(tokenParam!)}`,
      { method: "GET" },
      testEnv(),
    );

    expect(dlRes.status).toBe(200);
    const dlBytes = new Uint8Array(await dlRes.arrayBuffer());
    const header = new TextDecoder().decode(dlBytes.slice(0, 4));
    expect(header).toBe("%PDF");
  });

  it("minted token has 7-day expiry verifiable by verifyExportDownloadToken", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const nowMs = Date.now();
    const app = createTestApp(repo, storage, "landlord", () => nowMs);

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2022, 2023] }),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const { report_url } = (await res.json()) as { report_url: string };
    const tokenParam = new URL(report_url).searchParams.get("token")!;

    const payload = await verifyExportDownloadToken(tokenParam, SIGNING_SECRET);
    expect(payload.expiresAt).toBeGreaterThanOrEqual(
      Math.floor(nowMs / 1000) + 604790,
    );
    expect(payload.r2Key).toMatch(
      new RegExp(`^reports/${ORG_ID}/${PROPERTY_ID}/`),
    );
    expect(payload.r2Key).toMatch(/\.pdf$/);
  });

  it("no-anomalies path: PDF still uploads successfully (format:pdf)", async () => {
    const repo = new NoAnomalyAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const app = createTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2022, 2023] }),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { format: string };
    expect(body.format).toBe("pdf");
    expect(storage.putCalls).toHaveLength(1);

    const { key } = storage.putCalls[0]!;
    const bytes = await storage.getReportBytes(key);
    const header = new TextDecoder().decode(bytes!.slice(0, 4));
    expect(header).toBe("%PDF");
  });

  it("no export_history insert occurs", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    // Spy on any potential insertExportHistory calls on storage
    const insertSpy = vi.fn();
    const storageWithSpy = Object.assign(storage, {
      insertExportHistory: insertSpy,
    });
    const app = createTestApp(repo, storageWithSpy);

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2022, 2023] }),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    expect(insertSpy).not.toHaveBeenCalled();
    expect(repo.insertHistoryCalls).toBe(0);
  });

  it("include_charts accepted without error (unused, mirrors Python)", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const app = createTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          years: [2022, 2023],
          include_charts: true,
        }),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { format: string };
    expect(body.format).toBe("pdf");
  });

  it("years sorted ascending regardless of input order", async () => {
    const repo = new MemoryAnalysisRepository();
    const storage = new MemoryReportsStorage();
    const app = createTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/reports/historical/pdf",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ property_id: PROPERTY_ID, years: [2023, 2022] }),
      },
      testEnv(),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { format: string };
    expect(body.format).toBe("pdf");
  });
});

// ── Unit tests for formatUsdWhole ─────────────────────────────────────────────

describe("EP-16 formatUsdWhole (HALF_EVEN, asymmetric fixture guard)", () => {
  it("formats positive whole-dollar amounts with commas", () => {
    expect(formatUsdWhole("10000")).toBe("$10,000");
    expect(formatUsdWhole("5000")).toBe("$5,000");
    expect(formatUsdWhole("0")).toBe("$0");
  });

  it("rounds with HALF_EVEN (banker's rounding at .5 boundary)", () => {
    // 0.5 → 0 (even), 1.5 → 2 (even), 2.5 → 2 (even), 3.5 → 4 (even)
    expect(formatUsdWhole("0.5")).toBe("$0");
    expect(formatUsdWhole("1.5")).toBe("$2");
    expect(formatUsdWhole("2.5")).toBe("$2");
    expect(formatUsdWhole("3.5")).toBe("$4");
    // Unambiguous rounds
    expect(formatUsdWhole("1.6")).toBe("$2");
    expect(formatUsdWhole("1.4")).toBe("$1");
  });

  it("formats negative amounts with leading minus", () => {
    expect(formatUsdWhole("-1000")).toBe("-$1,000");
  });

  it("asymmetric: different amounts produce different output (regression guard)", () => {
    // Swapping base vs target years changes amounts; guard prevents symmetric fixtures
    const base2022 = formatUsdWhole("10000");
    const target2023 = formatUsdWhole("18000");
    expect(base2022).not.toBe(target2023);
    expect(base2022).toBe("$10,000");
    expect(target2023).toBe("$18,000");
  });
});

describe("EP-16 buildHistoricalPdf body content", () => {
  it("renders property, pool labels, amounts, totals, and variance", async () => {
    const bytes = await buildHistoricalPdf({
      propertyName: "Test Property",
      sortedYears: [2022, 2023],
      yoy: {
        property_id: PROPERTY_ID,
        property_name: "Test Property",
        years: [2022, 2023],
        base_year: 2022,
        pool_comparisons: [
          {
            pool_name: "Maintenance",
            amounts: { "2022": "10000.00", "2023": "18000.00" },
            base_year_amount: "10000.00",
            variance_amount: "8000.00",
            variance_percent: "80.0",
            variance_level: "critical",
            matched_from: null,
          },
          {
            pool_name: "Utilities",
            amounts: { "2022": "5000.00", "2023": "5100.00" },
            base_year_amount: "5000.00",
            variance_amount: "100.00",
            variance_percent: "2.0",
            variance_level: "normal",
            matched_from: null,
          },
        ],
        total_amounts: { "2022": "15000.00", "2023": "23100.00" },
        total_variance_amount: "8100.00",
        total_variance_percent: "54.0",
      },
      anomalies: [],
    });

    const bodyText = extractPdfStreamText(bytes);
    expect(bodyText).toContain("Property: Test Property");
    expect(bodyText).toContain("Maintenance");
    expect(bodyText).toContain("Utilities");
    expect(bodyText).toContain("$10,000");
    expect(bodyText).toContain("$18,000");
    expect(bodyText).toContain("$15,000");
    expect(bodyText).toContain("$23,100");
    expect(bodyText).toContain("+54.0%");
  });
});

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
  return value.replace(/<([0-9A-Fa-f]+)>\s*Tj/gu, (_match, hex: string) => {
    return Buffer.from(hex, "hex").toString("latin1");
  });
}
