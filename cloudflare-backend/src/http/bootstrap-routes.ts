import { Hono } from "hono";
import { PostgresBootstrapRepository } from "../adapters/db/bootstrap";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type { BootstrapRepository } from "../domain/bootstrap/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type BootstrapRouteDependencies = {
  repository?: BootstrapRepository;
  auth?: AuthMiddlewareOptions;
};

export function createBootstrapRoutes(
  dependencies: BootstrapRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/dashboard", authMiddleware(dependencies.auth));
  app.use("/dashboard/leakage-summary", authMiddleware(dependencies.auth));

  app.get("/dashboard", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor.party);
    const summary = await resolveRepository(
      c.env,
      dependencies,
    ).getDashboardSummary(auth.actor.organizationId);

    return c.json(summary);
  });

  app.get("/dashboard/leakage-summary", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor.party);
    const summary = await resolveRepository(
      c.env,
      dependencies,
    ).getLeakageSummary(auth.actor.organizationId);

    return c.json(summary);
  });

  return app;
}

function resolveRepository(
  env: AppEnv,
  dependencies: BootstrapRouteDependencies,
): BootstrapRepository {
  return (
    dependencies.repository ??
    new PostgresBootstrapRepository(createDirectPostgresExecutor(env))
  );
}

function requireLandlord(party: AuthVariables["auth"]["actor"]["party"]): void {
  if (party === "landlord") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}
