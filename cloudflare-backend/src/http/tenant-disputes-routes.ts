import { Hono, type Context } from "hono";
import { z } from "zod";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import { PostgresTenantDisputesRepository } from "../adapters/db/tenant-disputes";
import {
  createDisputeAttachmentStorage,
  type DisputeAttachmentStorage,
} from "../adapters/storage/dispute-attachments";
import { buildStatementPdf } from "../domain/tenant-portal/statement-pdf";
import type { TenantDisputesRepository } from "../domain/tenant-disputes/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { captureWorkerException } from "../platform/sentry";
import { attachmentContentDisposition } from "./content-disposition";
import { errorResponse, HttpError } from "./errors";
import { readMultipartForm } from "./multipart";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type TenantDisputesRouteDependencies = {
  repository?: TenantDisputesRepository;
  auth?: AuthMiddlewareOptions;
  clock?: () => Date;
  /** Override R2 storage — used in tests to inject an in-memory fake. */
  storage?: DisputeAttachmentStorage;
};

const uuidSchema = z.string().uuid();

const disputeCategorySchema = z.enum([
  "calculation_error",
  "missing_credit",
  "incorrect_area",
  "base_year_issue",
  "billing_question",
  "other",
]);

const disputeStatusSchema = z.enum([
  "open",
  "under_review",
  "resolved",
  "rejected",
  "closed",
]);

const createDisputeBodySchema = z.object({
  statement_id: z.string().uuid(),
  category: disputeCategorySchema,
  description: z.string().min(10).max(5000),
});

