import { Hono, type Context } from "hono";
import { z } from "zod";
import { PostgresComparisonRepository } from "../adapters/db/comparison";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type {
  ComparisonRepository,
  ComparisonRunInput,
} from "../domain/comparison/repository";
import type { ExplicitCharge } from "../domain/comparison/model";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type ComparisonRouteDependencies = {
  repository?: ComparisonRepository;
  auth?: AuthMiddlewareOptions;
};

const uuidSchema = z.string().uuid();
// Reject impossible calendar dates (2025-02-30 etc.) at the boundary. A
// shape-only regex would pass them, and the postgres driver rolls them forward
// (2025-02-30 -> 2025-03-02), shifting the comparison period the money math runs on.
const dateSchema = z.string().date();
const decimalStringSchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value))
  .pipe(z.string().regex(/^-?(?:\d+|\d*\.\d+)$/u));
const nonNegativeDecimalStringSchema = decimalStringSchema.refine(
  (value) => !value.startsWith("-"),
  "Expected non-negative decimal string",
);
const explicitChargeSchema = z.object({
  lease_id: uuidSchema.nullable().optional(),
  tenant_name: z.string().nullable().optional(),
  pool_id: uuidSchema.nullable().optional(),
  amount: decimalStringSchema,
});
const explicitChargesRequestSchema = z.object({
  period_start: dateSchema,
  period_end: dateSchema,
  charges: z.array(explicitChargeSchema),
  tolerance: nonNegativeDecimalStringSchema.default("0.01"),
  include_drafts: z.boolean().default(false),
});
const persistRunRequestSchema = z.object({
  period_start: dateSchema,
  period_end: dateSchema,
  tolerance: nonNegativeDecimalStringSchema.default("0.01"),
  include_drafts: z.boolean().default(false),
  charges: z.array(explicitChargeSchema).nullable().optional(),
});

export function createComparisonRoutes(
  dependencies: ComparisonRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/comparison/*", authMiddleware(dependencies.auth));

  app.get("/comparison/runs/:runId", async (c) => {
    const runId = uuidSchema.parse(c.req.param("runId"));
    const run = await resolveRepository(c.env, dependencies).getRun({
      organizationId: c.get("auth").actor.organizationId,
      runId,
    });
    if (!run) {
      throw new HttpError(
        404,
        "comparison_run_not_found",
        "Comparison run not found",
      );
    }

    return c.json(run);
  });

  app.get("/comparison/:propertyId/runs", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const limit = integerQuery(c, "limit", 50, 1, 200);
    const offset = integerQuery(c, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
    const runs = await resolveRepository(c.env, dependencies).listRuns({
      organizationId: c.get("auth").actor.organizationId,
      propertyId,
      limit,
      offset,
    });

    return c.json(runs);
  });

  app.post("/comparison/:propertyId/runs", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const body = persistRunRequestSchema.parse(await parseJsonBody(c));
    validatePeriod(body.period_start, body.period_end);
    const charges = body.charges?.map(normalizeExplicitCharge);
    const run = await resolveRepository(c.env, dependencies).createRun({
      organizationId: c.get("auth").actor.organizationId,
      userId: c.get("auth").actor.userId,
      propertyId,
      periodStart: body.period_start,
      periodEnd: body.period_end,
      tolerance: body.tolerance,
      includeDrafts: body.include_drafts,
      ...(body.charges !== undefined ? { charges: charges ?? null } : {}),
    });

    return c.json(run, 201);
  });

  app.get("/comparison/:propertyId", async (c) => {
    const input = comparisonQueryInput(c);
    const result = await resolveRepository(
      c.env,
      dependencies,
    ).compareActualBilled(input);

    return c.json(result);
  });

  app.post("/comparison/:propertyId", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const body = explicitChargesRequestSchema.parse(await parseJsonBody(c));
    validatePeriod(body.period_start, body.period_end);
    const result = await resolveRepository(c.env, dependencies).compareExplicit(
      {
        organizationId: c.get("auth").actor.organizationId,
        propertyId,
        periodStart: body.period_start,
        periodEnd: body.period_end,
        tolerance: body.tolerance,
        includeDrafts: body.include_drafts,
        charges: body.charges.map(normalizeExplicitCharge),
      },
    );

    return c.json(result);
  });

  return app;
}

function comparisonQueryInput(c: RouteContext): ComparisonRunInput {
  const propertyId = uuidSchema.parse(c.req.param("propertyId"));
  const periodStart = dateSchema.parse(requiredQuery(c, "period_start"));
  const periodEnd = dateSchema.parse(requiredQuery(c, "period_end"));
  const tolerance = nonNegativeDecimalStringSchema.parse(
    c.req.query("tolerance") ?? "0.01",
  );
  validatePeriod(periodStart, periodEnd);

  return {
    organizationId: c.get("auth").actor.organizationId,
    propertyId,
    periodStart,
    periodEnd,
    tolerance,
    includeDrafts: parseBooleanQuery(c.req.query("include_drafts")),
  };
}

function validatePeriod(periodStart: string, periodEnd: string): void {
  if (periodStart < periodEnd) {
    return;
  }

  throw new HttpError(
    400,
    "invalid_period",
    "period_start must be before period_end",
  );
}

function integerQuery(
  c: RouteContext,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = c.req.query(key);
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(422, "invalid_query_parameter", `${key} is invalid`);
  }

  return value;
}

function requiredQuery(c: RouteContext, key: string): string {
  const value = c.req.query(key);
  if (!value) {
    throw new HttpError(422, "missing_query_parameter", `${key} is required`);
  }

  return value;
}

function parseBooleanQuery(value: string | undefined): boolean {
  return value === "true" || value === "1";
}

function normalizeExplicitCharge(input: {
  lease_id?: string | null | undefined;
  tenant_name?: string | null | undefined;
  pool_id?: string | null | undefined;
  amount: string;
}): ExplicitCharge {
  return {
    amount: input.amount,
    ...(input.lease_id !== undefined ? { lease_id: input.lease_id } : {}),
    ...(input.tenant_name !== undefined
      ? { tenant_name: input.tenant_name }
      : {}),
    ...(input.pool_id !== undefined ? { pool_id: input.pool_id } : {}),
  };
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}

function resolveRepository(
  env: AppEnv,
  dependencies: ComparisonRouteDependencies,
): ComparisonRepository {
  return (
    dependencies.repository ??
    new PostgresComparisonRepository(createDirectPostgresExecutor(env))
  );
}
