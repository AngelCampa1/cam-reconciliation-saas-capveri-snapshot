import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  HttpSupabaseAdminAuthClient,
  type SupabaseAdminAuthClient,
} from "../adapters/auth/supabase-admin";
import { PostgresTeamRepository } from "../adapters/db/team";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import {
  ResendTeamInvitationEmailSender,
  ResendTeamWelcomeEmailSender,
  type TeamInvitationEmailSender,
  type TeamWelcomeEmailSender,
} from "../adapters/email/resend";
import { TERMS_HASH, TERMS_VERSION } from "../domain/legal/terms";
import type { TeamRepository } from "../domain/team/repository";
import {
  acceptTeamInvitationForExistingUser,
  assertManageableMember,
  completeTeamSignup,
  createTeamInvitationRecord,
  revokePendingInvitation,
  TeamConflictError,
  TeamInvitationAcceptError,
  TeamInvitationTokenError,
  TeamInputError,
  TeamNotFoundError,
  validateTeamInvitationToken,
} from "../domain/team/service";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { scheduleBestEffort } from "../platform/best-effort";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type TeamRouteDependencies = {
  repository?: TeamRepository;
  authClient?: SupabaseAdminAuthClient;
  emailSender?: TeamInvitationEmailSender;
  welcomeEmailSender?: TeamWelcomeEmailSender;
  auth?: AuthMiddlewareOptions;
  clock?: () => Date;
  randomBytes?: (length: number) => Uint8Array;
  randomUuid?: () => string;
};

const uuidSchema = z.string().uuid();
const assignableRoleSchema = z.enum(["admin", "member", "viewer"]);
const createInvitationSchema = z.object({
  email: z.string().trim().email(),
  role: assignableRoleSchema.default("member"),
});
const updateMemberRoleSchema = z.object({
  role: assignableRoleSchema,
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
  full_name: z.string().trim().min(1).max(255),
  accepted_terms: z.literal(true),
  terms_version: z.literal(TERMS_VERSION),
  terms_hash: z.literal(TERMS_HASH),
});
const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(128),
  user_id: uuidSchema,
});

