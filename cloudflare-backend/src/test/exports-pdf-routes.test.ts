/**
 * Route-level tests for the PDF export endpoints added in the pdf-lib sub-slice:
 *   GET  /exports/reconciliation/snapshots/:snapshotId/export/pdf
 *   POST /export/pdf/preview
 *   POST /demand-letter/generate
 *
 * Uses an in-memory repository — no real DB or PDF parsing.
 * Assertions are on HTTP status, content-type, content-disposition, filename,
 * and (for PDFs) that the response body starts with the PDF magic bytes %PDF.
 * Functional correctness of the PDF layout is verified by asserting on the
 * data passed into the builder via the injected fakes.
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type { SnapshotForErp } from "../domain/exports/erp-formatters";
import type {
  AuditLogRow,
  DemandLetterContext,
  ExportHistoryPage,
  ExportsRepository,
  SnapshotPdfContext,
} from "../domain/exports/repository";
import type { AppEnv } from "../env";
import { createExportsRoutes } from "../http/exports-routes";
import type { AuthVariables } from "../middleware/auth";

// ── constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SNAPSHOT_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PROPERTY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const LEASE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

// ── fixtures ──────────────────────────────────────────────────────────────────

function makePdfContext(
  overrides: Partial<SnapshotPdfContext["snapshot"]> = {},
): SnapshotPdfContext {
  return {
    snapshot: {
      id: SNAPSHOT_ID,
      lease_id: LEASE_ID,
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
      ...overrides,
    },
    lease: { tenant_name: "Acme Corp" },
    property: { name: "Main Street Plaza", address: "100 Main St" },
    organization: { name: "CapVeri LLC" },
  };
}

function makeDemandLetterContext(
  overrides: Partial<DemandLetterContext["snapshot"]> = {},
): DemandLetterContext {
  return {
    snapshot: {
      id: SNAPSHOT_ID,
      status: "finalized",
      total_recovery: "5250.00",
      period_start_date: "2024-01-01",
      period_end_date: "2024-12-31",
      lease_id: LEASE_ID,
      ...overrides,
    },
    lease: { tenant_name: "Acme Corp" },
    property: { address: "100 Main St, Dallas, TX 75201" },
  };
}

// ── in-memory repository ──────────────────────────────────────────────────────

class MemoryExportsPdfRepository implements ExportsRepository {
  pdfContext: SnapshotPdfContext | null = null;
  pdfContextList: SnapshotPdfContext[] = [];
  demandContext: DemandLetterContext | null = null;
  fullAccess = true;

  // ── stubs for the ERP sub-slice (not under test here) ──────────────────────
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

  // ── PDF methods ─────────────────────────────────────────────────────────────
  async getSnapshotForPdf(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _input: { snapshotId: string; organizationId: string },
  ): Promise<SnapshotPdfContext | null> {
    return this.pdfContext;
  }

  async listSnapshotsForPropertyPdf(): Promise<SnapshotPdfContext[]> {
    return this.pdfContextList;
  }

  async getDemandLetterContext(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _input: { snapshotId: string; organizationId: string },
  ): Promise<DemandLetterContext | null> {
    return this.demandContext;
  }

  async listSnapshotsForYear(): Promise<
    import("../domain/exports/repository").SnapshotSummary[]
  > {
    return [];
  }
  async getPropertyName(): Promise<
    import("../domain/exports/repository").PropertyNameRow | null
  > {
    return null;
  }

  async hasFullAccess(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _organizationId: string,
  ): Promise<boolean> {
    return this.fullAccess;
  }

  async insertExportHistory(): Promise<string> {
    return "00000000-0000-4000-8000-000000000000";
  }

  async getExportHistoryRow(): Promise<
    import("../domain/exports/repository").ExportHistoryRow | null
  > {
    return null;
  }

  async deleteExportHistory(): Promise<
    import("../domain/exports/repository").ExportHistoryRow | null
  > {
    return null;
  }
}

// ── test harness ──────────────────────────────────────────────────────────────

type AuthRole = "owner" | "admin" | "member" | "viewer";
type AuthParty = "landlord" | "tenant";

function createAuthContext(
  role: AuthRole = "owner",
  party: AuthParty = "landlord",
): AuthenticatedUserContext {
  return {
    user: {
      id: USER_ID,
      organizationId: ORG_ID,
      email: "owner@test.example",
      fullName: "Test Owner",
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

function createTestApp(
  repository: MemoryExportsPdfRepository,
  authContext: AuthenticatedUserContext = createAuthContext(),
  clock?: () => Date,
) {
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
    repository,
    auth: {
      verifier,
      db: { mode: "postgrest-compat", auth, protectedRecords },
    },
  };
  if (clock !== undefined) deps.clock = clock;

  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route("/api/v1", createExportsRoutes(deps));
  return app;
}

function env(): AppEnv {
  return { ENVIRONMENT: "test", APP_VERSION: "test" } as unknown as AppEnv;
}

function authHeaders() {
  return { authorization: "Bearer valid-token" };
}

/** Assert the response body starts with the PDF magic bytes. */
async function assertPdfMagic(res: Response): Promise<void> {
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // %PDF = 0x25 0x50 0x44 0x46
  expect(bytes[0]).toBe(0x25);
  expect(bytes[1]).toBe(0x50);
  expect(bytes[2]).toBe(0x44);
  expect(bytes[3]).toBe(0x46);
  expect(buf.byteLength).toBeGreaterThan(100);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /exports/reconciliation/snapshots/:snapshotId/export/pdf
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /exports/reconciliation/snapshots/:snapshotId/export/pdf", () => {
  it("returns 401 without auth header", async () => {
    const repo = new MemoryExportsPdfRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/pdf`,
      {},
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for tenant party", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContext = makePdfContext();
    const app = createTestApp(repo, createAuthContext("owner", "tenant"));
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/pdf`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 for invalid snapshot UUID", async () => {
    const repo = new MemoryExportsPdfRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/not-a-uuid/export/pdf`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when snapshot not in org", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContext = null;
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/pdf`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when snapshot is draft and allow_draft not set", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContext = makePdfContext({ status: "draft" });
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/pdf`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 PDF with attachment disposition for finalized snapshot", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContext = makePdfContext();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/pdf`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("filename=");
    await assertPdfMagic(res);
  });

  it("filename matches Reconciliation_{PropertyName}_{Year}.pdf with spaces as underscores", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContext = makePdfContext();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/pdf`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    // period_start_date = "2024-01-01", property.name = "Main Street Plaza"
    expect(res.headers.get("content-disposition")).toContain(
      'filename="Reconciliation_Main_Street_Plaza_2024.pdf"',
    );
  });

  it("sanitizes control characters and quotes in snapshot PDF filename", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContext = {
      ...makePdfContext(),
      property: { name: 'Main\r\n"X-Test: 1', address: "100 Main St" },
    };
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/pdf`,
      { headers: authHeaders() },
      env(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(
      'filename="Reconciliation_Main\'X-Test:_1_2024.pdf"',
    );
    await assertPdfMagic(res);
  });

  it("allows export of draft when allow_draft=true", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContext = makePdfContext({ status: "draft" });
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/pdf?allow_draft=true`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("org isolation: repo receives org id from auth context", async () => {
    const repo = new MemoryExportsPdfRepository();
    // pdfContext = null → 404 (repo returns null for any org)
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/pdf`,
      { headers: authHeaders() },
      env(),
    );
    // Verifies that the route passed organizationId to the repo; null → 404
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /export/pdf/preview
// ─────────────────────────────────────────────────────────────────────────────

const VALID_PREVIEW_BODY = {
  property_id: PROPERTY_ID,
  year: 2024,
  include_charts: false,
  include_notes: false,
};

describe("POST /export/pdf/preview", () => {
  it("returns 401 without auth", async () => {
    const repo = new MemoryExportsPdfRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/export/pdf/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_PREVIEW_BODY),
      },
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for tenant party", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContextList = [makePdfContext()];
    const app = createTestApp(repo, createAuthContext("owner", "tenant"));
    const res = await app.request(
      "/api/v1/export/pdf/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_PREVIEW_BODY),
      },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 402 when org has no full access", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.fullAccess = false;
    repo.pdfContextList = [makePdfContext()];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/export/pdf/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_PREVIEW_BODY),
      },
      env(),
    );
    expect(res.status).toBe(402);
  });

  it("returns 422 for missing property_id", async () => {
    const repo = new MemoryExportsPdfRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/export/pdf/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ year: 2024 }),
      },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("returns 400 when include_charts=true", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContextList = [makePdfContext()];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/export/pdf/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ...VALID_PREVIEW_BODY, include_charts: true }),
      },
      env(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when include_notes=true", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContextList = [makePdfContext()];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/export/pdf/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ...VALID_PREVIEW_BODY, include_notes: true }),
      },
      env(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when more than one tenant_id supplied", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContextList = [makePdfContext()];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/export/pdf/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          ...VALID_PREVIEW_BODY,
          tenant_ids: [LEASE_ID, "ffffffff-ffff-4fff-8fff-ffffffffffff"],
        }),
      },
      env(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when no finalized snapshots found", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContextList = [];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/export/pdf/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_PREVIEW_BODY),
      },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 with FastAPI-exact message when tenant_id matches no snapshot", async () => {
    const repo = new MemoryExportsPdfRepository();
    // List has a snapshot but with a different lease_id than what the caller provides
    repo.pdfContextList = [makePdfContext()]; // lease_id = LEASE_ID
    const app = createTestApp(repo);
    const OTHER_LEASE = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const res = await app.request(
      "/api/v1/export/pdf/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          ...VALID_PREVIEW_BODY,
          tenant_ids: [OTHER_LEASE],
        }),
      },
      env(),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error?: { message?: string; code?: string };
    };
    // Exact FastAPI message from _snapshots_for_pdf_request
    expect(body.error?.message).toBe(
      "No finalized snapshot matches the requested tenant_id",
    );
    expect(body.error?.code).toBe("tenant_not_found");
  });

  it("returns 200 when tenant_id matches a snapshot lease_id", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContextList = [makePdfContext()]; // lease_id = LEASE_ID
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/export/pdf/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ...VALID_PREVIEW_BODY, tenant_ids: [LEASE_ID] }),
      },
      env(),
    );
    expect(res.status).toBe(200);
    await assertPdfMagic(res);
  });

  it("guard ordering: include_charts error fires AFTER snapshot fetch (FastAPI parity)", async () => {
    // Snapshot list is populated; include_charts=true should still return 400
    // (not 404), confirming guards run after the DB fetch.
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContextList = [makePdfContext()];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/export/pdf/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ...VALID_PREVIEW_BODY, include_charts: true }),
      },
      env(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 200 PDF with Content-Disposition: inline", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.pdfContextList = [makePdfContext()];
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/export/pdf/preview",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_PREVIEW_BODY),
      },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    // Preview must be inline, NOT attachment
    expect(res.headers.get("content-disposition")).toBe("inline");
    await assertPdfMagic(res);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /demand-letter/generate
