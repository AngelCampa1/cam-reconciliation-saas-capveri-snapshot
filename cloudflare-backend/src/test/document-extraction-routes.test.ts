import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  DocumentStorage,
  DocumentStorageKeyInput,
  StoredDocument,
} from "../adapters/storage/documents";
import type {
  DocumentSubmissionRepository,
  DocumentRecord,
  ExtractionDetail,
  ExtractionJobSummary,
  ExtractionSubmission,
} from "../domain/documents/submission";
import {
  InvalidDocumentStateError,
  LeaseFinalizedReferenceError,
  NotFoundError,
} from "../domain/documents/submission";
import type { AppEnv } from "../env";
import {
  createDocumentExtractionRoutes,
  normalizeFilename,
} from "../http/document-extraction-routes";
import type { AuthVariables } from "../middleware/auth";
import type { ExtractionQueueMessage } from "../queues/messages";
import type { QueueProducer } from "../queues/producers";

const runtimeQueueHandler = vi.hoisted(() => vi.fn());

vi.mock("../workflows/runtime", () => ({
  createRuntimeQueueHandlers: () => ({
    extraction: runtimeQueueHandler,
  }),
}));

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const DOCUMENT_ID = "44444444-4444-4444-8444-444444444444";
const JOB_ID = "55555555-5555-4555-8555-555555555555";
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

type JsonRecord = Record<string, unknown>;

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryDocumentStorage implements DocumentStorage {
  readonly puts: string[] = [];
  readonly deletes: string[] = [];
  readonly objects = new Map<string, Uint8Array>();
  readonly storageKeyInputs: DocumentStorageKeyInput[] = [];
  failDelete = false;

  generateStorageKey(input: DocumentStorageKeyInput): string {
    this.storageKeyInputs.push(input);
    return `${input.organizationId}/${input.propertyId}/stored.pdf`;
  }

  validatePdf(content: Uint8Array): boolean {
    return (
      content[0] === 0x25 &&
      content[1] === 0x50 &&
      content[2] === 0x44 &&
      content[3] === 0x46
    );
  }

  validateFileSize(content: { readonly byteLength: number }): boolean {
    return content.byteLength <= 50 * 1024 * 1024;
  }

  async putDocument(
    key: string,
    content: Uint8Array | ArrayBuffer,
  ): Promise<StoredDocument> {
    const bytes =
      content instanceof Uint8Array ? content : new Uint8Array(content);
    this.puts.push(key);
    this.objects.set(key, bytes);

    return {
      bucket: "DOCUMENTS_BUCKET",
      key,
      etag: "etag",
      size: bytes.byteLength,
      contentType: "application/pdf",
    };
  }

  async getDocumentBytes(key: string): Promise<Uint8Array | undefined> {
    return this.objects.get(key);
  }

  async headDocument(key: string): Promise<StoredDocument | undefined> {
    const object = this.objects.get(key);

    if (!object) {
      return undefined;
    }

    return {
      bucket: "DOCUMENTS_BUCKET",
      key,
      etag: "etag",
      size: object.byteLength,
      contentType: "application/pdf",
    };
  }

  async deleteDocument(key: string): Promise<void> {
    this.deletes.push(key);
    if (this.failDelete) {
      throw new Error("storage unavailable");
    }
    this.objects.delete(key);
  }
}

class MemorySubmissionRepository implements DocumentSubmissionRepository {
  readonly createdDocuments: Parameters<
    DocumentSubmissionRepository["createDocument"]
  >[0][] = [];
  readonly queuedExtractions: Parameters<
    DocumentSubmissionRepository["queueExtraction"]
  >[0][] = [];
  readonly jobStatusRequests: Parameters<
    DocumentSubmissionRepository["getExtractionJob"]
  >[0][] = [];
  readonly detailRequests: Parameters<
    DocumentSubmissionRepository["getExtractionDetail"]
  >[0][] = [];
  readonly documentListRequests: Parameters<
    DocumentSubmissionRepository["listDocuments"]
  >[0][] = [];
  readonly documentDetailRequests: Parameters<
    DocumentSubmissionRepository["getDocument"]
  >[0][] = [];
  readonly documentDeleteRequests: Parameters<
    DocumentSubmissionRepository["deleteDocument"]
  >[0][] = [];
  readonly listExtractionRequests: Parameters<
    DocumentSubmissionRepository["listExtractions"]
  >[0][] = [];
  readonly featureUses: Parameters<
    DocumentSubmissionRepository["recordFeatureUse"]
  >[0][] = [];
  readonly savedDrafts: Parameters<
    DocumentSubmissionRepository["saveExtractionDraft"]
  >[0][] = [];
  readonly approvedExtractions: Parameters<
    DocumentSubmissionRepository["approveExtraction"]
  >[0][] = [];
  readonly rejectedExtractions: Parameters<
    DocumentSubmissionRepository["rejectExtraction"]
  >[0][] = [];
  readonly retriedJobs: Parameters<
    DocumentSubmissionRepository["retryExtractionJob"]
  >[0][] = [];
  readonly failedRetryEnqueues: Parameters<
    DocumentSubmissionRepository["markRetryEnqueueFailed"]
  >[0][] = [];
  readonly failedEnqueues: Parameters<
    DocumentSubmissionRepository["markExtractionEnqueueFailed"]
  >[0][] = [];
  createDocumentError: Error | undefined;
  queueExtractionError: Error | undefined;
  approveExtractionError: Error | undefined;
  deleteDocumentError: Error | undefined;
  fullAccess = true;
  document: DocumentRecord | null = {
    id: DOCUMENT_ID,
    organizationId: ORG_ID,
    propertyId: PROPERTY_ID,
    filename: "lease.pdf",
    storageKey: `${ORG_ID}/${PROPERTY_ID}/stored.pdf`,
    contentType: "application/pdf",
    fileSizeBytes: PDF_BYTES.byteLength,
    documentType: "lease",
    status: "pending",
    errorMessage: null,
    createdAt: "2026-06-12T00:00:00Z",
    updatedAt: "2026-06-12T00:00:01Z",
    processedAt: null,
  };
  job: ExtractionJobSummary | null = {
    id: JOB_ID,
    documentId: DOCUMENT_ID,
    organizationId: ORG_ID,
    status: "pending",
    priority: 5,
    retryCount: 0,
    errorMessage: null,
    resultData: null,
    createdAt: "2026-06-12T00:00:00Z",
    startedAt: null,
    completedAt: null,
    nextRetryAt: null,
  };
  detail: ExtractionDetail | null = {
    id: DOCUMENT_ID,
    filename: "lease.pdf",
    status: "ready_for_review",
    storageBucket: "DOCUMENTS_BUCKET",
    storageKey: `${ORG_ID}/${PROPERTY_ID}/stored.pdf`,
    contentType: "application/pdf",
    fileSizeBytes: PDF_BYTES.byteLength,
    extractionResult: {
      profile: { tenant_name: "Tenant A" },
      confidence_scores: { tenant_name: 0.9 },
      source_references: [],
    },
    createdAt: "2026-06-12T00:00:00Z",
    processedAt: "2026-06-12T00:00:05Z",
    verifiedAt: null,
    verifiedBy: null,
    propertyId: PROPERTY_ID,
    leaseId: null,
    editHistory: [],
  };

