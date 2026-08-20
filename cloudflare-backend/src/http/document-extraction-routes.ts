import { Hono } from "hono";
import { z } from "zod";
import { PostgresDocumentSubmissionRepository } from "../adapters/db/document-submissions";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import {
  createDocumentStorage,
  type DocumentStorage,
} from "../adapters/storage/documents";
import {
  InvalidDocumentStateError,
  LeaseFinalizedReferenceError,
  NotFoundError,
  type DocumentSubmissionRepository,
  type DocumentType,
  type DocumentRecord,
  type ExtractionDetail,
  type ExtractionListItem,
} from "../domain/documents/submission";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import type {
  QueueConsumerMessage,
  QueueHandlerContext,
} from "../queues/consumers";
import { createQueueProducer, type QueueProducer } from "../queues/producers";
import { createRuntimeQueueHandlers } from "../workflows/runtime";
import { errorResponse, HttpError } from "./errors";
import { readMultipartForm } from "./multipart";
import { leaseRecoveryProfileSchema } from "./recovery-profile-schema";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;
const AI_LEASE_EXTRACTION_FEATURE = "ai_lease_extraction";
const DOCUMENT_ACCESS_TTL_SECONDS = 60 * 60;

export type DocumentExtractionRouteDependencies = {
  storage?: DocumentStorage;
  repository?: DocumentSubmissionRepository;
  queueProducer?: QueueProducer;
  auth?: AuthMiddlewareOptions;
};