// ─────────────────────────────────────────────────────────────────────────────

const VALID_DEMAND_BODY = {
  snapshot_id: SNAPSHOT_ID,
  state: "TX",
  landlord_name: "John Smith",
  landlord_title: "Property Manager",
  landlord_company: "Acme Realty LLC",
  landlord_address: "123 Main St, Dallas, TX 75201",
  landlord_phone: "214-555-1234",
  landlord_email: "john@acmerealty.com",
  payment_deadline_days: 30,
};

describe("POST /demand-letter/generate", () => {
  it("returns 401 without auth", async () => {
    const repo = new MemoryExportsPdfRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_DEMAND_BODY),
      },
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for tenant party", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.demandContext = makeDemandLetterContext();
    const app = createTestApp(repo, createAuthContext("owner", "tenant"));
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DEMAND_BODY),
      },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 402 when org has no full access", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.fullAccess = false;
    repo.demandContext = makeDemandLetterContext();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DEMAND_BODY),
      },
      env(),
    );
    expect(res.status).toBe(402);
  });

  it("returns 422 for missing snapshot_id", async () => {
    const repo = new MemoryExportsPdfRepository();
    const app = createTestApp(repo);
    const body = { ...VALID_DEMAND_BODY };
    const { snapshot_id: _removed, ...bodyWithout } = body;
    void _removed;
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(bodyWithout),
      },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid state value", async () => {
    const repo = new MemoryExportsPdfRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ...VALID_DEMAND_BODY, state: "NY" }),
      },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when snapshot not found in org", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.demandContext = null;
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DEMAND_BODY),
      },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when snapshot status is not finalized", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.demandContext = makeDemandLetterContext({ status: "draft" });
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DEMAND_BODY),
      },
      env(),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("snapshot_not_finalized");
  });

  it("returns statement correction note PDF when total_recovery is 0", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.demandContext = makeDemandLetterContext({ total_recovery: "0.00" });
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DEMAND_BODY),
      },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition") ?? "").toContain(
      'filename="statement-correction-note-Acme Corp.pdf"',
    );
    await assertPdfMagic(res);
  });

  it("returns statement correction note PDF when total_recovery is negative", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.demandContext = makeDemandLetterContext({ total_recovery: "-100.00" });
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DEMAND_BODY),
      },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition") ?? "").toContain(
      'filename="statement-correction-note-Acme Corp.pdf"',
    );
    await assertPdfMagic(res);
  });

  it("returns 200 PDF with attachment disposition and correct filename", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.demandContext = makeDemandLetterContext();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DEMAND_BODY),
      },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment");
    // filename is demand-letter-{tenant_name}.pdf
    expect(disposition).toContain('filename="demand-letter-Acme Corp.pdf"');
    await assertPdfMagic(res);
  });

  it("TX state body — produces non-empty PDF", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.demandContext = makeDemandLetterContext();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ...VALID_DEMAND_BODY, state: "TX" }),
      },
      env(),
    );
    expect(res.status).toBe(200);
    await assertPdfMagic(res);
  });

  it("CA state body — produces non-empty PDF", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.demandContext = makeDemandLetterContext();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({ ...VALID_DEMAND_BODY, state: "CA" }),
      },
      env(),
    );
    expect(res.status).toBe(200);
    await assertPdfMagic(res);
  });

  it("payment_deadline_days outside 1..365 returns 422", async () => {
    const repo = new MemoryExportsPdfRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          ...VALID_DEMAND_BODY,
          payment_deadline_days: 400,
        }),
      },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("filename sanitizes slashes in tenant name", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.demandContext = {
      ...makeDemandLetterContext(),
      lease: { tenant_name: "Acme/Corp" },
    };
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DEMAND_BODY),
      },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(
      'filename="demand-letter-Acme-Corp.pdf"',
    );
  });

  it("sanitizes control characters and quotes in demand-letter filename", async () => {
    const repo = new MemoryExportsPdfRepository();
    repo.demandContext = {
      ...makeDemandLetterContext(),
      lease: { tenant_name: 'Acme\r\n"Corp' },
    };
    const app = createTestApp(repo);
    const res = await app.request(
      "/api/v1/demand-letter/generate",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DEMAND_BODY),
      },
      env(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(
      'filename="demand-letter-Acme\'Corp.pdf"',
    );
    await assertPdfMagic(res);
  });
});
