import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  HttpSupabaseAdminAuthClient,
  type SupabaseAdminAuthClient,
} from "../adapters/auth/supabase-admin";
import {
  PostHogServerAnalytics,
  type ServerAnalytics,
} from "../adapters/analytics/posthog";
import { PostgresCrmRepository } from "../adapters/db/crm";
import { PostgresAuthLifecycleRepository } from "../adapters/db/auth-lifecycle";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import {
  ResendWelcomeEmailSender,
  type WelcomeEmailSender,
} from "../adapters/email/resend";
import type { AuthLifecycleRepository } from "../domain/auth-lifecycle/repository";
import type { CrmRepository } from "../domain/crm/repository";
import {
  AccountDeletionBlockedError,
  assertAccountCanBeDeleted,
  assertCurrentTermsAcceptance,
  buildSignupNurtureEvents,
  LegalAcceptanceError,
  recordCurrentTermsAcceptance,
} from "../domain/auth-lifecycle/service";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { scheduleBestEffort } from "../platform/best-effort";
import { captureWorkerException } from "../platform/sentry";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

export type SequencerClient = {
  enroll(input: {
    email: string;
    sequenceSlug:
      | "capveri-fulfillment-intro"
      | "capveri-signup-daily-next-step";
    externalId: string;
    metadata: Record<string, string>;
  }): Promise<boolean>;
};

export type AuthLifecycleRouteDependencies = {
  repository?: AuthLifecycleRepository;
  authClient?: Pick<SupabaseAdminAuthClient, "deleteUser">;
  analytics?: ServerAnalytics;
  welcomeSender?: WelcomeEmailSender;
  sequencer?: SequencerClient;
  crm?: CrmRepository;
  auth?: AuthMiddlewareOptions;
  clock?: () => Date;
};

const legalAcceptanceSchema = z.object({
  accepted_terms: z.literal(true),
  terms_version: z.string(),
  terms_hash: z.string(),
});
const deleteAccountSchema = z.object({
  confirmation: z.literal("DELETE"),
});

export function createAuthLifecycleRoutes(
  dependencies: AuthLifecycleRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));
  // Account lifecycle routes are shared by both landlord and tenant sessions.
  app.use(
    "/auth/*",
    authMiddleware({
      ...dependencies.auth,
      parties: ["landlord", "tenant"] as const,
    }),
  );

  app.post("/auth/welcome", async (c) => {
    const payload = legalAcceptanceSchema.parse(await parseJsonBody(c));
    assertCurrentTermsAcceptance({
      acceptedTerms: payload.accepted_terms,
      termsVersion: payload.terms_version,
      termsHash: payload.terms_hash,
    });

    const auth = c.get("auth");
    schedule(
      c,
      runWelcomeSideEffects({
        env: c.env,
        dependencies,
        userId: auth.actor.userId,
        organizationId: auth.actor.organizationId,
        email: auth.user.email,
        termsVersion: payload.terms_version,
        termsHash: payload.terms_hash,
        ipAddress: clientIp(c),
        userAgent: c.req.header("user-agent") ?? null,
        now: now(dependencies),
      }),
    );

    return c.json({ status: "ok" });
  });

  app.post("/auth/legal-acceptance/current", async (c) => {
    const payload = legalAcceptanceSchema.parse(await parseJsonBody(c));
    const auth = c.get("auth");
    try {
      await recordCurrentTermsAcceptance({
        repository: resolveRepository(c.env, dependencies),
        userId: auth.actor.userId,
        organizationId: auth.actor.organizationId,
        acceptedTerms: payload.accepted_terms,
        termsVersion: payload.terms_version,
        termsHash: payload.terms_hash,
        source: "authenticated_legal_gate",
        acceptedAt: now(dependencies).toISOString(),
        ipAddress: clientIp(c),
        userAgent: c.req.header("user-agent") ?? null,
      });
    } catch (error) {
      throw mapAuthLifecycleError(error);
    }

    return c.json({ status: "accepted" });
  });

  app.delete("/auth/account", async (c) => {
    deleteAccountSchema.parse(await parseJsonBody(c));
    const auth = c.get("auth");
    try {
      await assertAccountCanBeDeleted({
        repository: resolveRepository(c.env, dependencies),
        userId: auth.actor.userId,
        organizationId: auth.actor.organizationId,
        role: auth.actor.role,
      });
      await resolveAuthClient(c.env, dependencies).deleteUser(
        auth.actor.userId,
      );
    } catch (error) {
      throw mapAuthLifecycleError(error);
    }

    return c.json({ status: "deleted" });
  });

  return app;
}

