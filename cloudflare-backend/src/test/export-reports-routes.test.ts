/**
 * Tests for C1 sub-slice: persisted PDF export to R2 + re-download.
 *
 * Covers:
 *   - reports storage adapter (put/get/delete, key format)
 *   - parseStoragePath / encodeR2StoragePath helpers
 *   - buildExportDownloadToken / verifyExportDownloadToken
 *   - POST /export/pdf/download (EP-7)
 *   - GET  /export/download/file (public token route)
 *   - GET  /export/download/:exportId (EP-11)
 */

import { Hono } from "hono";
import { describe, expect, it } from "vitest";
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
  SnapshotPdfContext,
} from "../domain/exports/repository";
import type { SnapshotForErp } from "../domain/exports/erp-formatters";
import type { ReportsStorage } from "../adapters/storage/reports";
import {
  createReportsStorage,
  encodeR2StoragePath,
  parseStoragePath,
} from "../adapters/storage/reports";
import {
  buildExportDownloadToken,
  verifyExportDownloadToken,
} from "../domain/exports/tokens";
import type { AppEnv } from "../env";
import { createExportsRoutes } from "../http/exports-routes";
import type { AuthVariables } from "../middleware/auth";

// ── constants ─────────────────────────────────────────────────────────────────

const ORG_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PROPERTY_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const EXPORT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const LEASE_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const SIGNING_SECRET = "test-signing-secret-32-bytes-long!!";

// ── in-memory R2 fake ─────────────────────────────────────────────────────────

class MemoryR2Bucket {
  private readonly store = new Map<
    string,
    { bytes: Uint8Array; contentType: string }
  >();

  async put(
    key: string,
    value: Uint8Array | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<R2Object> {
    const bytes =
      value instanceof Uint8Array
        ? value
        : new Uint8Array(value as ArrayBuffer);
    this.store.set(key, {
      bytes,
      contentType:
        options?.httpMetadata?.contentType ?? "application/octet-stream",
    });
    return {} as R2Object;
  }

  async get(key: string): Promise<R2ObjectBody | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    const bytes = entry.bytes;
    return {
      async arrayBuffer() {
        return bytes.buffer as ArrayBuffer;
      },
      body: new ReadableStream(),
    } as unknown as R2ObjectBody;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}

// ── in-memory reports storage ─────────────────────────────────────────────────

class MemoryReportsStorage implements ReportsStorage {
  readonly bucket = new MemoryR2Bucket();
  lastKey: string | null = null;
  failPut = false;
  failDelete = false;

  generateKey(input: {
    organizationId: string;
    propertyId: string;
    fileName: string;
  }): string {
    // Deterministic key for testing (no real UUID randomness)
    return `reports/${input.organizationId}/${input.propertyId}/test-uuid-${input.fileName}`;
  }

