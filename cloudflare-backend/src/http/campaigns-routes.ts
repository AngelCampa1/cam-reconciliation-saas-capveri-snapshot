/**
 * Reconciliation campaign workflow endpoints.
 *
 * Mirrors: backend/app/api/v1/campaigns.py
 *
 * Routes (all prefixed /campaigns, mounted at /api/v1):
 *   GET  /campaigns                          — list (OrgContext / landlord-read)
 *   POST /campaigns/:id/submit-for-review    — FINALIZED → IN_REVIEW (editor+)
 *   POST /campaigns/:id/approve              — IN_REVIEW → APPROVED  (admin+)
 *   POST /campaigns/:id/reject               — IN_REVIEW → FINALIZED (editor+)
 *   POST /campaigns/:id/mark-sent            — APPROVED → SENT       (admin+)
 */

import Decimal from "decimal.js";
import { Hono, type Context } from "hono";
import { PostgresCampaignRepository } from "../adapters/db/campaigns";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type { CampaignRepository } from "../domain/campaigns/repository";
import type { CampaignStatus } from "../domain/campaigns/transitions";
import {
  CampaignTransitionError,
  validateTransition,
  VALID_TRANSITIONS,
} from "../domain/campaigns/transitions";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

// Re-export for test visibility
export { VALID_TRANSITIONS };

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type CampaignRouteDependencies = {
  repository?: CampaignRepository;
  auth?: AuthMiddlewareOptions;
};

/**
 * Audit fields set per target status — mirrors _TRANSITION_AUDIT_FIELDS (campaigns.py:33-40).
 *
 * Target status → [timestampField, userIdField]
 */
const TRANSITION_AUDIT_FIELDS: Partial<
  Record<CampaignStatus, readonly [string, string]>
> = {
  in_review: ["submitted_for_review_at", "submitted_for_review_by_user_id"],
  approved: ["approved_at", "approved_by_user_id"],
  sent: ["sent_at", "sent_by_user_id"],
};

// ---------------------------------------------------------------------------
// Auth guards — mirror FastAPI dependency chain:
//   OrgContext  = get_org_scoped_context = get_current_landlord_user
//                 → 401 unauth, 403 tenant
//   require_org_editor = role ∈ {owner, admin, member}
//                 → additionally 403 viewer
//   require_org_admin  = role ∈ {owner, admin}
//                 → additionally 403 member, viewer
// ---------------------------------------------------------------------------

/** Party check — mirrors get_current_landlord_user (dependencies.py:215-224). */
function requireLandlord(party: AuthVariables["auth"]["actor"]["party"]): void {
  if (party !== "landlord") {
    throw new HttpError(
      403,
      "insufficient_permissions",
      "Insufficient permissions",
    );
  }
}

/**
 * Require owner | admin | member — mirrors require_org_editor (dependencies.py:474-482).
 * Error detail: "Editor privileges required"
 */
function requireEditor(role: AuthVariables["auth"]["actor"]["role"]): void {
  if (role !== "owner" && role !== "admin" && role !== "member") {
    throw new HttpError(
      403,
      "insufficient_permissions",
      "Editor privileges required",
    );
  }
}

/**
 * Require owner | admin — mirrors require_org_admin (dependencies.py:485-493).
 * Error detail: "Admin privileges required"
 */
function requireAdmin(role: AuthVariables["auth"]["actor"]["role"]): void {
  if (role !== "owner" && role !== "admin") {
    throw new HttpError(
      403,
      "insufficient_permissions",
      "Admin privileges required",
    );
  }
}

// ---------------------------------------------------------------------------
// Shared transition helper — mirrors _apply_transition (campaigns.py:57-99).
// Takes primitives instead of Context so the function is type-safe across
// all route handlers.
// ---------------------------------------------------------------------------

