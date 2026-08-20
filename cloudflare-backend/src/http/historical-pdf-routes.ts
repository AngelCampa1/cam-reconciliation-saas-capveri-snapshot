/**
 * Historical analysis PDF export routes — EP-16.
 *
 * Endpoint:
 *   POST /reports/historical/pdf
 *
 * When mounted under /api/v1 in app.ts the full path becomes:
 *   POST /api/v1/reports/historical/pdf
 *
 * This mirrors the FastAPI route:
 *   router = APIRouter()  # prefix="/reports" in __init__.py
 *   @router.post("/historical/pdf", ...)
 *
 * Auth: full-access 402 + landlord 403, identical to historical-xlsx-routes.ts.
 *
 * Request body: { property_id: uuid, years: int[], include_charts?: bool }
 * Response JSON: { report_url: string, expires_at: string, format: "pdf" }
 *   — report_url points at GET /api/v1/export/download/file?token=...
 *   — expires_at = now + 604800s (7 days), ISO string
 *   — No export_history row is inserted (Python route does not insert one).
 *     DEVIATION from C1 persisted-export slices: the Python /historical/pdf
 *     endpoint uploads to Supabase Storage and returns a signed URL but never
 *     writes to export_history.  This Worker port normalises storage to R2 +
 *     HMAC token but preserves the no-export_history-insert behaviour.
 *
 * Storage normalization (Supabase Storage → R2 + HMAC token):
 *   Python: uploads to Supabase Storage "reports/{org}/{property}/{uuid}.pdf"
 *           returns a 7-day signed URL.
 *   Worker: uploads to REPORTS_BUCKET at key "reports/{org}/{property}/{uuid}.pdf"
 *           mints a 7-day HMAC token (expiresAt = floor(now/1000) + 604800)
 *           returns { report_url: "{origin}/api/v1/export/download/file?token=...",
 *                     expires_at: ISO, format: "pdf" }
 *   The shared /export/download/file route verifies the token and streams bytes
 *   directly from R2 — it does NOT query export_history, so no DB insert is
 *   needed for the download to work.
 *
 * NOTE: The shared buildExportDownloadToken helper (EP-11) uses a per-call
 * expiresAt passed in the payload.  The EP-11 re-download route passes 3600s;
 * this EP-16 route passes 604800s.  The shared CONSTANT is NOT changed — the
 * TTL is computed locally here as: floor(Date.now()/1000) + 604800.
 */

import { Hono } from "hono";
import { z } from "zod";
import { PostgresAnalysisRepository } from "../adapters/db/analysis";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import {
  createReportsStorage,
  type ReportsStorage,
} from "../adapters/storage/reports";
import type { AnalysisRepository } from "../domain/analysis/repository";
import {
  buildYearOverYearComparison,
  detectAnalysisAnomalies,
  AnalysisInputError,
  AnalysisNotFoundError,
} from "../domain/analysis/service";
import { buildHistoricalPdf } from "../domain/analysis/historical-pdf";
import { buildExportDownloadToken } from "../domain/exports/tokens";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { requireRuntimeSecret } from "../platform/cloudflare";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

type HistoricalPdfTokenBuilder = typeof buildExportDownloadToken;

export type HistoricalPdfRouteDependencies = {
  repository?: AnalysisRepository;
  auth?: AuthMiddlewareOptions;
  /** Override R2 reports storage — injected in tests to use an in-memory fake. */
  reportsStorage?: ReportsStorage;
  /** Override signing secret for HMAC token — injected in tests. */
  signingSecret?: string;
  /** Override token builder for failure-path tests. */
  tokenBuilder?: HistoricalPdfTokenBuilder;
  /** Override clock for expires_at computation — injected in tests. */
  clock?: () => number;
};

// ── Zod schemas ───────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid();
const yearSchema = z.number().int().min(1990).max(2100);

const historicalPdfRequestSchema = z.object({
  property_id: uuidSchema,
  years: z
    .array(yearSchema)
    .min(2, "At least 2 years required for historical comparison"),
  include_charts: z.boolean().default(false),
});

// ── Route factory ─────────────────────────────────────────────────────────────

