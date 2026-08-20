/**
 * Denominator change analysis JSON routes — EP-18.
 *
 * Endpoint:
 *   POST /analysis/denominator-change
 *
 * When mounted under /api/v1 in app.ts the full path becomes:
 *   POST /api/v1/analysis/denominator-change
 *
 * This mirrors the FastAPI route in backend/app/api/v1/analysis.py:
 *   router = APIRouter()  # prefix="/analysis" set in backend/__init__.py
 *   @router.post("/denominator-change", response_model=DenominatorChangeReport, ...)
 *
 * Auth: full-access gate only (billing check). No landlord party gate — the
 * FastAPI route uses only `require_full_access` (no `get_current_landlord_user`
 * or `require_org_editor`). This differs from the sibling PDF route which adds
 * a landlord party check.
 *
 * Key behavioral difference from the PDF route:
 *   NoComparableSnapshotsError → HTTP 200 with comparison_available=false
 *   (the PDF route maps this to 400). This matches the FastAPI docstring which
 *   explicitly states "returns HTTP 200 with an otherwise-empty report".
 *
 * Request body: same schema as PDF route (DenominatorChangeRequest).
 *
 * Response: DenominatorChangeReport JSON (Decimal fields serialised as strings
 * via .toFixed() to match Pydantic's JSON serialisation behaviour).
 *
 * Error mapping (matches Python JSON route):
 *   NoComparableSnapshotsError → 200 with comparison_available=false
 *   ValueError                 → 400
 *   generic Exception          → 500
 */

import Decimal from "decimal.js";
import { Hono } from "hono";
import { z } from "zod";
import { PostgresDenominatorChangeRepository } from "../adapters/db/denominator-change";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type { DenominatorChangeRepository } from "../domain/denominator-change/repository";
import {
  generateDenominatorChangeReport,
  NoComparableSnapshotsError,
} from "../domain/denominator-change/service";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type DenominatorChangeRouteDependencies = {
  repository?: DenominatorChangeRepository;
  auth?: AuthMiddlewareOptions;
};

// ── Request schema (mirrors DenominatorChangeRequest) ─────────────────────────

const uuidSchema = z.string().uuid("Invalid UUID");
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const rsfSchema = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => (v == null ? null : String(v)));

const denominatorChangeRequestSchema = z.object({
  property_id: uuidSchema,
  current_period_start: dateSchema,
  current_period_end: dateSchema,
  prior_period_start: dateSchema.nullable().optional().default(null),
  prior_period_end: dateSchema.nullable().optional().default(null),
  prior_total_rsf: rsfSchema,
  current_total_rsf: rsfSchema,
});

// ── Response serialisation helpers ────────────────────────────────────────────

/**
 * Serialise a DenominatorChangeReport to a plain JSON-safe object.
 * Decimal fields are serialised as strings (matching Pydantic JSON output).
 */
function serialiseReport(
  report: Awaited<ReturnType<typeof generateDenominatorChangeReport>>,
  comparisonAvailable: boolean,
  missingPeriod: string | null,
): Record<string, unknown> {
  return {
    property_id: report.property_id,
    property_name: report.property_name,
    prior_period: report.prior_period,
    current_period: report.current_period,
    prior_total_rsf: report.prior_total_rsf.toFixed(),
    current_total_rsf: report.current_total_rsf.toFixed(),
    rsf_delta: report.rsf_delta.toFixed(),
    rsf_delta_percent: report.rsf_delta_percent.toFixed(),
    changes: report.changes.map((c) => ({
      change_type: c.change_type,
      description: c.description,
      prior_value: c.prior_value,
      current_value: c.current_value,
      impact_description: c.impact_description,
    })),
    tenant_impacts: report.tenant_impacts.map((t) => ({
      lease_id: t.lease_id,
      tenant_name: t.tenant_name,
      prior_pro_rata_share: t.prior_pro_rata_share.toFixed(),
      current_pro_rata_share: t.current_pro_rata_share.toFixed(),
      share_delta_pct_points: t.share_delta_pct_points.toFixed(),
      prior_estimated_recovery: t.prior_estimated_recovery.toFixed(),
      current_estimated_recovery: t.current_estimated_recovery.toFixed(),
      recovery_delta: t.recovery_delta.toFixed(),
      contributing_changes: t.contributing_changes,
    })),
    summary: report.summary,
    generated_at: report.generated_at.toISOString(),
    comparison_available: comparisonAvailable,
    missing_period: missingPeriod,
  };
}

