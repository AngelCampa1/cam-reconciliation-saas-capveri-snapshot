import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  HttpSupabaseAdminAuthClient,
  type SupabaseAdminAuthClient,
} from "../adapters/auth/supabase-admin";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import { PostgresTenantAuthRepository } from "../adapters/db/tenant-auth";
import {
  ResendTenantInvitationEmailSender,
  type TenantInvitationEmailSender,
} from "../adapters/email/resend";
import { TERMS_HASH, TERMS_VERSION } from "../domain/legal/terms";
import type { TenantAuthRepository } from "../domain/tenant-auth/repository";
import {
  completeTenantSignup,
  createTenantInvitationRecord,
  TenantAuthConflictError,
  TenantAuthInputError,
  TenantAuthNotFoundError,
  TenantInvitationTokenError,
  validateTenantInvitationToken,
} from "../domain/tenant-auth/service";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type TenantAuthRouteDependencies = {
  repository?: TenantAuthRepository;
  authClient?: SupabaseAdminAuthClient;
  emailSender?: TenantInvitationEmailSender;
  auth?: AuthMiddlewareOptions;
  clock?: () => Date;
  randomBytes?: (length: number) => Uint8Array;
  randomUuid?: () => string;
};

const uuidSchema = z.string().uuid();
const invitationCreateSchema = z.object({
  email: z.string().trim().email(),
  lease_id: uuidSchema,
});
const signupSchema = z.object({
  token: z.string().min(32).max(128),
  password: z
    .string()
    .min(8)
    .max(128)
    .refine(
      (value) =>
        /[A-Z]/u.test(value) && /[a-z]/u.test(value) && /[0-9]/u.test(value),
      "Password must contain uppercase, lowercase, and digit",
    ),
  contact_name: z.string().trim().min(1).max(200),
  accepted_terms: z.literal(true),
  terms_version: z.literal(TERMS_VERSION),
  terms_hash: z.literal(TERMS_HASH),
});

export function createTenantAuthRoutes(
  dependencies: TenantAuthRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));

  app.get("/tenant/invitations/:token/validate", async (c) => {
    const token = c.req.param("token");
    if (isMalformedInvitationToken(token)) {
      return c.json({ valid: false, error_reason: "not_found" });
    }

    try {
      const invitation = await validateTenantInvitationToken({
        repository: resolveRepository(c.env, dependencies),
        token,
        now: now(dependencies),
      });
      return c.json({
        valid: true,
        email: invitation.email,
        lease_id: invitation.lease_id,
        organization_id: invitation.organization_id,
        expires_at: invitation.expires_at,
      });
    } catch (error) {
      if (error instanceof TenantInvitationTokenError) {
        return c.json({ valid: false, error_reason: error.reason });
      }
      throw mapTenantAuthError(error);
    }
  });

  app.post("/tenant/signup", async (c) => {
    const body = signupSchema.parse(await c.req.json());
    try {
      const result = await completeTenantSignup({
        repository: resolveRepository(c.env, dependencies),
        authClient: resolveAuthClient(c.env, dependencies),
        token: body.token,
        password: body.password,
        contactName: body.contact_name,
        acceptedTerms: body.accepted_terms,
        termsVersion: body.terms_version,
        termsHash: body.terms_hash,
        ipAddress: clientIp(c),
        userAgent: c.req.header("user-agent") ?? null,
        now: now(dependencies),
        ...(dependencies.randomUuid
          ? { randomUuid: dependencies.randomUuid }
          : {}),
      });
      return c.json(
        {
          success: true,
          user_id: result.tenantUser.user_id,
          access_token: result.accessToken,
          refresh_token: result.refreshToken,
          tenant_user: result.tenantUser,
        },
        201,
      );
    } catch (error) {
      if (error instanceof TenantInvitationTokenError) {
        return c.json(
          {
            detail: {
              error: "Invalid invitation",
              reason: error.reason,
            },
          },
          410,
        );
      }
      throw mapTenantAuthError(error);
    }
  });

  app.post(
    "/tenant/invitations",
    authMiddleware(dependencies.auth),
    async (c) => {
      requireAdmin(c);
      const body = invitationCreateSchema.parse(await c.req.json());
      const auth = c.get("auth");
      try {
        const invitation = await createTenantInvitationRecord({
          repository: resolveRepository(c.env, dependencies),
          email: body.email,
          leaseId: body.lease_id,
          invitedBy: auth.actor.userId,
          organizationId: auth.actor.organizationId,
          now: now(dependencies),
          ...(dependencies.randomBytes
            ? { randomBytes: dependencies.randomBytes }
            : {}),
          ...(dependencies.randomUuid
            ? { randomUuid: dependencies.randomUuid }
            : {}),
        });
        sendTenantInvitationEmail(c, dependencies, {
          toEmail: invitation.email,
          invitationToken: invitation.token,
          expiresAt: invitation.expires_at,
          signupUrl: `${appBaseUrl(c.env)}/tenant/signup?token=${encodeURIComponent(invitation.token)}`,
        });
        return c.json(invitation, 201);
      } catch (error) {
        throw mapTenantAuthError(error);
      }
    },
  );

  return app;
}