const uuidSchema = z.string().uuid();
const uploadQuerySchema = z.object({
  property_id: uuidSchema,
  document_type: z
    .enum(["lease", "amendment", "rent_roll", "gl_export", "other"])
    .default("lease"),
  lease_id: uuidSchema.optional(),
});
const documentStatusSchema = z.enum([
  "pending",
  "processing",
  "completed",
  "failed",
  "ready_for_review",
  "verified",
  "rejected",
]);
const listExtractionsQuerySchema = z.object({
  status: documentStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
});
const listDocumentsQuerySchema = z.object({
  property_id: uuidSchema.optional(),
  status: documentStatusSchema.optional(),
  // Ceiling at MAX_SAFE_INTEGER so an absurd `skip` cannot reach OFFSET as an
  // exponent-notation string (1e+21) that Postgres rejects (22P02 -> opaque 500);
  // out-of-range now fails closed as a 422.
  skip: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const processQuerySchema = z.object({
  priority: z.coerce.number().int().min(0).max(15).default(5),
});
const editActionSchema = z.object({
  field: z.string(),
  old_value: z.string().nullable().optional(),
  new_value: z.string().nullable().optional(),
  timestamp: z.string(),
});
const draftRequestSchema = z.object({
  profile: z.record(z.string(), z.unknown()),
});
const approveRequestSchema = z.object({
  profile: leaseRecoveryProfileSchema,
  edit_history: z.array(editActionSchema).default([]),
  lease_id: uuidSchema.optional(),
});
const rejectRequestSchema = z.object({
  reason: z.string().trim().min(1),
  notes: z.string().nullable().optional(),
  requeue: z.boolean().default(false),
});
const documentAccessQuerySchema = z.object({
  org_id: uuidSchema,
  expires: z.coerce.number().int().positive(),
  signature: z.string().min(64),
});

export function createDocumentExtractionRoutes(
  dependencies: DocumentExtractionRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));

  app.get("/document-files/:documentId", async (c) => {
    const documentId = uuidSchema.parse(c.req.param("documentId"));
    const query = documentAccessQuerySchema.parse(c.req.query());

    if (query.expires < Math.floor(Date.now() / 1000)) {
      throw new HttpError(403, "document_url_expired", "Document URL expired");
    }

    const expectedSignature = await signDocumentAccessUrl({
      secret: requireDocumentSigningSecret(c.env),
      documentId,
      organizationId: query.org_id,
      expires: query.expires,
    });

    if (!constantTimeEqual(query.signature, expectedSignature)) {
      throw new HttpError(
        403,
        "invalid_document_signature",
        "Invalid document URL",
      );
    }

    const detail = await resolveRepository(c.env, dependencies)
      .getExtractionDetail({
        documentId,
        organizationId: query.org_id,
      })
      .catch((error: unknown) => {
        throw mapSubmissionError(error);
      });

    if (!detail) {
      throw new HttpError(404, "document_not_found", "Document not found");
    }

    const bytes = await resolveStorage(c.env, dependencies).getDocumentBytes(
      detail.storageKey,
    );

    if (!bytes) {
      throw new HttpError(
        404,
        "document_file_not_found",
        "Document file not found",
      );
    }

    const headers = new Headers({
      "cache-control": "private, max-age=300",
      "content-disposition": `inline; filename="${headerSafeFilename(detail.filename)}"`,
      "content-length": String(bytes.byteLength),
      "content-type": detail.contentType || "application/pdf",
      "x-content-type-options": "nosniff",
      vary: "Origin",
    });
    const origin = c.req.header("origin");
    const allowedOrigin = allowedDocumentFileOrigin(origin);

    if (allowedOrigin) {
      headers.set("access-control-allow-origin", allowedOrigin);
      headers.set("access-control-allow-methods", "GET, HEAD, OPTIONS");
      headers.set(
        "access-control-expose-headers",
        "Content-Length, Content-Type",
      );
    }

    return new Response(bytes, {
      headers,
    });
  });

  app.options("/document-files/:documentId", (c) => {
    const headers = new Headers({
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-max-age": "600",
      vary: "Origin",
    });
    const allowedOrigin = allowedDocumentFileOrigin(c.req.header("origin"));

    if (allowedOrigin) {
      headers.set("access-control-allow-origin", allowedOrigin);
      headers.set(
        "access-control-allow-headers",
        c.req.header("access-control-request-headers") ?? "Range",
      );

      return new Response(null, { status: 204, headers });
    }

    throw new HttpError(403, "cors_origin_not_allowed", "Origin not allowed");
  });

  app.use("/documents/*", authMiddleware(dependencies.auth));
  app.use("/extractions/*", authMiddleware(dependencies.auth));

  app.get("/extractions", async (c) => {
    const query = listExtractionsQuerySchema.parse(c.req.query());
    const auth = c.get("auth");
    const page = await resolveRepository(c.env, dependencies).listExtractions({
      organizationId: auth.actor.organizationId,
      ...(query.status ? { status: query.status } : {}),
      page: query.page,
      pageSize: query.page_size,
    });

    return c.json({
      items: page.items.map(toExtractionListResponseItem),
      total: page.total,
      page: page.page,
      page_size: page.pageSize,
      has_next: page.hasNext,
    });
  });

  app.get("/documents", async (c) => {
    const query = listDocumentsQuerySchema.parse(c.req.query());
    const auth = c.get("auth");
    const documents = await resolveRepository(
      c.env,
      dependencies,
    ).listDocuments({
      organizationId: auth.actor.organizationId,
      ...(query.property_id ? { propertyId: query.property_id } : {}),
      ...(query.status ? { status: query.status } : {}),
      skip: query.skip,
      limit: query.limit,
    });

    return c.json(documents.map(toDocumentResponse));
  });

  app.post("/documents/upload", async (c) => {
    requireLandlordEditor(c.get("auth").actor.role);
    rejectClearlyOversizedUpload(c.req.header("content-length"));

    const query = uploadQuerySchema.parse(c.req.query());
    const form = await readMultipartForm(c);
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new HttpError(400, "missing_file", "A PDF file field is required");
    }

    const contentType = file.type || "application/octet-stream";
    if (contentType !== "application/pdf") {
      throw new HttpError(
        400,
        "invalid_file_type",
        `Only PDF files are accepted. Received: ${contentType}`,
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const storage = resolveStorage(c.env, dependencies);

    if (!storage.validatePdf(bytes)) {
      throw new HttpError(
        400,
        "invalid_pdf",
        "File does not appear to be a valid PDF (invalid magic bytes)",
      );
    }

    if (!storage.validateFileSize(bytes)) {
      throw new HttpError(
        400,
        "file_too_large",
        "File exceeds maximum size of 50MB",
      );
    }

    const auth = c.get("auth");
    const filename = normalizeFilename(file.name || "document.pdf");
    const storageKey = storage.generateStorageKey({
      organizationId: auth.actor.organizationId,
      propertyId: query.property_id,
      filename,
    });

    await storage.putDocument(storageKey, bytes, {
      contentType: "application/pdf",
      customMetadata: {
        organization_id: auth.actor.organizationId,
        property_id: query.property_id,
        original_filename: filename,
      },
    });

    try {
      const createDocumentInput = {
        organizationId: auth.actor.organizationId,
        propertyId: query.property_id,
        filename,
        storageKey,
        storageBucket: "DOCUMENTS_BUCKET",
        contentType: "application/pdf",
        fileSizeBytes: bytes.byteLength,
        documentType: query.document_type as DocumentType,
        ...(query.lease_id ? { leaseId: query.lease_id } : {}),
      };
      const document = await resolveRepository(
        c.env,
        dependencies,
      ).createDocument(createDocumentInput);

      return c.json(
        {
          document_id: document.id,
          status: document.status,
          message: "Document uploaded successfully and queued for processing",
        },
        201,
      );
    } catch (error) {
      try {
        await storage.deleteDocument(storageKey);
      } catch {
        throw new HttpError(
          503,
          "document_storage_cleanup_failed",
          "Document upload failed and storage cleanup could not be verified",
        );
      }
      throw mapSubmissionError(error);
    }
  });

  app.get("/documents/:documentId", async (c) => {
    const documentId = uuidSchema.parse(c.req.param("documentId"));
    const auth = c.get("auth");
    const document = await resolveRepository(c.env, dependencies).getDocument({
      documentId,
      organizationId: auth.actor.organizationId,
    });

    if (!document) {
      throw new HttpError(404, "document_not_found", "Document not found");
    }

    return c.json(toDocumentResponse(document));
  });

  app.delete("/documents/:documentId", async (c) => {
    requireLandlordEditor(c.get("auth").actor.role);

    const documentId = uuidSchema.parse(c.req.param("documentId"));
    const auth = c.get("auth");
    const repository = resolveRepository(c.env, dependencies);
    await repository
      .deleteDocument({
        documentId,
        organizationId: auth.actor.organizationId,
        beforeDeleteStorage: async (storageKey) => {
          try {
            await resolveStorage(c.env, dependencies).deleteDocument(
              storageKey,
            );
          } catch {
            throw new HttpError(
              503,
              "document_storage_delete_failed",
              "Document storage cleanup failed; document record was not deleted",
            );
          }
        },
      })
      .catch((error: unknown) => {
        throw mapSubmissionError(error);
      });

    return c.body(null, 204);
  });

  app.post("/extractions/:documentId/process", async (c) => {
    requireLandlordEditor(c.get("auth").actor.role);

    const documentId = uuidSchema.parse(c.req.param("documentId"));
    const query = processQuerySchema.parse(c.req.query());
    const auth = c.get("auth");
    const repository = resolveRepository(c.env, dependencies);

    await requireFullAccess(repository, auth.actor.organizationId);

    const submission = await repository
      .queueExtraction({
        documentId,
        organizationId: auth.actor.organizationId,
        priority: query.priority,
      })
      .catch((error: unknown) => {
        throw mapSubmissionError(error);
      });

    const queueMessage = {
      version: 1,
      jobId: submission.jobId,
      documentId: submission.documentId,
      organizationId: submission.organizationId,
      priority: submission.priority,
    } as const;

    try {
      await resolveQueueProducer(c.env, dependencies).enqueueExtraction({
        ...queueMessage,
      });
      if (shouldRunInlineExtractionQueue(c.env)) {
        const handler = createRuntimeQueueHandlers(c.env).extraction;
        if (!handler) {
          throw new Error("Local extraction queue handler is unavailable.");
        }
        await handler(queueMessage, createInlineQueueMessage(queueMessage), {
          env: c.env,
          executionContext: {} as ExecutionContext,
          queue: "capveri-extraction-local-e2e",
          metadata: {} as MessageBatchMetadata,
        } satisfies QueueHandlerContext);
      }
    } catch (error) {
      await resolveRepository(c.env, dependencies).markExtractionEnqueueFailed({
        documentId: submission.documentId,
        jobId: submission.jobId,
        organizationId: submission.organizationId,
        errorMessage:
          error instanceof Error ? error.message : "Failed to enqueue job",
      });
      throw new HttpError(
        503,
        "queue_unavailable",
        "Failed to enqueue extraction job",
      );
    }

    await repository
      .recordFeatureUse({
        organizationId: auth.actor.organizationId,
        featureKey: AI_LEASE_EXTRACTION_FEATURE,
      })
      .catch(() => undefined);

    return c.json(
      {
        success: true,
        document_id: submission.documentId,
        job_id: submission.jobId,
        status: "processing",
        message: "Extraction job queued",
      },
      202,
    );
  });

  app.put("/extractions/:documentId/draft", async (c) => {
    requireLandlordEditor(c.get("auth").actor.role);

    const documentId = uuidSchema.parse(c.req.param("documentId"));
    const body = draftRequestSchema.parse(await c.req.json());
    const auth = c.get("auth");
    const repository = resolveRepository(c.env, dependencies);

    await requireFullAccess(repository, auth.actor.organizationId);
    await repository
      .saveExtractionDraft({
        documentId,
        organizationId: auth.actor.organizationId,
        profile: body.profile,
      })
      .catch((error: unknown) => {
        throw mapSubmissionError(error);
      });

    return c.json({
      success: true,
      message: "Draft saved successfully",
    });
  });

  app.put("/extractions/:documentId/approve", async (c) => {
    requireLandlordEditor(c.get("auth").actor.role);

    const documentId = uuidSchema.parse(c.req.param("documentId"));
    const body = approveRequestSchema.parse(await c.req.json());
    const auth = c.get("auth");
    const repository = resolveRepository(c.env, dependencies);

    await requireFullAccess(repository, auth.actor.organizationId);
    const result = await repository
      .approveExtraction({
        documentId,
        organizationId: auth.actor.organizationId,
        userId: auth.actor.userId,
        profile: body.profile,
        editHistory: body.edit_history,
        ...(body.lease_id ? { leaseId: body.lease_id } : {}),
      })
      .catch((error: unknown) => {
        throw mapSubmissionError(error);
      });

    return c.json({
      success: true,
      lease_id: result.leaseId,
    });
  });

  app.put("/extractions/:documentId/reject", async (c) => {
    requireLandlordEditor(c.get("auth").actor.role);

    const documentId = uuidSchema.parse(c.req.param("documentId"));
    const body = rejectRequestSchema.parse(await c.req.json());
    const auth = c.get("auth");
    const repository = resolveRepository(c.env, dependencies);

    await requireFullAccess(repository, auth.actor.organizationId);
    const result = await repository
      .rejectExtraction({
        documentId,
        organizationId: auth.actor.organizationId,
        userId: auth.actor.userId,
        reason: body.reason,
        notes: body.notes ?? null,
        requeue: body.requeue,
        priority: 5,
      })
      .catch((error: unknown) => {
        throw mapSubmissionError(error);
      });

    if (result.submission) {
      try {
        await resolveQueueProducer(c.env, dependencies).enqueueExtraction({
          version: 1,
          jobId: result.submission.jobId,
          documentId: result.submission.documentId,
          organizationId: result.submission.organizationId,
          priority: result.submission.priority,
        });
      } catch (error) {
        await repository.markExtractionEnqueueFailed({
          documentId: result.submission.documentId,
          jobId: result.submission.jobId,
          organizationId: result.submission.organizationId,
          errorMessage:
            error instanceof Error ? error.message : "Failed to enqueue job",
        });
        throw new HttpError(
          503,
          "queue_unavailable",
          "Failed to enqueue extraction job",
        );
      }
    }

    return c.json({
      success: true,
      message: result.message,
    });
  });

  app.get("/extractions/:documentId", async (c) => {
    const documentId = uuidSchema.parse(c.req.param("documentId"));
    const auth = c.get("auth");
    const detail = await resolveRepository(c.env, dependencies)
      .getExtractionDetail({
        documentId,
        organizationId: auth.actor.organizationId,
      })
      .catch((error: unknown) => {
        throw mapSubmissionError(error);
      });

    if (!detail) {
      throw new HttpError(
        404,
        "document_not_found",
        "Document not found or you don't have access to it",
      );
    }

    return c.json(
      await toExtractionDetailResponse({
        detail,
        origin: new URL(c.req.url).origin,
        secret: requireDocumentSigningSecret(c.env),
        organizationId: auth.actor.organizationId,
      }),
    );
  });

  app.get("/extractions/jobs/:jobId", async (c) => {
    const jobId = uuidSchema.parse(c.req.param("jobId"));
    const auth = c.get("auth");
    const job = await resolveRepository(c.env, dependencies).getExtractionJob({
      jobId,
      organizationId: auth.actor.organizationId,
    });

    if (!job) {
      throw new HttpError(404, "job_not_found", "Job not found");
    }

    return c.json(toExtractionJobResponse(job));
  });

  app.post("/extractions/jobs/:jobId/retry", async (c) => {
    requireLandlordEditor(c.get("auth").actor.role);

    const jobId = uuidSchema.parse(c.req.param("jobId"));
    const auth = c.get("auth");
    const repository = resolveRepository(c.env, dependencies);

    await requireFullAccess(repository, auth.actor.organizationId);
    const result = await repository
      .retryExtractionJob({
        jobId,
        organizationId: auth.actor.organizationId,
      })
      .catch((error: unknown) => {
        throw mapSubmissionError(error);
      });

    if (!result) {
      throw new HttpError(404, "job_not_found", "Job not found");
    }

    try {
      await resolveQueueProducer(c.env, dependencies).enqueueExtraction(
        {
          version: 1,
          jobId: result.job.id,
          documentId: result.job.documentId,
          organizationId: result.job.organizationId,
          priority: result.job.priority,
        },
        { delaySeconds: result.delaySeconds },
      );
    } catch (error) {
      await repository.markRetryEnqueueFailed({
        jobId: result.job.id,
        organizationId: result.job.organizationId,
        retryCount: result.previousRetryCount,
        errorMessage:
          error instanceof Error
            ? error.message
            : "Failed to enqueue retry job",
      });
      throw new HttpError(
        503,
        "queue_unavailable",
        error instanceof Error ? error.message : "Failed to enqueue retry job",
      );
    }

    return c.json(toExtractionJobResponse(result.job));
  });

  return app;
}

function rejectClearlyOversizedUpload(contentLength: string | undefined): void {
  if (!contentLength) {
    return;
  }

  const parsed = Number.parseInt(contentLength, 10);

  if (
    Number.isFinite(parsed) &&
    parsed > MAX_DOCUMENT_BYTES + MULTIPART_OVERHEAD_BYTES
  ) {
    throw new HttpError(
      400,
      "file_too_large",
      "File exceeds maximum size of 50MB",
    );
  }
}

function toExtractionListResponseItem(item: ExtractionListItem) {
  const confidenceSummary = summarizeConfidence(item.extractionResult);

  return {
    id: item.id,
    filename: item.filename,
    status: item.status,
    created_at: item.createdAt,
    processed_at: item.processedAt,
    verified_at: item.verifiedAt,
    average_confidence: confidenceSummary.averageConfidence,
    low_confidence_count: confidenceSummary.lowConfidenceCount,
  };
}

function toDocumentResponse(document: DocumentRecord) {
  return {
    id: document.id,
    organization_id: document.organizationId,
    property_id: document.propertyId,
    filename: document.filename,
    content_type: document.contentType,
    file_size_bytes: document.fileSizeBytes,
    document_type: document.documentType,
    status: document.status,
    error_message: document.errorMessage,
    created_at: document.createdAt,
    updated_at: document.updatedAt,
    processed_at: document.processedAt,
  };
}

async function toExtractionDetailResponse(input: {
  detail: ExtractionDetail;
  origin: string;
  secret: string;
  organizationId: string;
}) {
  return {
    id: input.detail.id,
    filename: input.detail.filename,
    status: input.detail.status,
    storage_bucket: input.detail.storageBucket,
    storage_key: input.detail.storageKey,
    document_url: await createDocumentAccessUrl(input),
    content_type: input.detail.contentType,
    file_size_bytes: input.detail.fileSizeBytes,
    extraction_result: input.detail.extractionResult,
    created_at: input.detail.createdAt,
    processed_at: input.detail.processedAt,
    verified_at: input.detail.verifiedAt,
    verified_by: input.detail.verifiedBy,
    property_id: input.detail.propertyId,
    lease_id: input.detail.leaseId,
    edit_history: input.detail.editHistory,
  };
}

function toExtractionJobResponse(job: {
  id: string;
  documentId: string;
  organizationId: string;
  status: string;
  priority: number;
  retryCount: number;
  errorMessage: string | null;
  resultData: Record<string, unknown> | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  nextRetryAt: string | null;
}) {
  return {
    id: job.id,
    document_id: job.documentId,
    organization_id: job.organizationId,
    status: job.status,
    priority: job.priority,
    retry_count: job.retryCount,
    error_message: job.errorMessage,
    result_data: job.resultData,
    created_at: job.createdAt,
    started_at: job.startedAt,
    completed_at: job.completedAt,
    next_retry_at: job.nextRetryAt,
  };
}

async function createDocumentAccessUrl(input: {
  detail: ExtractionDetail;
  origin: string;
  secret: string;
  organizationId: string;
}): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + DOCUMENT_ACCESS_TTL_SECONDS;
  const signature = await signDocumentAccessUrl({
    secret: input.secret,
    documentId: input.detail.id,
    organizationId: input.organizationId,
    expires,
  });
  const url = new URL(
    `/api/v1/document-files/${input.detail.id}`,
    input.origin,
  );
  url.searchParams.set("org_id", input.organizationId);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature);

  return url.toString();
}