  async hasFullAccess(): Promise<boolean> {
    return this.fullAccess;
  }

  async recordFeatureUse(
    input: Parameters<DocumentSubmissionRepository["recordFeatureUse"]>[0],
  ): Promise<void> {
    this.featureUses.push(input);
  }

  async createDocument(
    input: Parameters<DocumentSubmissionRepository["createDocument"]>[0],
  ) {
    this.createdDocuments.push(input);

    if (this.createDocumentError) {
      throw this.createDocumentError;
    }

    return { id: DOCUMENT_ID, status: "pending" as const };
  }

  async listDocuments(
    input: Parameters<DocumentSubmissionRepository["listDocuments"]>[0],
  ): Promise<DocumentRecord[]> {
    this.documentListRequests.push(input);

    return this.document ? [this.document] : [];
  }

  async getDocument(
    input: Parameters<DocumentSubmissionRepository["getDocument"]>[0],
  ): Promise<DocumentRecord | null> {
    this.documentDetailRequests.push(input);

    return this.document;
  }

  async deleteDocument(
    input: Parameters<DocumentSubmissionRepository["deleteDocument"]>[0],
  ): ReturnType<DocumentSubmissionRepository["deleteDocument"]> {
    if (this.deleteDocumentError) {
      throw this.deleteDocumentError;
    }
    if (!this.document) {
      throw new NotFoundError("Document");
    }
    if (this.document.status === "processing") {
      throw new InvalidDocumentStateError(
        "Cannot delete document with status 'processing'. Processing documents must finish or fail before deletion.",
      );
    }
    if (this.document.storageKey) {
      await input.beforeDeleteStorage?.(this.document.storageKey);
    }

    this.documentDeleteRequests.push(input);

    return { storageKey: this.document.storageKey };
  }

  async queueExtraction(
    input: Parameters<DocumentSubmissionRepository["queueExtraction"]>[0],
  ): Promise<ExtractionSubmission> {
    this.queuedExtractions.push(input);

    if (this.queueExtractionError) {
      throw this.queueExtractionError;
    }

    return {
      documentId: DOCUMENT_ID,
      jobId: JOB_ID,
      organizationId: ORG_ID,
      priority: input.priority,
    };
  }

  async markExtractionEnqueueFailed(
    input: Parameters<
      DocumentSubmissionRepository["markExtractionEnqueueFailed"]
    >[0],
  ): Promise<void> {
    this.failedEnqueues.push(input);
  }

  async getExtractionJob(
    input: Parameters<DocumentSubmissionRepository["getExtractionJob"]>[0],
  ): Promise<ExtractionJobSummary | null> {
    this.jobStatusRequests.push(input);

    return this.job;
  }

  async listExtractions(
    input: Parameters<DocumentSubmissionRepository["listExtractions"]>[0],
  ): ReturnType<DocumentSubmissionRepository["listExtractions"]> {
    this.listExtractionRequests.push(input);

    return {
      items: [
        {
          id: DOCUMENT_ID,
          filename: "lease.pdf",
          status: "ready_for_review",
          createdAt: "2026-06-12T00:00:00Z",
          processedAt: "2026-06-12T00:00:05Z",
          verifiedAt: null,
          extractionResult: {
            confidence_scores: {
              tenant_name: 0.9,
              base_year: 0.6,
            },
          },
        },
      ],
      total: 1,
      page: input.page,
      pageSize: input.pageSize,
      hasNext: false,
    };
  }

  async getExtractionDetail(
    input: Parameters<DocumentSubmissionRepository["getExtractionDetail"]>[0],
  ): Promise<ExtractionDetail | null> {
    this.detailRequests.push(input);

    return this.detail;
  }

  async saveExtractionDraft(
    input: Parameters<DocumentSubmissionRepository["saveExtractionDraft"]>[0],
  ): Promise<void> {
    this.savedDrafts.push(input);
  }

  async approveExtraction(
    input: Parameters<DocumentSubmissionRepository["approveExtraction"]>[0],
  ): ReturnType<DocumentSubmissionRepository["approveExtraction"]> {
    if (this.approveExtractionError) {
      throw this.approveExtractionError;
    }

    this.approvedExtractions.push(input);

    return { leaseId: input.leaseId ?? "66666666-6666-4666-8666-666666666666" };
  }

  async rejectExtraction(
    input: Parameters<DocumentSubmissionRepository["rejectExtraction"]>[0],
  ): ReturnType<DocumentSubmissionRepository["rejectExtraction"]> {
    this.rejectedExtractions.push(input);

    if (!input.requeue) {
      return {
        message:
          "Extraction rejected successfully. Re-upload to retry with different settings.",
      };
    }

    return {
      message: `Extraction rejected and queued for retry. Job ID: ${JOB_ID}`,
      submission: {
        documentId: input.documentId,
        jobId: JOB_ID,
        organizationId: input.organizationId,
        priority: input.priority,
      },
    };
  }

