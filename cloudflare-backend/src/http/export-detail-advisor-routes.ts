/**
 * EP-15 — Detail Level Advisor route.
 *
 * POST /export/detail-advisor
 *
 * Pure-compute JSON endpoint: no external calls, no storage.
 * Billing-gated (full access required), landlord role only.
 *
 * Mirrors FastAPI POST /api/v1/export/detail-advisor in
 * backend/app/api/v1/export.py (~line 1189).
 */

import { Hono } from "hono";
import { z } from "zod";
import type { AnalysisRepository } from "../domain/analysis/repository";
import {
  buildPoolDetails,
  analyzeDetailLevel,
  type DetailLevelAdvisory,
  type ImmaterialItem,
} from "../domain/exports/detail-advisor";
import { PostgresAnalysisRepository } from "../adapters/db/analysis";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

// ── Types ─────────────────────────────────────────────────────────────────────

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type DetailAdvisorRouteDependencies = {
  repository?: AnalysisRepository;
  auth?: AuthMiddlewareOptions;
};

// ── Zod schemas ───────────────────────────────────────────────────────────────

const uuidSchema = z.string().uuid();
const yearSchema = z.number().int().min(1990).max(2100);

const detailAdvisorBodySchema = z.object({
  property_id: uuidSchema,
  year: yearSchema,
});

// ── JSON serialization helpers ────────────────────────────────────────────────

/**
 * Serialize a Decimal to a string — mirrors how Pydantic v2 serializes
 * Python Decimal fields in JSON: it calls str(decimal), which preserves
 * the exact decimal string representation without trailing zeros or
 * scientific notation for normal values.
 *
 * Example: Decimal("123.45") → "123.45", Decimal("0.456789") → "0.456789"
 */
function decimalToJson(d: import("decimal.js").Decimal): string {
  return d.toString();
}

// ── Serialization of the advisory response ────────────────────────────────────

type GroupingSuggestionJson = {
  category_name: string;
  current_line_count: number;
  suggested_label: string;
  severity: string;
  explanation: string;
};

type ImmaterialItemJson = {
  account_code: string;
  account_description: string;
  amount: string;
  percent_of_total: string;
  pool_name: string;
};

type DetailLevelAdvisoryJson = {
  total_line_items: number;
  total_categories: number;
  overall_severity: string;
  summary: string;
  grouping_suggestions: GroupingSuggestionJson[];
  immaterial_items: ImmaterialItemJson[];
  suggested_total_lines: number;
};

function serializeAdvisory(
  advisory: DetailLevelAdvisory,
): DetailLevelAdvisoryJson {
  return {
    total_line_items: advisory.total_line_items,
    total_categories: advisory.total_categories,
    overall_severity: advisory.overall_severity,
    summary: advisory.summary,
    grouping_suggestions: advisory.grouping_suggestions.map((s) => ({
      category_name: s.category_name,
      current_line_count: s.current_line_count,
      suggested_label: s.suggested_label,
      severity: s.severity,
      explanation: s.explanation,
    })),
    immaterial_items: advisory.immaterial_items.map((i: ImmaterialItem) => ({
      account_code: i.account_code,
      account_description: i.account_description,
      amount: decimalToJson(i.amount),
      percent_of_total: decimalToJson(i.percent_of_total),
      pool_name: i.pool_name,
    })),
    suggested_total_lines: advisory.suggested_total_lines,
  };
}

// ── Route factory ─────────────────────────────────────────────────────────────

export function createDetailAdvisorRoutes(
  dependencies: DetailAdvisorRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/export/detail-advisor", authMiddleware(dependencies.auth));

  app.post("/export/detail-advisor", async (c) => {
    const auth = c.get("auth");

    // Landlord-only (mirrors FastAPI OrgContext which is landlord-scoped)
    if (auth.actor.party !== "landlord") {
      throw new HttpError(
        403,
        "insufficient_permissions",
        "Insufficient permissions",
      );
    }

    const repo = resolveRepository(c.env, dependencies);

    // Billing gate: mirrors _require_professional_feature(ctx, "statement_detail_advisor", ...)
    if (!(await repo.hasFullAccess(auth.actor.organizationId))) {
      throw new HttpError(
        402,
        "subscription_required",
        "subscription_required: An active subscription or trial is required.",
      );
    }

    const body = detailAdvisorBodySchema.parse(await parseJsonBody(c));
    const { property_id: propertyId, year } = body;
    const organizationId = auth.actor.organizationId;

    // Fetch pools (org-scoped via JOIN)
    const pools = await repo.listExpensePools({ propertyId, organizationId });
    if (pools.length === 0) {
      // No pools → empty advisory (mirrors Python returning [] → SUGGESTION)
      const advisory = analyzeDetailLevel([]);
      return c.json(serializeAdvisory(advisory));
    }

    const poolIds = pools.map((p) => p.id);

    // Fetch mappings and GL entries in parallel
    const [mappingsRaw, glEntriesRaw] = await Promise.all([
      repo.listPoolMappings({ poolIds, organizationId }),
      repo.listGlEntries({ propertyId, year, organizationId }),
    ]);

    // Group mappings by pool id
    const mappingsByPool = new Map<string, typeof mappingsRaw>(
      poolIds.map((id) => [id, []]),
    );
    for (const m of mappingsRaw) {
      mappingsByPool.get(m.expense_pool_id)?.push(m);
    }

    // Build pool details and run advisor
    const [poolDetails] = buildPoolDetails(pools, mappingsByPool, glEntriesRaw);
    const advisory = analyzeDetailLevel(poolDetails);

    return c.json(serializeAdvisory(advisory));
  });

  return app;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function resolveRepository(
  env: AppEnv,
  dependencies: DetailAdvisorRouteDependencies,
): AnalysisRepository {
  return (
    dependencies.repository ??
    new PostgresAnalysisRepository(createDirectPostgresExecutor(env))
  );
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}