async function applyTransition(
  env: AppEnv,
  campaignId: string,
  organizationId: string,
  userId: string,
  targetStatus: CampaignStatus,
  dependencies: CampaignRouteDependencies,
): Promise<Response> {
  const repo = resolveRepository(env, dependencies);

  // Fetch + org-scope check — campaigns.py:43-54
  const campaign = await repo.findCampaign(campaignId, organizationId);

  if (!campaign) {
    return Response.json(
      { detail: `Campaign with id '${campaignId}' not found` },
      { status: 404 },
    );
  }

  const currentStatus = campaign.status as CampaignStatus;

  // State-machine validation — campaigns.py:65-69
  try {
    validateTransition(currentStatus, targetStatus);
  } catch (err) {
    if (err instanceof CampaignTransitionError) {
      return Response.json({ detail: err.message }, { status: 409 });
    }
    throw err;
  }

  const now = new Date().toISOString();

  // Build update — campaigns.py:74-92
  const auditFields = TRANSITION_AUDIT_FIELDS[targetStatus];
  const isRejection =
    currentStatus === "in_review" && targetStatus === "finalized";

  if (isRejection) {
    // Rejection: IN_REVIEW → FINALIZED clears submission fields (campaigns.py:79-83)
    const updated = await repo.updateCampaignStatus({
      id: campaignId,
      organizationId,
      status: targetStatus,
      expectedStatus: currentStatus,
      clearSubmitFields: true,
    });
    if (!updated) {
      return campaignStatusConflictResponse(campaignId);
    }
  } else if (auditFields) {
    const updated = await repo.updateCampaignStatus({
      id: campaignId,
      organizationId,
      status: targetStatus,
      expectedStatus: currentStatus,
      timestampField: auditFields[0],
      userIdField: auditFields[1],
      userId,
      now,
    });
    if (!updated) {
      return campaignStatusConflictResponse(campaignId);
    }
  } else {
    const updated = await repo.updateCampaignStatus({
      id: campaignId,
      organizationId,
      status: targetStatus,
      expectedStatus: currentStatus,
    });
    if (!updated) {
      return campaignStatusConflictResponse(campaignId);
    }
  }

  // Response — campaigns.py:94-99 (CampaignTransitionResponse)
  return Response.json(
    {
      id: campaignId,
      status: targetStatus,
      transitioned_at: now,
      transitioned_by_user_id: userId,
    },
    { status: 200 },
  );
}

