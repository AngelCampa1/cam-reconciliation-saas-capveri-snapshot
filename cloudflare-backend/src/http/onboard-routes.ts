import { Hono, type Context } from "hono";
import { z } from "zod";
import { cachedSupabaseJwtVerifier } from "../adapters/auth/supabase-jwt";
import {
  JwtVerificationError,
  type JwtVerifier,
} from "../adapters/auth/verifier";
import { PostgresOnboardingRepository } from "../adapters/db/onboarding";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import { ResendWelcomeEmailSender } from "../adapters/email/resend";
import type { OnboardingRepository } from "../domain/onboarding/repository";
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

type WelcomeSender = {
  sendWelcomeEmail(input: {
    toEmail: string;
    organizationName: string;
    dashboardUrl: string;
  }): Promise<void>;
};

export type OnboardRouteDependencies = {
  repository?: OnboardingRepository;
  verifier?: JwtVerifier;
  auth?: AuthMiddlewareOptions;
  welcomeSender?: WelcomeSender;
};

const upgradeSchema = z.object({
  email: z.string().trim().email().max(320),
  organization_name: z.string().trim().max(255).nullable().optional(),
});

export function createOnboardRoutes(
  dependencies: OnboardRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));

  app.post("/onboard/init", async (c) => {
    const token = bearerToken(c.req.header("authorization"));
    const verified = await verifyBearerToken(c.env, dependencies, token);

    if (!verified.isActive) {
      throw new HttpError(403, "user_inactive", "User account is inactive");
    }

    const result = await resolveRepository(c.env, dependencies).initUser({
      userId: verified.subject,
    });

    return c.json({
      organization_id: result.organizationId,
      user_id: result.userId,
      already_existed: result.state === "already_exists",
    });
  });

  app.use("/onboard/upgrade", authMiddleware(dependencies.auth));

  app.patch("/onboard/upgrade", async (c) => {
    const payload = upgradeSchema.parse(await parseJsonBody(c));
    const token = bearerToken(c.req.header("authorization"));
    const verified = await verifyBearerToken(c.env, dependencies, token);
    const auth = c.get("auth");

    if (verified.subject !== auth.actor.userId) {
      throw new HttpError(401, "invalid_token", "Invalid token");
    }

    const authEmail = jwtEmail(verified.payload);
    if (!authEmail || authEmail.toLowerCase() !== payload.email.toLowerCase()) {
      throw new HttpError(
        403,
        "email_mismatch",
        "Email must match the authenticated Supabase account",
      );
    }

    const organizationName =
      payload.organization_name?.trim() ||
      fallbackOrganizationName(payload.email);
    const result = await resolveRepository(c.env, dependencies).upgradeUser({
      userId: auth.actor.userId,
      organizationId: auth.actor.organizationId,
      email: payload.email,
      organizationName,
    });

    if (result.state === "user_not_found") {
      throw new HttpError(
        404,
        "onboard_user_not_found",
        "User record not found. Call /onboard/init first.",
      );
    }

    schedule(
      c,
      sendWelcomeEmail(c.env, dependencies, {
        email: payload.email,
        organizationName,
      }),
    );

    return c.json({ success: true });
  });

  return app;
}

async function verifyBearerToken(
  env: AppEnv,
  dependencies: OnboardRouteDependencies,
  token: string,
) {
  try {
    return await resolveVerifier(env, dependencies).verify(token);
  } catch (error) {
    if (error instanceof JwtVerificationError) {
      throw new HttpError(401, "invalid_token", error.message);
    }

    throw error;
  }
}

function bearerToken(header: string | undefined): string {
  if (!header) {
    throw new HttpError(
      401,
      "authorization_required",
      "Authorization header required",
    );
  }

  const [scheme, token, extra] = header.trim().split(/\s+/u);
  if (scheme !== "Bearer" || !token || extra) {
    throw new HttpError(
      401,
      "invalid_authorization",
      "Authorization header must use Bearer token",
    );
  }

  return token;
}

function resolveVerifier(
  env: AppEnv,
  dependencies: OnboardRouteDependencies,
): JwtVerifier {
  return dependencies.verifier ?? cachedSupabaseJwtVerifier(env);
}

function resolveRepository(
  env: AppEnv,
  dependencies: OnboardRouteDependencies,
): OnboardingRepository {
  return (
    dependencies.repository ??
    new PostgresOnboardingRepository(createDirectPostgresExecutor(env))
  );
}

function resolveWelcomeSender(
  env: AppEnv,
  dependencies: OnboardRouteDependencies,
): WelcomeSender {
  return dependencies.welcomeSender ?? new ResendWelcomeEmailSender(env);
}

function jwtEmail(payload: Record<string, unknown>): string | null {
  const email = payload.email;

  return typeof email === "string" && email.trim() ? email : null;
}

function fallbackOrganizationName(email: string): string {
  const prefix = email.split("@")[0] ?? "Account";

  return prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

async function sendWelcomeEmail(
  env: AppEnv,
  dependencies: OnboardRouteDependencies,
  input: { email: string; organizationName: string },
): Promise<void> {
  await resolveWelcomeSender(env, dependencies).sendWelcomeEmail({
    toEmail: input.email,
    organizationName: input.organizationName,
    dashboardUrl: `${(env.APP_BASE_URL ?? "https://app.capveri.com").replace(/\/+$/u, "")}/dashboard`,
  });
}

function schedule(c: RouteContext, promise: Promise<void>): void {
  scheduleBestEffort(c, promise, {
    operation: "worker.best_effort.onboard",
  });
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}
