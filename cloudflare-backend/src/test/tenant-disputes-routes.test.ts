import { Hono } from "hono";
import { unzlibSync } from "fflate";
import { describe, expect, it, vi } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type { DisputeAttachmentStorage } from "../adapters/storage/dispute-attachments";
import type {
  AddAttachmentInput,
  AddCommentInput,
  CalculationTraceStep,
  CreateDisputeInput,
  DeleteSyntheticDisputeResult,
  DeleteSyntheticTenantDisputeInput,
  DisputeAttachment,
  DisputeComment,
  DisputeDetail,
  DisputeSummary,
  ListDisputesInput,
  StatementPdfContext,
  TenantDisputesRepository,
} from "../domain/tenant-disputes/repository";
import type { AppEnv } from "../env";
import { createTenantDisputesRoutes } from "../http/tenant-disputes-routes";
import type { AuthVariables } from "../middleware/auth";
import {
  buildStatementPdf,
  formatGeneratedOn,
} from "../domain/tenant-portal/statement-pdf";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_USER_ID = "33333333-3333-4333-8333-333333333333";
const STATEMENT_ID = "44444444-4444-4444-8444-444444444444";
const DISPUTE_ID = "55555555-5555-4555-8555-555555555555";
const ATTACHMENT_ID = "66666666-6666-4666-8666-666666666666";

const FIXED_NOW = "2026-06-13T00:00:00.000Z";
const sentryDsn = "https://public@example.ingest.sentry.io/12345";
const SYNTHETIC_DESCRIPTION =
  "[PROD-TEST] Tenant dispute lifecycle prod_e2e_run_id=run-12345678. " +
  "Synthetic dispute for production cleanup verification.";
const SYNTHETIC_STATEMENT_HANDOFF_DESCRIPTION =
  "[PROD-TEST] Tenant statement dispute handoff prod_e2e_run_id=run-12345678. " +
  "Synthetic dispute created after downloading its tenant statement PDF.";
const LEGACY_SYNTHETIC_STATEMENT_HANDOFF_DESCRIPTION =
  "[PROD-TEST] Tenant statement dispute handoff prod_e2e_run_id=run-12345678. " +
  `Synthetic dispute created from statement ${STATEMENT_ID} after downloading its tenant PDF.`;

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

const SAMPLE_PDF_CONTEXT: StatementPdfContext = {
  snapshot: {
    id: STATEMENT_ID,
    period_start_date: "2025-01-01",
    period_end_date: "2025-12-31",
    total_operating_expenses: "100000",
    grossed_up_expenses: "105000",
    base_year_amount: "90000",
    tenant_share_before_cap: "12500",
    tenant_share_after_cap: "12000",
    admin_fee: "360",
    total_recovery: "12360",
    calculation_trace: [
      {
        step_name: "Gross Up",
        operation: "multiply",
        output_value: "105000",
        output_unit: "currency",
        note: null,
      } satisfies CalculationTraceStep,
    ],
  },
  lease: { tenant_name: "Acme Corp" },
  property: { name: "Market Plaza", address: "100 Main St, Dallas, TX 75201" },
  organization: { name: "CapVeri LLC" },
};

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

class MemoryTenantDisputesRepository implements TenantDisputesRepository {
  recentCount = 0;
  verifyResult: "ok" | "not_found" | "not_linked" = "ok";
  disputes: DisputeSummary[] = [];
  disputeDetail: DisputeDetail | null = {
    id: DISPUTE_ID,
    statement_id: STATEMENT_ID,
    category: "calculation_error",
    status: "open",
    description: "Tenant-owned dispute",
    created_at: FIXED_NOW,
    comments: [],
    attachments: [],
  };
  pdfContext: StatementPdfContext | null = SAMPLE_PDF_CONTEXT;

  async countRecentDisputesForTenant(): Promise<number> {
    return this.recentCount;
  }

  async verifyStatementForTenant(): Promise<"ok" | "not_found" | "not_linked"> {
    return this.verifyResult;
  }

  lastCreateInput: CreateDisputeInput | null = null;

  async createDispute(input: CreateDisputeInput): Promise<DisputeSummary> {
    this.lastCreateInput = input;
    const dispute: DisputeSummary = {
      id: DISPUTE_ID,
      statement_id: input.statementId,
      category: input.category,
      status: "open",
      description: input.description,
      created_at: input.now,
    };
    this.disputes.push(dispute);
    return dispute;
  }