async function runWelcomeSideEffects(input: {
  env: AppEnv;
  dependencies: AuthLifecycleRouteDependencies;
  userId: string;
  organizationId: string;
  email: string;
  termsVersion: string;
  termsHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  now: Date;
}): Promise<void> {
  const repository = resolveRepository(input.env, input.dependencies);
  await reportWelcomeSideEffect(
    input,
    recordCurrentTermsAcceptance({
      repository,
      userId: input.userId,
      organizationId: input.organizationId,
      acceptedTerms: true,
      termsVersion: input.termsVersion,
      termsHash: input.termsHash,
      source: "owner_signup",
      acceptedAt: input.now.toISOString(),
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    }),
    "worker.best_effort.auth_welcome.legal_acceptance",
  );

  const organizationName =
    (await swallow(repository.getOrganizationName(input.organizationId))) ??
    "your organization";
  await reportWelcomeSideEffect(
    input,
    resolveCrm(input.env, input.dependencies).recordEvent({
      email: input.email,
      eventName: "signup_completed",
      eventSource: "auth_welcome",
      lifecycleStage: "trial_signup",
      nextStep: "checkout_plan_selected",
      userId: input.userId,
      organizationId: input.organizationId,
      occurredAt: input.now.toISOString(),
      metadata: {
        organizationName,
        cadence: "daily_until_next_step",
        stopWhen:
          "checkout_started,property_created,gl_uploaded,reconciliation_completed,subscription_active,unsubscribe",
      },
    }),
    "worker.best_effort.auth_welcome.crm",
  );
  await reportWelcomeSideEffect(
    input,
    resolveAnalytics(input.dependencies).capture(input.env, {
      eventName: "signup_completed",
      organizationId: input.organizationId,
      properties: {
        source: "auth_welcome",
      },
    }),
    "worker.best_effort.auth_welcome.analytics",
  );
  await reportWelcomeSideEffect(
    input,
    resolveWelcomeSender(input.env, input.dependencies).sendWelcomeEmail({
      toEmail: input.email,
      organizationName,
      dashboardUrl: checkoutUrl(input.env),
    }),
    "worker.best_effort.auth_welcome.email",
  );
  await reportWelcomeSideEffect(
    input,
    repository.upsertSignupNurtureEvents(
      buildSignupNurtureEvents({
        organizationId: input.organizationId,
        userId: input.userId,
        email: input.email,
        organizationName,
        now: input.now,
      }),
    ),
    "worker.best_effort.auth_welcome.nurture_events",
  );

  const metadata = {
    userId: input.userId,
    organizationId: input.organizationId,
    organizationName,
    source: "capveri-signup",
    crmStage: "trial_signup",
    funnelNextStep: "checkout_plan_selected",
    cadence: "daily_until_next_step",
    stopWhen:
      "checkout_started,property_created,gl_uploaded,reconciliation_completed,subscription_active,unsubscribe",
  };
  const sequencer = resolveSequencer(input.env, input.dependencies);
  await reportWelcomeSideEffect(
    input,
    sequencer.enroll({
      email: input.email,
      sequenceSlug: "capveri-fulfillment-intro",
      externalId: `signup:${input.userId}:fulfillment`,
      metadata,
    }),
    "worker.best_effort.auth_welcome.fulfillment_sequence",
  );
  await reportWelcomeSideEffect(
    input,
    sequencer.enroll({
      email: input.email,
      sequenceSlug: "capveri-signup-daily-next-step",
      externalId: `signup:${input.userId}:daily-next-step`,
      metadata,
    }),
    "worker.best_effort.auth_welcome.daily_sequence",
  );
}

async function reportWelcomeSideEffect<T>(
  input: { env: AppEnv },
  promise: Promise<T>,
  operation: string,
): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    await captureWorkerException(input.env, error, {
      operation,
      path: "/api/v1/auth/welcome",
    });
    return null;
  }
}