  async retryExtractionJob(
    input: Parameters<DocumentSubmissionRepository["retryExtractionJob"]>[0],
  ): ReturnType<DocumentSubmissionRepository["retryExtractionJob"]> {
    this.retriedJobs.push(input);

    if (!this.job) {
      return null;
    }

    return {
      job: {
        ...this.job,
        status: "retrying",
        retryCount: this.job.retryCount + 1,
        nextRetryAt: "2026-06-12T00:01:00.000Z",
      },
      delaySeconds: 60,
      previousRetryCount: this.job.retryCount,
    };
  }

  async markRetryEnqueueFailed(
    input: Parameters<
      DocumentSubmissionRepository["markRetryEnqueueFailed"]
    >[0],
  ): Promise<void> {
    this.failedRetryEnqueues.push(input);
  }
}

class RecordingQueueProducer implements QueueProducer {
  readonly extractionMessages: ExtractionQueueMessage[] = [];
  readonly extractionOptions: (QueueSendOptions | undefined)[] = [];
  extractionError: Error | undefined;

  async enqueueExtraction(
    message: ExtractionQueueMessage,
    options?: QueueSendOptions,
  ): Promise<void> {
    if (this.extractionError) {
      throw this.extractionError;
    }

    this.extractionMessages.push(message);
    this.extractionOptions.push(options);
  }

  async enqueueReconciliation(): Promise<void> {}

  async enqueueExport(): Promise<void> {}

  async enqueueEmail(): Promise<void> {}

  async enqueueAnalytics(): Promise<void> {}
}

function createAuthContext(
  role: AuthVariables["auth"]["actor"]["role"] = "member",
): AuthenticatedUserContext {
  const user: AuthenticatedUserContext["user"] = {
    id: USER_ID,
    organizationId: ORG_ID,
    email: "member@example.test",
    fullName: "Member User",
    role,
    isPlatformAdmin: false,
    createdAt: "2026-06-12T00:00:00Z",
    updatedAt: "2026-06-12T00:00:00Z",
  };

  return {
    user,
    actor: {
      userId: USER_ID,
      organizationId: ORG_ID,
      role,
      isServiceAdmin: false,
      party: role === "tenant" ? "tenant" : "landlord",
      bearerToken: "valid-token",
    },
  };
}

function createTestApp(options: {
  role?: AuthVariables["auth"]["actor"]["role"];
  storage?: MemoryDocumentStorage;
  repository?: MemorySubmissionRepository;
  queueProducer?: RecordingQueueProducer;
}) {
  const storage = options.storage ?? new MemoryDocumentStorage();
  const repository = options.repository ?? new MemorySubmissionRepository();
  const queueProducer = options.queueProducer ?? new RecordingQueueProducer();
  const context = createAuthContext(options.role);
  const verifier: JwtVerifier = {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
  const auth: AuthRepository = {
    async resolveUserContext() {
      return context;
    },
  };
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();

  app.route(
    "/api/v1",
    createDocumentExtractionRoutes({
      storage,
      repository,
      queueProducer,
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    }),
  );

  return { app, storage, repository, queueProducer };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
    DOCUMENT_ACCESS_SIGNING_SECRET: "unit-test-document-signing-secret",
  } as unknown as AppEnv;
}

function uploadBody(
  fileBytes: Uint8Array = PDF_BYTES,
  filename = "lease.pdf",
): FormData {
  const body = new FormData();
  body.set(
    "file",
    new File([fileBytes], filename, { type: "application/pdf" }),
  );

  return body;
}

function uploadBodyWithType(contentType: string): FormData {
  const body = new FormData();
  body.set("file", new File([PDF_BYTES], "lease.pdf", { type: contentType }));

  return body;
}