async function signDocumentAccessUrl(input: {
  secret: string;
  documentId: string;
  organizationId: string;
  expires: number;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(
      [input.documentId, input.organizationId, input.expires].join("."),
    ),
  );

  return bytesToHex(new Uint8Array(signature));
}

function summarizeConfidence(
  extractionResult: Record<string, unknown> | null,
): { averageConfidence: number | null; lowConfidenceCount: number } {
  const confidenceScores =
    extractionResult && typeof extractionResult.confidence_scores === "object"
      ? extractionResult.confidence_scores
      : undefined;

  if (!confidenceScores || Array.isArray(confidenceScores)) {
    return { averageConfidence: null, lowConfidenceCount: 0 };
  }

  const values = Object.values(confidenceScores).filter(
    (value): value is number => typeof value === "number",
  );

  if (values.length === 0) {
    return { averageConfidence: null, lowConfidenceCount: 0 };
  }

  return {
    averageConfidence:
      values.reduce((total, value) => total + value, 0) / values.length,
    lowConfidenceCount: values.filter((value) => value < 0.7).length,
  };
}

async function requireFullAccess(
  repository: DocumentSubmissionRepository,
  organizationId: string,
): Promise<void> {
  if (await repository.hasFullAccess(organizationId)) {
    return;
  }

  throw new HttpError(
    402,
    "subscription_required",
    "subscription_required: An active subscription or trial is required.",
  );
}