  async listDisputes(input: ListDisputesInput): Promise<DisputeSummary[]> {
    return this.disputes
      .filter((d) => !input.status || d.status === input.status)
      .slice(input.skip, input.skip + input.limit);
  }

  async getDispute(input: {
    disputeId: string;
    tenantUserId: string;
  }): Promise<DisputeDetail | null> {
    if (input.disputeId !== DISPUTE_ID) {
      return null;
    }
    return this.disputeDetail;
  }

  async addComment(input: AddCommentInput): Promise<DisputeComment | null> {
    if (input.disputeId !== DISPUTE_ID) {
      return null;
    }
    return {
      id: "cc000000-0000-4000-8000-000000000001",
      dispute_id: input.disputeId,
      author_id: input.authorId,
      author_name: input.authorName,
      content: input.content,
      is_internal: false,
      created_at: input.now,
    };
  }

  forceAttachmentFailure = false;
  lastDeleteInput: DeleteSyntheticTenantDisputeInput | null = null;
  deleteResult: DeleteSyntheticDisputeResult | null = {
    dispute_attachments: 1,
    dispute_comments: 2,
    disputes: 1,
  };

  async addAttachment(
    input: AddAttachmentInput,
  ): Promise<DisputeAttachment | null> {
    // Mirror the production repo's ownership re-check: the real addAttachment
    // scopes its insert by tenant_user_id and returns null when the dispute is
    // not owned by the caller. Modeling that here keeps the mock faithful so a
    // reviewer cannot mistake the up-front getDispute check as the only gate.
    if (
      this.forceAttachmentFailure ||
      input.disputeId !== DISPUTE_ID ||
      this.disputeDetail === null
    ) {
      return null;
    }
    return {
      id: ATTACHMENT_ID,
      filename: input.filename,
      file_url: `/api/v1/tenant/disputes/${input.disputeId}/attachments/${ATTACHMENT_ID}`,
      file_size_bytes: input.fileSize,
      content_type: input.mimeType,
      created_at: input.now,
    };
  }

  async getAttachmentForDownload(input: {
    disputeId: string;
    attachmentId: string;
    tenantUserId: string;
  }): Promise<{
    storagePath: string;
    filename: string;
    mimeType: string;
  } | null> {
    if (
      input.disputeId !== DISPUTE_ID ||
      input.attachmentId !== ATTACHMENT_ID
    ) {
      return null;
    }
    return {
      storagePath: `disputes/${ORG_ID}/${DISPUTE_ID}/uuid/test.pdf`,
      filename: "test.pdf",
      mimeType: "application/pdf",
    };
  }

  async deleteSyntheticTenantDispute(
    input: DeleteSyntheticTenantDisputeInput,
  ): Promise<DeleteSyntheticDisputeResult | null> {
    this.lastDeleteInput = input;
    if (
      input.disputeId !== DISPUTE_ID ||
      input.tenantUserId !== TENANT_USER_ID ||
      input.expectedDescription !== this.disputeDetail?.description
    ) {
      return null;
    }
    return this.deleteResult;
  }

  async getStatementPdfContext(input: {
    statementId: string;
    tenantUserId: string;
    organizationId: string;
  }): Promise<StatementPdfContext | null> {
    if (input.statementId !== STATEMENT_ID) {
      return null;
    }
    return this.pdfContext;
  }
}