const listDisputesQuerySchema = z.object({
  status: disputeStatusSchema.optional(),
  skip: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const addCommentBodySchema = z.object({
  content: z.string().min(1).max(5000),
  is_internal: z.boolean().optional(),
});

const cleanupSyntheticDisputeBodySchema = z.object({
  run_id: z.string().min(8).max(128),
  confirm: z.literal("delete-prod-e2e-dispute"),
});

/** Auth routes that need the tenant guard */
const TENANT_ROUTES = [
  "/tenant/disputes",
  "/tenant/disputes/*",
  "/tenant/statements/*",
];

export function createTenantDisputesRoutes(
  dependencies: TenantDisputesRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));

  const tenantAuth = { ...dependencies.auth, parties: ["tenant"] as const };
  for (const pattern of TENANT_ROUTES) {
    app.use(pattern, authMiddleware(tenantAuth));
  }

  // ── GET /tenant/statements/:statementId/pdf ──────────────────────────────
  app.get("/tenant/statements/:statementId/pdf", async (c) => {
    const tenant = requireTenant(c);
    const statementId = uuidSchema.parse(c.req.param("statementId"));

    const repo = resolveRepository(c.env, dependencies);
    const ctx = await repo.getStatementPdfContext({
      statementId,
      tenantUserId: tenant.id,
      organizationId: tenant.organizationId,
    });
    if (!ctx) {
      throw new HttpError(404, "not_found", "Statement not found");
    }

    const pdfBytes = await buildStatementPdf(ctx);

    const year = ctx.snapshot.period_start_date.slice(0, 4);
    const safeName = ctx.property.name.replace(/\s+/gu, "_");
    const filename = `Reconciliation_${safeName}_${year}.pdf`;

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": attachmentContentDisposition(filename),
        "Content-Length": String(pdfBytes.byteLength),
      },
    });
  });

  // ── POST /tenant/disputes ────────────────────────────────────────────────
  app.post("/tenant/disputes", async (c) => {
    const tenant = requireTenant(c);
    const body = createDisputeBodySchema.parse(await c.req.json());
    const repo = resolveRepository(c.env, dependencies);
    const now = nowIso(dependencies);

    // Rate limit: max 3 disputes per tenant per 24h.
    // NOTE: this is a pre-insert-only check. FastAPI also does a post-insert
    // TOCTOU re-check (unique constraint on rapid concurrent requests). We
    // intentionally omit that second check here; the 3/day cap is soft and a
    // race window is acceptable for this use case.
    const since = new Date(
      new Date(now).getTime() - 24 * 60 * 60 * 1000,
    ).toISOString();
    const recent = await repo.countRecentDisputesForTenant({
      tenantUserId: tenant.id,
      since,
    });
    if (recent >= 3) {
      throw new HttpError(
        429,
        "rate_limit_exceeded",
        "You may submit a maximum of 3 disputes per day. Please try again tomorrow.",
      );
    }

    // Verify statement is linked to this tenant and finalized
    const verification = await repo.verifyStatementForTenant({
      statementId: body.statement_id,
      tenantUserId: tenant.id,
      organizationId: tenant.organizationId,
    });
    if (verification === "not_found") {
      throw new HttpError(404, "not_found", "Statement not found");
    }
    if (verification === "not_linked") {
      throw new HttpError(
        403,
        "forbidden",
        "Statement does not belong to your lease",
      );
    }

    const dispute = await repo.createDispute({
      tenantUserId: tenant.id,
      // authorUserId is users(id) — needed for dispute_comments.author_id FK
      authorUserId: tenant.userId,
      organizationId: tenant.organizationId,
      statementId: body.statement_id,
      category: body.category,
      description: body.description,
      now,
    });

    return c.json(dispute, 201);
  });

  // ── GET /tenant/disputes ─────────────────────────────────────────────────
  app.get("/tenant/disputes", async (c) => {
    const tenant = requireTenant(c);
    const query = listDisputesQuerySchema.parse(c.req.query());
    const repo = resolveRepository(c.env, dependencies);

    const disputes = await repo.listDisputes({
      tenantUserId: tenant.id,
      ...(query.status !== undefined ? { status: query.status } : {}),
      skip: query.skip,
      limit: query.limit,
    });

    return c.json(disputes);
  });

  // ── GET /tenant/disputes/:disputeId ─────────────────────────────────────
  app.get("/tenant/disputes/:disputeId", async (c) => {
    const tenant = requireTenant(c);
    const disputeId = uuidSchema.parse(c.req.param("disputeId"));
    const repo = resolveRepository(c.env, dependencies);

    const detail = await repo.getDispute({
      disputeId,
      tenantUserId: tenant.id,
    });
    if (!detail) {
      throw new HttpError(404, "not_found", "Dispute not found");
    }

    return c.json(detail);
  });

  // ── POST /tenant/disputes/:disputeId/comments ────────────────────────────
  app.post("/tenant/disputes/:disputeId/comments", async (c) => {
    const tenant = requireTenant(c);
    const disputeId = uuidSchema.parse(c.req.param("disputeId"));
    const body = addCommentBodySchema.parse(await c.req.json());
    const repo = resolveRepository(c.env, dependencies);

    const comment = await repo.addComment({
      disputeId,
      tenantUserId: tenant.id,
      // authorId is users(id) FK on dispute_comments — use userId, not tenant profile id
      authorId: tenant.userId,
      authorName: tenant.contactName ?? "Tenant",
      content: body.content,
      // is_internal is forced to false for tenants regardless of input
      now: nowIso(dependencies),
    });
    if (!comment) {
      throw new HttpError(404, "not_found", "Dispute not found");
    }

    return c.json(comment, 201);
  });

  // ── POST /tenant/disputes/:disputeId/attachments ─────────────────────────
  app.post("/tenant/disputes/:disputeId/attachments", async (c) => {
    const tenant = requireTenant(c);
    const disputeId = uuidSchema.parse(c.req.param("disputeId"));
    const repo = resolveRepository(c.env, dependencies);

    const formData = await readMultipartForm(c);
    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new HttpError(400, "bad_request", "Form field 'file' is required");
    }

    if (file.size === 0) {
      throw new HttpError(400, "bad_request", "File must not be empty");
    }

    const mimeType = file.type || "application/octet-stream";

    const storage =
      dependencies.storage ?? createDisputeAttachmentStorage(c.env);

    if (!storage.validateContentType(mimeType)) {
      throw new HttpError(
        400,
        "invalid_content_type",
        "File must be application/pdf, image/jpeg, or image/png",
      );
    }

    if (!storage.validateFileSize(file.size)) {
      throw new HttpError(
        400,
        "file_too_large",
        "File exceeds the 10 MB size limit",
      );
    }

    const detail = await repo.getDispute({
      disputeId,
      tenantUserId: tenant.id,
    });
    if (!detail) {
      throw new HttpError(404, "not_found", "Dispute not found");
    }

    const key = storage.generateKey({
      organizationId: tenant.organizationId,
      disputeId,
      filename: file.name,
    });

    const bytes = new Uint8Array(await file.arrayBuffer());

    try {
      await storage.putAttachment(key, bytes, mimeType);
    } catch {
      throw new HttpError(500, "storage_error", "Failed to upload attachment");
    }

    const attachment = await repo.addAttachment({
      disputeId,
      tenantUserId: tenant.id,
      uploadedBy: tenant.userId,
      filename: file.name,
      storagePath: key,
      fileSize: file.size,
      mimeType,
      now: nowIso(dependencies),
    });

    if (!attachment) {
      // DB insert failed after successful upload — rollback R2 object
      try {
        await storage.deleteAttachment(key);
      } catch (error) {
        await captureWorkerException(c.env, error, {
          operation: "worker.tenant_disputes.attachment_rollback",
          method: "POST",
          path: "/api/v1/tenant/disputes/:disputeId/attachments",
          statusCode: 500,
        });
      }
      throw new HttpError(
        500,
        "storage_error",
        "Failed to record attachment; upload rolled back",
      );
    }

    return c.json(attachment, 201);
  });

  // ── GET /tenant/disputes/:disputeId/attachments/:attachmentId ────────────
  app.get(
    "/tenant/disputes/:disputeId/attachments/:attachmentId",
    async (c) => {
      const tenant = requireTenant(c);
      const disputeId = uuidSchema.parse(c.req.param("disputeId"));
      const attachmentId = uuidSchema.parse(c.req.param("attachmentId"));
      const repo = resolveRepository(c.env, dependencies);

      const meta = await repo.getAttachmentForDownload({
        disputeId,
        attachmentId,
        tenantUserId: tenant.id,
      });
      if (!meta) {
        throw new HttpError(404, "not_found", "Attachment not found");
      }

      const storage =
        dependencies.storage ?? createDisputeAttachmentStorage(c.env);
      const bytes = await storage.getAttachmentBytes(meta.storagePath);
      if (!bytes) {
        throw new HttpError(404, "not_found", "Attachment file not found");
      }

      return new Response(bytes, {
        status: 200,
        headers: {
          "Content-Type": meta.mimeType,
          "Content-Disposition": attachmentContentDisposition(meta.filename),
          "Content-Length": String(bytes.byteLength),
        },
      });
    },
  );

  app.delete("/tenant/disputes/:disputeId/e2e-cleanup", async (c) => {
    const tenant = requireTenant(c);
    const disputeId = uuidSchema.parse(c.req.param("disputeId"));
    const body = cleanupSyntheticDisputeBodySchema.parse(await c.req.json());
    const repo = resolveRepository(c.env, dependencies);

    const detail = await repo.getDispute({
      disputeId,
      tenantUserId: tenant.id,
    });
    if (!detail) {
      throw new HttpError(404, "not_found", "Dispute not found");
    }
    const expectedDescription = matchingSyntheticTenantDisputeDescription(
      detail.description,
      body.run_id,
    );
    if (!expectedDescription) {
      throw new HttpError(
        403,
        "cleanup_forbidden",
        "Only matching synthetic production test disputes can be cleaned up.",
      );
    }

    const attachmentStoragePaths: string[] = [];
    for (const attachment of detail.attachments) {
      const meta = await repo.getAttachmentForDownload({
        disputeId,
        attachmentId: attachment.id,
        tenantUserId: tenant.id,
      });
      if (!meta) {
        throw new HttpError(404, "not_found", "Attachment not found");
      }
      attachmentStoragePaths.push(meta.storagePath);
    }

    const storage =
      dependencies.storage ?? createDisputeAttachmentStorage(c.env);
    for (const storagePath of attachmentStoragePaths) {
      await storage.deleteAttachment(storagePath);
    }

    const deleted = await repo.deleteSyntheticTenantDispute({
      disputeId,
      tenantUserId: tenant.id,
      expectedDescription,
    });
    if (!deleted) {
      throw new HttpError(404, "not_found", "Dispute not found");
    }

    return c.json({
      dispute_id: disputeId,
      attachment_storage_paths: attachmentStoragePaths,
      deleted: {
        r2_objects: attachmentStoragePaths.length,
        ...deleted,
      },
      cleaned_at: nowIso(dependencies),
    });
  });

  return app;
}