function campaignStatusConflictResponse(campaignId: string): Response {
  return Response.json(
    {
      detail:
        `Campaign '${campaignId}' changed status while this transition was being applied. ` +
        "Refresh the campaign and retry the transition.",
      code: "campaign_status_conflict",
    },
    { status: 409 },
  );
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function createCampaignsRoutes(
  dependencies: CampaignRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/campaigns/*", authMiddleware(dependencies.auth));

  // -------------------------------------------------------------------------
  // GET /campaigns — campaigns.py:102-184
  // Auth: OrgContext (landlord read — tenant → 403, unauth → 401)
  // -------------------------------------------------------------------------
  const listCampaigns = async (c: RouteContext) => {
    const { actor } = c.get("auth");
    requireLandlord(actor.party);

    const yearParam = c.req.query("year");
    const year =
      yearParam !== undefined && yearParam !== ""
        ? Number.parseInt(yearParam, 10)
        : undefined;

    const repo = resolveRepository(c.env, dependencies);
    const { campaigns, snapshots } = await repo.listCampaigns(
      actor.organizationId,
      year,
    );

    if (campaigns.length === 0) {
      return c.json([]);
    }

    // Build snapshot index keyed by (property_id, snapshot_year) — campaigns.py:144-150
    const snapIndex = new Map<string, typeof snapshots>();
    for (const s of snapshots) {
      const periodStart = s.period_start_date ?? "";
      const snapshotYear =
        periodStart.length >= 4 && /^\d{4}/.test(periodStart)
          ? Number.parseInt(periodStart.slice(0, 4), 10)
          : 0;
      const key = `${s.property_id}::${snapshotYear}`;
      const existing = snapIndex.get(key) ?? [];

      existing.push(s);
      snapIndex.set(key, existing);
    }

    // Aggregate per campaign — campaigns.py:152-183
    const summaries = campaigns.map((row) => {
      const key = `${row.property_id}::${row.period_year}`;
      const snapData = snapIndex.get(key) ?? [];

      const tenantCount = snapData.length;
      const finalizedTenantCount = snapData.filter(
        (s) => s.status === "finalized",
      ).length;
      const totalRecovery = snapData.reduce(
        (acc, s) => acc.plus(new Decimal(s.total_recovery ?? "0")),
        new Decimal(0),
      );

      return {
        id: row.id,
        property_id: row.property_id,
        property_name: row.property_name,
        period_year: row.period_year,
        status: row.status,
        tenant_count: tenantCount,
        finalized_tenant_count: finalizedTenantCount,
        total_recovery: totalRecovery.toFixed(),
        finalized_at: row.finalized_at,
        submitted_for_review_at: row.submitted_for_review_at,
        approved_at: row.approved_at,
        sent_at: row.sent_at,
        updated_at: row.updated_at,
      };
    });

    return c.json(summaries);
  };
  app.get("/campaigns", listCampaigns);
  app.get("/campaigns/", listCampaigns);

  // -------------------------------------------------------------------------
  // POST /campaigns/:id/submit-for-review — campaigns.py:187-197
  // Auth: require_org_editor (landlord + owner|admin|member)
  // Transition: FINALIZED → IN_REVIEW
  // -------------------------------------------------------------------------
  app.post("/campaigns/:id/submit-for-review", async (c) => {
    const { actor } = c.get("auth");
    requireLandlord(actor.party);
    requireEditor(actor.role);

    return applyTransition(
      c.env,
      c.req.param("id"),
      actor.organizationId,
      actor.userId,
      "in_review",
      dependencies,
    );
  });

  // -------------------------------------------------------------------------
  // POST /campaigns/:id/approve — campaigns.py:200-210
  // Auth: require_org_admin (landlord + owner|admin)
  // Transition: IN_REVIEW → APPROVED
  // -------------------------------------------------------------------------
  app.post("/campaigns/:id/approve", async (c) => {
    const { actor } = c.get("auth");
    requireLandlord(actor.party);
    requireAdmin(actor.role);

    return applyTransition(
      c.env,
      c.req.param("id"),
      actor.organizationId,
      actor.userId,
      "approved",
      dependencies,
    );
  });

  // -------------------------------------------------------------------------
  // POST /campaigns/:id/reject — campaigns.py:213-223
  // Auth: require_org_editor (landlord + owner|admin|member)
  // Transition: IN_REVIEW → FINALIZED
  // -------------------------------------------------------------------------
  app.post("/campaigns/:id/reject", async (c) => {
    const { actor } = c.get("auth");
    requireLandlord(actor.party);
    requireEditor(actor.role);

    return applyTransition(
      c.env,
      c.req.param("id"),
      actor.organizationId,
      actor.userId,
      "finalized",
      dependencies,
    );
  });

  // -------------------------------------------------------------------------
  // POST /campaigns/:id/mark-sent — campaigns.py:226-236
  // Auth: require_org_admin (landlord + owner|admin)
  // Transition: APPROVED → SENT
  // -------------------------------------------------------------------------
  app.post("/campaigns/:id/mark-sent", async (c) => {
    const { actor } = c.get("auth");
    requireLandlord(actor.party);
    requireAdmin(actor.role);

    return applyTransition(
      c.env,
      c.req.param("id"),
      actor.organizationId,
      actor.userId,
      "sent",
      dependencies,
    );
  });

  return app;
}

function resolveRepository(
  env: AppEnv,
  dependencies: CampaignRouteDependencies,
): CampaignRepository {
  return (
    dependencies.repository ??
    new PostgresCampaignRepository(createDirectPostgresExecutor(env))
  );
}
