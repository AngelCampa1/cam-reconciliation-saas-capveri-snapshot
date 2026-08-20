/**
 * CapEx classification and flag-review routes.
 *
 * Mirrors backend/app/api/v1/analysis.py capex endpoints exactly. The analysis
 * router is mounted in FastAPI with prefix="/analysis", so every path below is
 * under /api/v1/analysis:
 *
 *   POST /api/v1/analysis/capex-classify          — requireEditor + requireFullAccess
 *   GET  /api/v1/analysis/capex-flags/:pid/:year  — org-scoped only
 *   GET  /api/v1/analysis/capex-summary/:pid/:yr  — org-scoped only
 *   POST /api/v1/analysis/capex-flags/bulk-review — requireEditor + requireFullAccess
 *   POST /api/v1/analysis/capex-flags/:id/review  — requireEditor + requireFullAccess
 *
 * NOTE: bulk-review must be registered BEFORE the :id/review route so that
 * the literal "bulk-review" path segment is not consumed as a flag UUID.
 */
import Decimal from "decimal.js";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { PostgresCapExRepository } from "../adapters/db/capex";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import { classifyEntries } from "../domain/capex/classifier";
import type { CapExRepository } from "../domain/capex/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type CapExRouteDependencies = {
  repository?: CapExRepository;
  auth?: AuthMiddlewareOptions;
};

// ── Zod schemas ──────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid();
const yearSchema = z.number().int().min(1990).max(2100);
const dispositionLiteral = z.enum(["pending", "confirmed_capex", "dismissed"]);
const reviewDispositionLiteral = z.enum(["confirmed_capex", "dismissed"]);

const classifyRequestSchema = z.object({
  property_id: uuidSchema,
  period_year: yearSchema,
});

const reviewRequestSchema = z.object({
  disposition: reviewDispositionLiteral,
  review_note: z.string().nullable().optional(),
});

const bulkReviewRequestSchema = z.object({
  flag_ids: z.array(uuidSchema).min(1),
  disposition: reviewDispositionLiteral,
  review_note: z.string().nullable().optional(),
});

const CLASSIFIER_VERSION = "1.0";

// ── Route factory ────────────────────────────────────────────────────────────