  async putReport(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void> {
    if (this.failPut) throw new Error("Simulated put failure");
    this.lastKey = key;
    await this.bucket.put(key, bytes, { httpMetadata: { contentType } });
  }

  async getReportBytes(key: string): Promise<Uint8Array | undefined> {
    const obj = await this.bucket.get(key);
    if (!obj) return undefined;
    return new Uint8Array(await obj.arrayBuffer());
  }

  async deleteReport(key: string): Promise<void> {
    if (this.failDelete) throw new Error("Simulated delete failure");
    await this.bucket.delete(key);
  }
}

// ── in-memory exports repository ──────────────────────────────────────────────

type ExportHistoryInsertInput = {
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
  fullAccess = true;
  insertedHistory: ExportHistoryInsertInput | null = null;
  deletedHistory: ExportHistoryRow | null = null;
  insertShouldFail = false;
  exportRow: ExportHistoryRow | null = null;

  // stubs for other sub-slices
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

  async listSnapshotsForPropertyPdf(): Promise<SnapshotPdfContext[]> {
    return this.pdfContextList;
  }

  async hasFullAccess(): Promise<boolean> {
    return this.fullAccess;
  }

  async insertExportHistory(input: ExportHistoryInsertInput): Promise<string> {
    if (this.insertShouldFail) throw new Error("Simulated DB insert failure");
    this.insertedHistory = input;
    return EXPORT_ID;
  }

  async getExportHistoryRow(input: {
    exportId: string;
    organizationId: string;
  }): Promise<ExportHistoryRow | null> {
    if (!this.exportRow) return null;
    // enforce org isolation
    if (this.exportRow.organization_id !== input.organizationId) return null;
    if (this.exportRow.id !== input.exportId) return null;
    return this.exportRow;
  }

  async deleteExportHistory(input: {
    exportId: string;
    organizationId: string;
    beforeDeleteStorage?: (storagePath: string) => Promise<void>;
  }): Promise<ExportHistoryRow | null> {
    const row = await this.getExportHistoryRow(input);
    if (!row) return null;
    if (row.storage_path) {
      await input.beforeDeleteStorage?.(row.storage_path);
    }
    this.deletedHistory = row;
    this.exportRow = null;
    return row;
  }
}

// ── auth fixtures ─────────────────────────────────────────────────────────────

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
  reportsStorage: MemoryReportsStorage,
  authContext: AuthenticatedUserContext = makeAuthContext(),
  fetchOverride?: typeof fetch,
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
    reportsStorage,
    auth: {
      verifier,
      db: { mode: "postgrest-compat", auth, protectedRecords },
    },
  };
  if (fetchOverride) deps.fetch = fetchOverride;

  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route("/api/v1", createExportsRoutes(deps));
  return app;
}

function env(extras?: Partial<AppEnv>): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
    DOCUMENT_ACCESS_SIGNING_SECRET: SIGNING_SECRET,
    SUPABASE_URL: "https://test.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
    ...extras,
  } as unknown as AppEnv;
}

function authHeaders() {
  return { authorization: "Bearer valid-token" };
}

function makePdfContext(): SnapshotPdfContext {
  return {
    snapshot: {
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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
    },
    lease: { tenant_name: "Acme Corp" },
    property: { name: "Main Street Plaza", address: "100 Main St" },
    organization: { name: "CapVeri LLC" },
  };
}

const VALID_DOWNLOAD_BODY = {
  property_id: PROPERTY_ID,
  year: 2024,
  include_charts: false,
  include_notes: false,
};

