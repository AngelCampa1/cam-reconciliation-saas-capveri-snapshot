/**
 * Tests for C3 sub-slice: EP-13 variance XLSX export.
 *
 * Covers:
 *   - Auth gate: tenant → 403
 *   - Billing gate: no full access → 402
 *   - Happy path: bytes returned, correct Content-Type, Content-Disposition filename
 *   - export_history insert values (format="variance_excel", storagePath "r2:…")
 *   - R2 rollback on DB insert failure
 *   - Org isolation (both years empty → 404)
 *   - variance_pct == 0 when prior_total == 0
 *   - Parse produced .xlsx (unzip with fflate): assert sheet name "Variance",
 *     header cells, B5/B6 numeric with dollar format, C6 variance fraction
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { unzipSync } from "fflate";
import Decimal from "decimal.js";
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
import { computeVariancePct } from "../domain/exports/variance-pdf";
import {
  buildVarianceXlsx,
  formatUtcTimestamp,
} from "../domain/exports/variance-xlsx";

// ── constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROPERTY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const EXPORT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

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
  summaryListCurrent: SnapshotSummary[] = [];
  summaryListPrior: SnapshotSummary[] = [];
  propRow: PropertyNameRow | null = {
    id: PROPERTY_ID,
    name: "Main Street Plaza",
    org_name: "CapVeri LLC",
  };
  fullAccess = true;
  insertedHistory: InsertInput | null = null;
  insertShouldFail = false;
  orgId = ORG_ID;

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
    return [];
  }

  async listSnapshotsForYear(input: {
    organizationId: string;
    propertyId: string;
    yearStart: string;
    yearEnd: string;
  }): Promise<SnapshotSummary[]> {
    // Org isolation: return empty for wrong org
    if (input.organizationId !== this.orgId) return [];
    if (input.yearStart.startsWith("2024")) return this.summaryListCurrent;
    if (input.yearStart.startsWith("2023")) return this.summaryListPrior;
    return [];
  }

  async getPropertyName(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<PropertyNameRow | null> {
    if (input.organizationId !== this.orgId) return null;
    return this.propRow;
  }

  async hasFullAccess(organizationId: string): Promise<boolean> {
    if (organizationId !== this.orgId) return false;
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
  orgId: string = ORG_ID,
): AuthenticatedUserContext {
  return {
    user: {
      id: USER_ID,
      organizationId: orgId,
      email: "owner@test.example",
      fullName,
      role,
      isPlatformAdmin: false,
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
    actor: {
      userId: USER_ID,
      organizationId: orgId,
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

function makeSnapshotSummary(
  totalRecovery: string,
  id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
): SnapshotSummary {
  return {
    id,
    lease_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    total_recovery: totalRecovery,
    period_start_date: "2024-01-01",
  };
}

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const BODY = {
  property_id: PROPERTY_ID,
  current_year: 2024,
  prior_year: 2023,
  threshold_percent: 10.0,
};

// ── XLSX parse helpers ────────────────────────────────────────────────────────

/**
 * Unzip an xlsx buffer and return the raw text content of xl/worksheets/sheet1.xml.
 * We use fflate (already a dependency) to avoid pulling a spreadsheet parser.
 */
function parseXlsxSheetXml(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const sheetEntry = files["xl/worksheets/sheet1.xml"];
  if (!sheetEntry) throw new Error("sheet1.xml not found in xlsx ZIP");
  return new TextDecoder().decode(sheetEntry);
}

/** Return the workbook.xml text (contains sheet name). */
function parseXlsxWorkbookXml(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const entry = files["xl/workbook.xml"];
  if (!entry) throw new Error("workbook.xml not found in xlsx ZIP");
  return new TextDecoder().decode(entry);
}

/** Return the styles.xml text (contains numFmt definitions). */
function parseXlsxStylesXml(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const entry = files["xl/styles.xml"];
  if (!entry) throw new Error("styles.xml not found in xlsx ZIP");
  return new TextDecoder().decode(entry);
}