function resolveRepository(
  env: AppEnv,
  dependencies: TenantDisputesRouteDependencies,
): TenantDisputesRepository {
  return (
    dependencies.repository ??
    new PostgresTenantDisputesRepository(createDirectPostgresExecutor(env))
  );
}

function requireTenant(
  c: RouteContext,
): NonNullable<AuthVariables["auth"]["tenantUser"]> {
  const auth = c.get("auth");
  if (auth.actor.party === "tenant" && auth.tenantUser) {
    return auth.tenantUser;
  }
  throw new HttpError(
    403,
    "tenant_profile_required",
    "Tenant profile required",
  );
}

function nowIso(dependencies: TenantDisputesRouteDependencies): string {
  return (dependencies.clock ?? (() => new Date()))().toISOString();
}

function syntheticTenantDisputeDescription(runId: string): string {
  return (
    `[PROD-TEST] Tenant dispute lifecycle prod_e2e_run_id=${runId}. ` +
    "Synthetic dispute for production cleanup verification."
  );
}

function syntheticTenantStatementHandoffDescription(runId: string): string {
  return (
    `[PROD-TEST] Tenant statement dispute handoff prod_e2e_run_id=${runId}. ` +
    "Synthetic dispute created after downloading its tenant statement PDF."
  );
}

function matchingSyntheticTenantDisputeDescription(
  description: string,
  runId: string,
): string | null {
  const allowed = [
    syntheticTenantDisputeDescription(runId),
    syntheticTenantStatementHandoffDescription(runId),
  ];
  if (allowed.includes(description)) {
    return description;
  }
  const legacyStatementHandoffDescription = new RegExp(
    "^\\[PROD-TEST\\] Tenant statement dispute handoff prod_e2e_run_id=" +
      escapeRegExp(runId) +
      "\\. Synthetic dispute created from statement " +
      "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12} " +
      "after downloading its tenant PDF\\.$",
    "iu",
  );
  return legacyStatementHandoffDescription.test(description)
    ? description
    : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