// ─────────────────────────────────────────────────────────────────────────────
// parseStoragePath / encodeR2StoragePath unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("parseStoragePath / encodeR2StoragePath", () => {
  it("encodeR2StoragePath produces r2: prefix", () => {
    expect(encodeR2StoragePath("reports/org/prop/file.pdf")).toBe(
      "r2:reports/org/prop/file.pdf",
    );
  });

  it("parseStoragePath with r2: prefix returns r2 provider and strips prefix", () => {
    const parsed = parseStoragePath("r2:reports/org/prop/file.pdf");
    expect(parsed.provider).toBe("r2");
    expect(parsed.key).toBe("reports/org/prop/file.pdf");
  });

  it("parseStoragePath without prefix returns supabase provider", () => {
    const parsed = parseStoragePath("reports/org/prop/file.pdf");
    expect(parsed.provider).toBe("supabase");
    expect(parsed.key).toBe("reports/org/prop/file.pdf");
  });

  it("round-trip: encode then parse returns original key", () => {
    const key = "reports/abc/def/uuid-report.pdf";
    const encoded = encodeR2StoragePath(key);
    const parsed = parseStoragePath(encoded);
    expect(parsed.provider).toBe("r2");
    expect(parsed.key).toBe(key);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Export download token unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildExportDownloadToken / verifyExportDownloadToken", () => {
  const secret = "test-secret-32-bytes-padded-here";

  it("round-trips a valid token", async () => {
    const payload = {
      r2Key: "reports/org/prop/file.pdf",
      fileName: "report.pdf",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await buildExportDownloadToken(payload, secret);
    const result = await verifyExportDownloadToken(token, secret);
    expect(result.r2Key).toBe(payload.r2Key);
    expect(result.fileName).toBe(payload.fileName);
    expect(result.expiresAt).toBe(payload.expiresAt);
  });

  it("rejects a tampered token with 400", async () => {
    const payload = {
      r2Key: "key",
      fileName: "file.pdf",
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = await buildExportDownloadToken(payload, secret);
    const [encodedPart, sigPart] = token.split(".");
    const tampered = `${encodedPart}.${sigPart?.slice(0, -2)}xx`;
    await expect(
      verifyExportDownloadToken(tampered, secret),
    ).rejects.toMatchObject({
      status: 400,
    });
  });

  it("rejects an expired token with 410", async () => {
    const payload = {
      r2Key: "key",
      fileName: "file.pdf",
      expiresAt: Math.floor(Date.now() / 1000) - 1, // already expired
    };
    const token = await buildExportDownloadToken(payload, secret);
    await expect(
      verifyExportDownloadToken(token, secret),
    ).rejects.toMatchObject({
      status: 410,
    });
  });

  it("rejects a malformed (non-two-part) token with 400", async () => {
    await expect(
      verifyExportDownloadToken("not-a-valid-token", secret),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a token with a non-string content type", async () => {
    const token = await buildExportDownloadToken(
      {
        r2Key: "key",
        fileName: "file.pdf",
        contentType: 123,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      } as unknown as Parameters<typeof buildExportDownloadToken>[0],
      secret,
    );

    await expect(
      verifyExportDownloadToken(token, secret),
    ).rejects.toMatchObject({ status: 400 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reports storage adapter tests
// ─────────────────────────────────────────────────────────────────────────────

describe("createReportsStorage", () => {
  it("throws ConfigError when REPORTS_BUCKET is missing", () => {
    expect(() => createReportsStorage({})).toThrow("REPORTS_BUCKET");
  });

  it("generateKey produces reports/{org}/{prop}/{uuid}-{filename} format", () => {
    const bucket = new MemoryR2Bucket();
    const storage = createReportsStorage({
      REPORTS_BUCKET: bucket as unknown as R2Bucket,
    });
    const key = storage.generateKey({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      fileName: "report.pdf",
    });
    expect(key).toMatch(
      new RegExp(`^reports/${ORG_ID}/${PROPERTY_ID}/[0-9a-f-]+-report\\.pdf$`),
    );
  });

  it("sanitizes slashes in filename so the key has no double-slash sequences", () => {
    const bucket = new MemoryR2Bucket();
    const storage = createReportsStorage({
      REPORTS_BUCKET: bucket as unknown as R2Bucket,
    });
    const key = storage.generateKey({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      fileName: "path/to/report.pdf",
    });
    // The filename portion (last segment) must not contain a literal slash —
    // i.e., slashes in the input filename must be replaced by underscores so the
    // resulting key has exactly 4 path segments: reports/{org}/{prop}/{uuid}-{safe}
    expect(key.split("/").length).toBe(4);
    expect(key).not.toContain("//");
  });

  it("put/get/delete round-trip works", async () => {
    const bucket = new MemoryR2Bucket();
    const storage = createReportsStorage({
      REPORTS_BUCKET: bucket as unknown as R2Bucket,
    });
    const key = "reports/org/prop/test-file.pdf";
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    await storage.putReport(key, bytes, "application/pdf");

    const retrieved = await storage.getReportBytes(key);
    expect(retrieved).toEqual(bytes);

    await storage.deleteReport(key);
    const afterDelete = await storage.getReportBytes(key);
    expect(afterDelete).toBeUndefined();
  });

  it("getReportBytes returns undefined for missing key", async () => {
    const bucket = new MemoryR2Bucket();
    const storage = createReportsStorage({
      REPORTS_BUCKET: bucket as unknown as R2Bucket,
    });
    const result = await storage.getReportBytes("no-such-key");
    expect(result).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /export/pdf/download (EP-7)
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /api/v1/export/pdf/download", () => {
  it("returns 401 without auth header", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      "/api/v1/export/pdf/download",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(VALID_DOWNLOAD_BODY),
      },
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for tenant party", async () => {
    const repo = new MemoryExportsRepository();
    repo.pdfContextList = [makePdfContext()];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage, makeAuthContext("owner", "tenant"));
    const res = await app.request(
      "/api/v1/export/pdf/download",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DOWNLOAD_BODY),
      },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 402 when org has no full access", async () => {
    const repo = new MemoryExportsRepository();
    repo.fullAccess = false;
    repo.pdfContextList = [makePdfContext()];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      "/api/v1/export/pdf/download",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DOWNLOAD_BODY),
      },
      env(),
    );
    expect(res.status).toBe(402);
  });

  it("returns 404 when no finalized snapshots found", async () => {
    const repo = new MemoryExportsRepository();
    repo.pdfContextList = [];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      "/api/v1/export/pdf/download",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DOWNLOAD_BODY),
      },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 PDF with attachment disposition and correct filename", async () => {
    const repo = new MemoryExportsRepository();
    repo.pdfContextList = [makePdfContext()];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      "/api/v1/export/pdf/download",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DOWNLOAD_BODY),
      },
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment");
    // Filename matches FastAPI: reconciliation-{year}-property.pdf
    expect(disposition).toContain(
      'filename="reconciliation-2024-property.pdf"',
    );
    expect(res.headers.get("x-capveri-export-id")).toBe(EXPORT_ID);
    expect(res.headers.get("x-capveri-export-storage-path")).toMatch(/^r2:/);
  });

  it("inserts export_history with r2: prefixed storage_path", async () => {
    const repo = new MemoryExportsRepository();
    repo.pdfContextList = [makePdfContext()];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    await app.request(
      "/api/v1/export/pdf/download",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DOWNLOAD_BODY),
      },
      env(),
    );
    expect(repo.insertedHistory).not.toBeNull();
    expect(repo.insertedHistory?.storagePath).toMatch(/^r2:/);
    expect(repo.insertedHistory?.format).toBe("pdf");
    expect(repo.insertedHistory?.fileName).toBe(
      "reconciliation-2024-property.pdf",
    );
    expect(repo.insertedHistory?.organizationId).toBe(ORG_ID);
    expect(repo.insertedHistory?.propertyId).toBe(PROPERTY_ID);
  });

  it("created_by_name uses fullName when available", async () => {
    const repo = new MemoryExportsRepository();
    repo.pdfContextList = [makePdfContext()];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(
      repo,
      storage,
      makeAuthContext("owner", "landlord", "Jane Smith"),
    );
    await app.request(
      "/api/v1/export/pdf/download",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DOWNLOAD_BODY),
      },
      env(),
    );
    expect(repo.insertedHistory?.createdByName).toBe("Jane Smith");
  });

  it("created_by_name falls back to email when fullName is null", async () => {
    const repo = new MemoryExportsRepository();
    repo.pdfContextList = [makePdfContext()];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(
      repo,
      storage,
      makeAuthContext("owner", "landlord", null),
    );
    await app.request(
      "/api/v1/export/pdf/download",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DOWNLOAD_BODY),
      },
      env(),
    );
    expect(repo.insertedHistory?.createdByName).toBe("owner@test.example");
  });

  it("upload is persisted to R2 (file present in storage after success)", async () => {
    const repo = new MemoryExportsRepository();
    repo.pdfContextList = [makePdfContext()];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      "/api/v1/export/pdf/download",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DOWNLOAD_BODY),
      },
      env(),
    );
    expect(res.status).toBe(200);
    expect(storage.lastKey).not.toBeNull();
    // Key is in the R2 bucket
    const bytes = await storage.getReportBytes(storage.lastKey!);
    expect(bytes).not.toBeUndefined();
  });

  it("rolls back R2 object when DB insert fails (500 returned)", async () => {
    const repo = new MemoryExportsRepository();
    repo.pdfContextList = [makePdfContext()];
    repo.insertShouldFail = true;
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      "/api/v1/export/pdf/download",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DOWNLOAD_BODY),
      },
      env(),
    );
    // Should fail with 5xx (the DB error propagates)
    expect(res.status).toBeGreaterThanOrEqual(500);
    // R2 object must be deleted (rollback happened)
    const key = storage.lastKey;
    if (key) {
      const bytes = await storage.getReportBytes(key);
      expect(bytes).toBeUndefined();
    }
  });

  it("fileSize is set to the actual PDF byte length", async () => {
    const repo = new MemoryExportsRepository();
    repo.pdfContextList = [makePdfContext()];
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      "/api/v1/export/pdf/download",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(VALID_DOWNLOAD_BODY),
      },
      env(),
    );
    expect(res.status).toBe(200);
    const pdfBytes = new Uint8Array(await res.arrayBuffer());
    // fileSize stored matches actual bytes streamed
    expect(repo.insertedHistory?.fileSize).toBe(pdfBytes.byteLength);
    expect(pdfBytes.byteLength).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/export/download/file (public token route)
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/v1/export/download/file", () => {
  async function makeValidToken(
    r2Key: string,
    fileName = "report.pdf",
    contentType?: string,
  ): Promise<string> {
    const payload: {
      r2Key: string;
      fileName: string;
      expiresAt: number;
      contentType?: string;
    } = {
      r2Key,
      fileName,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };
    if (contentType !== undefined) {
      payload.contentType = contentType;
    }
    return buildExportDownloadToken(payload, SIGNING_SECRET);
  }

  it("returns 200 and PDF bytes for a valid token", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const r2Key = "reports/org/prop/file.pdf";
    await storage.putReport(
      r2Key,
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      "application/pdf",
    );
    const token = await makeValidToken(r2Key);
    const app = makeTestApp(repo, storage);
    // No auth header — this is the public route
    const res = await app.request(
      `/api/v1/export/download/file?token=${encodeURIComponent(token)}`,
      {},
      env(),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("cache-control")).toBe(
      "private, max-age=0, no-store",
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("returns ZIP content type for a signed ZIP token", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const r2Key = "reports/org/prop/file.zip";
    await storage.putReport(
      r2Key,
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      "application/zip",
    );
    const token = await makeValidToken(
      r2Key,
      "reconciliation-2024-batch.zip",
      "application/zip",
    );
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      `/api/v1/export/download/file?token=${encodeURIComponent(token)}`,
      {},
      env(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
  });

  it("returns XLSX content type for a signed spreadsheet token", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const r2Key = "reports/org/prop/file.xlsx";
    await storage.putReport(
      r2Key,
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const token = await makeValidToken(
      r2Key,
      "statement-check-report.xlsx",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      `/api/v1/export/download/file?token=${encodeURIComponent(token)}`,
      {},
      env(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  });

  it("falls back to filename extension for legacy ZIP tokens without content type", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const r2Key = "reports/org/prop/file.zip";
    await storage.putReport(
      r2Key,
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      "application/zip",
    );
    const token = await makeValidToken(r2Key, "legacy-batch.zip");
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      `/api/v1/export/download/file?token=${encodeURIComponent(token)}`,
      {},
      env(),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
  });

  it("works WITHOUT an Authorization header (public route)", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const r2Key = "reports/org/prop/file.pdf";
    await storage.putReport(
      r2Key,
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      "application/pdf",
    );
    const token = await makeValidToken(r2Key);
    const app = makeTestApp(repo, storage);
    // Explicitly omit Authorization header
    const res = await app.request(
      `/api/v1/export/download/file?token=${encodeURIComponent(token)}`,
      { headers: {} },
      env(),
    );
    expect(res.status).toBe(200);
  });

  it("returns 400 when token is missing", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request("/api/v1/export/download/file", {}, env());
    expect(res.status).toBe(400);
  });

  it("returns 400 for tampered token", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      `/api/v1/export/download/file?token=invalidtoken.badsig`,
      {},
      env(),
    );
    expect(res.status).toBe(400);
  });

  it("returns 410 for an expired token", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const expiredToken = await buildExportDownloadToken(
      {
        r2Key: "some/key",
        fileName: "file.pdf",
        expiresAt: Math.floor(Date.now() / 1000) - 1,
      },
      SIGNING_SECRET,
    );
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      `/api/v1/export/download/file?token=${encodeURIComponent(expiredToken)}`,
      {},
      env(),
    );
    expect(res.status).toBe(410);
  });

  it("returns 404 when R2 object is missing", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const token = await makeValidToken("reports/org/prop/missing.pdf");
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      `/api/v1/export/download/file?token=${encodeURIComponent(token)}`,
      {},
      env(),
    );
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/export/download/:exportId (EP-11)
// ─────────────────────────────────────────────────────────────────────────────