export function createTeamRoutes(
  dependencies: TeamRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  app.use("/team/members/*", authMiddleware(dependencies.auth));
  app.use("/team/members", authMiddleware(dependencies.auth));

  app.get("/team/invitations/:token/validate", async (c) => {
    const token = c.req.param("token");
    if (isMalformedInvitationToken(token)) {
      return c.json({ valid: false, error_reason: "not_found" });
    }

    try {
      const invitation = await validateTeamInvitationToken({
        repository: resolveRepository(c.env, dependencies),
        token,
        now: now(dependencies),
      });
      return c.json({
        valid: true,
        email: invitation.email,
        organization_name: invitation.organization_name,
        role: invitation.role,
        expires_at: invitation.expires_at,
      });
    } catch (error) {
      if (error instanceof TeamInvitationTokenError) {
        return c.json({ valid: false, error_reason: error.reason });
      }
      throw mapTeamError(error);
    }
  });

  app.post("/team/signup", async (c) => {
    const body = signupSchema.parse(await c.req.json());
    try {
      const result = await completeTeamSignup({
        repository: resolveRepository(c.env, dependencies),
        authClient: resolveAuthClient(c.env, dependencies),
        token: body.token,
        password: body.password,
        fullName: body.full_name,
        acceptedTerms: body.accepted_terms,
        termsVersion: body.terms_version,
        termsHash: body.terms_hash,
        ipAddress: clientIp(c),
        userAgent: c.req.header("user-agent") ?? null,
        now: now(dependencies),
      });
      sendWelcomeEmail(c, dependencies, {
        toEmail: result.user.email,
        fullName: body.full_name,
        organizationName: result.user.organization_name ?? "your organization",
        role: result.user.role,
        dashboardUrl: appBaseUrl(c.env),
      });
      return c.json(
        {
          success: true,
          user_id: result.user.id,
          access_token: result.accessToken,
          refresh_token: result.refreshToken,
          user: result.user,
        },
        201,
      );
    } catch (error) {
      if (error instanceof TeamInvitationTokenError) {
        return c.json(
          {
            detail: {
              message: "Invalid invitation token",
              reason: error.reason,
            },
          },
          410,
        );
      }
      throw mapTeamError(error);
    }
  });

  app.post(
    "/team/invitations/accept",
    authMiddleware(dependencies.auth),
    async (c) => {
      const body = acceptInvitationSchema.parse(await c.req.json());
      const auth = c.get("auth");
      if (auth.actor.userId !== body.user_id) {
        throw new HttpError(403, "user_mismatch", "User mismatch");
      }
      try {
        const message = await acceptTeamInvitationForExistingUser({
          repository: resolveRepository(c.env, dependencies),
          token: body.token,
          userId: body.user_id,
          userEmail: auth.user.email,
          now: now(dependencies),
        });
        return c.json({ success: true, message });
      } catch (error) {
        if (error instanceof TeamInvitationTokenError) {
          return c.json(
            {
              detail: {
                error: "invalid_invitation",
                reason: error.reason,
              },
            },
            400,
          );
        }
        if (error instanceof TeamInvitationAcceptError) {
          return c.json(
            {
              detail: {
                error: "invitation_accept_failed",
                reason: error.reason,
              },
            },
            acceptErrorStatus(error.reason),
          );
        }
        throw mapTeamError(error);
      }
    },
  );

  app.get("/team/members", async (c) => {
    requireAdmin(c);
    const auth = c.get("auth");
    return c.json(
      await resolveRepository(c.env, dependencies).listMembers({
        organizationId: auth.actor.organizationId,
        currentUserId: auth.actor.userId,
      }),
    );
  });

  app.patch("/team/members/:memberId", async (c) => {
    requireAdmin(c);
    const memberId = uuidSchema.parse(c.req.param("memberId"));
    const body = updateMemberRoleSchema.parse(await c.req.json());
    const auth = c.get("auth");
    if (memberId === auth.actor.userId) {
      throw new HttpError(
        400,
        "self_role_change",
        "You cannot change your own role",
      );
    }

    try {
      const repository = resolveRepository(c.env, dependencies);
      const target = assertManageableMember(
        await repository.getMember({
          memberId,
          organizationId: auth.actor.organizationId,
          currentUserId: auth.actor.userId,
        }),
      );
      const updated = await repository.updateMemberRole({
        memberId: target.id,
        organizationId: auth.actor.organizationId,
        currentUserId: auth.actor.userId,
        role: body.role,
        updatedAt: nowIso(dependencies),
      });
      if (!updated) {
        throw new HttpError(
          404,
          "team_member_not_found",
          "Team member not found",
        );
      }

      return c.json(updated);
    } catch (error) {
      throw mapTeamError(error);
    }
  });

  app.delete("/team/members/:memberId", async (c) => {
    requireAdmin(c);
    const memberId = uuidSchema.parse(c.req.param("memberId"));
    const auth = c.get("auth");
    if (memberId === auth.actor.userId) {
      throw new HttpError(
        400,
        "self_remove",
        "You cannot remove your own account",
      );
    }

    try {
      const repository = resolveRepository(c.env, dependencies);
      const target = assertManageableMember(
        await repository.getMember({
          memberId,
          organizationId: auth.actor.organizationId,
          currentUserId: auth.actor.userId,
        }),
      );
      const removed = await repository.removeMember({
        memberId: target.id,
        organizationId: auth.actor.organizationId,
      });
      if (!removed) {
        throw new HttpError(
          404,
          "team_member_not_found",
          "Team member not found",
        );
      }

      return c.json({ status: "removed", member_id: memberId });
    } catch (error) {
      throw mapTeamError(error);
    }
  });

  app.get("/team/invitations", authMiddleware(dependencies.auth), async (c) => {
    requireAdmin(c);
    const includeUsed = c.req.query("include_used") === "true";
    return c.json(
      await resolveRepository(c.env, dependencies).listInvitations({
        organizationId: c.get("auth").actor.organizationId,
        includeUsed,
      }),
    );
  });

  app.post(
    "/team/invitations",
    authMiddleware(dependencies.auth),
    async (c) => {
      requireAdmin(c);
      const body = createInvitationSchema.parse(await c.req.json());
      const auth = c.get("auth");
      const repository = resolveRepository(c.env, dependencies);

      try {
        const invitation = await createTeamInvitationRecord({
          repository,
          email: body.email,
          role: body.role,
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
        const organizationName =
          (await repository.getOrganizationName(auth.actor.organizationId)) ??
          "your organization";
        sendInvitationEmail(c, dependencies, {
          toEmail: invitation.email,
          invitationToken: invitation.token,
          organizationName,
          role: invitation.role,
          inviterName: auth.user.fullName,
          expiresAt: invitation.expires_at,
          signupUrl: `${marketingBaseUrl(c.env)}/team/signup?token=${encodeURIComponent(invitation.token)}`,
        });

        return c.json(invitation, 201);
      } catch (error) {
        throw mapTeamError(error);
      }
    },
  );

  app.delete(
    "/team/invitations/:invitationId",
    authMiddleware(dependencies.auth),
    async (c) => {
      requireAdmin(c);
      const invitationId = uuidSchema.parse(c.req.param("invitationId"));
      try {
        await revokePendingInvitation({
          repository: resolveRepository(c.env, dependencies),
          invitationId,
          organizationId: c.get("auth").actor.organizationId,
          revokedAt: nowIso(dependencies),
        });
      } catch (error) {
        throw mapTeamError(error);
      }

      return c.json({ status: "revoked", invitation_id: invitationId });
    },
  );

  return app;
}

function resolveRepository(
  env: AppEnv,
  dependencies: TeamRouteDependencies,
): TeamRepository {
  return (
    dependencies.repository ??
    new PostgresTeamRepository(createDirectPostgresExecutor(env))
  );
}

function resolveAuthClient(
  env: AppEnv,
  dependencies: TeamRouteDependencies,
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

function mapTeamError(error: unknown): Error {
  if (error instanceof TeamInputError) {
    return new HttpError(400, "invalid_team_request", error.message);
  }
  if (error instanceof TeamNotFoundError) {
    return new HttpError(404, "team_resource_not_found", error.message);
  }
  if (error instanceof TeamConflictError) {
    return new HttpError(409, "team_conflict", error.message);
  }
  if (error instanceof HttpError) {
    return error;
  }
  if (error instanceof Error) {
    return new HttpError(500, "team_operation_failed", "Team operation failed");
  }
  return new HttpError(500, "team_operation_failed", "Team operation failed");
}

function now(dependencies: TeamRouteDependencies): Date {
  return (dependencies.clock ?? (() => new Date()))();
}

function isMalformedInvitationToken(value: string): boolean {
  const token = value.trim();
  return (
    token.length < 32 || token.length > 128 || !/^[a-zA-Z0-9_-]+$/u.test(token)
  );
}

function nowIso(dependencies: TeamRouteDependencies): string {
  return now(dependencies).toISOString();
}

function marketingBaseUrl(env: AppEnv): string {
  return (
    env.MARKETING_BASE_URL ?? env.APP_BASE_URL ?? "https://www.capveri.com"
  );
}

function appBaseUrl(env: AppEnv): string {
  return env.APP_BASE_URL ?? "https://app.capveri.com";
}

function sendInvitationEmail(
  c: RouteContext,
  dependencies: TeamRouteDependencies,
  input: Parameters<TeamInvitationEmailSender["sendTeamInvitation"]>[0],
): void {
  schedule(
    c,
    resolveEmailSender(c.env, dependencies).sendTeamInvitation(input),
    "worker.best_effort.team_invitation_email",
  );
}

function sendWelcomeEmail(
  c: RouteContext,
  dependencies: TeamRouteDependencies,
  input: Parameters<TeamWelcomeEmailSender["sendTeamWelcome"]>[0],
): void {
  schedule(
    c,
    resolveWelcomeEmailSender(c.env, dependencies).sendTeamWelcome(input),
    "worker.best_effort.team_welcome_email",
  );
}

function resolveEmailSender(
  env: AppEnv,
  dependencies: TeamRouteDependencies,
): TeamInvitationEmailSender {
  return dependencies.emailSender ?? new ResendTeamInvitationEmailSender(env);
}

function resolveWelcomeEmailSender(
  env: AppEnv,
  dependencies: TeamRouteDependencies,
): TeamWelcomeEmailSender {
  return (
    dependencies.welcomeEmailSender ?? new ResendTeamWelcomeEmailSender(env)
  );
}

function acceptErrorStatus(
  reason: TeamInvitationAcceptError["reason"],
): 403 | 404 | 409 | 400 {
  if (reason === "email_mismatch") {
    return 403;
  }
  if (reason === "user_not_found") {
    return 404;
  }
  if (
    reason === "wrong_org" ||
    reason === "used" ||
    reason === "role_update_failed"
  ) {
    return 409;
  }
  return 400;
}

function clientIp(c: RouteContext): string | null {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

function schedule(
  c: RouteContext,
  promise: Promise<unknown>,
  operation: string,
): void {
  scheduleBestEffort(c, promise, { operation });
}