describe("tenant disputes routes", () => {
  describe("POST /tenant/disputes", () => {
    it("creates a dispute and returns 201 with DisputeSummaryDTO", async () => {
      const { app } = createTestApp();

      const response = await app.request(
        "/api/v1/tenant/disputes",
        {
          method: "POST",
          headers: jsonAuthHeaders(),
          body: JSON.stringify({
            statement_id: STATEMENT_ID,
            category: "calculation_error",
            description: "This charge appears too high for our unit.",
          }),
        },
        testEnv(),
      );

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body).toMatchObject({
        id: DISPUTE_ID,
        statement_id: STATEMENT_ID,
        category: "calculation_error",
        status: "open",
      });
    });

    it("returns 429 when rate limit exceeded", async () => {
      const { app, repository } = createTestApp();
      repository.recentCount = 3;

      const response = await app.request(
        "/api/v1/tenant/disputes",
        {
          method: "POST",
          headers: jsonAuthHeaders(),
          body: JSON.stringify({
            statement_id: STATEMENT_ID,
            category: "other",
            description: "This is a valid dispute description.",
          }),
        },
        testEnv(),
      );

      expect(response.status).toBe(429);
    });

    it("returns 404 when statement not found", async () => {
      const { app, repository } = createTestApp();
      repository.verifyResult = "not_found";

      const response = await app.request(
        "/api/v1/tenant/disputes",
        {
          method: "POST",
          headers: jsonAuthHeaders(),
          body: JSON.stringify({
            statement_id: STATEMENT_ID,
            category: "other",
            description: "Description long enough to pass validation.",
          }),
        },
        testEnv(),
      );

      expect(response.status).toBe(404);
    });

    it("returns 403 when statement not linked to tenant", async () => {
      const { app, repository } = createTestApp();
      repository.verifyResult = "not_linked";

      const response = await app.request(
        "/api/v1/tenant/disputes",
        {
          method: "POST",
          headers: jsonAuthHeaders(),
          body: JSON.stringify({
            statement_id: STATEMENT_ID,
            category: "other",
            description: "Description long enough to pass validation.",
          }),
        },
        testEnv(),
      );

      expect(response.status).toBe(403);
    });

    it("returns 422 on invalid category", async () => {
      const { app } = createTestApp();

      const response = await app.request(
        "/api/v1/tenant/disputes",
        {
          method: "POST",
          headers: jsonAuthHeaders(),
          body: JSON.stringify({
            statement_id: STATEMENT_ID,
            category: "invalid_category",
            description: "Some description.",
          }),
        },
        testEnv(),
      );

      expect(response.status).toBe(422);
    });

    it("returns 403 for landlord users", async () => {
      const { app } = createTestApp({ party: "landlord", role: "admin" });

      const response = await app.request(
        "/api/v1/tenant/disputes",
        {
          method: "POST",
          headers: jsonAuthHeaders(),
          body: JSON.stringify({
            statement_id: STATEMENT_ID,
            category: "other",
            description: "A description.",
          }),
        },
        testEnv(),
      );

      expect(response.status).toBe(403);
    });
  });

  describe("GET /tenant/disputes", () => {
    it("returns empty list when no disputes exist", async () => {
      const { app } = createTestApp();

      const response = await app.request(
        "/api/v1/tenant/disputes",
        { headers: authHeaders() },
        testEnv(),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual([]);
    });

    it("returns disputes after creation", async () => {
      const { app, repository } = createTestApp();
      repository.disputes = [
        {
          id: DISPUTE_ID,
          statement_id: STATEMENT_ID,
          category: "calculation_error",
          status: "open",
          description: "Test dispute",
          created_at: FIXED_NOW,
        },
      ];

      const response = await app.request(
        "/api/v1/tenant/disputes",
        { headers: authHeaders() },
        testEnv(),
      );

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toHaveLength(1);
      expect((body as unknown[])[0]).toMatchObject({
        id: DISPUTE_ID,
        status: "open",
      });
    });

    it("filters by status", async () => {
      const { app, repository } = createTestApp();
      repository.disputes = [
        {
          id: DISPUTE_ID,
          statement_id: STATEMENT_ID,
          category: "other",
          status: "open",
          description: "Open dispute",
          created_at: FIXED_NOW,
        },
      ];

      const response = await app.request(
        "/api/v1/tenant/disputes?status=resolved",
        { headers: authHeaders() },
        testEnv(),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual([]);
    });
  });

  describe("GET /tenant/disputes/:disputeId", () => {
    it("returns 404 for unknown dispute", async () => {
      const { app } = createTestApp();

      const response = await app.request(
        `/api/v1/tenant/disputes/${"00000000-0000-4000-8000-000000000000"}`,
        { headers: authHeaders() },
        testEnv(),
      );

      expect(response.status).toBe(404);
    });

    it("returns detail with comments and attachments", async () => {
      const { app, repository } = createTestApp();
      repository.disputeDetail = {
        id: DISPUTE_ID,
        statement_id: STATEMENT_ID,
        category: "calculation_error",
        status: "open",
        description: "Test",
        created_at: FIXED_NOW,
        comments: [
          {
            id: "cc000000-0000-4000-8000-000000000001",
            dispute_id: DISPUTE_ID,
            author_id: TENANT_USER_ID,
            author_name: "Tenant User",
            content: "Test",
            is_internal: false,
            created_at: FIXED_NOW,
          },
        ],
        attachments: [],
      };

      const response = await app.request(
        `/api/v1/tenant/disputes/${DISPUTE_ID}`,
        { headers: authHeaders() },
        testEnv(),
      );

      expect(response.status).toBe(200);
      const body: unknown = await response.json();
      expect(body).toMatchObject({
        id: DISPUTE_ID,
        comments: expect.arrayContaining([
          expect.objectContaining({ is_internal: false }),
        ]),
      });
    });
  });

  describe("POST /tenant/disputes/:disputeId/comments", () => {
    it("adds a comment and forces is_internal=false", async () => {
      const { app } = createTestApp();

      const response = await app.request(
        `/api/v1/tenant/disputes/${DISPUTE_ID}/comments`,
        {
          method: "POST",
          headers: jsonAuthHeaders(),
          body: JSON.stringify({
            content: "I believe this charge is incorrect.",
            is_internal: true, // should be overridden to false
          }),
        },
        testEnv(),
      );

      expect(response.status).toBe(201);
      const body = await response.json();
      expect(body).toMatchObject({
        content: "I believe this charge is incorrect.",
        is_internal: false,
      });
    });

    it("returns 404 for unknown dispute", async () => {
      const { app } = createTestApp();

      const response = await app.request(
        `/api/v1/tenant/disputes/${"00000000-0000-4000-8000-000000000000"}/comments`,
        {
          method: "POST",
          headers: jsonAuthHeaders(),
          body: JSON.stringify({ content: "Some comment" }),
        },
        testEnv(),
      );

      expect(response.status).toBe(404);
    });
  });
});

describe("statement PDF route", () => {
  it("renders calculation notes without malformed empty null trace lines", async () => {
    const bytes = await buildStatementPdf({
      ...SAMPLE_PDF_CONTEXT,
      snapshot: {
        ...SAMPLE_PDF_CONTEXT.snapshot,
        calculation_trace: [
          {
            step_name: "",
            operation: null,
            output_value: null,
            output_unit: "currency",
            note: "QA-owned statement for tenant dispute E2E",
          } satisfies CalculationTraceStep,
        ],
      },
    });

    const text = extractPdfStreamText(bytes);

    expect(text).toContain("Calculation Summary");
    expect(text).toContain("Note: QA-owned statement for tenant dispute E2E");
    expect(text).not.toContain(": null");
  });

  it("stamps a friendly 'Generated on' date, never a raw ISO timestamp", () => {
    const line = formatGeneratedOn(new Date("2026-06-29T14:32:01Z"));
    expect(line).toBe("Generated on June 29, 2026");
    // No developer-artifact ISO timestamp or UTC leak on a tenant-facing doc.
    expect(line).not.toMatch(/\d{4}-\d{2}-\d{2}/u);
    expect(line).not.toContain("UTC");
    expect(line).not.toContain(":");
  });

  it("renders the footer disclaimer and generated date in the PDF body", async () => {
    const bytes = await buildStatementPdf(SAMPLE_PDF_CONTEXT);
    const text = extractPdfStreamText(bytes);

    expect(text).toContain("Generated on");
    expect(text).toContain("informational purposes");
    // The reversed/embedded-rule footer regression must not return.
    expect(text).not.toContain("UTC");
    expect(text).not.toMatch(/Generated:\s*\d{4}-\d{2}-\d{2}/u);
  });

  it("returns PDF bytes with correct headers", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      `/api/v1/tenant/statements/${STATEMENT_ID}/pdf`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      "Reconciliation_Market_Plaza_2025.pdf",
    );
    // PDF magic bytes: %PDF
    const buf = await response.arrayBuffer();
    const first4 = new Uint8Array(buf).slice(0, 4);
    expect(String.fromCharCode(...first4)).toBe("%PDF");
  });

  it("returns a header-safe filename for property-derived statement downloads", async () => {
    const { app, repository } = createTestApp();
    repository.pdfContext = {
      ...SAMPLE_PDF_CONTEXT,
      property: {
        ...SAMPLE_PDF_CONTEXT.property,
        name: 'Market "A"\r\nBad: x',
      },
    };

    const response = await app.request(
      `/api/v1/tenant/statements/${STATEMENT_ID}/pdf`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("Reconciliation_Market_'A'_Bad:_x_2025.pdf");
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain("\n");
    expect(disposition).not.toContain('"A"');
  });

  it("returns 404 when statement not found", async () => {
    const { app, repository } = createTestApp();
    repository.pdfContext = null;

    const response = await app.request(
      `/api/v1/tenant/statements/00000000-0000-4000-8000-000000000000/pdf`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("returns 403 for landlord users", async () => {
    const { app } = createTestApp({ party: "landlord", role: "admin" });

    const response = await app.request(
      `/api/v1/tenant/statements/${STATEMENT_ID}/pdf`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(403);
  });
});

/** In-memory storage fake for attachment tests. */
class MemoryDisputeAttachmentStorage implements DisputeAttachmentStorage {
  private readonly objects = new Map<
    string,
    { bytes: Uint8Array; contentType: string }
  >();
  deletedKeys: string[] = [];
  failDelete = false;

  generateKey(input: {
    organizationId: string;
    disputeId: string;
    filename: string;
  }): string {
    return `${input.organizationId}/disputes/${input.disputeId}/test-uuid/${input.filename}`;
  }

  validateContentType(contentType: string): boolean {
    return ["application/pdf", "image/jpeg", "image/png"].includes(
      contentType.toLowerCase(),
    );
  }

  validateFileSize(size: number): boolean {
    return size <= 10 * 1024 * 1024;
  }

  async putAttachment(
    key: string,
    content: Uint8Array | ArrayBuffer,
    contentType: string,
  ): Promise<void> {
    const bytes =
      content instanceof Uint8Array ? content : new Uint8Array(content);
    this.objects.set(key, { bytes, contentType });
  }

  async getAttachmentBytes(key: string): Promise<Uint8Array | undefined> {
    return this.objects.get(key)?.bytes;
  }

  async deleteAttachment(key: string): Promise<void> {
    if (this.failDelete) {
      throw new Error("R2 delete failed");
    }
    this.objects.delete(key);
    this.deletedKeys.push(key);
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }
}

describe("DELETE /tenant/disputes/:disputeId/e2e-cleanup", () => {
  async function deleteE2eDispute(
    app: Hono<{ Bindings: AppEnv; Variables: AuthVariables }>,
    disputeId: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    return app.request(
      `/api/v1/tenant/disputes/${disputeId}/e2e-cleanup`,
      {
        method: "DELETE",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(body),
      },
      testEnv(),
    );
  }

  it("deletes a matching synthetic tenant dispute after removing attachment objects", async () => {
    const storage = new MemoryDisputeAttachmentStorage();
    const { app, repository } = createTestApp({}, storage);
    repository.disputeDetail = {
      id: DISPUTE_ID,
      statement_id: STATEMENT_ID,
      category: "calculation_error",
      status: "open",
      description: SYNTHETIC_DESCRIPTION,
      created_at: FIXED_NOW,
      comments: [],
      attachments: [
        {
          id: ATTACHMENT_ID,
          filename: "test.pdf",
          file_url: `/api/v1/tenant/disputes/${DISPUTE_ID}/attachments/${ATTACHMENT_ID}`,
          file_size_bytes: 4,
          content_type: "application/pdf",
          created_at: FIXED_NOW,
        },
      ],
    };

    const response = await deleteE2eDispute(app, DISPUTE_ID, {
      run_id: "run-12345678",
      confirm: "delete-prod-e2e-dispute",
    });

    expect(response.status).toBe(200);
    expect(storage.deletedKeys).toEqual([
      `disputes/${ORG_ID}/${DISPUTE_ID}/uuid/test.pdf`,
    ]);
    expect(repository.lastDeleteInput).toEqual({
      disputeId: DISPUTE_ID,
      tenantUserId: TENANT_USER_ID,
      expectedDescription: SYNTHETIC_DESCRIPTION,
    });
    const body = (await response.json()) as {
      attachment_storage_paths: string[];
      deleted: {
        r2_objects: number;
        dispute_attachments: number;
        dispute_comments: number;
        disputes: number;
      };
    };
    expect(body.attachment_storage_paths).toEqual([
      `disputes/${ORG_ID}/${DISPUTE_ID}/uuid/test.pdf`,
    ]);
    expect(body.deleted).toMatchObject({
      r2_objects: 1,
      dispute_attachments: 1,
      dispute_comments: 2,
      disputes: 1,
    });
  });

  it("deletes a matching synthetic tenant statement handoff dispute", async () => {
    const storage = new MemoryDisputeAttachmentStorage();
    const { app, repository } = createTestApp({}, storage);
    repository.disputeDetail = {
      id: DISPUTE_ID,
      statement_id: STATEMENT_ID,
      category: "calculation_error",
      status: "open",
      description: SYNTHETIC_STATEMENT_HANDOFF_DESCRIPTION,
      created_at: FIXED_NOW,
      comments: [],
      attachments: [],
    };

    const response = await deleteE2eDispute(app, DISPUTE_ID, {
      run_id: "run-12345678",
      confirm: "delete-prod-e2e-dispute",
    });

    expect(response.status).toBe(200);
    expect(repository.lastDeleteInput).toEqual({
      disputeId: DISPUTE_ID,
      tenantUserId: TENANT_USER_ID,
      expectedDescription: SYNTHETIC_STATEMENT_HANDOFF_DESCRIPTION,
    });
  });

  it("deletes the legacy statement-id handoff marker from the failed prod run", async () => {
    const storage = new MemoryDisputeAttachmentStorage();
    const { app, repository } = createTestApp({}, storage);
    repository.disputeDetail = {
      id: DISPUTE_ID,
      statement_id: STATEMENT_ID,
      category: "calculation_error",
      status: "open",
      description: LEGACY_SYNTHETIC_STATEMENT_HANDOFF_DESCRIPTION,
      created_at: FIXED_NOW,
      comments: [],
      attachments: [],
    };

    const response = await deleteE2eDispute(app, DISPUTE_ID, {
      run_id: "run-12345678",
      confirm: "delete-prod-e2e-dispute",
    });

    expect(response.status).toBe(200);
    expect(repository.lastDeleteInput).toEqual({
      disputeId: DISPUTE_ID,
      tenantUserId: TENANT_USER_ID,
      expectedDescription: LEGACY_SYNTHETIC_STATEMENT_HANDOFF_DESCRIPTION,
    });
  });

  it("rejects non-synthetic tenant disputes without deleting objects or rows", async () => {
    const storage = new MemoryDisputeAttachmentStorage();
    const { app, repository } = createTestApp({}, storage);
    repository.disputeDetail = {
      id: DISPUTE_ID,
      statement_id: STATEMENT_ID,
      category: "calculation_error",
      status: "open",
      description: "This is a real dispute and must not be deleted.",
      created_at: FIXED_NOW,
      comments: [],
      attachments: [],
    };

    const response = await deleteE2eDispute(app, DISPUTE_ID, {
      run_id: "run-12345678",
      confirm: "delete-prod-e2e-dispute",
    });

    expect(response.status).toBe(403);
    expect(storage.deletedKeys).toEqual([]);
    expect(repository.lastDeleteInput).toBeNull();
  });
});

describe("POST /tenant/disputes/:disputeId/attachments (with storage fake)", () => {
  function makeFormData(
    content: Uint8Array,
    filename: string,
    mimeType: string,
  ): FormData {
    const fd = new FormData();
    fd.append("file", new File([content], filename, { type: mimeType }));
    return fd;
  }

  it("uploads attachment and returns 201 with attachment metadata", async () => {
    const storage = new MemoryDisputeAttachmentStorage();
    const { app } = createTestApp({}, storage);
    const content = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

    const response = await app.request(
      `/api/v1/tenant/disputes/${DISPUTE_ID}/attachments`,
      {
        method: "POST",
        headers: authHeaders(),
        body: makeFormData(content, "invoice.pdf", "application/pdf"),
      },
      testEnv(),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body).toMatchObject({
      filename: "invoice.pdf",
      content_type: "application/pdf",
      file_size_bytes: 4,
    });
    // Verify the object was stored in R2
    const key = storage.generateKey({
      organizationId: ORG_ID,
      disputeId: DISPUTE_ID,
      filename: "invoice.pdf",
    });
    expect(storage.has(key)).toBe(true);
  });

  it("rolls back R2 object when DB insert fails", async () => {
    const storage = new MemoryDisputeAttachmentStorage();
    const { app, repository } = createTestApp({}, storage);
    repository.forceAttachmentFailure = true;
    const content = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    const response = await app.request(
      `/api/v1/tenant/disputes/${DISPUTE_ID}/attachments`,
      {
        method: "POST",
        headers: authHeaders(),
        body: makeFormData(content, "invoice.pdf", "application/pdf"),
      },
      testEnv(),
    );

    expect(response.status).toBe(500);
    // The uploaded object must have been deleted (rollback)
    expect(storage.deletedKeys).toHaveLength(1);
    const key = storage.generateKey({
      organizationId: ORG_ID,
      disputeId: DISPUTE_ID,
      filename: "invoice.pdf",
    });
    expect(storage.deletedKeys[0]).toBe(key);
    expect(storage.has(key)).toBe(false);
  });

  it("reports rollback delete failures when DB insert fails after upload", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const storage = new MemoryDisputeAttachmentStorage();
    storage.failDelete = true;
    const { app, repository } = createTestApp({}, storage);
    repository.forceAttachmentFailure = true;
    const content = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    const response = await app.request(
      `/api/v1/tenant/disputes/${DISPUTE_ID}/attachments`,
      {
        method: "POST",
        headers: authHeaders(),
        body: makeFormData(content, "invoice.pdf", "application/pdf"),
      },
      { ...testEnv(), SENTRY_DSN: sentryDsn },
    );

    expect(response.status).toBe(500);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(
      fetchMock.mock.calls.map((call) => String(call[1]?.body)).join("\n"),
    ).toContain(
      "\"operation\":\"worker.tenant_disputes.attachment_rollback\"",
    );
    vi.unstubAllGlobals();
  });

  it("returns 404 before storage write when dispute is not owned by tenant", async () => {
    const storage = new MemoryDisputeAttachmentStorage();
    const { app, repository } = createTestApp({}, storage);
    repository.disputeDetail = null;
    const content = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    const response = await app.request(
      `/api/v1/tenant/disputes/${DISPUTE_ID}/attachments`,
      {
        method: "POST",
        headers: authHeaders(),
        body: makeFormData(content, "invoice.pdf", "application/pdf"),
      },
      testEnv(),
    );

    expect(response.status).toBe(404);
    const key = storage.generateKey({
      organizationId: ORG_ID,
      disputeId: DISPUTE_ID,
      filename: "invoice.pdf",
    });
    expect(storage.has(key)).toBe(false);
    expect(storage.deletedKeys).toEqual([]);
  });

  it("streams bytes with correct content-type on download", async () => {
    const storage = new MemoryDisputeAttachmentStorage();
    // Pre-seed the expected storage path (matches getAttachmentForDownload mock)
    const storagePath = `disputes/${ORG_ID}/${DISPUTE_ID}/uuid/test.pdf`;
    await storage.putAttachment(
      storagePath,
      new Uint8Array([1, 2, 3]),
      "application/pdf",
    );
    const { app } = createTestApp({}, storage);

    const response = await app.request(
      `/api/v1/tenant/disputes/${DISPUTE_ID}/attachments/${ATTACHMENT_ID}`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    const buf = await response.arrayBuffer();
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("returns 404 on download when attachment doesn't belong to tenant", async () => {
    const storage = new MemoryDisputeAttachmentStorage();
    const { app } = createTestApp({}, storage);
    const wrongAttachmentId = "00000000-0000-4000-8000-000000000099";

    const response = await app.request(
      `/api/v1/tenant/disputes/${DISPUTE_ID}/attachments/${wrongAttachmentId}`,
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 for 0-byte file", async () => {
    const storage = new MemoryDisputeAttachmentStorage();
    const { app } = createTestApp({}, storage);

    const response = await app.request(
      `/api/v1/tenant/disputes/${DISPUTE_ID}/attachments`,
      {
        method: "POST",
        headers: authHeaders(),
        body: makeFormData(new Uint8Array(0), "empty.pdf", "application/pdf"),
      },
      testEnv(),
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 for disallowed mime type", async () => {
    const storage = new MemoryDisputeAttachmentStorage();
    const { app } = createTestApp({}, storage);

    const response = await app.request(
      `/api/v1/tenant/disputes/${DISPUTE_ID}/attachments`,
      {
        method: "POST",
        headers: authHeaders(),
        body: makeFormData(
          new Uint8Array([1, 2, 3]),
          "payload.exe",
          "application/x-msdownload",
        ),
      },
      testEnv(),
    );

    expect(response.status).toBe(400);
  });
});

describe("author_id identity", () => {
  it("createDispute passes authorUserId (users.id) not tenant profile id", async () => {
    const { app, repository } = createTestApp();

    await app.request(
      "/api/v1/tenant/disputes",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          statement_id: STATEMENT_ID,
          category: "calculation_error",
          description: "This charge appears too high for our unit.",
        }),
      },
      testEnv(),
    );

    expect(repository.lastCreateInput).not.toBeNull();
    // authorUserId must be the users(id) value, not the tenant_users(id)
    expect(repository.lastCreateInput?.authorUserId).toBe(USER_ID);
    expect(repository.lastCreateInput?.tenantUserId).toBe(TENANT_USER_ID);
  });

  it("addAttachment passes uploadedBy = users.id not tenant profile id", async () => {
    const storage = new MemoryDisputeAttachmentStorage();
    const { app, repository } = createTestApp({}, storage);
    let capturedInput: AddAttachmentInput | null = null;
    const origAddAttachment = repository.addAttachment.bind(repository);
    repository.addAttachment = async (input: AddAttachmentInput) => {
      capturedInput = input;
      return origAddAttachment(input);
    };

    const content = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const fd = new FormData();
    fd.append(
      "file",
      new File([content], "invoice.pdf", { type: "application/pdf" }),
    );

    await app.request(
      `/api/v1/tenant/disputes/${DISPUTE_ID}/attachments`,
      { method: "POST", headers: authHeaders(), body: fd },
      testEnv(),
    );

    expect(capturedInput).not.toBeNull();
    const captured = capturedInput as unknown as AddAttachmentInput;
    // uploadedBy must be users(id), not tenant_users(id)
    expect(captured.uploadedBy).toBe(USER_ID);
    expect(captured.tenantUserId).toBe(TENANT_USER_ID);
  });

  it("addComment passes authorId = users.id not tenant profile id", async () => {
    const { app, repository } = createTestApp();
    let capturedInput: AddCommentInput | null = null;
    const origAddComment = repository.addComment.bind(repository);
    repository.addComment = async (input: AddCommentInput) => {
      capturedInput = input;
      return origAddComment(input);
    };

    await app.request(
      `/api/v1/tenant/disputes/${DISPUTE_ID}/comments`,
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          content: "I believe this charge is incorrect.",
        }),
      },
      testEnv(),
    );

    expect(capturedInput).not.toBeNull();
    // Use non-null assertion: we already asserted it is not null above
    const captured = capturedInput as unknown as AddCommentInput;
    expect(captured.authorId).toBe(USER_ID);
    expect(captured.tenantUserId).toBe(TENANT_USER_ID);
  });
});

function createTestApp(
  options: {
    party?: AuthVariables["auth"]["actor"]["party"];
    role?: AuthVariables["auth"]["actor"]["role"];
  } = {},
  storage?: DisputeAttachmentStorage,
): {
  app: Hono<{ Bindings: AppEnv; Variables: AuthVariables }>;
  repository: MemoryTenantDisputesRepository;
} {
  const repository = new MemoryTenantDisputesRepository();
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createTenantDisputesRoutes({
      repository,
      clock: () => new Date(FIXED_NOW),
      ...(storage !== undefined ? { storage } : {}),
      auth: {
        verifier: jwtVerifier(),
        db: {
          mode: "postgrest-compat",
          auth: authRepository(options),
          protectedRecords,
        },
      },
    }),
  );
  return { app, repository };
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

function authRepository(options: {
  party?: AuthVariables["auth"]["actor"]["party"];
  role?: AuthVariables["auth"]["actor"]["role"];
}): DbAdapter["auth"] & AuthRepository {
  return {
    async resolveUserContext(): Promise<AuthenticatedUserContext> {
      const party = options.party ?? "tenant";
      const role = options.role ?? (party === "tenant" ? "tenant" : "admin");
      const actor: AuthenticatedUserContext["actor"] = {
        userId: USER_ID,
        organizationId: ORG_ID,
        role,
        isServiceAdmin: false,
        party,
        bearerToken: "valid-token",
      };
      return {
        actor,
        user: {
          id: USER_ID,
          organizationId: ORG_ID,
          email: "tenant@example.com",
          fullName: "Tenant User",
          role,
          isPlatformAdmin: false,
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW,
        },
        ...(party === "tenant"
          ? {
              tenantUser: {
                id: TENANT_USER_ID,
                userId: USER_ID,
                organizationId: ORG_ID,
                contactName: "Tenant User",
                contactEmail: "tenant@example.com",
                createdAt: FIXED_NOW,
              },
            }
          : {}),
      };
    },
  };
}

function testEnv(): AppEnv {
  return {
    ENVIRONMENT: "development",
    APP_VERSION: "0.1.0",
    DATABASE_URL: "postgres://example",
    PROTECTED_RECORDS: protectedRecords,
  } as unknown as AppEnv;
}
