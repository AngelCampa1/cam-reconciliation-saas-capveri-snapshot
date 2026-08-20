/**
 * Cross-document analysis routes.
 *
 * Ported from backend/app/api/v1/cross_doc_analysis.py
 *
 * Routes (mounted under /api/v1 in app.ts):
 *   POST   /properties/:propertyId/cross-doc-analysis
 *   GET    /properties/:propertyId/cross-doc-analysis/:periodYear
 *   PATCH  /cross-doc-analysis/:analysisId/findings/:findingId
 *   PATCH  /organizations/:orgId/auditor-config
 *   PATCH  /properties/:propertyId/auditor-overrides
 *
 * Auth gates match FastAPI Depends() order exactly:
 *   - POST trigger: requireEditor (403) then requireFullAccess (402)
 *   - GET  retrieve: authMiddleware only (org-scoped)
 *   - PATCH finding: requireEditor (403) then requireFullAccess (402)
 *   - PATCH auditor-config: requireEditor (403) then requireFullAccess (402)
 *   - PATCH auditor-overrides: requireEditor (403) then requireFullAccess (402)
 */

import { Hono, type Context } from "hono";
import { z } from "zod";
import type { OpenRouterClient } from "../adapters/ai/openrouter";
import { createOpenRouterClient } from "../adapters/ai/openrouter";
import { PostgresCrossDocAnalysisRepository } from "../adapters/db/cross-doc-analysis";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type { CrossDocAnalysisRepository } from "../domain/cross-doc-analysis/repository";
import {
  CrossDocAnalysisError,
  CrossDocInsufficientDataError,
  CrossDocValidationError,
  runCrossDocAnalysis,
} from "../domain/cross-doc-analysis/orchestrator";
import type {
  AuditorContext,
  FindingCategory,
  FindingDecisionRecord,
  PropertyAuditorOverrides,
} from "../domain/cross-doc-analysis/types";
import { createExtractionModelConfig } from "../domain/extraction/model-config";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type CrossDocRouteDependencies = {
  repository?: CrossDocAnalysisRepository;
  openRouter?: OpenRouterClient;
  auth?: AuthMiddlewareOptions;
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const uuidSchema = z.string().uuid("Invalid UUID");
const periodYearSchema = z.coerce.number().int().min(1900).max(2100);

const triggerAnalysisSchema = z.object({
  period_year: z.number().int().min(1900).max(2100),
});

const findingDecisionSchema = z.object({
  decision: z.enum(["accepted", "dismissed", "deferred"]),
  reason: z.string().default(""),
});

const auditorContextSchema = z.object({
  market: z.string().nullable().optional(),
  typical_management_fee_pct: z.string().nullable().optional(),
  known_vendor_patterns: z.array(z.string()).optional(),
  custom_rules: z.array(z.string()).optional(),
});

const propertyAuditorOverridesSchema = z.object({
  known_exceptions: z.array(z.string()).optional(),
  special_instructions: z.array(z.string()).optional(),
  suppressed_finding_categories: z
    .array(
      z.enum([
        "lease_nuance",
        "cross_doc_mismatch",
        "billing_anomaly",
        "term_override",
      ] as [FindingCategory, ...FindingCategory[]]),
    )
    .optional(),
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function createCrossDocAnalysisRoutes(
  dependencies: CrossDocRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/properties/*", authMiddleware(dependencies.auth));
  app.use("/cross-doc-analysis/*", authMiddleware(dependencies.auth));
  app.use("/organizations/*", authMiddleware(dependencies.auth));

  // -------------------------------------------------------------------------
  // POST /properties/:propertyId/cross-doc-analysis
  // Auth: requireEditor (403) → requireFullAccess (402)
  // -------------------------------------------------------------------------
  app.post("/properties/:propertyId/cross-doc-analysis", async (c) => {
    requireEditor(c);
    await requireFullAccess(c, dependencies);

    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const body = triggerAnalysisSchema.parse(await c.req.json());
    const auth = c.get("auth").actor;
    const repository = resolveRepository(c.env, dependencies);

    // Verify property belongs to this org (404 if not)
    const exists = await repository.checkPropertyInOrg({
      propertyId,
      organizationId: auth.organizationId,
    });
    if (!exists) {
      throw new HttpError(404, "property_not_found", "Property not found.");
    }

    const modelConfig = createExtractionModelConfig(c.env);
    const client = resolveOpenRouterClient(c.env, dependencies);

    try {
      const result = await runCrossDocAnalysis(
        repository,
        client,
        modelConfig.crossDoc,
        {
          propertyId,
          periodYear: body.period_year,
          organizationId: auth.organizationId,
        },
      );
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof CrossDocInsufficientDataError) {
        throw new HttpError(422, "insufficient_data", err.message);
      }
      if (err instanceof CrossDocValidationError) {
        throw new HttpError(
          502,
          "invalid_llm_response",
          "Claude returned an invalid response. Please retry.",
        );
      }
      if (err instanceof CrossDocAnalysisError || err instanceof Error) {
        throw new HttpError(
          500,
          "cross_doc_analysis_failed",
          "Cross-document analysis failed.",
        );
      }
      throw new HttpError(
        500,
        "cross_doc_analysis_failed",
        "Cross-document analysis failed.",
      );
    }
  });

  // -------------------------------------------------------------------------
  // GET /properties/:propertyId/cross-doc-analysis/:periodYear
  // Auth: authMiddleware only (org-scoped)
  // -------------------------------------------------------------------------
  app.get(
    "/properties/:propertyId/cross-doc-analysis/:periodYear",
    async (c) => {
      const propertyId = uuidSchema.parse(c.req.param("propertyId"));
      const periodYear = periodYearSchema.parse(c.req.param("periodYear"));
      const auth = c.get("auth").actor;
      const repository = resolveRepository(c.env, dependencies);

      const row = await repository.getLatestAnalysis({
        propertyId,
        periodYear,
        organizationId: auth.organizationId,
      });

      if (!row) {
        throw new HttpError(
          404,
          "not_found",
          "No cross-document analysis found for this property/period.",
        );
      }

      return c.json(row, 200);
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /cross-doc-analysis/:analysisId/findings/:findingId
  // Auth: requireEditor (403) → requireFullAccess (402)
  // -------------------------------------------------------------------------
  app.patch(
    "/cross-doc-analysis/:analysisId/findings/:findingId",
    async (c) => {
      requireEditor(c);
      await requireFullAccess(c, dependencies);

      const analysisId = uuidSchema.parse(c.req.param("analysisId"));
      const findingId = uuidSchema.parse(c.req.param("findingId"));
      const body = findingDecisionSchema.parse(await c.req.json());
      const auth = c.get("auth").actor;
      const repository = resolveRepository(c.env, dependencies);

      // Verify analysis exists + belongs to org
      const analysisRow = await repository.getAnalysisOrgId({ analysisId });
      if (!analysisRow) {
        throw new HttpError(404, "not_found", "Analysis not found.");
      }
      if (analysisRow.organization_id !== auth.organizationId) {
        throw new HttpError(404, "not_found", "Analysis not found.");
      }

      const decisionRecord: FindingDecisionRecord = {
        decision: body.decision,
        reason: body.reason,
        user_id: auth.userId,
        decided_at: new Date().toISOString(),
      };

      const mergedDecisions = await repository.mergeFindingDecision({
        analysisId,
        findingId,
        organizationId: auth.organizationId,
        decision: decisionRecord,
      });

      if (!mergedDecisions) {
        throw new HttpError(404, "not_found", "Finding not found.");
      }

      // Advance status (mirrors Python _maybe_advance_status)
      await maybeAdvanceStatus(
        repository,
        analysisId,
        auth.organizationId,
        mergedDecisions,
      );

      return c.json({ status: "ok", decision: body.decision }, 200);
    },
  );

  // -------------------------------------------------------------------------
  // PATCH /organizations/:orgId/auditor-config
  // Auth: requireEditor (403) → requireFullAccess (402)
  // -------------------------------------------------------------------------
  app.patch("/organizations/:orgId/auditor-config", async (c) => {
    requireEditor(c);
    await requireFullAccess(c, dependencies);

    const orgId = uuidSchema.parse(c.req.param("orgId"));
    const auth = c.get("auth").actor;

    if (orgId !== auth.organizationId) {
      throw new HttpError(403, "access_denied", "Access denied.");
    }

    const body = auditorContextSchema.parse(await c.req.json());
    const repository = resolveRepository(c.env, dependencies);

    const config: AuditorContext = {
      market: body.market ?? null,
      typical_management_fee_pct: body.typical_management_fee_pct ?? null,
      known_vendor_patterns: body.known_vendor_patterns ?? [],
      custom_rules: body.custom_rules ?? [],
    };

    await repository.updateOrgAuditorConfig({
      organizationId: orgId,
      config,
    });

    return c.json({ status: "ok" }, 200);
  });

  // -------------------------------------------------------------------------
  // PATCH /properties/:propertyId/auditor-overrides
  // Auth: requireEditor (403) → requireFullAccess (402)
  // -------------------------------------------------------------------------
  app.patch("/properties/:propertyId/auditor-overrides", async (c) => {
    requireEditor(c);
    await requireFullAccess(c, dependencies);

    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const auth = c.get("auth").actor;
    const body = propertyAuditorOverridesSchema.parse(await c.req.json());
    const repository = resolveRepository(c.env, dependencies);

    // Verify property belongs to this org
    const exists = await repository.checkPropertyInOrg({
      propertyId,
      organizationId: auth.organizationId,
    });
    if (!exists) {
      throw new HttpError(404, "property_not_found", "Property not found.");
    }

    const overrides: PropertyAuditorOverrides = {
      known_exceptions: body.known_exceptions ?? [],
      special_instructions: body.special_instructions ?? [],
      suppressed_finding_categories: body.suppressed_finding_categories ?? [],
    };

    await repository.updatePropertyAuditorOverrides({
      propertyId,
      organizationId: auth.organizationId,
      overrides,
    });

    return c.json({ status: "ok" }, 200);
  });

  return app;
}

// ---------------------------------------------------------------------------
// Status advancement (mirrors Python _maybe_advance_status)
// ---------------------------------------------------------------------------

async function maybeAdvanceStatus(
  repository: CrossDocAnalysisRepository,
  analysisId: string,
  organizationId: string,
  decisions: Record<string, Record<string, unknown>>,
): Promise<void> {
  const row = await repository.getAnalysisForStatus({
    analysisId,
    organizationId,
  });
  if (!row) return;
  if (row.status === "reviewed") return;

  const findingsBlob =
    row.findings !== null &&
    typeof row.findings === "object" &&
    !Array.isArray(row.findings)
      ? row.findings
      : {};
  const findingsList: Array<Record<string, unknown>> = Array.isArray(
    findingsBlob["findings"],
  )
    ? (findingsBlob["findings"] as Array<Record<string, unknown>>)
    : [];

  if (findingsList.length === 0) return;

  const allDecided = findingsList.every((f) => {
    const id = typeof f["id"] === "string" ? f["id"] : null;
    return id !== null && id in decisions;
  });

  if (allDecided) {
    await repository.updateAnalysisStatus({
      analysisId,
      organizationId,
      status: "reviewed",
    });
    return;
  }

  if (Object.keys(decisions).length > 0 && row.status === "pending") {
    await repository.updateAnalysisStatus({
      analysisId,
      organizationId,
      status: "in_review",
      expectedStatus: "pending",
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRepository(
  env: AppEnv,
  dependencies: CrossDocRouteDependencies,
): CrossDocAnalysisRepository {
  return (
    dependencies.repository ??
    new PostgresCrossDocAnalysisRepository(createDirectPostgresExecutor(env))
  );
}

function resolveOpenRouterClient(
  env: AppEnv,
  dependencies: CrossDocRouteDependencies,
): OpenRouterClient {
  return dependencies.openRouter ?? createOpenRouterClient(env);
}

function requireLandlord(c: RouteContext): void {
  if (c.get("auth").actor.party === "landlord") return;
  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function requireEditor(c: RouteContext): void {
  requireLandlord(c);
  const role = c.get("auth").actor.role;
  if (role === "owner" || role === "admin" || role === "member") return;
  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

async function requireFullAccess(
  c: RouteContext,
  dependencies: CrossDocRouteDependencies,
): Promise<void> {
  const hasAccess = await resolveRepository(c.env, dependencies).hasFullAccess(
    c.get("auth").actor.organizationId,
  );
  if (hasAccess) return;
  throw new HttpError(
    402,
    "subscription_required",
    "subscription_required: An active subscription or trial is required.",
  );
}