export function createCapExRoutes(
  dependencies: CapExRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/analysis/capex-classify", authMiddleware(dependencies.auth));
  app.use("/analysis/capex-flags/*", authMiddleware(dependencies.auth));
  app.use("/analysis/capex-summary/*", authMiddleware(dependencies.auth));

  // ── POST /analysis/capex-classify ────────────────────────────────────────
  app.post("/analysis/capex-classify", async (c) => {
    requireEditor(c);
    await requireFullAccess(c, dependencies);

    const body = classifyRequestSchema.parse(await parseJsonBody(c));
    const organizationId = c.get("auth").actor.organizationId;
    const repo = resolveRepository(c.env, dependencies);

    const entries = await repo.listGlEntries({
      propertyId: body.property_id,
      periodYear: body.period_year,
      organizationId,
    });

    if (entries.length === 0) {
      return c.json({
        flags_created: 0,
        gl_entries_scanned: 0,
        property_id: body.property_id,
        period_year: body.period_year,
      });
    }

    const matches = classifyEntries(entries);

    if (matches.length > 0) {
      await repo.upsertFlags(
        matches.map((m) => ({
          organization_id: organizationId,
          gl_entry_id: m.gl_entry_id,
          property_id: body.property_id,
          period_year: body.period_year,
          flag_reason: m.reason,
          rule_name: m.rule_name,
          confidence_score: m.confidence,
          matched_pattern: m.matched_pattern,
          disposition: "pending",
          classifier_version: CLASSIFIER_VERSION,
        })),
      );
    }

    return c.json({
      flags_created: matches.length,
      gl_entries_scanned: entries.length,
      property_id: body.property_id,
      period_year: body.period_year,
    });
  });

  // ── GET /analysis/capex-flags/:propertyId/:periodYear ────────────────────
  app.get("/analysis/capex-flags/:propertyId/:periodYear", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const periodYear = yearSchema.parse(Number(c.req.param("periodYear")));
    const dispositionParam = c.req.query("disposition");
    const disposition =
      dispositionParam != null
        ? dispositionLiteral.parse(dispositionParam)
        : null;

    const organizationId = c.get("auth").actor.organizationId;
    const repo = resolveRepository(c.env, dependencies);

    const flags = await repo.listFlags({
      propertyId,
      periodYear,
      organizationId,
      ...(disposition != null ? { disposition } : {}),
    });

    return c.json(flags);
  });

  // ── GET /analysis/capex-summary/:propertyId/:periodYear ──────────────────
  app.get("/analysis/capex-summary/:propertyId/:periodYear", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const periodYear = yearSchema.parse(Number(c.req.param("periodYear")));
    const organizationId = c.get("auth").actor.organizationId;
    const repo = resolveRepository(c.env, dependencies);

    const flags = await repo.listFlags({
      propertyId,
      periodYear,
      organizationId,
    });

    const pending = flags.filter((f) => f.disposition === "pending").length;
    const confirmedCapex = flags.filter(
      (f) => f.disposition === "confirmed_capex",
    ).length;
    const dismissed = flags.filter((f) => f.disposition === "dismissed").length;

    // Sum actual GL amounts for all flagged entries (chunked to avoid BUG-09).
    let totalFlaggedAmount = new Decimal(0);
    if (flags.length > 0) {
      const entryIds = [...new Set(flags.map((f) => f.gl_entry_id))];
      const amounts = await repo.listGlEntryAmounts({
        entryIds,
        organizationId,
      });
      for (const row of amounts) {
        totalFlaggedAmount = totalFlaggedAmount.plus(
          new Decimal(row.amount).abs(),
        );
      }
    }

    return c.json({
      total: flags.length,
      pending,
      confirmed_capex: confirmedCapex,
      dismissed,
      total_flagged_amount: totalFlaggedAmount.toFixed(2),
    });
  });

  // ── POST /analysis/capex-flags/bulk-review (MUST precede :flagId/review) ──
  app.post("/analysis/capex-flags/bulk-review", async (c) => {
    requireEditor(c);
    await requireFullAccess(c, dependencies);

    const body = bulkReviewRequestSchema.parse(await parseJsonBody(c));
    const organizationId = c.get("auth").actor.organizationId;
    const userId = c.get("auth").actor.userId;
    const repo = resolveRepository(c.env, dependencies);

    const now = new Date().toISOString();
    const reviewResult = await repo.reviewFlags({
      flagIds: body.flag_ids,
      organizationId,
      disposition: body.disposition,
      reviewedAt: now,
      reviewedByUserId: userId,
      reviewNote: body.review_note ?? null,
    });

    if (reviewResult.status === "not_found") {
      throw new HttpError(
        404,
        "capex_flag_not_found",
        `CapEx flag(s) not found: ${reviewResult.missingFlagIds.join(", ")}`,
      );
    }

    return c.json(reviewResult.flags);
  });

  // ── POST /analysis/capex-flags/:flagId/review ───────────────────────────
  app.post("/analysis/capex-flags/:flagId/review", async (c) => {
    requireEditor(c);
    await requireFullAccess(c, dependencies);

    const flagId = uuidSchema.parse(c.req.param("flagId"));
    const body = reviewRequestSchema.parse(await parseJsonBody(c));
    const organizationId = c.get("auth").actor.organizationId;
    const userId = c.get("auth").actor.userId;
    const repo = resolveRepository(c.env, dependencies);

    const updated = await repo.reviewFlag({
      flagId,
      organizationId,
      disposition: body.disposition,
      reviewedAt: new Date().toISOString(),
      reviewedByUserId: userId,
      reviewNote: body.review_note ?? null,
    });

    if (updated === null) {
      throw new HttpError(
        404,
        "capex_flag_not_found",
        `CapEx flag ${flagId} not found`,
      );
    }

    return c.json(updated);
  });

  return app;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveRepository(
  env: AppEnv,
  dependencies: CapExRouteDependencies,
): CapExRepository {
  return (
    dependencies.repository ??
    new PostgresCapExRepository(createDirectPostgresExecutor(env))
  );
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
  dependencies: CapExRouteDependencies,
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

async function parseJsonBody(c: RouteContext): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}
