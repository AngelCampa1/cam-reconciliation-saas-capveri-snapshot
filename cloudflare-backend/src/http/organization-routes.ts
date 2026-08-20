import { Hono } from "hono";
import { z } from "zod";
import { PostgresOrganizationRepository } from "../adapters/db/organization";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import type {
  OrganizationRepository,
  OrganizationSettings,
  OrganizationSettingsPatch,
  OrganizationSettingsResponse,
  RawOrganizationSettings,
} from "../domain/organization/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type OrganizationRouteDependencies = {
  repository?: OrganizationRepository;
  auth?: AuthMiddlewareOptions;
};

const settingsPatchSchema = z.object({
  timezone: z.string().nullable().optional(),
  default_currency: z.string().nullable().optional(),
  fiscal_year_end_month: z.number().int().min(1).max(12).nullable().optional(),
  contact_name: z.string().max(255).nullable().optional(),
  contact_title: z.string().max(255).nullable().optional(),
  contact_company: z.string().max(255).nullable().optional(),
  contact_phone: z.string().max(50).nullable().optional(),
  contact_email: z.string().max(255).nullable().optional(),
  contact_address: z.string().max(1000).nullable().optional(),
});

const defaultSettings: OrganizationSettings = {
  timezone: "America/New_York",
  default_currency: "USD",
  fiscal_year_end_month: 12,
  contact_name: null,
  contact_title: null,
  contact_company: null,
  contact_phone: null,
  contact_email: null,
  contact_address: null,
};

export function createOrganizationRoutes(
  dependencies: OrganizationRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/organization/*", authMiddleware(dependencies.auth));

  app.get("/organization/usage", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);
    const usage = await resolveRepository(c.env, dependencies).getUsage(
      auth.actor.organizationId,
    );

    return c.json(usage);
  });

  app.get("/organization/settings", async (c) => {
    const auth = c.get("auth");

    requireLandlord(auth.actor);
    const settings = await resolveCurrentSettings(
      c.env,
      dependencies,
      auth.actor.organizationId,
    );

    return c.json(toSettingsResponse(auth.actor.organizationId, settings));
  });

  app.patch("/organization/settings", async (c) => {
    const auth = c.get("auth");

    requireOwner(auth.actor);
    const patch = removeUndefined(
      settingsPatchSchema.parse(await parseJsonBody(c)),
    );
    const current = await resolveStoredSettings(
      c.env,
      dependencies,
      auth.actor.organizationId,
    );
    const merged = {
      ...current.raw,
      ...current.settings,
      ...patch,
    };
    const settings = await resolveRepository(
      c.env,
      dependencies,
    ).updateSettings({
      organizationId: auth.actor.organizationId,
      settings: merged,
    });

    if (!settings) {
      throw new HttpError(
        404,
        "organization_not_found",
        "Organization not found",
      );
    }

    return c.json(
      toSettingsResponse(auth.actor.organizationId, settings.settings),
    );
  });

  return app;
}

async function resolveCurrentSettings(
  env: AppEnv,
  dependencies: OrganizationRouteDependencies,
  organizationId: string,
): Promise<OrganizationSettings> {
  return (await resolveStoredSettings(env, dependencies, organizationId))
    .settings;
}

async function resolveStoredSettings(
  env: AppEnv,
  dependencies: OrganizationRouteDependencies,
  organizationId: string,
): Promise<{ raw: RawOrganizationSettings; settings: OrganizationSettings }> {
  const current = await resolveRepository(env, dependencies).getSettings(
    organizationId,
  );

  return {
    raw: current?.raw ?? {},
    settings: { ...defaultSettings, ...(current?.settings ?? {}) },
  };
}

function toSettingsResponse(
  organizationId: string,
  settings: OrganizationSettings,
): OrganizationSettingsResponse {
  return {
    organization_id: organizationId,
    ...settings,
  };
}

function requireLandlord(actor: AuthVariables["auth"]["actor"]): void {
  if (actor.party === "landlord" && actor.role !== "tenant") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function requireOwner(actor: AuthVariables["auth"]["actor"]): void {
  requireLandlord(actor);

  if (actor.role === "owner") {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function removeUndefined(
  record: z.infer<typeof settingsPatchSchema>,
): OrganizationSettingsPatch {
  return Object.fromEntries(
    Object.entries(record).filter((entry) => entry[1] !== undefined),
  ) as OrganizationSettingsPatch;
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(422, "validation_error", "request: Invalid JSON");
  }
}

function resolveRepository(
  env: AppEnv,
  dependencies: OrganizationRouteDependencies,
): OrganizationRepository {
  return (
    dependencies.repository ??
    new PostgresOrganizationRepository(createDirectPostgresExecutor(env))
  );
}
