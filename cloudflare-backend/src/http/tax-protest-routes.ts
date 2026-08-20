/**
 * Tax protest routes — deadline lookup + ZIP data package generation.
 *
 * When mounted under /api/v1 in app.ts the full paths become:
 *   GET  /api/v1/tax-protest/deadlines
 *   POST /api/v1/tax-protest/generate
 *
 * Mirrors backend/app/api/v1/tax_protest.py (FastAPI).
 *
 * Auth:
 *   GET  /deadlines — OrgContext only (any authenticated landlord)
 *   POST /generate  — OrgContext + tax_protest feature access (402 if not entitled)
 *
 * POST /generate streams a 4-file ZIP directly (no R2 persistence), matching
 * FastAPI's StreamingResponse(zip_buf, media_type="application/zip").
 */

import { Hono } from "hono";
import { z } from "zod";
import { zipSync } from "fflate";
import { PostgresTaxProtestRepository } from "../adapters/db/tax-protest";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type {
  TaxProtestPropertyContext,
  TaxProtestRepository,
} from "../domain/tax-protest/repository";
import {
  computeDaysRemaining,
  computeEffectiveDeadline,
  getDeadlineForCounty,
} from "../domain/tax-protest/deadlines";
import { buildExpenseSummaryPdf } from "../domain/tax-protest/expense-summary-pdf";
import {
  buildGlCategoryCsv,
  type GlPool,
} from "../domain/tax-protest/gl-category-csv";
import { buildCoverSheetPdf } from "../domain/tax-protest/cover-sheet-pdf";
import { buildVariancePdf } from "../domain/exports/variance-pdf";
import type { SnapshotSummary } from "../domain/exports/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { attachmentContentDisposition } from "./content-disposition";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type TaxProtestRouteDependencies = {
  repository?: TaxProtestRepository;
  auth?: AuthMiddlewareOptions;
};

// ── Zod schemas ───────────────────────────────────────────────────────────────

const deadlinesQuerySchema = z.object({
  year: z.coerce
    .number()
    .int()
    .min(2000, "year must be >= 2000")
    .max(2100, "year must be <= 2100")
    .optional(),
});

const generateBodySchema = z.object({
  snapshot_id: z.string().uuid("snapshot_id must be a valid UUID"),
  tax_year: z.number().int().min(1900).max(2100),
  county: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
});