/**
 * Build the empty 200 response for NoComparableSnapshotsError — mirrors the
 * Python handler in get_denominator_change_report exactly.
 */
function serialiseEmptyReport(
  body: z.infer<typeof denominatorChangeRequestSchema>,
  err: NoComparableSnapshotsError,
): Record<string, unknown> {
  const priorPeriod =
    body.prior_period_start != null && body.prior_period_end != null
      ? `${body.prior_period_start} to ${body.prior_period_end}`
      : "";

  return {
    property_id: body.property_id,
    property_name: "",
    prior_period: priorPeriod,
    current_period: `${body.current_period_start} to ${body.current_period_end}`,
    prior_total_rsf: new Decimal(0).toFixed(),
    current_total_rsf: new Decimal(0).toFixed(),
    rsf_delta: new Decimal(0).toFixed(),
    rsf_delta_percent: new Decimal(0).toFixed(),
    changes: [],
    tenant_impacts: [],
    summary: err.message,
    generated_at: new Date().toISOString(),
    comparison_available: false,
    missing_period: err.period,
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createDenominatorChangeRoutes(
  dependencies: DenominatorChangeRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/analysis/*", authMiddleware(dependencies.auth));

  app.post("/analysis/denominator-change", async (c) => {
    const auth = c.get("auth");
    const repository = resolveRepository(c.env, dependencies);

    // ── Full-access gate (billing check only — no landlord party gate) ────────
    if (!(await repository.hasFullAccess(auth.actor.organizationId))) {
      throw new HttpError(
        402,
        "subscription_required",
        "subscription_required: An active subscription or trial is required.",
      );
    }

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: z.infer<typeof denominatorChangeRequestSchema>;
    try {
      body = denominatorChangeRequestSchema.parse(await c.req.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        const msg = firstIssue?.message ?? "Invalid request";
        throw new HttpError(400, "validation_error", msg);
      }
      throw err;
    }

    // ── Generate report ───────────────────────────────────────────────────────
    let report: Awaited<ReturnType<typeof generateDenominatorChangeReport>>;
    try {
      report = await generateDenominatorChangeReport(repository, {
        property_id: body.property_id,
        current_period_start: body.current_period_start,
        current_period_end: body.current_period_end,
        prior_period_start: body.prior_period_start,
        prior_period_end: body.prior_period_end,
        prior_total_rsf: body.prior_total_rsf,
        current_total_rsf: body.current_total_rsf,
        organizationId: auth.actor.organizationId,
      });
    } catch (err) {
      // NoComparableSnapshotsError → 200 with comparison_available=false
      // (mirrors Python: "returns HTTP 200 with an otherwise-empty report")
      if (err instanceof NoComparableSnapshotsError) {
        return c.json(serialiseEmptyReport(body, err), 200);
      }
      // ValueError → 400 (matches Python: except ValueError as e → 400)
      if (err instanceof Error && err.name === "ValueError") {
        throw new HttpError(400, "invalid_request", err.message);
      }
      if (err instanceof Error) {
        throw new HttpError(
          500,
          "report_generation_failed",
          `Failed to generate denominator change report: ${err.message}`,
        );
      }
      throw new HttpError(
        500,
        "report_generation_failed",
        "Failed to generate denominator change report",
      );
    }

    return c.json(serialiseReport(report, true, null), 200);
  });

  return app;
}

// ── Internal ──────────────────────────────────────────────────────────────────

function resolveRepository(
  env: AppEnv,
  dependencies: DenominatorChangeRouteDependencies,
): DenominatorChangeRepository {
  return (
    dependencies.repository ??
    new PostgresDenominatorChangeRepository(createDirectPostgresExecutor(env))
  );
}
