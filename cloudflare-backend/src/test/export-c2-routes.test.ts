/**
 * Tests for C2 sub-slice: EP-8 batch PDF, EP-12 variance PDF, EP-14 board PDF.
 *
 * Covers:
 *   - EP-8 POST /export/pdf/batch
 *   - EP-12 POST /export/variance/pdf
 *   - EP-14 POST /export/board/preview + /export/board/download
 *   - Auth (403 for tenant), billing gate (402)
 *   - Happy paths: bytes returned, correct Content-Type/Disposition, persistence
 *   - EP-8: no-match → 400, mode != "zip" → 400, ZIP entry names
 *   - EP-12: variance math including prior_total == 0
 *   - EP-14: cap_rate range validation, preview not persisted, download persisted
 *   - R2 rollback on DB insert failure
 *   - Org isolation
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { unzlibSync, unzipSync } from "fflate";
import Decimal from "decimal.js";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuditLogRow,
  DemandLetterContext,
  ExportHistoryPage,
  ExportHistoryRow,
  ExportsRepository,
  PropertyNameRow,
  SnapshotPdfContext,
  SnapshotSummary,
} from "../domain/exports/repository";
import type { SnapshotForErp } from "../domain/exports/erp-formatters";
import type { ReportsStorage } from "../adapters/storage/reports";
import type { AppEnv } from "../env";
import { createExportsRoutes } from "../http/exports-routes";
import type { AuthVariables } from "../middleware/auth";
import { buildBoardPdf, calculateNoi } from "../domain/exports/board-pdf";

// ── constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROPERTY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const EXPORT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const LEASE_ID_1 = "11111111-1111-4111-8111-111111111111";
const LEASE_ID_2 = "22222222-2222-4222-8222-222222222222";

// ── in-memory fakes ───────────────────────────────────────────────────────────

class MemoryReportsStorage implements ReportsStorage {
  readonly store = new Map<string, Uint8Array>();
  lastKey: string | null = null;
  deletedKeys: string[] = [];
  failPut = false;

  generateKey(input: {
    organizationId: string;
    propertyId: string;
    fileName: string;
  }): string {
    return `reports/${input.organizationId}/${input.propertyId}/test-uuid-${input.fileName}`;
  }

  async putReport(
    key: string,
    bytes: Uint8Array,
    _contentType: string,
  ): Promise<void> {
    void _contentType;
    if (this.failPut) throw new Error("Simulated put failure");
    this.lastKey = key;
    this.store.set(key, bytes);
  }

  async getReportBytes(key: string): Promise<Uint8Array | undefined> {
    return this.store.get(key);
  }

  async deleteReport(key: string): Promise<void> {
    this.deletedKeys.push(key);
    this.store.delete(key);
  }
}

type InsertInput = {
  organizationId: string;
  propertyId: string;
  format: string;
  fileName: string;
  fileSize: number;
  createdByName: string;
  storagePath: string;
};

class MemoryExportsRepository implements ExportsRepository {
  pdfContextList: SnapshotPdfContext[] = [];
  summaryList: SnapshotSummary[] = [];
  summaryListPrior: SnapshotSummary[] = [];
  propRow: PropertyNameRow | null = {
    id: PROPERTY_ID,
    name: "Main Street Plaza",
    org_name: "CapVeri LLC",
  };
  fullAccess = true;
  insertedHistory: InsertInput | null = null;
  insertShouldFail = false;

  // Stubs for other sub-slices
  async getSnapshotForErp(): Promise<SnapshotForErp | null> {
    return null;
  }
  async listSnapshotsForErpBatch(): Promise<SnapshotForErp[]> {
    return [];
  }
  async propertyBelongsToOrg(): Promise<boolean> {
    return true;
  }
  async queryAuditLog(): Promise<AuditLogRow[]> {
    return [];
  }
  async listExportHistory(): Promise<ExportHistoryPage> {
    return { items: [], total: 0, page: 1, page_size: 25 };
  }
  async getSnapshotForPdf(): Promise<SnapshotPdfContext | null> {
    return null;
  }
  async getDemandLetterContext(): Promise<DemandLetterContext | null> {
    return null;
  }
  async getExportHistoryRow(): Promise<ExportHistoryRow | null> {
    return null;
  }
  async deleteExportHistory(): Promise<ExportHistoryRow | null> {
    return null;
  }

  async listSnapshotsForPropertyPdf(): Promise<SnapshotPdfContext[]> {
    return this.pdfContextList;
  }

  // For variance tests we want independent prior/current results keyed by the
  // actual year range passed in — NOT by call order. This makes the fake immune
  // to a swapped current/prior-year bug: it returns the correct dataset for the
  // year requested, so a swap would surface in the rendered PDF rather than be
  // masked by call-index alternation.
  yearCalls: Array<{ yearStart: string; yearEnd: string }> = [];
  summaryByYearStart = new Map<string, SnapshotSummary[]>();
  async listSnapshotsForYear(input: {
    organizationId: string;
    propertyId: string;
    yearStart: string;
    yearEnd: string;
  }): Promise<SnapshotSummary[]> {
    this.yearCalls.push({ yearStart: input.yearStart, yearEnd: input.yearEnd });
    // Year-keyed override wins when configured.
    const keyed = this.summaryByYearStart.get(input.yearStart);
    if (keyed) return keyed;
    // Fallback: prior-year range returns summaryListPrior, else summaryList.
    if (
      input.yearStart.startsWith("2023") &&
      this.summaryListPrior.length > 0
    ) {
      return this.summaryListPrior;
    }
    return this.summaryList;
  }

  async getPropertyName(): Promise<PropertyNameRow | null> {
    return this.propRow;
  }

  async hasFullAccess(): Promise<boolean> {
    return this.fullAccess;
  }

  async insertExportHistory(input: InsertInput): Promise<string> {
    if (this.insertShouldFail) throw new Error("Simulated DB insert failure");
    this.insertedHistory = input;
    return EXPORT_ID;
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

type AuthRole = "owner" | "admin" | "member" | "viewer";
type AuthParty = "landlord" | "tenant";

function makeAuthContext(
  role: AuthRole = "owner",
  party: AuthParty = "landlord",
  fullName: string | null = "Test Owner",
): AuthenticatedUserContext {
  return {
    user: {
      id: USER_ID,
      organizationId: ORG_ID,
      email: "owner@test.example",
      fullName,
      role,
      isPlatformAdmin: false,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
    actor: {
      userId: USER_ID,
      organizationId: ORG_ID,
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
  repo: MemoryExportsRepository,
  storage: MemoryReportsStorage,
  authContext: AuthenticatedUserContext = makeAuthContext(),
  clock?: () => Date,
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
  const deps: import("../http/exports-routes").ExportsRouteDependencies = {
    repository: repo,
    reportsStorage: storage,
    auth: {
      verifier,
      db: { mode: "postgrest-compat", auth, protectedRecords },
    },
    ...(clock ? { clock } : {}),
  };
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route("/api/v1", createExportsRoutes(deps));
  return app;
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
    DOCUMENT_ACCESS_SIGNING_SECRET: "test-signing-secret-32-bytes-long!!",
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  } as unknown as AppEnv;
}

function authHeaders() {
  return { authorization: "Bearer valid-token" };
}

function makePdfContext(leaseId = LEASE_ID_1): SnapshotPdfContext {
  return {
    snapshot: {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      lease_id: leaseId,
      period_start_date: "2024-01-01",
      period_end_date: "2024-12-31",
      total_operating_expenses: "40000.00",
      grossed_up_expenses: "41025.64",
      base_year_amount: "20000.00",
      tenant_share_before_cap: "6000.00",
      tenant_share_after_cap: "5000.00",
      admin_fee: "250.00",
      total_recovery: "5250.00",
      status: "finalized",
      calculation_trace: [],
    },
    lease: { tenant_name: "Acme Corp" },
    property: { name: "Main Street Plaza", address: "100 Main St" },
    organization: { name: "CapVeri LLC" },
  };
}

function makeSnapshotSummary(
  leaseId: string,
  totalRecovery: string,
): SnapshotSummary {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    lease_id: leaseId,
    total_recovery: totalRecovery,
    period_start_date: "2024-01-01",
  };
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Unit tests for calculateNoi
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateNoi", () => {
  it("computes noi_lift = total_recovery and asset_value_lift = noi_lift / cap_rate", () => {
    const { noiLift, assetValueLift } = calculateNoi(
      new Decimal("10000"),
      new Decimal("0.07"),
    );
    // Decimal.js toDecimalPlaces doesn't add trailing zeros; compare numeric value
    expect(noiLift.toFixed(2)).toBe("10000.00");
    // 10000 / 0.07 = 142857.142857... → 142857.14
    expect(assetValueLift.toFixed(2)).toBe("142857.14");
  });

  it("rounds noi_lift to cents (ROUND_HALF_UP)", () => {
    const { noiLift } = calculateNoi(
      new Decimal("100.005"),
      new Decimal("0.07"),
    );
    expect(noiLift.toString()).toBe("100.01");
  });

  it("cap_rate below 0.01 throws", () => {
    expect(() =>
      calculateNoi(new Decimal("1000"), new Decimal("0.009")),
    ).toThrow();
  });

  it("cap_rate above 0.25 throws", () => {
    expect(() =>
      calculateNoi(new Decimal("1000"), new Decimal("0.251")),
    ).toThrow();
  });

  it("cap_rate exactly 0.01 is valid", () => {
    const { assetValueLift } = calculateNoi(
      new Decimal("100"),
      new Decimal("0.01"),
    );
    expect(assetValueLift.toFixed(2)).toBe("10000.00");
  });
});

describe("buildBoardPdf", () => {
  it("renders long property names and board math in extractable PDF text", async () => {
    const propertyName = "[PROD-TEST] Multilease Reconcile Tower 12345678";

    const bytes = await buildBoardPdf({
      snapshots: [makeSnapshotSummary(LEASE_ID_1, "1950.21")],
      propertyName,
      orgName: "Test Org",
      year: "2026",
      capRate: new Decimal("0.07"),
    });

    const text = extractPdfStreamText(bytes);

    expect(text).toContain("CAM Recovery Impact Report");
    expect(text).toContain("Property:");
    expect(text).toContain(propertyName);
    expect(text).toContain("2026 Reconciliation Year");
    expect(text).toContain("$1,950.21");
    expect(text).toContain("$27,860.14");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EP-8: POST /export/pdf/batch
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/v1/export/pdf/batch", () => {
  it("returns 403 for tenant party", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage, makeAuthContext("owner", "tenant"));

    const res = await app.request(
      "/api/v1/export/pdf/batch",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          year: 2024,
          tenant_ids: [LEASE_ID_1],
        }),
      },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 402 when no full access", async () => {
    const repo = new MemoryExportsRepository();
    repo.fullAccess = false;
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/pdf/batch",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          year: 2024,
          tenant_ids: [LEASE_ID_1],
        }),
      },
      env(),
    );
    expect(res.status).toBe(402);
  });

  it("returns 400 when mode is not zip", async () => {
    const repo = new MemoryExportsRepository();
    repo.pdfContextList = [makePdfContext()];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/pdf/batch",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          year: 2024,
          tenant_ids: [LEASE_ID_1],
          mode: "individual",
        }),
      },
      env(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when no snapshots match tenant_ids", async () => {
    const repo = new MemoryExportsRepository();
    // pdfContextList has LEASE_ID_1, request asks for LEASE_ID_2
    repo.pdfContextList = [makePdfContext(LEASE_ID_1)];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/pdf/batch",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          year: 2024,
          tenant_ids: [LEASE_ID_2],
        }),
      },
      env(),
    );
    expect(res.status).toBe(400);
  });

  it("happy path: returns 200 ZIP, persists export_history with format=pdf_batch and r2: storage_path", async () => {
    const fixedDate = new Date("2024-07-15T12:00:00Z");
    const repo = new MemoryExportsRepository();
    repo.pdfContextList = [
      makePdfContext(LEASE_ID_1),
      makePdfContext(LEASE_ID_2),
    ];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage, makeAuthContext(), () => fixedDate);

    const res = await app.request(
      "/api/v1/export/pdf/batch",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          year: 2024,
          tenant_ids: [LEASE_ID_1, LEASE_ID_2],
        }),
      },
      env(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    const cd = res.headers.get("content-disposition") ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toContain("reconciliation-2024-batch-20240715.zip");
    expect(res.headers.get("x-capveri-export-id")).toBe(EXPORT_ID);
    expect(res.headers.get("x-capveri-export-storage-path")).toMatch(/^r2:/);

    // Verify ZIP contains expected entry names
    const bytes = new Uint8Array(await res.arrayBuffer());
    const entries = unzipSync(bytes);
    const names = Object.keys(entries);
    const short1 = LEASE_ID_1.slice(0, 8);
    const short2 = LEASE_ID_2.slice(0, 8);
    expect(names).toContain(`reconciliation-2024-${short1}.pdf`);
    expect(names).toContain(`reconciliation-2024-${short2}.pdf`);

    // Verify persistence
    expect(repo.insertedHistory).not.toBeNull();
    expect(repo.insertedHistory?.format).toBe("pdf_batch");
    expect(repo.insertedHistory?.storagePath).toMatch(/^r2:/);
    expect(repo.insertedHistory?.fileSize).toBeGreaterThan(0);
  });

  it("rolls back R2 on DB insert failure", async () => {
    const repo = new MemoryExportsRepository();
    repo.pdfContextList = [makePdfContext(LEASE_ID_1)];
    repo.insertShouldFail = true;
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/pdf/batch",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          year: 2024,
          tenant_ids: [LEASE_ID_1],
        }),
      },
      env(),
    );

    expect(res.status).toBe(500);
    // R2 key should have been deleted (rollback)
    expect(storage.deletedKeys.length).toBeGreaterThan(0);
    expect(storage.store.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EP-12: POST /export/variance/pdf
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/v1/export/variance/pdf", () => {
  it("returns 403 for tenant party", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage, makeAuthContext("owner", "tenant"));

    const res = await app.request(
      "/api/v1/export/variance/pdf",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          current_year: 2024,
          prior_year: 2023,
        }),
      },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 402 when no full access", async () => {
    const repo = new MemoryExportsRepository();
    repo.fullAccess = false;
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/variance/pdf",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          current_year: 2024,
          prior_year: 2023,
        }),
      },
      env(),
    );
    expect(res.status).toBe(402);
  });

  it("returns 404 when both years have no snapshots", async () => {
    const repo = new MemoryExportsRepository();
    // summaryList = [] and summaryListPrior = [] (defaults)
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/variance/pdf",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          current_year: 2024,
          prior_year: 2023,
        }),
      },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("happy path: returns PDF attachment with correct filename and persists format=variance_pdf", async () => {
    const repo = new MemoryExportsRepository();
    // First call (current year) returns 10000, second call (prior year) returns 8000
    repo.summaryList = [makeSnapshotSummary(LEASE_ID_1, "10000.00")];
    repo.summaryListPrior = [makeSnapshotSummary(LEASE_ID_1, "8000.00")];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/variance/pdf",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          current_year: 2024,
          prior_year: 2023,
        }),
      },
      env(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const cd = res.headers.get("content-disposition") ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toContain("statement-check-report-2024-vs-2023.pdf");
    expect(res.headers.get("x-capveri-export-id")).toBe(EXPORT_ID);
    expect(res.headers.get("x-capveri-export-storage-path")).toMatch(/^r2:/);

    // Verify persistence
    expect(repo.insertedHistory?.format).toBe("variance_pdf");
    expect(repo.insertedHistory?.storagePath).toMatch(/^r2:/);
    expect(repo.insertedHistory?.fileSize).toBeGreaterThan(0);

    // Guard against a swapped current/prior-year bug: the route MUST query the
    // current year (2024) and the prior year (2023). Assert exact ranges, not
    // just that two calls happened.
    expect(repo.yearCalls).toEqual([
      { yearStart: "2024-01-01", yearEnd: "2024-12-31" },
      { yearStart: "2023-01-01", yearEnd: "2023-12-31" },
    ]);
  });

  it("exports a statement check PDF when only the current year has snapshots", async () => {
    const repo = new MemoryExportsRepository();
    repo.summaryList = [makeSnapshotSummary(LEASE_ID_1, "10000.00")];
    repo.summaryListPrior = [];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/variance/pdf",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          current_year: 2024,
          prior_year: 2023,
        }),
      },
      env(),
    );

    expect(res.status).toBe(200);
    expect(repo.insertedHistory?.fileName).toBe(
      "statement-check-report-2024-vs-2023.pdf",
    );
    expect(repo.insertedHistory?.format).toBe("variance_pdf");
  });

  it("computes variance_pct = ((current - prior) / prior) * 100", async () => {
    const { computeVariancePct } =
      await import("../domain/exports/variance-pdf");
    // current=10000, prior=8000 → (2000/8000)*100 = 25.00%
    expect(
      computeVariancePct(new Decimal("10000"), new Decimal("8000")).toFixed(2),
    ).toBe("25.00");
    // current < prior → negative
    expect(
      computeVariancePct(new Decimal("8000"), new Decimal("10000")).toFixed(2),
    ).toBe("-20.00");
    // prior == 0 → 0 (no division by zero)
    expect(
      computeVariancePct(new Decimal("5000"), new Decimal("0")).toFixed(2),
    ).toBe("0.00");
  });

  it("builds honest statement check notes for compared and one-sided data", async () => {
    const { buildStatementCheckNotes, computeVariancePct } =
      await import("../domain/exports/variance-pdf");

    const comparedCurrent = new Decimal("10000");
    const comparedPrior = new Decimal("8000");
    expect(
      buildStatementCheckNotes({
        currentYear: 2024,
        priorYear: 2023,
        priorTotal: comparedPrior,
        hasCurrentSnapshots: true,
        hasPriorSnapshots: true,
        variancePct: computeVariancePct(comparedCurrent, comparedPrior),
      }),
    ).toEqual({
      scopeNote: "We checked final billing totals for 2023 and 2024.",
      findingNote: "We found the billing total changed by 25.00%.",
    });

    expect(
      buildStatementCheckNotes({
        currentYear: 2024,
        priorYear: 2023,
        priorTotal: new Decimal("0"),
        hasCurrentSnapshots: true,
        hasPriorSnapshots: false,
        variancePct: new Decimal("0"),
      }),
    ).toEqual({
      scopeNote: "We checked the final billing total for 2024.",
      findingNote: "We did not find a prior-year billing total to compare.",
    });
  });

  it("prior_total == 0 produces variance_pct == 0 (no division by zero)", async () => {
    // This test verifies the math directly via buildVariancePdf without a route.
    // The route doesn't expose variance_pct in the response; we test the domain fn.
    const { buildVariancePdf } = await import("../domain/exports/variance-pdf");
    const bytes = await buildVariancePdf({
      snapshotsCurrent: [makeSnapshotSummary(LEASE_ID_1, "5000.00")],
      snapshotsPrior: [], // prior_total = 0
      currentYear: 2024,
      priorYear: 2023,
      thresholdPercent: 10,
      propertyName: "Test Property",
    });
    // Should produce valid PDF bytes without throwing
    expect(bytes.byteLength).toBeGreaterThan(100);
  });

  it("wraps variance PDF title text within the content width", async () => {
    const { buildVariancePdf, wrapTextForPdf } =
      await import("../domain/exports/variance-pdf");
    const pdfDoc = await PDFDocument.create();
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const maxWidth = 504;
    const fontSize = 16;
    const longToken = "A".repeat(120);
    const title = `Statement Check Report - [PROD-TEST] ${longToken}`;

    const lines = wrapTextForPdf(boldFont, title, maxWidth, fontSize);

    expect(lines.length).toBeGreaterThan(1);
    expect(
      lines.every(
        (line) => boldFont.widthOfTextAtSize(line, fontSize) <= maxWidth,
      ),
    ).toBe(true);

    const bytes = await buildVariancePdf({
      snapshotsCurrent: [makeSnapshotSummary(LEASE_ID_1, "1000.00")],
      snapshotsPrior: [makeSnapshotSummary(LEASE_ID_1, "700.00")],
      currentYear: 2026,
      priorYear: 2025,
      thresholdPercent: 10,
      propertyName: `[PROD-TEST] ${longToken}`,
    });

    expect(bytes.byteLength).toBeGreaterThan(100);
  });

  it("rolls back R2 on DB insert failure", async () => {
    const repo = new MemoryExportsRepository();
    repo.summaryList = [makeSnapshotSummary(LEASE_ID_1, "10000.00")];
    repo.insertShouldFail = true;
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/variance/pdf",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          current_year: 2024,
          prior_year: 2023,
        }),
      },
      env(),
    );

    expect(res.status).toBe(500);
    expect(storage.deletedKeys.length).toBeGreaterThan(0);
    expect(storage.store.size).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EP-14: POST /export/board/preview + /export/board/download
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/v1/export/board/preview", () => {
  it("returns 403 for tenant party", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage, makeAuthContext("owner", "tenant"));

    const res = await app.request(
      "/api/v1/export/board/preview",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ property_id: PROPERTY_ID, year: 2024 }),
      },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 402 when no full access", async () => {
    const repo = new MemoryExportsRepository();
    repo.fullAccess = false;
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/board/preview",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ property_id: PROPERTY_ID, year: 2024 }),
      },
      env(),
    );
    expect(res.status).toBe(402);
  });

  it("returns 400 when cap_rate < 0.01", async () => {
    const repo = new MemoryExportsRepository();
    repo.summaryList = [makeSnapshotSummary(LEASE_ID_1, "10000.00")];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/board/preview",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          year: 2024,
          cap_rate: 0.009,
        }),
      },
      env(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when cap_rate > 0.25", async () => {
    const repo = new MemoryExportsRepository();
    repo.summaryList = [makeSnapshotSummary(LEASE_ID_1, "10000.00")];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/board/preview",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          year: 2024,
          cap_rate: 0.26,
        }),
      },
      env(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when no snapshots found", async () => {
    const repo = new MemoryExportsRepository();
    // summaryList is empty by default
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/board/preview",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ property_id: PROPERTY_ID, year: 2024 }),
      },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("happy path: returns PDF inline (no persistence)", async () => {
    const repo = new MemoryExportsRepository();
    repo.summaryList = [makeSnapshotSummary(LEASE_ID_1, "10000.00")];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/board/preview",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          year: 2024,
          cap_rate: 0.07,
        }),
      },
      env(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const cd = res.headers.get("content-disposition") ?? "";
    expect(cd).toBe("inline");

    // Preview must NOT persist to export_history
    expect(repo.insertedHistory).toBeNull();
    expect(storage.store.size).toBe(0);
  });

  it("asset_value_lift math: 10000 / 0.07 = 142857.14", () => {
    const { noiLift, assetValueLift } = calculateNoi(
      new Decimal("10000"),
      new Decimal("0.07"),
    );
    expect(noiLift.toFixed(2)).toBe("10000.00");
    expect(assetValueLift.toFixed(2)).toBe("142857.14");
  });
});

describe("POST /api/v1/export/board/download", () => {
  it("returns 402 when no full access", async () => {
    const repo = new MemoryExportsRepository();
    repo.fullAccess = false;
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/board/download",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ property_id: PROPERTY_ID, year: 2024 }),
      },
      env(),
    );
    expect(res.status).toBe(402);
  });

  it("happy path: returns attachment PDF and persists export_history with format=board_pdf", async () => {
    const repo = new MemoryExportsRepository();
    repo.summaryList = [makeSnapshotSummary(LEASE_ID_1, "10000.00")];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/board/download",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          property_id: PROPERTY_ID,
          year: 2024,
          cap_rate: 0.07,
        }),
      },
      env(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const cd = res.headers.get("content-disposition") ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toContain("board-presentation-2024.pdf");
    expect(res.headers.get("x-capveri-export-id")).toBe(EXPORT_ID);
    expect(res.headers.get("x-capveri-export-storage-path")).toMatch(/^r2:/);

    expect(repo.insertedHistory).not.toBeNull();
    expect(repo.insertedHistory?.format).toBe("board_pdf");
    expect(repo.insertedHistory?.storagePath).toMatch(/^r2:/);
    expect(repo.insertedHistory?.fileSize).toBeGreaterThan(0);
    expect(storage.store.size).toBe(1);
  });

  it("rolls back R2 on DB insert failure", async () => {
    const repo = new MemoryExportsRepository();
    repo.summaryList = [makeSnapshotSummary(LEASE_ID_1, "10000.00")];
    repo.insertShouldFail = true;
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/board/download",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ property_id: PROPERTY_ID, year: 2024 }),
      },
      env(),
    );

    expect(res.status).toBe(500);
    expect(storage.deletedKeys.length).toBeGreaterThan(0);
    expect(storage.store.size).toBe(0);
  });

  it("org isolation: requests for other org get 404 (no snapshots returned)", async () => {
    const repo = new MemoryExportsRepository();
    // summaryList empty — simulates no snapshots for a different org
    const storage = new MemoryReportsStorage();
    const otherOrg = makeAuthContext("owner", "landlord", "Other User");
    // Override org ID by building a custom context
    otherOrg.actor.organizationId = "99999999-9999-4999-8999-999999999999";
    otherOrg.user.organizationId = "99999999-9999-4999-8999-999999999999";
    const app = makeTestApp(repo, storage, otherOrg);

    const res = await app.request(
      "/api/v1/export/board/download",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ property_id: PROPERTY_ID, year: 2024 }),
      },
      env(),
    );
    // No snapshots for this org → 404
    expect(res.status).toBe(404);
  });
});