function resolveRepository(
  env: AppEnv,
  dependencies: TenantAuthRouteDependencies,
): TenantAuthRepository {
  return (
    dependencies.repository ??
    new PostgresTenantAuthRepository(createDirectPostgresExecutor(env))
  );
}

function resolveAuthClient(
  env: AppEnv,
  dependencies: TenantAuthRouteDependencies,
): SupabaseAdminAuthClient {
  return dependencies.authClient ?? new HttpSupabaseAdminAuthClient(env);
}

function requireAdmin(c: RouteContext): void {
  const actor = c.get("auth").actor;
  if (
    actor.party === "landlord" &&
    (actor.role === "owner" || actor.role === "admin")
  ) {
    return;
  }
  throw new HttpError(
    403,
    "insufficient_permissions",
    "Insufficient permissions",
  );
}

function mapTenantAuthError(error: unknown): Error {
  if (error instanceof TenantAuthInputError) {
    return new HttpError(400, "invalid_tenant_auth_request", error.message);
  }
  if (error instanceof TenantAuthNotFoundError) {
    return new HttpError(404, "tenant_auth_resource_not_found", error.message);
  }
  if (error instanceof TenantAuthConflictError) {
    return new HttpError(409, "tenant_auth_conflict", error.message);
  }
  if (error instanceof HttpError) {
    return error;
  }
  if (error instanceof Error) {
    return new HttpError(500, "tenant_auth_failed", "Tenant auth failed");
  }
  return new HttpError(500, "tenant_auth_failed", "Tenant auth failed");
}

function sendTenantInvitationEmail(
  c: RouteContext,
  dependencies: TenantAuthRouteDependencies,
  input: Parameters<TenantInvitationEmailSender["sendTenantInvitation"]>[0],
): void {
  const promise = resolveEmailSender(c.env, dependencies)
    .sendTenantInvitation(input)
    .catch(() => undefined);
  schedule(c, promise);
}

function resolveEmailSender(
  env: AppEnv,
  dependencies: TenantAuthRouteDependencies,
): TenantInvitationEmailSender {
  return dependencies.emailSender ?? new ResendTenantInvitationEmailSender(env);
}

function appBaseUrl(env: AppEnv): string {
  return env.APP_BASE_URL ?? "https://app.capveri.com";
}

function now(dependencies: TenantAuthRouteDependencies): Date {
  return (dependencies.clock ?? (() => new Date()))();
}

function isMalformedInvitationToken(value: string): boolean {
  const token = value.trim();
  return (
    token.length < 32 || token.length > 128 || !/^[a-zA-Z0-9_-]+$/u.test(token)
  );
}

function clientIp(c: RouteContext): string | null {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

function schedule(c: RouteContext, promise: Promise<void>): void {
  const executionCtx = executionContextOrNull(c);
  if (executionCtx) {
    executionCtx.waitUntil(promise);
    return;
  }
  void promise;
}

type WaitUntilContext = {
  waitUntil(promise: Promise<unknown>): void;
};

function executionContextOrNull(c: RouteContext): WaitUntilContext | null {
  try {
    return c.executionCtx;
  } catch {
    return null;
  }
}