function makeExportRow(
  overrides: Partial<ExportHistoryRow> = {},
): ExportHistoryRow {
  return {
    id: EXPORT_ID,
    organization_id: ORG_ID,
    property_id: PROPERTY_ID,
    format: "pdf",
    file_name: "reconciliation-2024-property.pdf",
    file_size: 12345,
    status: "completed",
    created_by_name: "Test Owner",
    created_at: "2024-01-01T00:00:00Z",
    storage_path: `r2:reports/${ORG_ID}/${PROPERTY_ID}/uuid-reconciliation-2024-property.pdf`,
    ...overrides,
  };
}

describe("GET /api/v1/export/download/:exportId", () => {
  it("returns 401 without auth header", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      `/api/v1/export/download/${EXPORT_ID}`,
      {},
      env(),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for tenant party", async () => {
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow();
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage, makeAuthContext("owner", "tenant"));
    const res = await app.request(
      `/api/v1/export/download/${EXPORT_ID}`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 when export_history row not found", async () => {
    const repo = new MemoryExportsRepository();
    repo.exportRow = null;
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      `/api/v1/export/download/${EXPORT_ID}`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("returns 410 when storage_path is null", async () => {
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({ storage_path: null });
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      `/api/v1/export/download/${EXPORT_ID}`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(410);
    const body = (await res.json()) as { error?: { message?: string } };
    // Matches FastAPI's exact message
    expect(body.error?.message).toContain("no longer available");
  });

  it("org isolation: returns 404 for export belonging to another org", async () => {
    const OTHER_ORG = "11111111-1111-4111-8111-111111111111";
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({ organization_id: OTHER_ORG });
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      `/api/v1/export/download/${EXPORT_ID}`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(404);
  });

  it("R2 path: returns JSON with download_url, file_name, expires_at", async () => {
    const r2Key = `reports/${ORG_ID}/${PROPERTY_ID}/uuid-reconciliation-2024-property.pdf`;
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({ storage_path: `r2:${r2Key}` });
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      `/api/v1/export/download/${EXPORT_ID}`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      download_url?: string;
      file_name?: string;
      expires_at?: string;
    };
    expect(body.download_url).toContain("/api/v1/export/download/file?token=");
    expect(body.file_name).toBe("reconciliation-2024-property.pdf");
    expect(body.expires_at).toBeDefined();
  });

  it("R2 path: token in download_url is valid and points to correct key", async () => {
    const r2Key = `reports/${ORG_ID}/${PROPERTY_ID}/uuid-reconciliation-2024-property.pdf`;
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({ storage_path: `r2:${r2Key}` });
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      `/api/v1/export/download/${EXPORT_ID}`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { download_url?: string };
    const url = new URL(body.download_url ?? "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    const payload = await verifyExportDownloadToken(token, SIGNING_SECRET);
    expect(payload.r2Key).toBe(r2Key);
    expect(payload.contentType).toBe("application/pdf");
    expect(payload.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("R2 path: token content type follows export history format", async () => {
    const r2Key = `reports/${ORG_ID}/${PROPERTY_ID}/uuid-batch.zip`;
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({
      format: "pdf_batch",
      file_name: "reconciliation-2024-batch.zip",
      storage_path: `r2:${r2Key}`,
    });
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    const res = await app.request(
      `/api/v1/export/download/${EXPORT_ID}`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { download_url?: string };
    const url = new URL(body.download_url ?? "http://localhost");
    const token = url.searchParams.get("token") ?? "";
    const payload = await verifyExportDownloadToken(token, SIGNING_SECRET);
    expect(payload.r2Key).toBe(r2Key);
    expect(payload.contentType).toBe("application/zip");
  });

  it("legacy Supabase path: calls sign REST and returns its URL", async () => {
    const legacyPath = `reports/${ORG_ID}/${PROPERTY_ID}/legacy-file.pdf`;
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({ storage_path: legacyPath });
    const storage = new MemoryReportsStorage();

    // Fake fetch returning the REAL raw Storage REST response shape: the
    // signedURL is relative to /storage/v1 and does NOT include that prefix.
    const fakeFetch = async (): Promise<Response> => {
      return new Response(
        JSON.stringify({
          signedURL: "/object/sign/reports/file.pdf?token=abc",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };

    const app = makeTestApp(
      repo,
      storage,
      makeAuthContext(),
      fakeFetch as typeof fetch,
    );
    const res = await app.request(
      `/api/v1/export/download/${EXPORT_ID}`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { download_url?: string };
    // Must be the absolute URL storage-js would build:
    // {SUPABASE_URL}/storage/v1{signedURL}
    expect(body.download_url).toBe(
      "https://test.supabase.co/storage/v1/object/sign/reports/file.pdf?token=abc",
    );
  });

  it("legacy Supabase path: handles signedURL already prefixed with /storage/v1", async () => {
    const legacyPath = `reports/${ORG_ID}/${PROPERTY_ID}/legacy-file.pdf`;
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({ storage_path: legacyPath });
    const storage = new MemoryReportsStorage();

    const fakeFetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          signedURL: "/storage/v1/object/sign/reports/file.pdf?token=xyz",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );

    const app = makeTestApp(
      repo,
      storage,
      makeAuthContext(),
      fakeFetch as typeof fetch,
    );
    const res = await app.request(
      `/api/v1/export/download/${EXPORT_ID}`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { download_url?: string };
    // No double /storage/v1 prefix
    expect(body.download_url).toBe(
      "https://test.supabase.co/storage/v1/object/sign/reports/file.pdf?token=xyz",
    );
  });

  it("legacy Supabase path: 500 when Supabase config missing", async () => {
    const legacyPath = `reports/${ORG_ID}/${PROPERTY_ID}/legacy-file.pdf`;
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({ storage_path: legacyPath });
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);
    // env without SUPABASE_URL
    const res = await app.request(
      `/api/v1/export/download/${EXPORT_ID}`,
      { headers: authHeaders() },
      {
        ENVIRONMENT: "test",
        APP_VERSION: "test",
        DOCUMENT_ACCESS_SIGNING_SECRET: SIGNING_SECRET,
      } as unknown as AppEnv,
    );
    expect(res.status).toBe(500);
  });

  it("legacy Supabase path: 502 when sign REST fails", async () => {
    const legacyPath = `reports/${ORG_ID}/${PROPERTY_ID}/legacy-file.pdf`;
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({ storage_path: legacyPath });
    const storage = new MemoryReportsStorage();

    const failFetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });

    const app = makeTestApp(
      repo,
      storage,
      makeAuthContext(),
      failFetch as typeof fetch,
    );
    const res = await app.request(
      `/api/v1/export/download/${EXPORT_ID}`,
      { headers: authHeaders() },
      env(),
    );
    expect(res.status).toBe(502);
  });
});

describe("DELETE /api/v1/export/history/:exportId", () => {
  it("requires authentication", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      `/api/v1/export/history/${EXPORT_ID}`,
      { method: "DELETE" },
      env(),
    );

    expect(res.status).toBe(401);
  });

  it("rejects tenant-party actors", async () => {
    const r2Key = `reports/${ORG_ID}/${PROPERTY_ID}/export.pdf`;
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({ storage_path: `r2:${r2Key}` });
    const storage = new MemoryReportsStorage();
    await storage.putReport(
      r2Key,
      new Uint8Array([1, 2, 3]),
      "application/pdf",
    );

    const app = makeTestApp(repo, storage, makeAuthContext("owner", "tenant"));
    const res = await app.request(
      `/api/v1/export/history/${EXPORT_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );

    expect(res.status).toBe(403);
    expect(await storage.getReportBytes(r2Key)).toBeDefined();
    expect(repo.exportRow?.id).toBe(EXPORT_ID);
  });

  it("does not delete another organization's export", async () => {
    const r2Key = `reports/${ORG_ID}/${PROPERTY_ID}/export.pdf`;
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({ storage_path: `r2:${r2Key}` });
    const storage = new MemoryReportsStorage();
    await storage.putReport(
      r2Key,
      new Uint8Array([1, 2, 3]),
      "application/pdf",
    );
    const authContext = makeAuthContext();
    authContext.user.organizationId = "99999999-9999-4999-8999-999999999999";
    authContext.actor.organizationId = "99999999-9999-4999-8999-999999999999";

    const app = makeTestApp(repo, storage, authContext);
    const res = await app.request(
      `/api/v1/export/history/${EXPORT_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );

    expect(res.status).toBe(404);
    expect(await storage.getReportBytes(r2Key)).toBeDefined();
    expect(repo.exportRow?.id).toBe(EXPORT_ID);
  });

  it("deletes R2-backed export storage before deleting the history row", async () => {
    const r2Key = `reports/${ORG_ID}/${PROPERTY_ID}/export.pdf`;
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({ storage_path: `r2:${r2Key}` });
    const storage = new MemoryReportsStorage();
    await storage.putReport(
      r2Key,
      new Uint8Array([1, 2, 3]),
      "application/pdf",
    );

    const app = makeTestApp(repo, storage);
    const res = await app.request(
      `/api/v1/export/history/${EXPORT_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );

    expect(res.status).toBe(204);
    expect(await storage.getReportBytes(r2Key)).toBeUndefined();
    expect(repo.deletedHistory?.id).toBe(EXPORT_ID);
    expect(repo.exportRow).toBeNull();
  });

  it("keeps the history row when R2 deletion fails", async () => {
    const r2Key = `reports/${ORG_ID}/${PROPERTY_ID}/export.pdf`;
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({ storage_path: `r2:${r2Key}` });
    const storage = new MemoryReportsStorage();
    await storage.putReport(
      r2Key,
      new Uint8Array([1, 2, 3]),
      "application/pdf",
    );
    storage.failDelete = true;

    const app = makeTestApp(repo, storage);
    const res = await app.request(
      `/api/v1/export/history/${EXPORT_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );

    expect(res.status).toBe(503);
    expect(await storage.getReportBytes(r2Key)).toBeDefined();
    expect(repo.deletedHistory).toBeNull();
    expect(repo.exportRow?.id).toBe(EXPORT_ID);
    await expect(res.json()).resolves.toMatchObject({
      detail: "Export storage cleanup failed; export history was not deleted",
      error: { code: "export_storage_delete_failed" },
    });
  });

  it("rejects legacy Supabase storage paths rather than deleting only the row", async () => {
    const legacyPath = `reports/${ORG_ID}/${PROPERTY_ID}/legacy-file.pdf`;
    const repo = new MemoryExportsRepository();
    repo.exportRow = makeExportRow({ storage_path: legacyPath });
    const storage = new MemoryReportsStorage();

    const app = makeTestApp(repo, storage);
    const res = await app.request(
      `/api/v1/export/history/${EXPORT_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );

    expect(res.status).toBe(400);
    expect(repo.deletedHistory).toBeNull();
    expect(repo.exportRow?.id).toBe(EXPORT_ID);
    await expect(res.json()).resolves.toMatchObject({
      detail:
        "Legacy export storage cannot be safely deleted through this route",
      error: { code: "legacy_export_cleanup_unsupported" },
    });
  });

  it("returns 404 when the export history row is absent", async () => {
    const repo = new MemoryExportsRepository();
    const storage = new MemoryReportsStorage();
    const app = makeTestApp(repo, storage);

    const res = await app.request(
      `/api/v1/export/history/${EXPORT_ID}`,
      { method: "DELETE", headers: authHeaders() },
      env(),
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({
      detail: "Export not found",
      error: { code: "export_not_found" },
    });
  });
});