describe("document extraction routes", () => {
  it("lists org-scoped extractions with pagination and confidence summaries", async () => {
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/extractions?page=2&page_size=10&status=ready_for_review",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [
        {
          id: DOCUMENT_ID,
          filename: "lease.pdf",
          status: "ready_for_review",
          created_at: "2026-06-12T00:00:00Z",
          processed_at: "2026-06-12T00:00:05Z",
          verified_at: null,
          average_confidence: 0.75,
          low_confidence_count: 1,
        },
      ],
      total: 1,
      page: 2,
      page_size: 10,
      has_next: false,
    });
    expect(repository.listExtractionRequests).toEqual([
      {
        organizationId: ORG_ID,
        status: "ready_for_review",
        page: 2,
        pageSize: 10,
      },
    ]);
  });

  it("returns validation errors for malformed extraction list query params", async () => {
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/extractions?page=0&page_size=101&status=unknown",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(422);
    expect(repository.listExtractionRequests).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "validation_error" },
    });
  });

  it("returns extraction detail with a short-lived signed document URL", async () => {
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    const body = await response.json<JsonRecord>();
    expect(body).toMatchObject({
      id: DOCUMENT_ID,
      filename: "lease.pdf",
      status: "ready_for_review",
      storage_bucket: "DOCUMENTS_BUCKET",
      storage_key: `${ORG_ID}/${PROPERTY_ID}/stored.pdf`,
      content_type: "application/pdf",
      file_size_bytes: PDF_BYTES.byteLength,
      extraction_result: {
        profile: { tenant_name: "Tenant A" },
        confidence_scores: { tenant_name: 0.9 },
        source_references: [],
      },
      created_at: "2026-06-12T00:00:00Z",
      processed_at: "2026-06-12T00:00:05Z",
      verified_at: null,
      verified_by: null,
      property_id: PROPERTY_ID,
      lease_id: null,
      edit_history: [],
    });
    expect(body.document_url).toMatch(
      new RegExp(
        `^http://localhost/api/v1/document-files/${DOCUMENT_ID}\\?org_id=${ORG_ID}&expires=\\d+&signature=[a-f0-9]{64}$`,
      ),
    );
    expect(repository.detailRequests).toEqual([
      { documentId: DOCUMENT_ID, organizationId: ORG_ID },
    ]);
  });

  it("serves document bytes through the signed document URL without bearer auth", async () => {
    const storage = new MemoryDocumentStorage();
    await storage.putDocument(`${ORG_ID}/${PROPERTY_ID}/stored.pdf`, PDF_BYTES);
    const { app } = createTestApp({ storage });
    const detailResponse = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const detail = await detailResponse.json<JsonRecord>();
    const documentUrl = detail.document_url;

    if (typeof documentUrl !== "string") {
      throw new TypeError(
        "Expected document_url in extraction detail response",
      );
    }
    const fileResponse = await app.request(
      documentUrl,
      { headers: { origin: "https://app.capveri.com" } },
      env(),
    );

    expect(fileResponse.status).toBe(200);
    expect(fileResponse.headers.get("content-type")).toBe("application/pdf");
    expect(fileResponse.headers.get("access-control-allow-origin")).toBe(
      "https://app.capveri.com",
    );
    expect(fileResponse.headers.get("vary")).toBe("Origin");
    expect(fileResponse.headers.get("content-disposition")).toBe(
      'inline; filename="lease.pdf"',
    );
    await expect(fileResponse.arrayBuffer()).resolves.toEqual(PDF_BYTES.buffer);
  });

  it("answers signed document file CORS preflights for trusted frontend origins", async () => {
    const { app } = createTestApp({});
    const response = await app.request(
      `/api/v1/document-files/${DOCUMENT_ID}`,
      {
        method: "OPTIONS",
        headers: {
          origin: "https://app.capveri.com",
          "access-control-request-headers": "range",
        },
      },
      env(),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://app.capveri.com",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe("range");
  });

  it("rejects document file requests with invalid signatures", async () => {
    const { app } = createTestApp({});
    const response = await app.request(
      `/api/v1/document-files/${DOCUMENT_ID}?org_id=${ORG_ID}&expires=9999999999&signature=${"0".repeat(64)}`,
      {},
      env(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid_document_signature" },
    });
  });

  it("uploads a PDF document into R2 and creates a pending document record", async () => {
    const { app, storage, repository } = createTestApp({});
    const response = await app.request(
      `/api/v1/documents/upload?property_id=${PROPERTY_ID}`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: uploadBody(),
      },
      env(),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      document_id: DOCUMENT_ID,
      status: "pending",
      message: "Document uploaded successfully and queued for processing",
    });
    expect(storage.puts).toEqual([`${ORG_ID}/${PROPERTY_ID}/stored.pdf`]);
    expect(storage.storageKeyInputs).toEqual([
      {
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        filename: "lease.pdf",
      },
    ]);
    expect(repository.createdDocuments).toEqual([
      {
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        filename: "lease.pdf",
        storageKey: `${ORG_ID}/${PROPERTY_ID}/stored.pdf`,
        storageBucket: "DOCUMENTS_BUCKET",
        contentType: "application/pdf",
        fileSizeBytes: PDF_BYTES.byteLength,
        documentType: "lease",
        leaseId: undefined,
      },
    ]);
  });

  it("normalizes path-like upload filenames before storage and document creation", async () => {
    const { app, storage, repository } = createTestApp({});
    const response = await app.request(
      `/api/v1/documents/upload?property_id=${PROPERTY_ID}`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: uploadBody(
          PDF_BYTES,
          String.raw`C:\fakepath\..\Quarterly Lease.PDF`,
        ),
      },
      env(),
    );

    expect(response.status).toBe(201);
    expect(storage.puts).toEqual([`${ORG_ID}/${PROPERTY_ID}/stored.pdf`]);
    expect(storage.storageKeyInputs).toEqual([
      {
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        filename: "Quarterly Lease.PDF",
      },
    ]);
    expect(repository.createdDocuments).toHaveLength(1);
    expect(repository.createdDocuments[0]?.filename).toBe(
      "Quarterly Lease.PDF",
    );
    expect(repository.createdDocuments[0]?.storageKey).toBe(
      `${ORG_ID}/${PROPERTY_ID}/stored.pdf`,
    );
  });

  it("strips control characters (incl. NUL) from upload filenames", () => {
    // A NUL byte in an uploaded filename previously flowed unchanged into the
    // Postgres text INSERT / R2 metadata, both of which reject U+0000, so the
    // upload surfaced an opaque 500. normalizeFilename must scrub C0/C1
    // control characters so a cosmetically odd filename still stores cleanly.
    const nul = String.fromCharCode(0);
    const unitSep = String.fromCharCode(0x1f);
    const del = String.fromCharCode(0x7f);

    expect(normalizeFilename(`lea${nul}se.pdf`)).toBe("lease.pdf");
    expect(normalizeFilename(`report${unitSep}${del}.pdf`)).toBe("report.pdf");
    expect(normalizeFilename(`C:\\path\\lea${nul}se.PDF`)).toBe("lease.PDF");
    // A name that is only control characters degrades to the safe default.
    expect(normalizeFilename(nul + unitSep)).toBe("document.pdf");
  });

  it("lists organization documents with optional property and status filters", async () => {
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/documents?property_id=${PROPERTY_ID}&status=pending&skip=5&limit=10`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: DOCUMENT_ID,
        organization_id: ORG_ID,
        property_id: PROPERTY_ID,
        filename: "lease.pdf",
        content_type: "application/pdf",
        file_size_bytes: PDF_BYTES.byteLength,
        document_type: "lease",
        status: "pending",
        error_message: null,
        created_at: "2026-06-12T00:00:00Z",
        updated_at: "2026-06-12T00:00:01Z",
        processed_at: null,
      },
    ]);
    expect(repository.documentListRequests).toEqual([
      {
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        status: "pending",
        skip: 5,
        limit: 10,
      },
    ]);
  });

  it("returns validation errors for malformed document list filters", async () => {
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/documents?property_id=bad&status=unknown&skip=-1&limit=101",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(422);
    expect(repository.documentListRequests).toEqual([]);
  });

  it("loads one organization-scoped document", async () => {
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/documents/${DOCUMENT_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: DOCUMENT_ID,
      organization_id: ORG_ID,
      property_id: PROPERTY_ID,
      filename: "lease.pdf",
      status: "pending",
    });
    expect(repository.documentDetailRequests).toEqual([
      { documentId: DOCUMENT_ID, organizationId: ORG_ID },
    ]);
  });

  it("returns 404 when a document is not visible to the organization", async () => {
    const repository = new MemorySubmissionRepository();
    repository.document = null;
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/documents/${DOCUMENT_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Document not found",
      error: {
        code: "document_not_found",
        message: "Document not found",
      },
    });
  });

  it("deletes pending documents from the database and R2 for landlord editors", async () => {
    const storage = new MemoryDocumentStorage();
    await storage.putDocument(`${ORG_ID}/${PROPERTY_ID}/stored.pdf`, PDF_BYTES);
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository, storage });
    const response = await app.request(
      `/api/v1/documents/${DOCUMENT_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(204);
    expect(repository.documentDeleteRequests).toHaveLength(1);
    expect(repository.documentDeleteRequests[0]).toMatchObject({
      documentId: DOCUMENT_ID,
      organizationId: ORG_ID,
    });
    expect(storage.deletes).toEqual([`${ORG_ID}/${PROPERTY_ID}/stored.pdf`]);
  });

  it("reports storage cleanup failures when deleting document records", async () => {
    const storage = new MemoryDocumentStorage();
    storage.failDelete = true;
    await storage.putDocument(`${ORG_ID}/${PROPERTY_ID}/stored.pdf`, PDF_BYTES);
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository, storage });
    const response = await app.request(
      `/api/v1/documents/${DOCUMENT_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(503);
    expect(repository.documentDeleteRequests).toEqual([]);
    expect(storage.deletes).toEqual([`${ORG_ID}/${PROPERTY_ID}/stored.pdf`]);
    expect(
      await storage.headDocument(`${ORG_ID}/${PROPERTY_ID}/stored.pdf`),
    ).toBeDefined();
    await expect(response.json()).resolves.toMatchObject({
      detail:
        "Document storage cleanup failed; document record was not deleted",
      error: { code: "document_storage_delete_failed" },
    });
  });

  it("blocks tenant users from deleting documents", async () => {
    const repository = new MemorySubmissionRepository();
    const { app, storage } = createTestApp({ repository, role: "tenant" });
    const response = await app.request(
      `/api/v1/documents/${DOCUMENT_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(403);
    expect(repository.documentDeleteRequests).toEqual([]);
    expect(storage.deletes).toEqual([]);
  });

  it("maps non-deletable document states to a 400 response", async () => {
    const repository = new MemorySubmissionRepository();
    repository.document = {
      ...repository.document!,
      status: "processing",
    };
    const { app, storage } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/documents/${DOCUMENT_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(storage.deletes).toEqual([]);
    expect(repository.documentDeleteRequests).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      detail:
        "Cannot delete document with status 'processing'. Processing documents must finish or fail before deletion.",
      error: { code: "invalid_document_state" },
    });
  });

  it("maps finalized lease document delete conflicts to 409 before storage deletion", async () => {
    const storage = new MemoryDocumentStorage();
    await storage.putDocument(`${ORG_ID}/${PROPERTY_ID}/stored.pdf`, PDF_BYTES);
    const repository = new MemorySubmissionRepository();
    repository.deleteDocumentError = new LeaseFinalizedReferenceError(
      "66666666-6666-4666-8666-666666666666",
      1,
    );
    const { app } = createTestApp({ repository, storage });

    const response = await app.request(
      `/api/v1/documents/${DOCUMENT_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(409);
    expect(storage.deletes).toEqual([]);
    expect(repository.documentDeleteRequests).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "lease_in_finalized_snapshot" },
    });
  });

  it("cleans up the uploaded object if document record creation fails", async () => {
    const repository = new MemorySubmissionRepository();
    repository.createDocumentError = new NotFoundError("Property");
    const { app, storage } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/documents/upload?property_id=${PROPERTY_ID}`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: uploadBody(),
      },
      env(),
    );

    expect(response.status).toBe(404);
    expect(storage.deletes).toEqual([`${ORG_ID}/${PROPERTY_ID}/stored.pdf`]);
  });

  it("reports cleanup failure if document record creation fails after upload", async () => {
    const repository = new MemorySubmissionRepository();
    repository.createDocumentError = new NotFoundError("Property");
    const { app, storage } = createTestApp({ repository });
    storage.failDelete = true;
    const response = await app.request(
      `/api/v1/documents/upload?property_id=${PROPERTY_ID}`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: uploadBody(),
      },
      env(),
    );

    expect(response.status).toBe(503);
    expect(storage.deletes).toEqual([`${ORG_ID}/${PROPERTY_ID}/stored.pdf`]);
    expect(storage.objects.has(`${ORG_ID}/${PROPERTY_ID}/stored.pdf`)).toBe(
      true,
    );
    await expect(response.json()).resolves.toMatchObject({
      detail:
        "Document upload failed and storage cleanup could not be verified",
      error: { code: "document_storage_cleanup_failed" },
    });
  });

  it("rejects clearly oversized upload requests before reading multipart body", async () => {
    const { app, storage, repository } = createTestApp({});
    const response = await app.request(
      `/api/v1/documents/upload?property_id=${PROPERTY_ID}`,
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-length": String(52 * 1024 * 1024),
        },
        body: uploadBody(),
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(storage.puts).toEqual([]);
    expect(repository.createdDocuments).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      detail: "File exceeds maximum size of 50MB",
      error: {
        code: "file_too_large",
        message: "File exceeds maximum size of 50MB",
      },
    });
  });

  it("returns validation errors for malformed upload query parameters", async () => {
    const { app, storage, repository } = createTestApp({});
    const response = await app.request(
      "/api/v1/documents/upload?property_id=not-a-uuid",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: uploadBody(),
      },
      env(),
    );

    expect(response.status).toBe(422);
    expect(storage.puts).toEqual([]);
    expect(repository.createdDocuments).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "validation_error" },
    });
  });

  it("rejects non-PDF upload content types", async () => {
    const { app, storage, repository } = createTestApp({});
    const response = await app.request(
      `/api/v1/documents/upload?property_id=${PROPERTY_ID}`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: uploadBodyWithType("text/plain"),
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(storage.puts).toEqual([]);
    expect(repository.createdDocuments).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Only PDF files are accepted. Received: text/plain",
      error: {
        code: "invalid_file_type",
        message: "Only PDF files are accepted. Received: text/plain",
      },
    });
  });

  it("rejects uploads with invalid PDF magic bytes", async () => {
    const { app, storage, repository } = createTestApp({});
    const response = await app.request(
      `/api/v1/documents/upload?property_id=${PROPERTY_ID}`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: uploadBody(new Uint8Array([0x41, 0x42, 0x43])),
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(storage.puts).toEqual([]);
    expect(repository.createdDocuments).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      detail: "File does not appear to be a valid PDF (invalid magic bytes)",
      error: {
        code: "invalid_pdf",
        message: "File does not appear to be a valid PDF (invalid magic bytes)",
      },
    });
  });

  it("rejects uploads larger than the document limit after multipart parsing", async () => {
    const storage = new MemoryDocumentStorage();
    storage.validateFileSize = () => false;
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ storage, repository });
    const response = await app.request(
      `/api/v1/documents/upload?property_id=${PROPERTY_ID}`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: uploadBody(),
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(storage.puts).toEqual([]);
    expect(repository.createdDocuments).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      detail: "File exceeds maximum size of 50MB",
      error: {
        code: "file_too_large",
        message: "File exceeds maximum size of 50MB",
      },
    });
  });

  it("rejects upload access for viewer users", async () => {
    const { app } = createTestApp({ role: "viewer" });
    const response = await app.request(
      `/api/v1/documents/upload?property_id=${PROPERTY_ID}`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: uploadBody(),
      },
      env(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Insufficient permissions",
      error: {
        code: "insufficient_permissions",
        message: "Insufficient permissions",
      },
    });
  });

  it("queues extraction work for a document", async () => {
    runtimeQueueHandler.mockClear();
    const { app, repository, queueProducer } = createTestApp({});
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/process?priority=15`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      success: true,
      document_id: DOCUMENT_ID,
      job_id: JOB_ID,
      status: "processing",
      message: "Extraction job queued",
    });
    expect(queueProducer.extractionMessages).toEqual([
      {
        version: 1,
        jobId: JOB_ID,
        documentId: DOCUMENT_ID,
        organizationId: ORG_ID,
        priority: 15,
      },
    ]);
    expect(repository.queuedExtractions).toEqual([
      {
        documentId: DOCUMENT_ID,
        organizationId: ORG_ID,
        priority: 15,
      },
    ]);
    expect(repository.featureUses).toEqual([
      {
        organizationId: ORG_ID,
        featureKey: "ai_lease_extraction",
      },
    ]);
    expect(runtimeQueueHandler).not.toHaveBeenCalled();
  });

  it("runs the extraction queue inline only for local E2E environments", async () => {
    runtimeQueueHandler.mockResolvedValueOnce(undefined);
    const { app, queueProducer } = createTestApp({});
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/process?priority=15`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      {
        ...env(),
        ENVIRONMENT: "development",
        SUPABASE_URL: "http://127.0.0.1:54321",
        LOCAL_E2E_INLINE_EXTRACTION_QUEUE: "1",
      } as AppEnv,
    );

    expect(response.status).toBe(202);
    expect(queueProducer.extractionMessages).toEqual([
      {
        version: 1,
        jobId: JOB_ID,
        documentId: DOCUMENT_ID,
        organizationId: ORG_ID,
        priority: 15,
      },
    ]);
    expect(runtimeQueueHandler).toHaveBeenCalledOnce();
    expect(runtimeQueueHandler.mock.calls[0]?.[0]).toEqual({
      version: 1,
      jobId: JOB_ID,
      documentId: DOCUMENT_ID,
      organizationId: ORG_ID,
      priority: 15,
    });
  });

  it("does not run the local inline extraction queue in production", async () => {
    runtimeQueueHandler.mockClear();
    const { app, queueProducer } = createTestApp({});
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/process?priority=15`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      {
        ...env(),
        ENVIRONMENT: "production",
        LOCAL_E2E_INLINE_EXTRACTION_QUEUE: "1",
      } as unknown as AppEnv,
    );

    expect(response.status).toBe(202);
    expect(queueProducer.extractionMessages).toEqual([
      {
        version: 1,
        jobId: JOB_ID,
        documentId: DOCUMENT_ID,
        organizationId: ORG_ID,
        priority: 15,
      },
    ]);
    expect(runtimeQueueHandler).not.toHaveBeenCalled();
  });

  it("does not run the local inline extraction queue in remote non-production environments", async () => {
    runtimeQueueHandler.mockClear();
    const { app, queueProducer } = createTestApp({});
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/process?priority=15`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      {
        ...env(),
        ENVIRONMENT: "staging",
        SUPABASE_URL: "https://example.supabase.co",
        LOCAL_E2E_INLINE_EXTRACTION_QUEUE: "1",
      } as unknown as AppEnv,
    );

    expect(response.status).toBe(202);
    expect(queueProducer.extractionMessages).toEqual([
      {
        version: 1,
        jobId: JOB_ID,
        documentId: DOCUMENT_ID,
        organizationId: ORG_ID,
        priority: 15,
      },
    ]);
    expect(runtimeQueueHandler).not.toHaveBeenCalled();
  });

  it("does not run the local inline extraction queue with a remote Supabase URL", async () => {
    runtimeQueueHandler.mockClear();
    const { app, queueProducer } = createTestApp({});
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/process?priority=15`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      {
        ...env(),
        ENVIRONMENT: "development",
        SUPABASE_URL: "https://example.supabase.co",
        LOCAL_E2E_INLINE_EXTRACTION_QUEUE: "1",
      } as unknown as AppEnv,
    );

    expect(response.status).toBe(202);
    expect(queueProducer.extractionMessages).toEqual([
      {
        version: 1,
        jobId: JOB_ID,
        documentId: DOCUMENT_ID,
        organizationId: ORG_ID,
        priority: 15,
      },
    ]);
    expect(runtimeQueueHandler).not.toHaveBeenCalled();
  });

  it("marks extraction enqueue failed when local inline extraction fails", async () => {
    runtimeQueueHandler.mockRejectedValueOnce(new Error("inline failed"));
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/process?priority=15`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      {
        ...env(),
        ENVIRONMENT: "development",
        SUPABASE_URL: "http://127.0.0.1:54321",
        LOCAL_E2E_INLINE_EXTRACTION_QUEUE: "1",
      } as AppEnv,
    );

    expect(response.status).toBe(503);
    expect(repository.failedEnqueues).toEqual([
      {
        documentId: DOCUMENT_ID,
        jobId: JOB_ID,
        organizationId: ORG_ID,
        errorMessage: "inline failed",
      },
    ]);
  });

  it("blocks extraction processing when the org lacks full access", async () => {
    const repository = new MemorySubmissionRepository();
    repository.fullAccess = false;
    const { app, queueProducer } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/process`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(402);
    expect(repository.queuedExtractions).toEqual([]);
    expect(queueProducer.extractionMessages).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      detail:
        "subscription_required: An active subscription or trial is required.",
      error: {
        code: "subscription_required",
        message:
          "subscription_required: An active subscription or trial is required.",
      },
    });
  });

  it("returns validation errors for unsupported extraction priority values", async () => {
    const { app, repository, queueProducer } = createTestApp({});
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/process?priority=16`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(422);
    expect(repository.queuedExtractions).toEqual([]);
    expect(queueProducer.extractionMessages).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "validation_error" },
    });
  });

  it("returns validation errors for malformed process document IDs", async () => {
    const { app, repository, queueProducer } = createTestApp({});
    const response = await app.request(
      "/api/v1/extractions/not-a-uuid/process",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(422);
    expect(repository.queuedExtractions).toEqual([]);
    expect(queueProducer.extractionMessages).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "validation_error" },
    });
  });

  it("saves verification drafts for paid landlord users", async () => {
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/draft`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ profile: { tenant_name: "Tenant A" } }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Draft saved successfully",
    });
    expect(repository.savedDrafts).toEqual([
      {
        documentId: DOCUMENT_ID,
        organizationId: ORG_ID,
        profile: { tenant_name: "Tenant A" },
      },
    ]);
  });

  it("approves extraction and returns the committed lease id", async () => {
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const leaseId = "66666666-6666-4666-8666-666666666666";
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/approve`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profile: { base_year: 2024, pro_rata_share: "0.1" },
          edit_history: [
            {
              field: "base_year",
              new_value: "2024",
              timestamp: "2026-06-12T00:00:00Z",
            },
          ],
          lease_id: leaseId,
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      lease_id: leaseId,
    });
    expect(repository.approvedExtractions).toEqual([
      {
        documentId: DOCUMENT_ID,
        organizationId: ORG_ID,
        userId: USER_ID,
        profile: {
          base_year: 2024,
          gross_up_base_year: false,
          pro_rata_share: "0.1",
          cap_type: "none",
          admin_fee_percentage: "0",
          excluded_pools: [],
          base_year_adjustments: [],
        },
        editHistory: [
          {
            field: "base_year",
            new_value: "2024",
            timestamp: "2026-06-12T00:00:00Z",
          },
        ],
        leaseId,
      },
    ]);
  });

  it("maps finalized lease approval conflicts to 409", async () => {
    const repository = new MemorySubmissionRepository();
    const leaseId = "66666666-6666-4666-8666-666666666666";
    repository.approveExtractionError = new LeaseFinalizedReferenceError(
      leaseId,
      1,
    );
    const { app } = createTestApp({ repository });

    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/approve`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profile: { base_year: 2024, pro_rata_share: "0.1" },
          edit_history: [
            {
              field: "base_year",
              new_value: "2024",
              timestamp: "2026-06-12T00:00:00Z",
            },
          ],
          lease_id: leaseId,
        }),
      },
      env(),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "lease_in_finalized_snapshot" },
    });
    expect(repository.approvedExtractions).toEqual([]);
  });

  it("rejects approval requests with invalid recovery profiles", async () => {
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/approve`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profile: {
            pro_rata_share: "0.1",
            cap_type: "cumulative",
          },
          edit_history: [
            {
              field: "cap_type",
              old_value: null,
              new_value: "cumulative",
              timestamp: "2026-06-12T00:00:00Z",
            },
          ],
        }),
      },
      env(),
    );

    expect(response.status).toBe(422);
    expect(repository.approvedExtractions).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "validation_error" },
    });
  });

  it.each([
    {
      description: "blank decimal strings",
      profile: { pro_rata_share: "" },
    },
    {
      description: "null cap rates on non-none caps",
      profile: {
        pro_rata_share: "0.1",
        cap_type: "cumulative",
        cap_rate: null,
      },
    },
  ])("rejects approval requests with $description", async ({ profile }) => {
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/approve`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profile,
          edit_history: [],
        }),
      },
      env(),
    );

    expect(response.status).toBe(422);
    expect(repository.approvedExtractions).toEqual([]);
  });

  it("rejects approval requests with malformed edit history", async () => {
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/approve`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profile: {
            pro_rata_share: "0.1",
            cap_type: "none",
          },
          edit_history: [{ field: "pro_rata_share" }],
        }),
      },
      env(),
    );

    expect(response.status).toBe(422);
    expect(repository.approvedExtractions).toEqual([]);
  });

  it("strips extraction-only profile fields before approving", async () => {
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/approve`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profile: {
            tenant_name: "Tenant A",
            pro_rata_share: "0.1",
          },
          edit_history: [],
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.approvedExtractions[0]?.profile).toEqual({
      gross_up_base_year: false,
      pro_rata_share: "0.1",
      cap_type: "none",
      admin_fee_percentage: "0",
      excluded_pools: [],
      base_year_adjustments: [],
    });
  });

  it("rejects extraction without requeueing by default", async () => {
    const repository = new MemorySubmissionRepository();
    const { app, queueProducer } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/reject`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ reason: "poor_ocr_quality", notes: null }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message:
        "Extraction rejected successfully. Re-upload to retry with different settings.",
    });
    expect(repository.rejectedExtractions).toEqual([
      {
        documentId: DOCUMENT_ID,
        organizationId: ORG_ID,
        userId: USER_ID,
        reason: "poor_ocr_quality",
        notes: null,
        requeue: false,
        priority: 5,
      },
    ]);
    expect(queueProducer.extractionMessages).toEqual([]);
  });

  it("rejects extraction and enqueues retry work when requested", async () => {
    const repository = new MemorySubmissionRepository();
    const { app, queueProducer } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/reject`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          reason: "poor_ocr_quality",
          notes: "Missing page",
          requeue: true,
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(queueProducer.extractionMessages).toEqual([
      {
        version: 1,
        jobId: JOB_ID,
        documentId: DOCUMENT_ID,
        organizationId: ORG_ID,
        priority: 5,
      },
    ]);
  });

  it("requires full access for verification mutations", async () => {
    const repository = new MemorySubmissionRepository();
    repository.fullAccess = false;
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/approve`,
      {
        method: "PUT",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          profile: { pro_rata_share: "0.1" },
          edit_history: [],
        }),
      },
      env(),
    );

    expect(response.status).toBe(402);
    expect(repository.approvedExtractions).toEqual([]);
  });

  it("maps invalid extraction document state to a 400 response", async () => {
    const repository = new MemorySubmissionRepository();
    repository.queueExtractionError = new InvalidDocumentStateError(
      "Extraction workflow is only available for lease or amendment documents",
    );
    const { app, queueProducer } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/process`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(queueProducer.extractionMessages).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      detail:
        "Extraction workflow is only available for lease or amendment documents",
      error: {
        code: "invalid_document_state",
        message:
          "Extraction workflow is only available for lease or amendment documents",
      },
    });
  });

  it("maps missing extraction documents to a 404 response", async () => {
    const repository = new MemorySubmissionRepository();
    repository.queueExtractionError = new NotFoundError("Document");
    const { app, queueProducer } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/process`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(404);
    expect(queueProducer.extractionMessages).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Document not found",
      error: {
        code: "document_not_found",
        message: "Document not found",
      },
    });
  });

  it("marks the extraction enqueue as failed when Cloudflare Queue send fails", async () => {
    const queueProducer = new RecordingQueueProducer();
    queueProducer.extractionError = new Error("queue down");
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository, queueProducer });
    const response = await app.request(
      `/api/v1/extractions/${DOCUMENT_ID}/process`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Failed to enqueue extraction job",
      error: {
        code: "queue_unavailable",
        message: "Failed to enqueue extraction job",
      },
    });
    expect(repository.failedEnqueues).toEqual([
      {
        documentId: DOCUMENT_ID,
        jobId: JOB_ID,
        organizationId: ORG_ID,
        errorMessage: "queue down",
      },
    ]);
  });

  it("returns extraction job status scoped to the authenticated organization", async () => {
    const repository = new MemorySubmissionRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/jobs/${JOB_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: JOB_ID,
      document_id: DOCUMENT_ID,
      organization_id: ORG_ID,
      status: "pending",
      retry_count: 0,
    });
    expect(repository.jobStatusRequests).toEqual([
      { jobId: JOB_ID, organizationId: ORG_ID },
    ]);
  });

  it("retries failed extraction jobs with delayed queue delivery", async () => {
    const repository = new MemorySubmissionRepository();
    repository.job = {
      ...repository.job!,
      status: "failed",
      retryCount: 0,
      errorMessage: "OpenRouter timeout",
    };
    const { app, queueProducer } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/jobs/${JOB_ID}/retry`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: JOB_ID,
      document_id: DOCUMENT_ID,
      organization_id: ORG_ID,
      status: "retrying",
      retry_count: 1,
      next_retry_at: "2026-06-12T00:01:00.000Z",
    });
    expect(repository.retriedJobs).toEqual([
      { jobId: JOB_ID, organizationId: ORG_ID },
    ]);
    expect(queueProducer.extractionMessages).toEqual([
      {
        version: 1,
        jobId: JOB_ID,
        documentId: DOCUMENT_ID,
        organizationId: ORG_ID,
        priority: 5,
      },
    ]);
    expect(queueProducer.extractionOptions).toEqual([{ delaySeconds: 60 }]);
  });

  it("returns 404 when retrying a job that is not visible to the organization", async () => {
    const repository = new MemorySubmissionRepository();
    repository.job = null;
    const { app, queueProducer } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/jobs/${JOB_ID}/retry`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(404);
    expect(queueProducer.extractionMessages).toEqual([]);
  });

  it("maps non-retryable extraction jobs to a 400 response", async () => {
    const repository = new MemorySubmissionRepository();
    repository.retryExtractionJob = async () => {
      throw new InvalidDocumentStateError(
        `Job ${JOB_ID} cannot be retried: status=completed, retry_count=0`,
      );
    };
    const { app, queueProducer } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/jobs/${JOB_ID}/retry`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(queueProducer.extractionMessages).toEqual([]);
  });

  it("restores failed retry state when delayed queue send fails", async () => {
    const repository = new MemorySubmissionRepository();
    repository.job = {
      ...repository.job!,
      status: "failed",
      retryCount: 0,
      errorMessage: "OpenRouter timeout",
    };
    const queueProducer = new RecordingQueueProducer();
    queueProducer.extractionError = new Error("queue unavailable");
    const { app } = createTestApp({ repository, queueProducer });
    const response = await app.request(
      `/api/v1/extractions/jobs/${JOB_ID}/retry`,
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(503);
    expect(repository.failedRetryEnqueues).toEqual([
      {
        jobId: JOB_ID,
        organizationId: ORG_ID,
        retryCount: 0,
        errorMessage: "queue unavailable",
      },
    ]);
  });

  it("returns 404 when an extraction job is not visible to the organization", async () => {
    const repository = new MemorySubmissionRepository();
    repository.job = null;
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/extractions/jobs/${JOB_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Job not found",
      error: {
        code: "job_not_found",
        message: "Job not found",
      },
    });
  });

  it("returns validation errors for malformed extraction job IDs", async () => {
    const { app, repository } = createTestApp({});
    const response = await app.request(
      "/api/v1/extractions/jobs/not-a-uuid",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(422);
    expect(repository.jobStatusRequests).toEqual([]);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "validation_error" },
    });
  });
});