/** Return the sharedStrings.xml text (ExcelJS stores string cells here). */
function parseXlsxSharedStrings(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const entry = files["xl/sharedStrings.xml"];
  if (!entry) return ""; // may not exist if all cells are numeric
  return new TextDecoder().decode(entry);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("EP-13 POST /export/variance/excel", () => {
  it("returns 403 for tenant auth", async () => {
    const repo = new MemoryExportsRepository();
    repo.summaryListCurrent = [makeSnapshotSummary("10000.00")];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage, makeAuthContext("owner", "tenant"));
    const res = await app.request(
      "/api/v1/export/variance/excel",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(BODY),
      },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 402 when org lacks full access", async () => {
    const repo = new MemoryExportsRepository();
    repo.fullAccess = false;
    repo.summaryListCurrent = [makeSnapshotSummary("10000.00")];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      "/api/v1/export/variance/excel",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(BODY),
      },
      env(),
    );
    expect(res.status).toBe(402);
  });

  it("happy path: returns xlsx bytes with correct headers and filename", async () => {
    const repo = new MemoryExportsRepository();
    repo.summaryListCurrent = [makeSnapshotSummary("12000.00")];
    repo.summaryListPrior = [makeSnapshotSummary("10000.00")];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/variance/excel",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(BODY),
      },
      env(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain(XLSX_CONTENT_TYPE);
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="statement-check-report-2024-vs-2023.xlsx"`,
    );
    expect(res.headers.get("X-CapVeri-Export-Id")).toBe(EXPORT_ID);
    expect(res.headers.get("X-CapVeri-Export-Storage-Path")).toMatch(/^r2:/);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes.byteLength).toBeGreaterThan(100);
  });

  it("inserts export_history with correct values", async () => {
    const repo = new MemoryExportsRepository();
    repo.summaryListCurrent = [makeSnapshotSummary("12000.00")];
    repo.summaryListPrior = [makeSnapshotSummary("10000.00")];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    await app.request(
      "/api/v1/export/variance/excel",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(BODY),
      },
      env(),
    );

    expect(repo.insertedHistory).not.toBeNull();
    const h = repo.insertedHistory!;
    expect(h.format).toBe("variance_excel");
    expect(h.organizationId).toBe(ORG_ID);
    expect(h.propertyId).toBe(PROPERTY_ID);
    expect(h.fileName).toBe("statement-check-report-2024-vs-2023.xlsx");
    expect(h.fileSize).toBeGreaterThan(0);
    expect(h.createdByName).toBe("Test Owner");
    expect(h.storagePath).toMatch(/^r2:/u);
  });

  it("uses email as createdByName when fullName is null", async () => {
    const repo = new MemoryExportsRepository();
    repo.summaryListCurrent = [makeSnapshotSummary("5000.00")];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(
      repo,
      storage,
      makeAuthContext("owner", "landlord", null),
    );

    await app.request(
      "/api/v1/export/variance/excel",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(BODY),
      },
      env(),
    );

    expect(repo.insertedHistory?.createdByName).toBe("owner@test.example");
  });

  it("rolls back R2 on DB insert failure and returns 500", async () => {
    const repo = new MemoryExportsRepository();
    repo.summaryListCurrent = [makeSnapshotSummary("8000.00")];
    repo.insertShouldFail = true;
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/variance/excel",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(BODY),
      },
      env(),
    );

    expect(res.status).toBe(500);
    // The R2 upload should have been rolled back
    expect(storage.deletedKeys.length).toBe(1);
    expect(storage.store.size).toBe(0);
  });

  it("returns 404 when both years have no snapshots (org isolation)", async () => {
    // Repo configured for ORG_ID; auth context uses ORG_ID_B → listSnapshotsForYear returns []
    const repo = new MemoryExportsRepository();
    repo.summaryListCurrent = [makeSnapshotSummary("5000.00")];
    repo.summaryListPrior = [makeSnapshotSummary("4000.00")];
    // fullAccess must return true for ORG_ID_B so 404 not 402
    repo.orgId = ORG_ID; // repo returns data only for ORG_ID
    repo.fullAccess = true; // but hasFullAccess will be called with ORG_ID_B which is != orgId → false
    // Make a special repo where hasFullAccess always returns true but data is org-isolated
    const storage = new MemoryReportsStorage();
    const authCtx = makeAuthContext("owner", "landlord", "Test", ORG_ID_B);

    const auth: AuthRepository = {
      async resolveUserContext() {
        return authCtx;
      },
    };
    const verifier: JwtVerifier = {
      async verify() {
        return { subject: USER_ID, payload: {}, isActive: true };
      },
    };

    // Override hasFullAccess to return true for ORG_ID_B so we can reach the 404
    const isolatedRepo = new MemoryExportsRepository();
    isolatedRepo.summaryListCurrent = repo.summaryListCurrent;
    isolatedRepo.summaryListPrior = repo.summaryListPrior;
    isolatedRepo.orgId = ORG_ID; // data only available for ORG_ID
    isolatedRepo.fullAccess = true; // but we need it to pass billing gate for ORG_ID_B
    // We'll override hasFullAccess in a subclass-style way by replacing it
    // directly since MemoryExportsRepository supports it through orgId logic.
    // Instead: use a wrapper that ignores org check for hasFullAccess only.
    class IsolatedRepo extends MemoryExportsRepository {
      override async hasFullAccess(): Promise<boolean> {
        return true;
      }
    }
    const wrappedRepo = new IsolatedRepo();
    wrappedRepo.summaryListCurrent = repo.summaryListCurrent;
    wrappedRepo.summaryListPrior = repo.summaryListPrior;
    wrappedRepo.orgId = ORG_ID; // listSnapshotsForYear returns [] for ORG_ID_B

    const deps: import("../http/exports-routes").ExportsRouteDependencies = {
      repository: wrappedRepo,
      reportsStorage: storage,
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    };
    const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
    app.route("/api/v1", createExportsRoutes(deps));

    const res = await app.request(
      "/api/v1/export/variance/excel",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(BODY),
      },
      env(),
    );

    expect(res.status).toBe(404);
  });

  it("variance_pct is 0 when prior_total is 0", async () => {
    // Domain function test
    const current = new Decimal("5000");
    const prior = new Decimal("0");
    expect(computeVariancePct(current, prior).toNumber()).toBe(0);
  });

  it("produces correct xlsx: sheet name, header cells, numeric B5/B6, C6 fraction", async () => {
    const current = "12000.00";
    const prior = "10000.00";
    const bytes = await buildVarianceXlsx({
      snapshotsCurrent: [makeSnapshotSummary(current)],
      snapshotsPrior: [makeSnapshotSummary(prior)],
      currentYear: 2024,
      priorYear: 2023,
      thresholdPercent: 10.0,
      propertyName: "Main Street Plaza",
    });

    // 1. Verify it is a valid ZIP (xlsx is a ZIP)
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'

    // 2. Sheet name = "Variance" in workbook.xml
    const wbXml = parseXlsxWorkbookXml(bytes);
    expect(wbXml).toContain("Variance");

    // 3. Parse sheet1.xml — ExcelJS uses sharedStrings for text cells.
    //    String cells appear as <c t="s"><v>{index}</v></c>; numeric cells
    //    have no t attribute and their value appears directly in <v>.
    const sheetXml = parseXlsxSheetXml(bytes);
    const sharedStrings = parseXlsxSharedStrings(bytes);

    // Header labels live in sharedStrings.xml
    expect(sharedStrings).toContain(
      "Statement Check Report - Main Street Plaza",
    );
    expect(sharedStrings).toContain(
      "We checked final billing totals for 2023 and 2024. We found the billing total changed by 20.00%.",
    );
    expect(sharedStrings).toContain("Period");
    expect(sharedStrings).toContain("Total Recovery");
    // "Variance" appears in both the sheet name (workbook.xml) and the header label
    // It's in sharedStrings for the header cell value
    expect(sharedStrings).toContain("Variance");

    // B5 and B6: numeric cells — raw values appear in sheet XML (no t="s")
    // ExcelJS emits <c r="B5" s="..."><v>12000</v></c> for a number cell
    expect(sheetXml).toContain('<c r="B5"');
    expect(sheetXml).toContain('<c r="B6"');
    // Verify numeric values are embedded directly
    expect(sheetXml).toContain(">12000<");
    expect(sheetXml).toContain(">10000<");

    // C6 should contain the variance fraction: (12000-10000)/10000 = 0.2 (= 20%)
    expect(sheetXml).toContain(">0.2<");

    // styles.xml should have "$#,##0.00" as a custom numFmt.
    // "0.00%" is OOXML built-in numFmtId=10 (ExcelJS resolves it as a built-in,
    // so it does NOT appear as a <numFmt formatCode="0.00%"> but as numFmtId="10"
    // on the cellXf for C6).
    const stylesXml = parseXlsxStylesXml(bytes);
    expect(stylesXml).toContain("$#,##0.00");
    // Verify percentage format is applied via built-in id 10
    expect(stylesXml).toContain('numFmtId="10"');
  });

  it("exports a statement check xlsx when only the current year has snapshots", async () => {
    const repo = new MemoryExportsRepository();
    repo.summaryListCurrent = [makeSnapshotSummary("12000.00")];
    repo.summaryListPrior = [];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      "/api/v1/export/variance/excel",
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(BODY),
      },
      env(),
    );

    expect(res.status).toBe(200);
    expect(repo.insertedHistory?.fileName).toBe(
      "statement-check-report-2024-vs-2023.xlsx",
    );
    expect(repo.insertedHistory?.format).toBe("variance_excel");

    const bytes = new Uint8Array(await res.arrayBuffer());
    const sharedStrings = parseXlsxSharedStrings(bytes);
    expect(sharedStrings).toContain(
      "We checked the final billing total for 2024. We did not find a prior-year billing total to compare.",
    );
  });

  it("strips ILLEGAL_CHARACTERS from property name", async () => {
    // A property name with a stray null byte should not crash
    const bytes = await buildVarianceXlsx({
      snapshotsCurrent: [makeSnapshotSummary("1000.00")],
      snapshotsPrior: [],
      currentYear: 2024,
      priorYear: 2023,
      thresholdPercent: 5.0,
      propertyName: "Bad\x00Prop\x08Name",
    });
    // Should not throw and should produce valid xlsx bytes
    expect(bytes.byteLength).toBeGreaterThan(0);
    const wbXml = parseXlsxWorkbookXml(bytes);
    expect(wbXml).toContain("Variance");
  });

  it("formatUtcTimestamp produces correct format", () => {
    // Fixed UTC date: 2024-03-15 08:05:09 UTC
    const d = new Date("2024-03-15T08:05:09Z");
    expect(formatUtcTimestamp(d)).toBe("2024-03-15 08:05:09 UTC");
  });
});
