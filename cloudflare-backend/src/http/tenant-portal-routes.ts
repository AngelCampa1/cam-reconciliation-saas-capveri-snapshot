import { Hono, type Context } from "hono";
import { z } from "zod";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import { PostgresTenantPortalRepository } from "../adapters/db/tenant-portal";
import type {
  TenantEmailPreferencesPatch,
  TenantPortalRepository,
} from "../domain/tenant-portal/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type TenantPortalRouteDependencies = {
  repository?: TenantPortalRepository;
  auth?: AuthMiddlewareOptions;
  clock?: () => Date;
};

const uuidSchema = z.string().uuid();
const notificationQuerySchema = z.object({
  unread_only: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  skip: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const emailPreferencesPatchSchema = z.object({
  new_statement_emails: z.boolean().nullable().optional(),
  dispute_update_emails: z.boolean().nullable().optional(),
  reminder_emails: z.boolean().nullable().optional(),
  marketing_emails: z.boolean().nullable().optional(),
});

export function createTenantPortalRoutes(
  dependencies: TenantPortalRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  const tenantAuth = { ...dependencies.auth, parties: ["tenant"] as const };
  app.use("/tenant/dashboard", authMiddleware(tenantAuth));
  app.use("/tenant/notifications", authMiddleware(tenantAuth));
  app.use("/tenant/notifications/*", authMiddleware(tenantAuth));

  app.get("/tenant/dashboard", async (c) => {
    const tenant = requireTenant(c);
    return c.json(
      await resolveRepository(c.env, dependencies).getDashboard({
        tenantUserId: tenant.id,
        organizationId: tenant.organizationId,
      }),
    );
  });

  app.get("/tenant/notifications", async (c) => {
    const tenant = requireTenant(c);
    const query = notificationQuerySchema.parse(c.req.query());
    return c.json(
      await resolveRepository(c.env, dependencies).listNotifications({
        tenantUserId: tenant.id,
        unreadOnly: query.unread_only,
        skip: query.skip,
        limit: query.limit,
      }),
    );
  });

  app.post("/tenant/notifications/:notificationId/read", async (c) => {
    const tenant = requireTenant(c);
    const notificationId = uuidSchema.parse(c.req.param("notificationId"));
    const marked = await resolveRepository(
      c.env,
      dependencies,
    ).markNotificationRead({
      tenantUserId: tenant.id,
      notificationId,
      readAt: nowIso(dependencies),
    });
    if (!marked) {
      throw new HttpError(
        404,
        "tenant_notification_not_found",
        `Notification ${notificationId} not found or already read`,
      );
    }
    return c.json({ status: "ok" });
  });

  app.post("/tenant/notifications/read-all", async (c) => {
    const tenant = requireTenant(c);
    const marked = await resolveRepository(
      c.env,
      dependencies,
    ).markAllNotificationsRead({
      tenantUserId: tenant.id,
      readAt: nowIso(dependencies),
    });
    return c.json({ marked_read: marked });
  });

  app.get("/tenant/notifications/preferences", async (c) => {
    const tenant = requireTenant(c);
    return c.json(
      await resolveRepository(c.env, dependencies).getEmailPreferences({
        tenantUserId: tenant.id,
        timestamp: nowIso(dependencies),
      }),
    );
  });

  app.put("/tenant/notifications/preferences", async (c) => {
    const tenant = requireTenant(c);
    const body = emailPreferencesPatchSchema.parse(await c.req.json());
    const patch = compactPatch(body);
    const preferences = await resolveRepository(
      c.env,
      dependencies,
    ).updateEmailPreferences({
      tenantUserId: tenant.id,
      patch,
      updatedAt: nowIso(dependencies),
    });
    if (!preferences) {
      throw new HttpError(
        500,
        "tenant_preferences_update_failed",
        "Failed to update email preferences",
      );
    }
    return c.json(preferences);
  });

  return app;
}

function resolveRepository(
  env: AppEnv,
  dependencies: TenantPortalRouteDependencies,
): TenantPortalRepository {
  return (
    dependencies.repository ??
    new PostgresTenantPortalRepository(createDirectPostgresExecutor(env))
  );
}

function requireTenant(
  c: RouteContext,
): NonNullable<AuthVariables["auth"]["tenantUser"]> {
  const auth = c.get("auth");
  if (auth.actor.party === "tenant" && auth.tenantUser) {
    return auth.tenantUser;
  }
  throw new HttpError(
    403,
    "tenant_profile_required",
    "Tenant profile required",
  );
}

function compactPatch(
  input: z.infer<typeof emailPreferencesPatchSchema>,
): TenantEmailPreferencesPatch {
  const patch: TenantEmailPreferencesPatch = {};
  for (const key of [
    "new_statement_emails",
    "dispute_update_emails",
    "reminder_emails",
    "marketing_emails",
  ] as const) {
    const value = input[key];
    if (typeof value === "boolean") {
      patch[key] = value;
    }
  }
  return patch;
}

function nowIso(dependencies: TenantPortalRouteDependencies): string {
  return (dependencies.clock ?? (() => new Date()))().toISOString();
}