export function resolveTaxProtestCoverSheetContext(input: {
  bodyCounty?: string | null | undefined;
  bodyState?: string | null | undefined;
  property: Pick<
    TaxProtestPropertyContext,
    "state" | "taxProtestCounty" | "taxProtestDeadlineOverride"
  >;
  taxYear: number;
  today?: Date;
}): {
  county: string;
  state: string;
  effectiveDeadline: string | null;
  daysRemaining: number | null;
  notes: string;
} {
  const countyResolved =
    input.bodyCounty || input.property.taxProtestCounty || null;
  const stateResolved = input.bodyState || input.property.state || null;
  const county = countyResolved ?? "Not configured";
  const state = stateResolved ?? "";
  const countyDeadline =
    countyResolved !== null
      ? getDeadlineForCounty(stateResolved ?? "", countyResolved)
      : null;
  const effectiveDeadline = computeEffectiveDeadline(
    countyDeadline,
    input.property.taxProtestDeadlineOverride ?? null,
    input.taxYear,
  );
  const today = input.today ?? new Date();
  const daysRemaining =
    effectiveDeadline !== null
      ? computeDaysRemaining(effectiveDeadline, today)
      : null;

  return {
    county,
    state,
    effectiveDeadline,
    daysRemaining,
    notes: countyDeadline?.notes ?? "",
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createTaxProtestRoutes(
  dependencies: TaxProtestRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/tax-protest", authMiddleware(dependencies.auth));
  app.use("/tax-protest/*", authMiddleware(dependencies.auth));

  // ── POST /tax-protest/generate ───────────────────────────────────────────

  app.post("/tax-protest/generate", async (c) => {
    const orgId = c.get("auth").actor.organizationId;
    const repository = resolveRepository(c.env, dependencies);

    // Guard 1: entitlement (402 before any DB work, matching FastAPI order)
    const hasAccess = await repository.hasTaxProtestAccess(orgId);
    if (!hasAccess) {
      throw new HttpError(
        402,
        "reconcile_subscription_required",
        "reconcile_subscription_required: Tax protest data package requires an active Reconcile subscription.",
      );
    }

    // Parse + validate body
    let body: z.infer<typeof generateBodySchema>;
    try {
      body = generateBodySchema.parse(await c.req.json());
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        throw new HttpError(
          422,
          "validation_error",
          firstIssue?.message ?? "Invalid request body",
        );
      }
      throw err;
    }

    // Guard 2: snapshot exists + belongs to org
    const snapshot = await repository.getSnapshotForGenerate({
      snapshotId: body.snapshot_id,
      organizationId: orgId,
    });
    if (snapshot === null) {
      throw new HttpError(
        404,
        "reconciliation_snapshot_not_found",
        `reconciliation_snapshot with id '${body.snapshot_id}' not found`,
      );
    }

    // Guard 3: finalized
    if (snapshot.status !== "finalized") {
      throw new HttpError(
        400,
        "snapshot_not_finalized",
        `Tax protest packages can only be generated for finalized snapshots. Current status: '${snapshot.status}'.`,
      );
    }

    // Load lease / property / org context
    const { lease, property, org } = await repository.loadExportContext({
      leaseId: snapshot.lease_id,
      propertyId: snapshot.property_id,
      organizationId: orgId,
    });

    const taxYear = body.tax_year;

    const coverSheetContext = resolveTaxProtestCoverSheetContext({
      bodyCounty: body.county,
      bodyState: body.state,
      property,
      taxYear,
    });

    // ── File 1: 01_Expense_Summary.pdf ──────────────────────────────────────
    const expenseSummaryBytes = await buildExpenseSummaryPdf({
      snapshot: {
        period_start_date: snapshot.period_start_date,
        period_end_date: snapshot.period_end_date,
        total_operating_expenses: snapshot.total_operating_expenses,
        grossed_up_expenses: snapshot.grossed_up_expenses,
        base_year_amount: snapshot.base_year_amount,
        tenant_share_before_cap: snapshot.tenant_share_before_cap,
        tenant_share_after_cap: snapshot.tenant_share_after_cap,
        admin_fee: snapshot.admin_fee,
        total_recovery: snapshot.total_recovery,
        calculation_trace: snapshot.calculation_trace,
      },
      lease: { tenant_name: lease.tenant_name },
      property: { name: property.name, address: property.address },
      organization: { name: org.name },
    });

    // ── File 2: 02_GL_by_Category.csv ───────────────────────────────────────
    const pools: GlPool[] = await repository.fetchPoolDetails({
      propertyId: snapshot.property_id,
      organizationId: orgId,
      year: taxYear,
    });
    const glCsvUtf8 = new TextEncoder().encode(
      buildGlCategoryCsv(pools, taxYear),
    );

    // ── File 3: 03_Year_Over_Year_Comparison.pdf ─────────────────────────────
    const priorSnapshots = await repository.fetchPriorSnapshots({
      propertyId: snapshot.property_id,
      organizationId: orgId,
      year: taxYear - 1,
    });

    // Map to SnapshotSummary shape (only total_recovery needed by buildVariancePdf)
    const currentSummaries: SnapshotSummary[] = [
      {
        id: snapshot.id,
        lease_id: snapshot.lease_id ?? "",
        total_recovery: snapshot.total_recovery,
        period_start_date: snapshot.period_start_date,
      },
    ];
    const priorSummaries: SnapshotSummary[] = priorSnapshots.map((s) => ({
      id: s.id,
      lease_id: "",
      total_recovery: s.total_recovery,
      period_start_date: s.period_start_date,
    }));

    const variancePdfBytes = await buildVariancePdf({
      snapshotsCurrent: currentSummaries,
      snapshotsPrior: priorSummaries,
      currentYear: taxYear,
      priorYear: taxYear - 1,
      thresholdPercent: 10.0,
      propertyName: property.name,
    });

    // ── File 4: 04_County_Cover_Sheet.pdf ───────────────────────────────────
    const coverSheetBytes = await buildCoverSheetPdf({
      property_name: property.name,
      property_address: property.address,
      county: coverSheetContext.county,
      state: coverSheetContext.state,
      effective_deadline: coverSheetContext.effectiveDeadline,
      days_remaining: coverSheetContext.daysRemaining,
      notes: coverSheetContext.notes,
      tax_year: taxYear,
    });

    // ── Build ZIP (fflate.zipSync level 6 = ZIP_DEFLATED) ────────────────────
    const zipEntries: Record<string, Uint8Array> = {
      "01_Expense_Summary.pdf": expenseSummaryBytes,
      "02_GL_by_Category.csv": glCsvUtf8,
      "03_Year_Over_Year_Comparison.pdf": variancePdfBytes,
      "04_County_Cover_Sheet.pdf": coverSheetBytes,
    };
    const zipBytes = zipSync(zipEntries, { level: 6 });

    // Filename mirrors Python: property name with "/" and "\" replaced by "-"
    const propNameSafe = property.name.replace(/\//g, "-").replace(/\\/g, "-");
    const filename = `tax-protest-${propNameSafe}-${taxYear}.zip`;

    // NOTE: FastAPI calls record_feature_use(admin, org, "tax_protest") here.
    // DEFERRED in this Worker slice — consistent with the exports-routes ports
    // (EP-7/EP-8); usage metering is a side effect, not part of the response
    // contract, and there is no Worker feature-usage mechanism wired yet.
    return new Response(zipBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": attachmentContentDisposition(filename),
        "Content-Length": String(zipBytes.byteLength),
      },
    });
  });

  // ── GET /tax-protest/deadlines ────────────────────────────────────────────

  app.get("/tax-protest/deadlines", async (c) => {
    const rawQuery = c.req.query();

    let params: z.infer<typeof deadlinesQuerySchema>;
    try {
      params = deadlinesQuerySchema.parse(rawQuery);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const firstIssue = err.issues[0];
        throw new HttpError(
          400,
          "validation_error",
          firstIssue?.message ?? "Invalid query parameter",
        );
      }
      throw err;
    }

    const effectiveYear = params.year ?? new Date().getUTCFullYear();
    const orgId = c.get("auth").actor.organizationId;
    const repository = resolveRepository(c.env, dependencies);

    const properties = await repository.listPropertiesForDeadlines(orgId);
    const today = new Date();

    const items = properties.map((prop) => {
      const county = prop.taxProtestCounty;
      const state = prop.state;
      const overrideDate = prop.taxProtestDeadlineOverride;

      const countyDeadline =
        county !== null && state !== null
          ? getDeadlineForCounty(state, county)
          : null;

      const effectiveDeadline = computeEffectiveDeadline(
        countyDeadline,
        overrideDate,
        effectiveYear,
      );

      let daysRemaining: number | null;
      let isPast: boolean;

      if (effectiveDeadline !== null) {
        daysRemaining = computeDaysRemaining(effectiveDeadline, today);
        isPast = daysRemaining < 0;
      } else {
        daysRemaining = null;
        isPast = false;
      }

      // Mirror Python `bool(county or override_date)`: empty-string county is
      // falsy and falls through to the override (not `??`, which keeps "").
      const isConfigured = Boolean(county || overrideDate);

      return {
        property_id: prop.id,
        property_name: prop.name,
        county: county,
        state: state,
        effective_deadline: effectiveDeadline,
        days_remaining: daysRemaining,
        is_past: isPast,
        is_configured: isConfigured,
      };
    });

    return c.json({ items, year: effectiveYear });
  });

  return app;
}

// ── DI helper ─────────────────────────────────────────────────────────────────

function resolveRepository(
  env: AppEnv,
  dependencies: TaxProtestRouteDependencies,
): TaxProtestRepository {
  return (
    dependencies.repository ??
    new PostgresTaxProtestRepository(createDirectPostgresExecutor(env))
  );
}
