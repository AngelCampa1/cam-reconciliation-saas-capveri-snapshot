/**
 * Route-level tests for the exports endpoints.
 * Uses an in-memory repository to avoid any real DB calls.
 * Tests: auth, validation, admin gate, pagination, format selection,
 * content-type/disposition, org isolation, CSV-injection neutralization.
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
  AuditLogQueryInput,
  AuditLogRow,
  DemandLetterContext,
  ExportHistoryListInput,
  ExportHistoryPage,
  ExportHistoryRow,
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

// ── in-memory repository ──────────────────────────────────────────────────────

class MemoryExportsRepository implements ExportsRepository {
  snapshots: SnapshotForErp[] = [];
  auditEntries: AuditLogRow[] = [];
  historyItems: ExportHistoryRow[] = [];
  lastAuditInput: AuditLogQueryInput | null = null;
  lastHistoryInput: ExportHistoryListInput | null = null;

  async getSnapshotForErp(input: {
    snapshotId: string;
    organizationId: string;
  }): Promise<SnapshotForErp | null> {
    return (
      this.snapshots.find(
        (s) => s.id === input.snapshotId && s.status === "finalized",
      ) ?? null
    );
  }

  async listSnapshotsForErpBatch(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _batchInput: {
      organizationId: string;
      propertyId: string;
      periodStart: string;
      periodEnd: string;
    },
  ): Promise<SnapshotForErp[]> {
    return this.snapshots.filter((s) => s.status === "finalized");
  }

  async propertyBelongsToOrg(input: {
    propertyId: string;
    organizationId: string;
  }): Promise<boolean> {
    return input.propertyId === PROPERTY_ID && input.organizationId === ORG_ID;
  }

  async queryAuditLog(input: AuditLogQueryInput): Promise<AuditLogRow[]> {
    this.lastAuditInput = input;
    return this.auditEntries;
  }

  async listExportHistory(
    _input: ExportHistoryListInput,
  ): Promise<ExportHistoryPage> {
    this.lastHistoryInput = _input;
    return {
      items: this.historyItems,
      total: this.historyItems.length,
      page: _input.page,
      page_size: _input.pageSize,
    };
  }

  // ── new PDF/demand-letter methods (not under test in this file) ───────────
  async getSnapshotForPdf(): Promise<SnapshotPdfContext | null> {
    return null;
  }
  async listSnapshotsForPropertyPdf(): Promise<SnapshotPdfContext[]> {
    return [];
  }
  async getDemandLetterContext(): Promise<DemandLetterContext | null> {
    return null;
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
  async hasFullAccess(): Promise<boolean> {
    return true;
  }
  async insertExportHistory(): Promise<string> {
    return "00000000-0000-4000-8000-000000000000";
  }
  async getExportHistoryRow(): Promise<ExportHistoryRow | null> {
    return null;
  }
  async deleteExportHistory(): Promise<ExportHistoryRow | null> {
    return null;
  }
}

// ── test harness ──────────────────────────────────────────────────────────────

function makeSnapshotFixture(
  overrides: Partial<SnapshotForErp> = {},
): SnapshotForErp {
  return {
    id: SNAPSHOT_ID,
    lease_id: "11111111-1111-4111-8111-111111111111",
    period_start_date: "2024-01-01",
    period_end_date: "2024-12-31",
    total_recovery: "5000.00",
    total_operating_expenses: "40000.00",
    grossed_up_expenses: "41025.64",
    base_year_amount: "20000.00",
    tenant_share_before_cap: "6000.00",
    tenant_share_after_cap: "5000.00",
    admin_fee: "250.00",
    status: "finalized",
    properties: { id: PROPERTY_ID, name: "Main Street" },
    leases: { tenant_name: "Test Tenant" },
    ...overrides,
  };
}

function makeHistoryItem(): ExportHistoryRow {
  return {
    id: "hhhhhhhh-hhhh-4hhh-8hhh-hhhhhhhhhhhh",
    organization_id: ORG_ID,
    property_id: PROPERTY_ID,
    format: "csv",
    file_name: "CAM_Reconciliation_2024.csv",
    file_size: 2048,
    status: "completed",
    created_by_name: "Angel C",
    created_at: "2024-06-13T12:00:00Z",
    storage_path: null,
  };
}

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
      fullName: "Test User",
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
  repository: MemoryExportsRepository,
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
      return {
        subject: USER_ID,
        payload: {},
        isActive: true,
      };
    },
  };

  const deps: import("../http/exports-routes").ExportsRouteDependencies = {
    repository,
    reportsStorage: {
      generateKey: () => "reports/org/prop/report.csv",
      putReport: async () => {},
      getReportBytes: async () => undefined,
      deleteReport: async () => {},
    },
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

// ── GET /exports/reconciliation/snapshots/:id/export/erp ─────────────────────

describe("GET /exports/reconciliation/snapshots/:snapshotId/export/erp", () => {
  it("returns 401 without auth header", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/erp`,
      {},
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for tenant user", async () => {
    const repo = new MemoryExportsRepository();
    repo.snapshots = [makeSnapshotFixture()];
    const app = createTestApp(repo, createAuthContext("viewer", "tenant"));
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/erp`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 for invalid snapshot UUID", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/not-a-uuid/export/erp`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when snapshot not found", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/erp`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when snapshot exists but is not finalized (status check in route)", async () => {
    // The in-memory repo returns snapshots regardless of status so the route's
    // status check fires. Override getSnapshotForErp to return draft snapshot.
    const repo = new MemoryExportsRepository();
    const draftSnap = makeSnapshotFixture({ status: "draft" });
    repo.getSnapshotForErp = async () => draftSnap;
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/erp`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(400);
  });

  it("returns CSV (default) with correct content-type and disposition", async () => {
    const repo = new MemoryExportsRepository();
    repo.snapshots = [makeSnapshotFixture()];
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/erp`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain(
      'filename="CAM_Reconciliation_2024.csv"',
    );
    const body = await res.text();
    expect(body).toContain("Amount Due");
  });

  it("returns Yardi format when format=yardi", async () => {
    const repo = new MemoryExportsRepository();
    repo.snapshots = [makeSnapshotFixture()];
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/erp?format=yardi`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(
      'filename="Yardi_CAM_Import_2024.csv"',
    );
    const body = await res.text();
    expect(body).toContain("1200");
  });

  it("returns MRI format when format=mri", async () => {
    const repo = new MemoryExportsRepository();
    repo.snapshots = [makeSnapshotFixture()];
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/erp?format=mri`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("content-disposition")).toContain(
      'filename="MRI_CAM_Import_2024.txt"',
    );
    const body = await res.text();
    expect(body).toContain("11200");
  });

  it("422 for invalid format value", async () => {
    const repo = new MemoryExportsRepository();
    repo.snapshots = [makeSnapshotFixture()];
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/erp?format=excel`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("neutralizes CSV injection in property name", async () => {
    const repo = new MemoryExportsRepository();
    repo.snapshots = [
      makeSnapshotFixture({ properties: { id: "p1", name: "=EVIL()" } }),
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/${SNAPSHOT_ID}/export/erp`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("'=EVIL()");
  });
});

// ── GET /exports/reconciliation/snapshots/export/erp/batch ───────────────────

describe("GET /exports/reconciliation/snapshots/export/erp/batch", () => {
  it("returns 401 without auth", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/export/erp/batch?property_id=${PROPERTY_ID}&period_start=2024-01-01&period_end=2024-12-31`,
      {},
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 422 when property_id missing", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/export/erp/batch?period_start=2024-01-01&period_end=2024-12-31`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for malformed dates", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/export/erp/batch?property_id=${PROPERTY_ID}&period_start=not-a-date&period_end=2024-12-31`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("returns 404 when property not found in org (org isolation)", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("owner", "landlord"));
    // Use a different property_id that does not belong to ORG_ID
    const foreignPropId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/export/erp/batch?property_id=${foreignPropId}&period_start=2024-01-01&period_end=2024-12-31`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when no finalized snapshots found", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    // No snapshots in repo
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/export/erp/batch?property_id=${PROPERTY_ID}&period_start=2024-01-01&period_end=2024-12-31`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("returns CSV with correct content-type for multiple snapshots", async () => {
    const repo = new MemoryExportsRepository();
    repo.snapshots = [
      makeSnapshotFixture(),
      makeSnapshotFixture({ id: "dddddddd-dddd-4ddd-8ddd-ddddddddddde" }),
    ];
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/export/erp/batch?property_id=${PROPERTY_ID}&period_start=2024-01-01&period_end=2024-12-31`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const body = await res.text();
    expect(body).toContain("Amount Due");
  });

  it("respects format=yardi for batch", async () => {
    const repo = new MemoryExportsRepository();
    repo.snapshots = [makeSnapshotFixture()];
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/exports/reconciliation/snapshots/export/erp/batch?property_id=${PROPERTY_ID}&period_start=2024-01-01&period_end=2024-12-31&format=yardi`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain(
      "Yardi_CAM_Import",
    );
  });
});

// ── GET /exports/audit-log ────────────────────────────────────────────────────

describe("GET /exports/audit-log", () => {
  it("returns 401 without auth", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    const res = await app.request(`/api/v1/exports/audit-log`, {}, env());
    expect(res.status).toBe(401);
  });

  it("returns 403 for member role (non-admin)", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("member", "landlord"));
    const res = await app.request(
      `/api/v1/exports/audit-log`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer role", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("viewer", "landlord"));
    const res = await app.request(
      `/api/v1/exports/audit-log`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 200 for admin role", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("admin", "landlord"));
    const res = await app.request(
      `/api/v1/exports/audit-log`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
  });

  it("returns 200 for owner role", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("owner", "landlord"));
    const res = await app.request(
      `/api/v1/exports/audit-log`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
  });

  it("returns text/csv with audit_log filename containing date", async () => {
    const repo = new MemoryExportsRepository();
    const fixedDate = new Date("2024-06-13T10:00:00Z");
    const app = createTestApp(
      repo,
      createAuthContext("owner"),
      () => fixedDate,
    );
    const res = await app.request(
      `/api/v1/exports/audit-log`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain(
      'filename="audit_log_20240613.csv"',
    );
  });

  it("CSV has correct column headers", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("owner"));
    const res = await app.request(
      `/api/v1/exports/audit-log`,
      { headers: authHeaders() },
      env(),
    );
    const body = await res.text();
    const header = body.split("\r\n")[0];
    expect(header).toBe(
      "id,table_name,operation,row_id,old_data,new_data,changed_by,changed_at",
    );
  });

  it("passes filters through to repository", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("owner"));
    await app.request(
      `/api/v1/exports/audit-log?start_date=2024-01-01&end_date=2024-12-31&table_name=gl_entries&operation=INSERT&limit=50`,
      { headers: authHeaders() },
      env(),
    );
    expect(repo.lastAuditInput?.startDate).toBe("2024-01-01");
    expect(repo.lastAuditInput?.endDate).toBe("2024-12-31");
    expect(repo.lastAuditInput?.tableName).toBe("gl_entries");
    expect(repo.lastAuditInput?.operation).toBe("INSERT");
    expect(repo.lastAuditInput?.limit).toBe(50);
  });

  it("rejects limit > 5000", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("owner"));
    const res = await app.request(
      `/api/v1/exports/audit-log?limit=9999`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("includes audit data rows in CSV body", async () => {
    const repo = new MemoryExportsRepository();
    repo.auditEntries = [
      {
        id: "1",
        table_name: "gl_entries",
        operation: "INSERT",
        row_id: "row-uuid-1",
        old_data: "",
        new_data: '{"amount": "500"}',
        changed_by: USER_ID,
        changed_at: "2024-06-13T10:00:00Z",
      },
    ];
    const app = createTestApp(repo, createAuthContext("owner"));
    const res = await app.request(
      `/api/v1/exports/audit-log`,
      { headers: authHeaders() },
      env(),
    );
    const body = await res.text();
    expect(body).toContain("gl_entries");
    expect(body).toContain("INSERT");
  });

  it("does not leak data across organizations (org scope passed to repo)", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("owner"));
    await app.request(
      `/api/v1/exports/audit-log`,
      { headers: authHeaders() },
      env(),
    );
    expect(repo.lastAuditInput?.organizationId).toBe(ORG_ID);
  });
});

// ── GET /export/history ───────────────────────────────────────────────────────

describe("GET /export/history", () => {
  it("returns 401 without auth", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/export/history?property_id=${PROPERTY_ID}`,
      {},
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 422 when property_id missing", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/export/history`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid property_id UUID", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/export/history?property_id=not-a-uuid`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("returns paginated JSON with items/total/page/page_size", async () => {
    const repo = new MemoryExportsRepository();
    repo.historyItems = [makeHistoryItem()];
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/export/history?property_id=${PROPERTY_ID}`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body["page"]).toBe(1);
    expect(body["page_size"]).toBe(25);
    expect(body["total"]).toBe(1);
    expect(Array.isArray(body["items"])).toBe(true);
    expect((body["items"] as unknown[]).length).toBe(1);
  });

  it("passes pagination params to repository", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    await app.request(
      `/api/v1/export/history?property_id=${PROPERTY_ID}&page=3&page_size=10`,
      { headers: authHeaders() },
      env(),
    );
    expect(repo.lastHistoryInput?.page).toBe(3);
    expect(repo.lastHistoryInput?.pageSize).toBe(10);
  });

  it("passes format filter to repository when provided", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    await app.request(
      `/api/v1/export/history?property_id=${PROPERTY_ID}&format=yardi`,
      { headers: authHeaders() },
      env(),
    );
    expect(repo.lastHistoryInput?.format).toBe("yardi");
  });

  it("scopes query to requesting org (org isolation)", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    await app.request(
      `/api/v1/export/history?property_id=${PROPERTY_ID}`,
      { headers: authHeaders() },
      env(),
    );
    expect(repo.lastHistoryInput?.organizationId).toBe(ORG_ID);
  });

  it("rejects page_size > 100", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/export/history?property_id=${PROPERTY_ID}&page_size=200`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("returns 403 for tenant party", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("member", "tenant"));
    const res = await app.request(
      `/api/v1/export/history?property_id=${PROPERTY_ID}`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(403);
  });
});

// ── DELETE /export/history/:exportId ────────────────────────────────────────

describe("DELETE /export/history/:exportId", () => {
  const EXPORT_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

  it("returns 401 without auth header", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo);
    const res = await app.request(
      `/api/v1/export/history/${EXPORT_ID}`,
      { method: "DELETE" },
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for tenant party", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("admin", "tenant"));
    const res = await app.request(
      `/api/v1/export/history/${EXPORT_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for viewer role (destructive delete is admin-gated)", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("viewer", "landlord"));
    const res = await app.request(
      `/api/v1/export/history/${EXPORT_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 403 for member role (destructive delete is admin-gated)", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("member", "landlord"));
    const res = await app.request(
      `/api/v1/export/history/${EXPORT_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 422 for invalid export UUID", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("admin", "landlord"));
    const res = await app.request(
      `/api/v1/export/history/not-a-uuid`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(422);
  });

  it("admin passes the guard and reaches the repository (404 when not found)", async () => {
    const repo = new MemoryExportsRepository();
    const app = createTestApp(repo, createAuthContext("admin", "landlord"));
    const res = await app.request(
      `/api/v1/export/history/${EXPORT_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(404);
  });
});
