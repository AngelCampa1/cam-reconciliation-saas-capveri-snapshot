/**
 * Denominator change PDF export routes — EP-18.
 *
 * Endpoint:
 *   POST /reports/denominator-change/pdf
 *
 * When mounted under /api/v1 in app.ts the full path becomes:
 *   POST /api/v1/reports/denominator-change/pdf
 *
 * This mirrors the FastAPI route mounted as:
 *   router = APIRouter()  # prefix="/reports" set in backend/__init__.py
 *   @router.post("/denominator-change/pdf", ...)
 *
 * Auth: landlord gate + full-access gate (same pattern as historical-xlsx-routes.ts).
 *
 * Request body:
 *   { property_id, current_period_start, current_period_end,
 *     prior_period_start?, prior_period_end?,
 *     prior_total_rsf?, current_total_rsf? }
 *
 * Response: binary PDF download (no storage, no export_history row).
 *
 * Error mapping (matches Python PDF route):
 *   NoComparableSnapshotsError (subclass of ValueError) → 400
 *   ValueError / bad UUID / null db                     → 400
 *   generic Exception                                   → 500
 */

import { Hono } from "hono";
import { z } from "zod";
import { PostgresDenominatorChangeRepository } from "../adapters/db/denominator-change";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type { DenominatorChangeRepository } from "../domain/denominator-change/repository";
import {
  generateDenominatorChangeReport,
  NoComparableSnapshotsError,
} from "../domain/denominator-change/service";
import { buildDenominatorChangePdf } from "../domain/denominator-change/pdf";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type DenominatorChangePdfRouteDependencies = {
  repository?: DenominatorChangeRepository;
  auth?: AuthMiddlewareOptions;
};

// ── Request schema ────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid("Invalid UUID");
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");
const rsfSchema = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v) => (v == null ? null : String(v)));

const denominatorChangePdfRequestSchema = z.object({
  property_id: uuidSchema,
  current_period_start: dateSchema,
  current_period_end: dateSchema,
  prior_period_start: dateSchema.nullable().optional().default(null),
  prior_period_end: dateSchema.nullable().optional().default(null),
  prior_total_rsf: rsfSchema,
  current_total_rsf: rsfSchema,
});

// ── Route factory ─────────────────────────────────────────────────────────────

export function createDenominatorChangePdfRoutes(
  dependencies: DenominatorChangePdfRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/reports/*", authMiddleware(dependencies.auth));

  app.post("/reports/denominator-change/pdf", async (c) => {
    const auth = c.get("auth");

    // ── Landlord gate ───────────────────────────────────────────────────────
    if (auth.actor.party !== "landlord") {
      throw new HttpError(
        403,
        "insufficient_permissions",
        "Insufficient permissions",
      );
    }

    const repository = resolveRepository(c.env, dependencies);

    // ── Full-access gate ────────────────────────────────────────────────────
    if (!(await repository.hasFullAccess(auth.actor.organizationId))) {
      throw new HttpError(
        402,
        "subscription_required",
        "subscription_required: An active subscription or trial is required.",
      );
    }

    // ── Parse body ──────────────────────────────────────────────────────────
    let body: z.infer<typeof denominatorChangePdfRequestSchema>;
    try {
      body = denominatorChangePdfRequestSchema.parse(await c.req.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        const msg = firstIssue?.message ?? "Invalid request";
        throw new HttpError(400, "validation_error", msg);
      }
      throw err;
    }

    // ── Generate report ─────────────────────────────────────────────────────
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
      // NoComparableSnapshotsError is a subclass of ValueError in Python → 400
      if (err instanceof NoComparableSnapshotsError) {
        throw new HttpError(400, "no_comparable_snapshots", err.message);
      }
      if (err instanceof Error) {
        throw new HttpError(
          500,
          "report_generation_failed",
          `Failed to generate denominator change PDF: ${err.message}`,
        );
      }
      throw new HttpError(
        500,
        "report_generation_failed",
        "Failed to generate denominator change PDF",
      );
    }

    // ── Render PDF ──────────────────────────────────────────────────────────
    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildDenominatorChangePdf(report);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new HttpError(
        500,
        "pdf_render_failed",
        `Failed to generate denominator change PDF: ${msg}`,
      );
    }

    // ── Filename (mirrors Python) ────────────────────────────────────────────
    const filename =
      `denominator_change_${body.property_id}_` +
      `${body.current_period_start}_${body.current_period_end}.pdf`;

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  });

  return app;
}

// ── Internal ──────────────────────────────────────────────────────────────────

function resolveRepository(
  env: AppEnv,
  dependencies: DenominatorChangePdfRouteDependencies,
): DenominatorChangeRepository {
  return (
    dependencies.repository ??
    new PostgresDenominatorChangeRepository(createDirectPostgresExecutor(env))
  );
}