function resolveRepository(
  env: AppEnv,
  dependencies: AuthLifecycleRouteDependencies,
): AuthLifecycleRepository {
  return (
    dependencies.repository ??
    new PostgresAuthLifecycleRepository(createDirectPostgresExecutor(env))
  );
}

function resolveAuthClient(
  env: AppEnv,
  dependencies: AuthLifecycleRouteDependencies,
): Pick<SupabaseAdminAuthClient, "deleteUser"> {
  return dependencies.authClient ?? new HttpSupabaseAdminAuthClient(env);
}

function resolveWelcomeSender(
  env: AppEnv,
  dependencies: AuthLifecycleRouteDependencies,
): WelcomeEmailSender {
  return dependencies.welcomeSender ?? new ResendWelcomeEmailSender(env);
}

function resolveAnalytics(
  dependencies: AuthLifecycleRouteDependencies,
): ServerAnalytics {
  return dependencies.analytics ?? new PostHogServerAnalytics();
}

function resolveCrm(
  env: AppEnv,
  dependencies: AuthLifecycleRouteDependencies,
): CrmRepository {
  return (
    dependencies.crm ?? new PostgresCrmRepository(createDirectPostgresExecutor(env))
  );
}

function resolveSequencer(
  env: AppEnv,
  dependencies: AuthLifecycleRouteDependencies,
): SequencerClient {
  return dependencies.sequencer ?? new HttpSequencerClient(env);
}

class HttpSequencerClient implements SequencerClient {
  constructor(private readonly env: AppEnv) {}

  async enroll(input: {
    email: string;
    sequenceSlug:
      | "capveri-fulfillment-intro"
      | "capveri-signup-daily-next-step";
    externalId: string;
    metadata: Record<string, string>;
  }): Promise<boolean> {
    const baseUrl = this.env.SEQUENCER_BASE_URL?.trim().replace(/\/+$/u, "");
    const clientId = this.env.SEQUENCER_CF_ACCESS_CLIENT_ID?.trim();
    const clientSecret = this.env.SEQUENCER_CF_ACCESS_CLIENT_SECRET?.trim();
    if (!baseUrl || !clientId || !clientSecret) {
      return false;
    }

    const headers = {
      "content-type": "application/json",
      "CF-Access-Client-Id": clientId,
      "CF-Access-Client-Secret": clientSecret,
    };
    await postSequencer(baseUrl, headers, "/api/v1/contacts", {
      email: input.email,
      product: "capveri",
      properties: input.metadata,
    });
    await postSequencer(
      baseUrl,
      { ...headers, "Idempotency-Key": input.externalId },
      "/api/v1/enrollments",
      {
        email: input.email,
        product: "capveri",
        sequence_slug: input.sequenceSlug,
        source: input.externalId,
        properties: input.metadata,
      },
    );
    return true;
  }
}

async function postSequencer(
  baseUrl: string,
  headers: Record<string, string>,
  path: string,
  body: unknown,
): Promise<void> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error("Sequencer request failed");
  }
}

function mapAuthLifecycleError(error: unknown): Error {
  if (error instanceof LegalAcceptanceError) {
    return new HttpError(422, "invalid_legal_acceptance", error.message);
  }
  if (error instanceof AccountDeletionBlockedError) {
    return new HttpError(400, "account_deletion_blocked", error.message);
  }
  if (error instanceof HttpError) {
    return error;
  }
  if (error instanceof Error) {
    return new HttpError(500, "auth_lifecycle_failed", error.message);
  }
  return new HttpError(
    500,
    "auth_lifecycle_failed",
    "Auth lifecycle operation failed",
  );
}

function checkoutUrl(env: AppEnv): string {
  return `${(env.APP_BASE_URL ?? "https://app.capveri.com").replace(/\/+$/u, "")}/settings/billing?intent=select-plan&source=signup`;
}

function now(dependencies: AuthLifecycleRouteDependencies): Date {
  return (dependencies.clock ?? (() => new Date()))();
}

function clientIp(c: RouteContext): string | null {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

function schedule(c: RouteContext, promise: Promise<void>): void {
  scheduleBestEffort(c, promise, {
    operation: "worker.best_effort.auth_lifecycle",
  });
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}

async function swallow<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}
