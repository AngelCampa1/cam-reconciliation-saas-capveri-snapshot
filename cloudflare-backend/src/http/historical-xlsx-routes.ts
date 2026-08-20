/**
 * Historical analysis XLSX export routes — EP-17.
 *
 * Endpoint:
 *   POST /reports/historical/excel
 *
 * When mounted under /api/v1 in app.ts the full path becomes:
 *   POST /api/v1/reports/historical/excel
 *
 * This mirrors the FastAPI route mounted as:
 *   router = APIRouter()  # prefix="/reports" set in __init__.py
 *   @router.post("/historical/excel", ...)
 *
 * Auth: landlord gate + full-access gate (matches sibling export routes).
 *
 * Request body: { property_id: uuid, years: int[], include_charts?: bool }
 * Response: binary .xlsx download (no storage, no export_history row).
 */

import { Hono } from "hono";
import { z } from "zod";
import { PostgresAnalysisRepository } from "../adapters/db/analysis";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type { AnalysisRepository } from "../domain/analysis/repository";
import {
  buildYearOverYearComparison,
  detectAnalysisAnomalies,
  AnalysisInputError,
  AnalysisNotFoundError,
} from "../domain/analysis/service";
import { buildHistoricalXlsx } from "../domain/analysis/historical-xlsx";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type HistoricalXlsxRouteDependencies = {
  repository?: AnalysisRepository;
  auth?: AuthMiddlewareOptions;
};

const uuidSchema = z.string().uuid();
const yearSchema = z.number().int().min(1990).max(2100);

const historicalExcelRequestSchema = z.object({
  property_id: uuidSchema,
  years: z
    .array(yearSchema)
    .min(2, "At least 2 years required for historical comparison"),
  include_charts: z.boolean().default(false),
});

export function createHistoricalXlsxRoutes(
  dependencies: HistoricalXlsxRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/reports/*", authMiddleware(dependencies.auth));

  app.post("/reports/historical/excel", async (c) => {
    const auth = c.get("auth");

    // ── Landlord gate (same pattern as exports-routes.ts) ─────────────────────
    if (auth.actor.party !== "landlord") {
      throw new HttpError(
        403,
        "insufficient_permissions",
        "Insufficient permissions",
      );
    }

    const repository = resolveRepository(c.env, dependencies);

    // ── Full-access gate ────────────────────────────────────────────────────────
    if (!(await repository.hasFullAccess(auth.actor.organizationId))) {
      throw new HttpError(
        402,
        "subscription_required",
        "subscription_required: An active subscription or trial is required.",
      );
    }

    // ── Parse body ──────────────────────────────────────────────────────────────
    let body: z.infer<typeof historicalExcelRequestSchema>;
    try {
      body = historicalExcelRequestSchema.parse(await c.req.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        const msg = firstIssue?.message ?? "Invalid request";
        throw new HttpError(400, "validation_error", msg);
      }
      throw err;
    }

    // ── Explicit years < 2 check (mirrors Python) ───────────────────────────────
    if (body.years.length < 2) {
      throw new HttpError(
        400,
        "validation_error",
        "At least 2 years required for historical comparison",
      );
    }

    const sortedYears = [...body.years].sort((a, b) => a - b);
    const organizationId = auth.actor.organizationId;

    // ── Year-over-year comparison ───────────────────────────────────────────────
    let yoy: Awaited<ReturnType<typeof buildYearOverYearComparison>>;
    try {
      yoy = await buildYearOverYearComparison(repository, {
        property_id: body.property_id,
        years: sortedYears,
        use_fuzzy_matching: true,
        organizationId,
      });
    } catch (err) {
      throw mapAnalysisError(err, "Failed to build historical comparison");
    }

    // ── Anomaly detection ───────────────────────────────────────────────────────
    const targetYear = sortedYears[sortedYears.length - 1] as number;
    const comparisonYears = sortedYears.filter((y) => y < targetYear);

    let anomaliesResult: Awaited<ReturnType<typeof detectAnalysisAnomalies>>;
    try {
      anomaliesResult = await detectAnalysisAnomalies(repository, {
        property_id: body.property_id,
        target_year: targetYear,
        comparison_years: comparisonYears,
        organizationId,
      });
    } catch (err) {
      throw mapAnalysisError(err, "Failed to detect anomalies");
    }

    // ── Build XLSX ──────────────────────────────────────────────────────────────
    const xlsxBytes = await buildHistoricalXlsx({
      propertyId: body.property_id,
      yoy,
      anomalies: anomaliesResult.anomalies,
    });

    // ── Filename ────────────────────────────────────────────────────────────────
    const minYear = sortedYears[0] as number;
    const maxYear = sortedYears[sortedYears.length - 1] as number;
    const filename = `historical_analysis_${body.property_id}_${minYear}-${maxYear}.xlsx`;

    return new Response(xlsxBytes, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });

  return app;
}

function resolveRepository(
  env: AppEnv,
  dependencies: HistoricalXlsxRouteDependencies,
): AnalysisRepository {
  return (
    dependencies.repository ??
    new PostgresAnalysisRepository(createDirectPostgresExecutor(env))
  );
}

function mapAnalysisError(error: unknown, fallback: string): HttpError {
  if (error instanceof AnalysisInputError) {
    return new HttpError(400, "invalid_analysis_request", error.message);
  }
  if (error instanceof AnalysisNotFoundError) {
    return new HttpError(404, "property_not_found", "Property not found");
  }
  if (error instanceof HttpError) {
    return error;
  }
  if (error instanceof Error) {
    return new HttpError(
      500,
      "analysis_failed",
      `${fallback}: ${error.message}`,
    );
  }
  return new HttpError(500, "analysis_failed", fallback);
}