function requireDocumentSigningSecret(env: AppEnv): string {
  if (!env.DOCUMENT_ACCESS_SIGNING_SECRET) {
    throw new HttpError(
      500,
      "document_signing_not_configured",
      "Document access signing is not configured",
    );
  }

  return env.DOCUMENT_ACCESS_SIGNING_SECRET;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function headerSafeFilename(filename: string): string {
  return filename.replace(/["\\\r\n]/g, "_").slice(0, 255) || "document.pdf";
}

function allowedDocumentFileOrigin(
  origin: string | undefined,
): string | undefined {
  if (!origin) {
    return undefined;
  }

  if (
    origin === "https://app.capveri.com" ||
    origin === "https://www.capveri.com"
  ) {
    return origin;
  }

  try {
    const url = new URL(origin);

    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    ) {
      return origin;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function requireLandlordEditor(
  role: AuthVariables["auth"]["actor"]["role"],
): void {
  if (role === "owner" || role === "admin" || role === "member") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function resolveStorage(
  env: AppEnv,
  dependencies: DocumentExtractionRouteDependencies,
): DocumentStorage {
  return dependencies.storage ?? createDocumentStorage(env);
}

function resolveRepository(
  env: AppEnv,
  dependencies: DocumentExtractionRouteDependencies,
): DocumentSubmissionRepository {
  return (
    dependencies.repository ??
    new PostgresDocumentSubmissionRepository(createDirectPostgresExecutor(env))
  );
}

function resolveQueueProducer(
  env: AppEnv,
  dependencies: DocumentExtractionRouteDependencies,
): QueueProducer {
  return dependencies.queueProducer ?? createQueueProducer(env);
}

function shouldRunInlineExtractionQueue(env: AppEnv): boolean {
  return (
    env.LOCAL_E2E_INLINE_EXTRACTION_QUEUE === "1" &&
    String(env.ENVIRONMENT ?? "") === "development" &&
    isLoopbackUrl(env.SUPABASE_URL)
  );
}

function isLoopbackUrl(rawUrl: string | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

function createInlineQueueMessage<Message>(
  body: Message,
): QueueConsumerMessage {
  return {
    body,
    attempts: 1,
    ack() {},
    retry() {},
  };
}

export function normalizeFilename(filename: string): string {
  const trimmed = filename.trim();
  const basename = trimmed.split(/[\\/]/).at(-1) || "document.pdf";
  // Drop C0/C1 control characters (including NUL). Postgres text columns and
  // R2 object metadata both reject U+0000, so a control char in the uploaded
  // filename otherwise surfaced as an opaque 500 instead of storing cleanly.
  const sanitized = Array.from(basename)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 0x1f && !(code >= 0x7f && code <= 0x9f);
    })
    .join("");

  return sanitized.slice(0, 255) || "document.pdf";
}

function mapSubmissionError(error: unknown): Error {
  if (error instanceof NotFoundError) {
    const code = `${error.resource.toLowerCase()}_not_found`;

    return new HttpError(404, code, error.message);
  }

  if (error instanceof InvalidDocumentStateError) {
    return new HttpError(400, "invalid_document_state", error.message);
  }

  if (error instanceof LeaseFinalizedReferenceError) {
    return new HttpError(409, "lease_in_finalized_snapshot", error.message);
  }

  if (error instanceof HttpError) {
    return error;
  }

  return error instanceof Error
    ? error
    : new Error("Unexpected submission error");
}
