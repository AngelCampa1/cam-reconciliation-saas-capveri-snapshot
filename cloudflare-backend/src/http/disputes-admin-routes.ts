/**
 * Admin disputes routes — landlord-side dispute management API.
 *
 * When mounted under /api/v1 in app.ts the full paths become:
 *   GET  /api/v1/disputes
 *   GET  /api/v1/disputes/:disputeId
 *   PUT  /api/v1/disputes/:disputeId/status
 *   POST /api/v1/disputes/:disputeId/comments
 *
 * Mirrors backend/app/api/v1/disputes.py (FastAPI) — admin/landlord endpoints only.
 * Tenant-side dispute routes live at /tenant/disputes (tenant-disputes-routes.ts).
 *
 * Auth gate summary (confirmed from disputes.py decorator + param order):
 *   GET  /disputes            — OrgContext only → requireLandlord (any landlord role)
 *   GET  /disputes/:id        — OrgContext only → requireLandlord
 *   PUT  /disputes/:id/status — [Depends(require_full_access)] then get_current_admin_user
 *                               → requireFullAccess (402) first, requireAdmin (403) second
 *   POST /disputes/:id/comments — same as PUT: full-access (402) then admin (403)
 *
 * Deferred (consistent with tenant dispute slice decision c887ae43):
 *   - Tenant notifications on status change / non-internal comment: deferred to the
 *     background-work slice that will implement async notification dispatch.
 *   - Analytics events (landlord_dispute_status_changed, landlord_dispute_comment_added)
 *     and record_feature_use: deferred — no Worker telemetry mechanism yet, consistent
 *     with other ported slices.
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  HttpSupabaseAdminAuthClient,
  type SupabaseAdminAuthClient,
} from "../adapters/auth/supabase-admin";
import { PostgresAdminDisputesRepository } from "../adapters/db/tenant-disputes";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import {
  createDisputeAttachmentStorage,
  type DisputeAttachmentStorage,
} from "../adapters/storage/dispute-attachments";
import type {
  AdminDisputesRepository,
  DeleteSyntheticAdminDisputeFixtureResidueResult,
  DeleteSyntheticAdminDisputeFixtureResult,
  DeleteSyntheticDisputeResult,
} from "../domain/tenant-disputes/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { attachmentContentDisposition } from "./content-disposition";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type DisputesAdminRouteDependencies = {
  repository?: AdminDisputesRepository;
  storage?: DisputeAttachmentStorage;
  authClient?: Pick<SupabaseAdminAuthClient, "createUser" | "deleteUser">;
  auth?: AuthMiddlewareOptions;
};

// ── Zod schemas ───────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid("Invalid UUID");

const disputeStatusSchema = z.enum([
  "open",
  "under_review",
  "resolved",
  "rejected",
  "closed",
]);

type DisputeStatus = z.infer<typeof disputeStatusSchema>;

const listQuerySchema = z.object({
  status: disputeStatusSchema.optional(),
  skip: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const updateStatusBodySchema = z.object({
  status: disputeStatusSchema,
  resolution_summary: z.string().max(5000).nullable().optional(),
});

const addCommentBodySchema = z.object({
  content: z.string().min(1).max(5000),
  is_internal: z.boolean().optional().default(false),
});

const cleanupSyntheticDisputeBodySchema = z.object({
  run_id: z.string().min(8).max(128),
  confirm: z.literal("delete-prod-e2e-dispute"),
});

const createSyntheticFixtureBodySchema = z.object({
  run_id: z.string().min(8).max(128),
  confirm: z.literal("create-prod-e2e-admin-dispute"),
});

const cleanupSyntheticAdminFixtureResidueBodySchema = z.object({
  run_id: z.string().min(8).max(128),
  confirm: z.literal("delete-prod-e2e-admin-dispute-residue"),
});

// ── State-transition map (byte-faithful to dispute_service.py update_status) ──
// Source: backend/app/services/tenant/dispute_service.py lines 367–378.

const VALID_TRANSITIONS: Record<DisputeStatus, DisputeStatus[]> = {
  open: ["under_review", "rejected"],
  under_review: ["resolved", "rejected"],
  resolved: ["closed"],
  rejected: ["closed"],
  closed: [],
};

// ── Auth guard helpers ────────────────────────────────────────────────────────

function requireLandlord(c: RouteContext): void {
  if (c.get("auth").actor.party === "landlord") return;
  // Error detail matches FastAPI's insufficient_permissions convention used
  // by get_org_scoped_context / OrgContext in the Python layer.
  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function requireAdmin(c: RouteContext): void {
  requireLandlord(c);
  const { role } = c.get("auth").actor;
  if (role === "owner" || role === "admin") return;
  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

async function requireFullAccess(
  c: RouteContext,
  repo: AdminDisputesRepository,
): Promise<void> {
  const { organizationId } = c.get("auth").actor;
  const hasAccess = await repo.hasFullAccess(organizationId);
  if (!hasAccess) {
    throw new HttpError(
      402,
      "subscription_required",
      "subscription_required: An active subscription or trial is required.",
    );
  }
}

type SyntheticCleanupMarker = "tenant_dispute" | "admin_fixture";
const e2eFixtureSecretHeader = "x-capveri-e2e-secret";

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

function syntheticAdminDisputeDescription(runId: string): string {
  return (
    `[PROD-TEST] Admin dispute lifecycle prod_e2e_run_id=${runId}. ` +
    "Synthetic admin-visible dispute for production cleanup verification."
  );
}

function syntheticAdminDisputeTenantEmail(runId: string): string {
  return `prodtest+admin-dispute-${runId.toLowerCase()}@capveri.com`;
}

function syntheticAdminDisputeAuthSignupOrganizationName(
  runId: string,
): string {
  return `[PROD-TEST] Admin dispute auth signup ${runId}`;
}

function syntheticAdminDisputePassword(runId: string): string {
  return `ProdE2E-${runId}-Aa1`;
}

function matchingSyntheticTenantDisputeDescription(
  description: string,
  runId: string,
): SyntheticCleanupMarker | null {
  if (description === syntheticAdminDisputeDescription(runId)) {
    return "admin_fixture";
  }
  const allowed = [
    syntheticTenantDisputeDescription(runId),
    syntheticTenantStatementHandoffDescription(runId),
  ];
  if (allowed.includes(description)) {
    return "tenant_dispute";
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
    ? "tenant_dispute"
    : null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

// ── Attachment URL strategy (parity note) ──────────────────────────────────────
//
// FastAPI's _presign_attachment (disputes.py lines 50–65) returns an S3 GET
// presigned URL. The Worker has no presigned-URL mechanism for R2 in this stack;
// instead — consistent with the tenant dispute slice — the repository emits a
// Worker-served streaming download route as file_url
// (/api/v1/disputes/:disputeId/attachments/:attachmentId). That route is
// auth-gated and org-scoped below, so the raw R2 storage_path is never exposed
// to the client. This matches the tenant slice's attachmentFromRow convention.

// ── Route factory ─────────────────────────────────────────────────────────────

export function createDisputesAdminRoutes(
  dependencies: DisputesAdminRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/disputes", authMiddleware(dependencies.auth));
  app.use("/disputes/*", authMiddleware(dependencies.auth));

  // ── GET /disputes ────────────────────────────────────────────────────────────
  // Auth: OrgContext (any landlord role). Source: disputes.py line 88–99 — uses
  // `ctx: OrgContext` with no admin dependency; any authenticated landlord may list.

  app.get("/disputes", async (c) => {
    requireLandlord(c);

    let query: z.infer<typeof listQuerySchema>;
    try {
      query = listQuerySchema.parse(c.req.query());
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        throw new HttpError(
          400,
          "validation_error",
          firstIssue?.message ?? "Invalid query parameters",
        );
      }
      throw err;
    }

    const orgId = c.get("auth").actor.organizationId;
    const repo = resolveRepository(c.env, dependencies);

    const disputes = await repo.listDisputesForOrg({
      organizationId: orgId,
      ...(query.status !== undefined ? { status: query.status } : {}),
      skip: query.skip,
      limit: query.limit,
    });

    return c.json(disputes);
  });

  app.post("/disputes/e2e-fixture", async (c) => {
    const repo = resolveRepository(c.env, dependencies);

    requireE2eFixtureSecret(c.env, c.req.header(e2eFixtureSecretHeader));
    await requireFullAccess(c, repo);
    requireAdmin(c);

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw new HttpError(
        400,
        "invalid_json",
        "Request body must be valid JSON",
      );
    }

    let body: z.infer<typeof createSyntheticFixtureBodySchema>;
    try {
      body = createSyntheticFixtureBodySchema.parse(rawBody);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        throw new HttpError(
          400,
          "validation_error",
          firstIssue?.message ?? "Invalid request body",
        );
      }
      throw err;
    }

    const authClient = resolveAuthClient(c.env, dependencies);
    const tenantEmail = syntheticAdminDisputeTenantEmail(body.run_id);
    const authSignupOrganizationName =
      syntheticAdminDisputeAuthSignupOrganizationName(body.run_id);
    const authUser = await authClient.createUser({
      email: tenantEmail,
      password: syntheticAdminDisputePassword(body.run_id),
      metadata: {
        full_name: `PROD TEST Admin Dispute Tenant ${body.run_id}`,
        organization_name: authSignupOrganizationName,
        prod_e2e_run_id: body.run_id,
      },
    });

    let fixture;
    try {
      fixture = await repo.createSyntheticAdminDisputeFixture({
        organizationId: c.get("auth").actor.organizationId,
        actorUserId: c.get("auth").actor.userId,
        syntheticUserId: authUser.id,
        tenantEmail,
        authSignupOrganizationName,
        runId: body.run_id,
        description: syntheticAdminDisputeDescription(body.run_id),
        now: new Date().toISOString(),
      });
    } catch (error) {
      await authClient.deleteUser(authUser.id).catch(() => undefined);
      await repo
        .deleteSyntheticAdminAuthSignupResidue({
          tenantEmail,
          authSignupOrganizationName,
        })
        .catch(() => undefined);
      throw error;
    }

    return c.json(fixture, 201);
  });

  // ── GET /disputes/:disputeId ──────────────────────────────────────────────────
  // Auth: OrgContext (any landlord role). Source: disputes.py line 138–143 — uses
  // `ctx: OrgContext` with no admin dependency.
  // Admin sees ALL comments including is_internal=true (unlike tenant view).

  app.delete("/disputes/e2e-fixture-residue", async (c) => {
    const repo = resolveRepository(c.env, dependencies);

    requireE2eFixtureSecret(c.env, c.req.header(e2eFixtureSecretHeader));
    await requireFullAccess(c, repo);
    requireAdmin(c);

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw new HttpError(
        400,
        "invalid_json",
        "Request body must be valid JSON",
      );
    }

    let body: z.infer<typeof cleanupSyntheticAdminFixtureResidueBodySchema>;
    try {
      body = cleanupSyntheticAdminFixtureResidueBodySchema.parse(rawBody);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        throw new HttpError(
          400,
          "validation_error",
          firstIssue?.message ?? "Invalid request body",
        );
      }
      throw err;
    }

    const deleted = await repo.deleteSyntheticAdminDisputeFixtureResidue({
      organizationId: c.get("auth").actor.organizationId,
      runId: body.run_id,
    });
    if (!deleted) {
      throw new HttpError(404, "not_found", "Synthetic fixture not found");
    }

    return c.json({
      run_id: body.run_id,
      deleted:
        deleted satisfies DeleteSyntheticAdminDisputeFixtureResidueResult,
      cleaned_at: new Date().toISOString(),
    });
  });

  app.get("/disputes/:disputeId", async (c) => {
    requireLandlord(c);

    let disputeId: string;
    try {
      disputeId = uuidSchema.parse(c.req.param("disputeId"));
    } catch {
      throw new HttpError(
        400,
        "validation_error",
        "disputeId must be a valid UUID",
      );
    }

    const orgId = c.get("auth").actor.organizationId;
    const repo = resolveRepository(c.env, dependencies);

    const detail = await repo.getDisputeForAdmin({
      disputeId,
      organizationId: orgId,
    });
    if (!detail) {
      throw new HttpError(404, "not_found", "Dispute not found");
    }

    // file_url is already a Worker-served streaming download route (set by the
    // repository), mirroring the tenant slice. No presigning step needed.
    return c.json(detail);
  });

  // ── GET /disputes/:disputeId/attachments/:attachmentId ───────────────────────
  // Auth: OrgContext (any landlord role). Streams the R2 object. Org-scoped so a
  // landlord can only download attachments belonging to their own org.

  app.get("/disputes/:disputeId/attachments/:attachmentId", async (c) => {
    requireLandlord(c);

    let disputeId: string;
    let attachmentId: string;
    try {
      disputeId = uuidSchema.parse(c.req.param("disputeId"));
      attachmentId = uuidSchema.parse(c.req.param("attachmentId"));
    } catch {
      throw new HttpError(400, "validation_error", "Invalid UUID");
    }

    const orgId = c.get("auth").actor.organizationId;
    const repo = resolveRepository(c.env, dependencies);

    const meta = await repo.getAttachmentForOrgDownload({
      disputeId,
      attachmentId,
      organizationId: orgId,
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
  });

  // ── PUT /disputes/:disputeId/status ──────────────────────────────────────────
  // Auth: [Depends(require_full_access)] then get_current_admin_user.
  // Source: disputes.py lines 244–248 — decorator order: full-access (402) first,
  // then admin user injection (403 when role insufficient).

  app.put("/disputes/:disputeId/status", async (c) => {
    const repo = resolveRepository(c.env, dependencies);

    await requireFullAccess(c, repo);
    requireAdmin(c);

    let disputeId: string;
    try {
      disputeId = uuidSchema.parse(c.req.param("disputeId"));
    } catch {
      throw new HttpError(
        400,
        "validation_error",
        "disputeId must be a valid UUID",
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw new HttpError(
        400,
        "invalid_json",
        "Request body must be valid JSON",
      );
    }

    let body: z.infer<typeof updateStatusBodySchema>;
    try {
      body = updateStatusBodySchema.parse(rawBody);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        throw new HttpError(
          400,
          "validation_error",
          firstIssue?.message ?? "Invalid request body",
        );
      }
      throw err;
    }

    const newStatus = body.status;
    const orgId = c.get("auth").actor.organizationId;

    // Fetch current status for transition validation (org-scoped).
    const current = await repo.getDisputeForAdmin({
      disputeId,
      organizationId: orgId,
    });
    if (!current) {
      throw new HttpError(404, "not_found", "Dispute not found");
    }

    const currentStatus = current.status as DisputeStatus;
    const allowed = VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      // Exact error string from dispute_service.py line 382–383.
      throw new HttpError(
        400,
        "invalid_transition",
        `Cannot transition from ${currentStatus} to ${newStatus}`,
      );
    }

    // resolution_summary required when transitioning to resolved or rejected.
    // Exact check from dispute_service.py lines 385–388.
    if (newStatus === "resolved" || newStatus === "rejected") {
      const summary = body.resolution_summary;
      if (!summary || !summary.trim()) {
        // Exact error string from dispute_service.py line 388.
        throw new HttpError(
          400,
          "validation_error",
          "Resolution summary is required",
        );
      }
    }

    const actorUserId = c.get("auth").actor.userId;
    const needsResolution =
      newStatus === "resolved" || newStatus === "rejected";

    const updated = await repo.updateDisputeStatus({
      disputeId,
      organizationId: orgId,
      newStatus,
      // Guard the UPDATE on the status we validated the transition against, so a
      // concurrent admin who already moved this dispute can't be clobbered.
      expectedStatus: currentStatus,
      resolutionSummary: needsResolution
        ? (body.resolution_summary ?? null)
        : null,
      resolvedBy: needsResolution ? actorUserId : null,
      resolvedAt: needsResolution ? new Date().toISOString() : null,
    });

    if (!updated) {
      // The dispute existed at the read above, so a null result here means its
      // status changed between our read and write (another admin transitioned it
      // concurrently). Surface a 409 rather than a misleading 404 so the client
      // re-fetches and re-validates the transition against the new status.
      throw new HttpError(
        409,
        "dispute_status_conflict",
        "Dispute status changed since it was loaded. Reload and try again.",
      );
    }

    return c.json(updated);
  });

  // ── POST /disputes/:disputeId/comments ────────────────────────────────────────
  // Auth: [Depends(require_full_access)] then get_current_admin_user.
  // Source: disputes.py lines 318–323 — same gate order as PUT /status.
  // Admins may set is_internal=true (unlike tenant side which forces false).

  app.post("/disputes/:disputeId/comments", async (c) => {
    const repo = resolveRepository(c.env, dependencies);

    await requireFullAccess(c, repo);
    requireAdmin(c);

    let disputeId: string;
    try {
      disputeId = uuidSchema.parse(c.req.param("disputeId"));
    } catch {
      throw new HttpError(
        400,
        "validation_error",
        "disputeId must be a valid UUID",
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw new HttpError(
        400,
        "invalid_json",
        "Request body must be valid JSON",
      );
    }

    let body: z.infer<typeof addCommentBodySchema>;
    try {
      body = addCommentBodySchema.parse(rawBody);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        throw new HttpError(
          400,
          "validation_error",
          firstIssue?.message ?? "Invalid request body",
        );
      }
      throw err;
    }

    const orgId = c.get("auth").actor.organizationId;
    const actor = c.get("auth").actor;
    const user = c.get("auth").user;

    // author_name: prefer full_name from UserProfile, fall back to email then
    // "Unknown" — mirrors disputes.py line 378 `user.full_name or "Unknown"`.
    const authorName = user.fullName ?? user.email ?? "Unknown";

    const comment = await repo.addAdminComment({
      disputeId,
      organizationId: orgId,
      authorId: actor.userId,
      authorName,
      content: body.content,
      isInternal: body.is_internal,
      now: new Date().toISOString(),
    });

    if (!comment) {
      throw new HttpError(404, "not_found", "Dispute not found");
    }

    return c.json(comment, 201);
  });

  app.delete("/disputes/:disputeId/e2e-cleanup", async (c) => {
    const repo = resolveRepository(c.env, dependencies);

    await requireFullAccess(c, repo);
    requireAdmin(c);

    let disputeId: string;
    try {
      disputeId = uuidSchema.parse(c.req.param("disputeId"));
    } catch {
      throw new HttpError(
        400,
        "validation_error",
        "disputeId must be a valid UUID",
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      throw new HttpError(
        400,
        "invalid_json",
        "Request body must be valid JSON",
      );
    }

    let body: z.infer<typeof cleanupSyntheticDisputeBodySchema>;
    try {
      body = cleanupSyntheticDisputeBodySchema.parse(rawBody);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        throw new HttpError(
          400,
          "validation_error",
          firstIssue?.message ?? "Invalid request body",
        );
      }
      throw err;
    }

    const orgId = c.get("auth").actor.organizationId;
    const detail = await repo.getDisputeForAdmin({
      disputeId,
      organizationId: orgId,
    });
    if (!detail) {
      throw new HttpError(404, "not_found", "Dispute not found");
    }

    const cleanupMarker = matchingSyntheticTenantDisputeDescription(
      detail.description,
      body.run_id,
    );
    if (!cleanupMarker) {
      throw new HttpError(
        403,
        "cleanup_forbidden",
        "Only matching synthetic production test disputes can be cleaned up.",
      );
    }

    const attachmentStoragePaths: string[] = [];
    for (const attachment of detail.attachments) {
      const meta = await repo.getAttachmentForOrgDownload({
        disputeId,
        attachmentId: attachment.id,
        organizationId: orgId,
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

    let authUsersDeleted = 0;
    let deleted:
      | DeleteSyntheticDisputeResult
      | Omit<DeleteSyntheticAdminDisputeFixtureResult, "synthetic_user_id">
      | DeleteSyntheticAdminDisputeFixtureResidueResult
      | null;
    if (cleanupMarker === "admin_fixture") {
      const cleanupTarget =
        await repo.getSyntheticAdminDisputeFixtureCleanupTarget({
          disputeId,
          organizationId: orgId,
          runId: body.run_id,
          expectedDescription: detail.description,
        });
      if (!cleanupTarget) {
        throw new HttpError(404, "not_found", "Dispute not found");
      }
      authUsersDeleted = await deleteSyntheticAuthUserIfPresent(
        resolveAuthClient(c.env, dependencies),
        cleanupTarget.synthetic_user_id,
      );
      const adminFixtureDeleted = await repo.deleteSyntheticAdminDisputeFixture(
        {
          disputeId,
          organizationId: orgId,
          runId: body.run_id,
          expectedDescription: detail.description,
        },
      );
      deleted = adminFixtureDeleted
        ? withoutSyntheticUserId(adminFixtureDeleted)
        : await repo.deleteSyntheticAdminDisputeFixtureResidue({
            organizationId: orgId,
            runId: body.run_id,
          });
    } else {
      deleted = await repo.deleteSyntheticDispute({
        disputeId,
        organizationId: orgId,
        expectedDescription: detail.description,
      });
    }
    if (!deleted) {
      throw new HttpError(404, "not_found", "Dispute not found");
    }

    return c.json({
      dispute_id: disputeId,
      attachment_storage_paths: attachmentStoragePaths,
      deleted: {
        r2_objects: attachmentStoragePaths.length,
        auth_users: authUsersDeleted,
        ...deleted,
      },
      cleaned_at: new Date().toISOString(),
    });
  });

  return app;
}

// ── DI helpers ────────────────────────────────────────────────────────────────

function requireE2eFixtureSecret(env: AppEnv, headerValue: string | undefined) {
  const expected = env.PROD_E2E_FIXTURE_SECRET?.trim();
  if (!expected || !headerValue || headerValue !== expected) {
    throw new HttpError(
      404,
      "not_found",
      "Synthetic fixture endpoint not found",
    );
  }
}

function withoutSyntheticUserId(
  value: DeleteSyntheticAdminDisputeFixtureResult,
): Omit<DeleteSyntheticAdminDisputeFixtureResult, "synthetic_user_id"> {
  return {
    dispute_attachments: value.dispute_attachments,
    dispute_comments: value.dispute_comments,
    disputes: value.disputes,
    tenant_lease_links: value.tenant_lease_links,
    tenant_users: value.tenant_users,
    users: value.users,
    reconciliation_snapshots: value.reconciliation_snapshots,
    leases: value.leases,
    properties: value.properties,
  };
}

async function deleteSyntheticAuthUserIfPresent(
  authClient: Pick<SupabaseAdminAuthClient, "deleteUser">,
  userId: string,
): Promise<number> {
  try {
    await authClient.deleteUser(userId);
    return 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("not found")) {
      return 0;
    }
    throw error;
  }
}

function resolveRepository(
  env: AppEnv,
  dependencies: DisputesAdminRouteDependencies,
): AdminDisputesRepository {
  return (
    dependencies.repository ??
    new PostgresAdminDisputesRepository(createDirectPostgresExecutor(env))
  );
}

function resolveAuthClient(
  env: AppEnv,
  dependencies: DisputesAdminRouteDependencies,
): Pick<SupabaseAdminAuthClient, "createUser" | "deleteUser"> {
  return dependencies.authClient ?? new HttpSupabaseAdminAuthClient(env);
}