export function createHistoricalPdfRoutes(
  dependencies: HistoricalPdfRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/reports/*", authMiddleware(dependencies.auth));

  app.post("/reports/historical/pdf", async (c) => {
    const auth = c.get("auth");

    // ── Landlord gate ───────────────────────────────────────────────────────────
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
    let body: z.infer<typeof historicalPdfRequestSchema>;
    try {
      body = historicalPdfRequestSchema.parse(await c.req.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        const msg = firstIssue?.message ?? "Invalid request";
        throw new HttpError(400, "validation_error", msg);
      }
      throw err;
    }

    // ── Explicit years < 2 guard (mirrors Python) ───────────────────────────────
    if (body.years.length < 2) {
      throw new HttpError(
        400,
        "validation_error",
        "At least 2 years required for historical comparison",
      );
    }

    const sortedYears = [...body.years].sort((a, b) => a - b);
    const organizationId = auth.actor.organizationId;
    const propertyId = body.property_id;
    const propertyName = await repository.getPropertyName({
      propertyId,
      organizationId,
    });
    if (propertyName === null) {
      throw new HttpError(404, "property_not_found", "Property not found");
    }

    // ── Generate PDF ────────────────────────────────────────────────────────────
    // Error mapping mirrors Python /historical/pdf:
    //   HTTPException re-raised; ValueError → 400; Exception → 500 with detail
    //   "Failed to generate PDF report: {message}"

    let pdfBytes: Uint8Array;
    try {
      // Year-over-year comparison
      let yoy: Awaited<ReturnType<typeof buildYearOverYearComparison>>;
      try {
        yoy = await buildYearOverYearComparison(repository, {
          property_id: propertyId,
          years: sortedYears,
          use_fuzzy_matching: true,
          organizationId,
        });
      } catch (err) {
        if (err instanceof AnalysisInputError) {
          throw new HttpError(400, "invalid_analysis_request", err.message);
        }
        if (err instanceof AnalysisNotFoundError) {
          throw new HttpError(404, "property_not_found", "Property not found");
        }
        throw err;
      }

      // Anomaly detection
      const targetYear = sortedYears[sortedYears.length - 1] as number;
      const comparisonYears = sortedYears.filter((y) => y < targetYear);

      let anomaliesResult: Awaited<ReturnType<typeof detectAnalysisAnomalies>>;
      try {
        anomaliesResult = await detectAnalysisAnomalies(repository, {
          property_id: propertyId,
          target_year: targetYear,
          comparison_years: comparisonYears,
          organizationId,
        });
      } catch (err) {
        if (err instanceof AnalysisInputError) {
          throw new HttpError(400, "invalid_analysis_request", err.message);
        }
        if (err instanceof AnalysisNotFoundError) {
          throw new HttpError(404, "property_not_found", "Property not found");
        }
        throw err;
      }

      // Build PDF
      pdfBytes = await buildHistoricalPdf({
        propertyName,
        sortedYears,
        yoy,
        anomalies: anomaliesResult.anomalies,
      });
    } catch (err) {
      // Re-raise HttpError (already mapped above)
      if (err instanceof HttpError) {
        throw err;
      }
      // ValueError → 400 (Python maps ValueError to HTTPException 400)
      if (err instanceof Error && err.constructor.name === "ValueError") {
        throw new HttpError(400, "invalid_request", err.message);
      }
      // Generic exception → 500 with Python-identical detail string
      const message = err instanceof Error ? err.message : String(err);
      throw new HttpError(
        500,
        "report_generation_failed",
        `Failed to generate PDF report: ${message}`,
      );
    }

    // ── Upload to R2 ────────────────────────────────────────────────────────────
    // Key: reports/{organizationId}/{propertyId}/{uuid}.pdf
    // (Matches Python's Supabase path: "reports/{org}/{property}/{uuid4()}.pdf")
    const r2Uuid = crypto.randomUUID();
    const r2Key = `reports/${organizationId}/${propertyId}/${r2Uuid}.pdf`;

    const storage = resolveReportsStorage(c.env, dependencies);
    const signingSecret =
      dependencies.signingSecret ??
      requireRuntimeSecret(c.env, "DOCUMENT_ACCESS_SIGNING_SECRET");
    await storage.putReport(r2Key, pdfBytes, "application/pdf");

    // ── Mint 7-day HMAC token ───────────────────────────────────────────────────
    // Token TTL: 604800s (7 days). The shared buildExportDownloadToken helper
    // accepts the expiresAt in the payload — we compute a 604800s expiry here
    // without touching any shared constant.
    const nowSeconds = Math.floor(
      (dependencies.clock ? dependencies.clock() : Date.now()) / 1000,
    );
    const expiresAtSeconds = nowSeconds + 604800;

    const fileName = `historical_analysis_${propertyId}.pdf`;
    const tokenBuilder = dependencies.tokenBuilder ?? buildExportDownloadToken;
    let token: string;
    try {
      token = await tokenBuilder(
        {
          r2Key,
          fileName,
          expiresAt: expiresAtSeconds,
        },
        signingSecret,
      );
    } catch (error) {
      await storage.deleteReport(r2Key).catch(() => undefined);
      throw error;
    }

    // ── Build response ──────────────────────────────────────────────────────────
    const origin = new URL(c.req.url).origin;
    const reportUrl = `${origin}/api/v1/export/download/file?token=${encodeURIComponent(token)}`;
    const expiresAt = new Date(expiresAtSeconds * 1000).toISOString();

    return c.json({
      report_url: reportUrl,
      expires_at: expiresAt,
      format: "pdf",
    });
  });

  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveRepository(
  env: AppEnv,
  dependencies: HistoricalPdfRouteDependencies,
): AnalysisRepository {
  return (
    dependencies.repository ??
    new PostgresAnalysisRepository(createDirectPostgresExecutor(env))
  );
}

function resolveReportsStorage(
  env: AppEnv,
  dependencies: HistoricalPdfRouteDependencies,
): ReportsStorage {
  return dependencies.reportsStorage ?? createReportsStorage(env);
}
