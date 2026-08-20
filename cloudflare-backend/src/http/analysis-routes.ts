import { Hono, type Context } from "hono";
import { z } from "zod";
import { PostgresAnalysisRepository } from "../adapters/db/analysis";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type { AnalysisRepository } from "../domain/analysis/repository";
import {
  AnalysisInputError,
  AnalysisNotFoundError,
  buildYearOverYearComparison,
  detectAnalysisAnomalies,
} from "../domain/analysis/service";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type AnalysisRouteDependencies = {
  repository?: AnalysisRepository;
  auth?: AuthMiddlewareOptions;
};

const uuidSchema = z.string().uuid();
const yearSchema = z.number().int().min(1990).max(2100);
const yearOverYearRequestSchema = z.object({
  property_id: uuidSchema,
  years: z.array(yearSchema).min(2).max(4),
  use_fuzzy_matching: z.boolean().default(true),
});
const anomalyDetectionRequestSchema = z.object({
  property_id: uuidSchema,
  target_year: yearSchema,
  comparison_years: z.array(yearSchema).min(1),
});

export function createAnalysisRoutes(
  dependencies: AnalysisRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/analysis/*", authMiddleware(dependencies.auth));

  app.get("/analysis/properties/:propertyId/available-years", async (c) => {
    const propertyId = uuidSchema.parse(c.req.param("propertyId"));
    const repository = resolveRepository(c.env, dependencies);
    const organizationId = c.get("auth").actor.organizationId;
    const propertyName = await repository.getPropertyName({
      propertyId,
      organizationId,
    });
    if (!propertyName) {
      throw new HttpError(404, "property_not_found", "Property not found");
    }

    return c.json(
      await repository.listAvailableYears({ propertyId, organizationId }),
    );
  });

  app.post("/analysis/year-over-year", async (c) => {
    await requireFullAccess(c, dependencies);
    const body = yearOverYearRequestSchema.parse(await c.req.json());

    try {
      return c.json(
        await buildYearOverYearComparison(
          resolveRepository(c.env, dependencies),
          {
            ...body,
            organizationId: c.get("auth").actor.organizationId,
          },
        ),
      );
    } catch (error) {
      throw mapAnalysisError(error, "Failed to generate comparison");
    }
  });

  app.post("/analysis/anomaly-detection", async (c) => {
    await requireFullAccess(c, dependencies);
    const body = anomalyDetectionRequestSchema.parse(await c.req.json());

    try {
      return c.json(
        await detectAnalysisAnomalies(resolveRepository(c.env, dependencies), {
          ...body,
          organizationId: c.get("auth").actor.organizationId,
        }),
      );
    } catch (error) {
      throw mapAnalysisError(error, "Failed to detect anomalies");
    }
  });

  return app;
}

function resolveRepository(
  env: AppEnv,
  dependencies: AnalysisRouteDependencies,
): AnalysisRepository {
  return (
    dependencies.repository ??
    new PostgresAnalysisRepository(createDirectPostgresExecutor(env))
  );
}

async function requireFullAccess(
  c: RouteContext,
  dependencies: AnalysisRouteDependencies,
): Promise<void> {
  const auth = c.get("auth");
  if (
    await resolveRepository(c.env, dependencies).hasFullAccess(
      auth.actor.organizationId,
    )
  ) {
    return;
  }

  throw new HttpError(
    402,
    "subscription_required",
    "subscription_required: An active subscription or trial is required.",
  );
}

function mapAnalysisError(error: unknown, fallback: string): Error {
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
