import { Hono, type Context } from "hono";
import { z } from "zod";
import { ResendContentDownloadEmailSender } from "../adapters/email/resend";
import { PostgresCrmRepository } from "../adapters/db/crm";
import { PostgresLeadRepository } from "../adapters/db/leads";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import { CloudflareTurnstileVerifier } from "../adapters/security/turnstile";
import {
  getLeadMagnetAsset,
  type LeadMagnetAsset,
} from "../domain/leads/assets";
import type { LeadRepository } from "../domain/leads/repository";
import {
  buildDownloadToken,
  buildUnsubscribeToken,
  verifyDownloadToken,
  verifyUnsubscribeToken,
} from "../domain/leads/tokens";
import type { CrmRepository } from "../domain/crm/repository";
import type { AppEnv } from "../env";
import type { AuthVariables } from "../middleware/auth";
import { scheduleBestEffort } from "../platform/best-effort";
import { ConfigError, requireRuntimeSecret } from "../platform/cloudflare";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };
type RouteContext = Context<RouteBindings>;

type TurnstileVerifier = {
  verify(input: {
    token: string | null;
    remoteIp: string | null;
  }): Promise<boolean>;
};

type ContentDownloadSender = {
  sendContentDownload(input: {
    toEmail: string;
    firstName: string;
    assetName: string;
    downloadUrl: string;
    unsubscribeUrl: string;
    registerUrl: string;
  }): Promise<void>;
};

type LeadEventCapturer = {
  capture(input: {
    event: string;
    email: string;
    properties: Record<string, unknown>;
  }): Promise<void>;
};

type SequencerClient = {
  enroll(input: {
    email: string;
    sequenceSlug: string;
    externalId: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  recordEvent(input: {
    email: string;
    event: string;
    metadata: Record<string, unknown>;
  }): Promise<void>;
  unsubscribe(input: { email: string; source: string }): Promise<void>;
};

export type LeadRouteDependencies = {
  repository?: LeadRepository;
  turnstile?: TurnstileVerifier;
  emailSender?: ContentDownloadSender;
  events?: LeadEventCapturer;
  sequencer?: SequencerClient;
  crm?: CrmRepository;
  bucket?: R2Bucket;
};

const plgFreeAuditSlug = "plg_free_audit";
const defaultContentSequenceSlug = "capveri-nurture-value-1";
const contentSequenceBySource: Record<string, string> = {
  exit_intent_popup: "capveri-exit-intent-nurture",
};
const rateLimitWindowHours = 24;
const downloadTtlSeconds = 7 * 24 * 60 * 60;
const contentDownloadMessage = "Check your email for the download link";
const calculatorUnlockMessage = "Results unlocked.";
const plgSignupMessage =
  "Your reconciliation results are saved - check your email.";

const optionalNullableString = (maxLength: number) =>
  z.string().trim().max(maxLength).nullable().optional();

const attributionSchema = {
  ve_product: optionalNullableString(200),
  ve_icp: optionalNullableString(200),
  ve_campaign_id: optionalNullableString(200),
  ve_variant: optionalNullableString(200),
  ve_step: optionalNullableString(200),
  ve_offer: optionalNullableString(200),
  ve_instantly_campaign_id: optionalNullableString(200),
  ve_lead_list_id: optionalNullableString(200),
  ve_sender_pool: optionalNullableString(200),
  ve_sequence_day: optionalNullableString(200),
  ve_branding: optionalNullableString(200),
};

const contentLeadSchema = z.object({
  first_name: optionalNullableString(100),
  email: z.string().trim().email().max(320),
  company: optionalNullableString(200),
  asset_slug: z.string().trim().min(1).max(200),
  source: optionalNullableString(200),
  utm_source: optionalNullableString(200),
  utm_medium: optionalNullableString(200),
  utm_campaign: optionalNullableString(200),
  turnstile_token: z.string().max(2048).nullable().optional(),
  company_website: optionalNullableString(200),
  ...attributionSchema,
});

const calculatorUnlockSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(320),
  slug: z.string().trim().min(1).max(200),
  source: optionalNullableString(200),
  turnstile_token: z.string().max(2048).nullable().optional(),
  company_website: optionalNullableString(200),
});

const plgSignupSchema = z.object({
  email: z.string().trim().email().max(320),
  first_name: z.string().trim().min(1).max(100),
  organization_name: optionalNullableString(200),
  leakage_amount: z.union([z.string(), z.number()]).nullable().optional(),
  property_name: optionalNullableString(200),
  utm_source: optionalNullableString(200),
  utm_campaign: optionalNullableString(200),
  turnstile_token: z.string().max(2048).nullable().optional(),
  company_website: optionalNullableString(200),
  ...attributionSchema,
});

export function createLeadRoutes(
  dependencies: LeadRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));

  app.post("/leads/content-download", async (c) => {
    const payload = contentLeadSchema.parse(await parseJsonBody(c));
    const email = payload.email.toLowerCase();

    if (payload.company_website) {
      return c.json({ success: true, message: contentDownloadMessage });
    }

    await requireVerifiedTurnstile(
      c,
      dependencies,
      payload.turnstile_token ?? null,
    );
    const asset = requireAsset(payload.asset_slug, "content");

    if (await resolveRepository(c.env, dependencies).isSuppressed(email)) {
      return c.json({ success: true, message: contentDownloadMessage });
    }

    await enforceLeadRateLimit(c.env, dependencies, email, payload.asset_slug);
    const downloadUrl = await buildLeadDownloadUrl(c, dependencies, {
      email,
      asset,
    });
    const leadId = await resolveRepository(
      c.env,
      dependencies,
    ).insertContentLead({
      firstName: payload.first_name ?? null,
      email,
      company: payload.company ?? null,
      assetSlug: payload.asset_slug,
      source: payload.source ?? null,
      utmSource: payload.utm_source ?? null,
      utmMedium: payload.utm_medium ?? null,
      utmCampaign: payload.utm_campaign ?? null,
    });
    const attribution = outboundAttributionProperties(payload);
    schedule(
      c,
      recordCrmEvent(c.env, dependencies, {
        email,
        eventName: "lead_form_submit",
        lifecycleStage: "lead",
        nextStep: "download_asset",
        contentLeadId: leadId,
        metadata: {
          lead_id: leadId,
          asset_slug: payload.asset_slug,
          asset_name: asset.displayName,
          source: payload.source ?? null,
          ...attribution,
        },
      }),
    );

    schedule(
      c,
      captureEvent(c.env, dependencies, {
        event: "lead_form_submit",
        email,
        properties: {
          lead_id: leadId,
          lead_type: "content_download",
          asset_slug: payload.asset_slug,
          asset_format: asset.format,
          source: payload.source ?? null,
          utm_source: payload.utm_source ?? null,
          utm_medium: payload.utm_medium ?? null,
          utm_campaign: payload.utm_campaign ?? null,
          ...attribution,
        },
      }),
    );
    schedule(
      c,
      sendDownloadEmail(c.env, dependencies, {
        email,
        firstName: payload.first_name ?? "",
        asset,
        downloadUrl,
      }),
    );
    schedule(
      c,
      resolveSequencer(c.env, dependencies).enroll({
        email,
        sequenceSlug: contentSequenceSlug(payload.source ?? null),
        externalId: `content:${leadId}:nurture`,
        metadata: {
          assetSlug: payload.asset_slug,
          assetName: asset.displayName,
          source: payload.source ?? null,
          utmSource: payload.utm_source ?? null,
          utmMedium: payload.utm_medium ?? null,
          utmCampaign: payload.utm_campaign ?? null,
          ...attribution,
        },
      }),
    );

    return c.json({ success: true, message: contentDownloadMessage });
  });

  app.post("/leads/calculator-unlock", async (c) => {
    const payload = calculatorUnlockSchema.parse(await parseJsonBody(c));
    const email = payload.email.toLowerCase();

    if (payload.company_website) {
      return c.json({ unlocked: true, message: calculatorUnlockMessage });
    }

    await requireVerifiedTurnstile(
      c,
      dependencies,
      payload.turnstile_token ?? null,
    );
    const asset = requireAsset(payload.slug, "calculator");

    if (await resolveRepository(c.env, dependencies).isSuppressed(email)) {
      return c.json({ unlocked: true, message: calculatorUnlockMessage });
    }

    await enforceLeadRateLimit(c.env, dependencies, email, payload.slug);
    const downloadUrl = await buildLeadDownloadUrl(c, dependencies, {
      email,
      asset,
    });
    const leadId = await resolveRepository(
      c.env,
      dependencies,
    ).insertContentLead({
      firstName: payload.first_name,
      email,
      company: null,
      assetSlug: payload.slug,
      source: payload.source ?? null,
      utmSource: null,
      utmMedium: null,
      utmCampaign: null,
    });
    schedule(
      c,
      recordCrmEvent(c.env, dependencies, {
        email,
        eventName: "calculator_unlock_completed",
        lifecycleStage: "lead",
        nextStep: "download_worksheet",
        contentLeadId: leadId,
        metadata: {
          lead_id: leadId,
          asset_slug: payload.slug,
          asset_name: asset.displayName,
          source: payload.source ?? null,
        },
      }),
    );

    schedule(
      c,
      captureEvent(c.env, dependencies, {
        event: "calculator_unlock_completed",
        email,
        properties: {
          lead_id: leadId,
          lead_type: "calculator_unlock",
          asset_slug: payload.slug,
          source: payload.source ?? null,
        },
      }),
    );
    schedule(
      c,
      sendDownloadEmail(c.env, dependencies, {
        email,
        firstName: payload.first_name,
        asset,
        downloadUrl,
      }),
    );
    schedule(
      c,
      resolveSequencer(c.env, dependencies).enroll({
        email,
        sequenceSlug: defaultContentSequenceSlug,
        externalId: `calculator:${leadId}:nurture`,
        metadata: {
          assetSlug: payload.slug,
          assetName: asset.displayName,
          source: payload.source ?? null,
        },
      }),
    );

    return c.json({ unlocked: true, message: calculatorUnlockMessage });
  });

  app.post("/leads/plg-signup", async (c) => {
    const payload = plgSignupSchema.parse(await parseJsonBody(c));
    const email = payload.email.toLowerCase();

    if (payload.company_website) {
      return c.json({ success: true, message: plgSignupMessage });
    }

    await requireVerifiedTurnstile(
      c,
      dependencies,
      payload.turnstile_token ?? null,
    );

    if (await resolveRepository(c.env, dependencies).isSuppressed(email)) {
      return c.json({ success: true, message: plgSignupMessage });
    }

    await enforceLeadRateLimit(c.env, dependencies, email, plgFreeAuditSlug);
    const leadId = await resolveRepository(
      c.env,
      dependencies,
    ).insertContentLead({
      firstName: payload.first_name,
      email,
      company: payload.organization_name ?? null,
      assetSlug: plgFreeAuditSlug,
      source: null,
      utmSource: payload.utm_source ?? null,
      utmMedium: null,
      utmCampaign: payload.utm_campaign ?? null,
    });
    const attribution = outboundAttributionProperties(payload);
    schedule(
      c,
      recordCrmEvent(c.env, dependencies, {
        email,
        eventName: "plg_signup_lead_captured",
        lifecycleStage: "lead",
        nextStep: "create_account",
        contentLeadId: leadId,
        metadata: {
          lead_id: leadId,
          asset_slug: plgFreeAuditSlug,
          leakage_amount_bucket: amountBucket(payload.leakage_amount ?? null),
          property_name: payload.property_name ?? null,
          utm_source: payload.utm_source ?? null,
          utm_campaign: payload.utm_campaign ?? null,
          ...attribution,
        },
      }),
    );

    schedule(
      c,
      captureEvent(c.env, dependencies, {
        event: "plg_signup_lead_captured",
        email,
        properties: {
          lead_id: leadId,
          lead_type: "plg_free_audit",
          asset_slug: plgFreeAuditSlug,
          leakage_amount_bucket: amountBucket(payload.leakage_amount ?? null),
          utm_source: payload.utm_source ?? null,
          utm_campaign: payload.utm_campaign ?? null,
          ...attribution,
        },
      }),
    );
    schedule(
      c,
      resolveSequencer(c.env, dependencies).recordEvent({
        email,
        event: "signup_completed",
        metadata: {
          lead_id: leadId,
          source: "plg_free_audit",
          asset_slug: plgFreeAuditSlug,
          utm_source: payload.utm_source ?? null,
          utm_campaign: payload.utm_campaign ?? null,
          ...attribution,
        },
      }),
    );

    return c.json({ success: true, message: plgSignupMessage });
  });

  app.post("/leads/unsubscribe", async (c) => {
    const emailB64 = c.req.query("e");
    const token = c.req.query("t");

    if (!emailB64 || !token) {
      throw new HttpError(422, "validation_error", "e and t are required");
    }

    const email = await verifyUnsubscribeToken(
      emailB64,
      token,
      requireRuntimeSecret(c.env, "UNSUBSCRIBE_HMAC_SECRET"),
    );

    if (!email) {
      throw new HttpError(
        400,
        "invalid_unsubscribe_token",
        "Invalid or expired unsubscribe link.",
      );
    }

    const normalizedEmail = email.toLowerCase();
    await resolveRepository(c.env, dependencies).suppressEmail({
      email: normalizedEmail,
      reason: "user_unsubscribe",
    });
    await resolveRepository(c.env, dependencies).markContentLeadsUnsubscribed({
      email: normalizedEmail,
      unsubscribedAtIso: new Date().toISOString(),
    });
    await recordCrmEvent(c.env, dependencies, {
      email: normalizedEmail,
      eventName: "email_unsubscribed",
      lifecycleStage: "lead",
      nextStep: "do_not_email",
      emailSubscriptionStatus: "unsubscribed",
      metadata: {
        source: "capveri-unsubscribe-link",
      },
    }).catch(() => undefined);
    schedule(
      c,
      resolveSequencer(c.env, dependencies).unsubscribe({
        email: normalizedEmail,
        source: "capveri-unsubscribe-link",
      }),
    );

    return c.json({
      success: true,
      message:
        "You've been unsubscribed. You won't receive further marketing emails.",
    });
  });

  app.get("/leads/download/:token", async (c) => {
    const payload = await verifyDownloadToken(
      c.req.param("token"),
      requireRuntimeSecret(c.env, "DOCUMENT_ACCESS_SIGNING_SECRET"),
    );
    const asset = getLeadMagnetAsset(payload.assetSlug);

    if (!asset || !asset.enabled || asset.storagePath !== payload.storagePath) {
      throw new HttpError(404, "asset_not_found", "Download not found.");
    }

    const bucket = resolveBucket(c.env, dependencies);
    const object = await bucket.get(payload.storagePath);

    if (!object) {
      throw new HttpError(404, "asset_not_found", "Download not found.");
    }

    return new Response(object.body, {
      headers: {
        "content-type": contentTypeForStoragePath(payload.storagePath),
        "content-disposition": `attachment; filename="${filenameForPath(payload.storagePath)}"`,
        "cache-control": "private, max-age=0, no-store",
      },
    });
  });

  return app;
}

function requireAsset(
  slug: string,
  kind: "content" | "calculator",
): LeadMagnetAsset {
  const asset = getLeadMagnetAsset(slug);
  const valid =
    kind === "content"
      ? asset?.format === "pdf" || asset?.format === "xlsx"
      : asset?.format === "calculator_unlock";

  if (!asset || !valid) {
    const message =
      kind === "content"
        ? `Unknown asset_slug ${JSON.stringify(slug)}.`
        : `Unknown calculator slug: ${JSON.stringify(slug)}`;
    throw new HttpError(422, "unknown_lead_asset", message);
  }

  if (!asset.enabled) {
    throw new HttpError(
      422,
      "lead_asset_disabled",
      `Asset ${JSON.stringify(slug)} is not yet available.`,
    );
  }

  return asset;
}

async function requireVerifiedTurnstile(
  c: RouteContext,
  dependencies: LeadRouteDependencies,
  token: string | null,
): Promise<void> {
  const verified = await resolveTurnstile(c.env, dependencies).verify({
    token,
    remoteIp: clientIp(c.req.raw.headers),
  });

  if (!verified) {
    throw new HttpError(
      403,
      "forbidden",
      "Verification failed. Please try again.",
    );
  }
}

async function enforceLeadRateLimit(
  env: AppEnv,
  dependencies: LeadRouteDependencies,
  email: string,
  assetSlug: string,
): Promise<void> {
  const createdSinceIso = new Date(
    Date.now() - rateLimitWindowHours * 60 * 60 * 1000,
  ).toISOString();

  if (
    await resolveRepository(env, dependencies).hasRecentLead({
      email,
      assetSlug,
      createdSinceIso,
    })
  ) {
    throw new HttpError(
      429,
      "rate_limit_exceeded",
      "You have already requested this download. Check your email for the link.",
    );
  }
}

async function buildLeadDownloadUrl(
  c: RouteContext,
  dependencies: LeadRouteDependencies,
  input: { email: string; asset: LeadMagnetAsset },
): Promise<string> {
  const token = await buildDownloadToken(
    {
      email: input.email,
      assetSlug: input.asset.slug,
      storagePath: input.asset.storagePath,
      expiresAt: Math.floor(Date.now() / 1000) + downloadTtlSeconds,
    },
    requireRuntimeSecret(c.env, "DOCUMENT_ACCESS_SIGNING_SECRET"),
  );

  try {
    resolveBucket(c.env, dependencies);
  } catch {
    throw new HttpError(
      503,
      "lead_asset_storage_unavailable",
      "Download link is temporarily unavailable. Please try again shortly.",
    );
  }

  return `${apiBaseUrl(c.req.raw.url)}/api/v1/leads/download/${encodeURIComponent(token)}`;
}

async function sendDownloadEmail(
  env: AppEnv,
  dependencies: LeadRouteDependencies,
  input: {
    email: string;
    firstName: string;
    asset: LeadMagnetAsset;
    downloadUrl: string;
  },
): Promise<void> {
  const unsubscribe = await buildUnsubscribeToken(
    input.email,
    requireRuntimeSecret(env, "UNSUBSCRIBE_HMAC_SECRET"),
  );
  const appBaseUrl = env.APP_BASE_URL ?? "https://app.capveri.com";
  const marketingBaseUrl = env.MARKETING_BASE_URL ?? "https://www.capveri.com";
  const unsubscribeUrl = `${marketingBaseUrl.replace(/\/+$/u, "")}/unsubscribe?e=${encodeURIComponent(unsubscribe.emailB64)}&t=${encodeURIComponent(unsubscribe.token)}`;

  await resolveEmailSender(env, dependencies).sendContentDownload({
    toEmail: input.email,
    firstName: input.firstName,
    assetName: input.asset.displayName,
    downloadUrl: input.downloadUrl,
    unsubscribeUrl,
    registerUrl: `${appBaseUrl.replace(/\/+$/u, "")}/auth/register`,
  });
}

async function captureEvent(
  env: AppEnv,
  dependencies: LeadRouteDependencies,
  input: {
    event: string;
    email: string;
    properties: Record<string, unknown>;
  },
): Promise<void> {
  await resolveEvents(env, dependencies).capture(input);
}

class PostHogLeadEventCapturer implements LeadEventCapturer {
  constructor(private readonly env: AppEnv) {}

  async capture(input: {
    event: string;
    email: string;
    properties: Record<string, unknown>;
  }): Promise<void> {
    const apiKey = this.env.POSTHOG_PROJECT_API_KEY?.trim();
    if (!apiKey) {
      return;
    }

    const emailDomain = emailDomainFor(input.email);
    await fetch(
      `${(this.env.POSTHOG_HOST ?? "https://us.i.posthog.com").replace(/\/+$/u, "")}/capture/`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey,
          event: input.event,
          distinct_id: await leadDistinctId(input.email),
          properties: {
            ...(emailDomain ? { lead_email_domain: emailDomain } : {}),
            ...input.properties,
          },
        }),
      },
    );
  }
}

class VentoraSequencerClient implements SequencerClient {
  constructor(private readonly env: AppEnv) {}

  enroll(input: {
    email: string;
    sequenceSlug: string;
    externalId: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    return this.post("/api/v1/enrollments", {
      email: input.email,
      product: "capveri",
      sequence_slug: input.sequenceSlug,
      source: input.externalId,
      properties: input.metadata,
    });
  }

  recordEvent(input: {
    email: string;
    event: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    return this.post(
      "/api/v1/events",
      {
        email: input.email,
        product: "capveri",
        event: input.event,
        properties: input.metadata,
      },
      input.event === "signup_completed"
        ? `signup_completed:capveri:lead:${String(input.metadata.lead_id ?? input.email)}`
        : undefined,
    );
  }

  unsubscribe(input: { email: string; source: string }): Promise<void> {
    return this.post("/api/v1/unsubscribe", {
      email: input.email,
      product: "capveri",
      reason: input.source,
    });
  }

  private async post(
    path: string,
    payload: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<void> {
    const baseUrl = this.env.SEQUENCER_BASE_URL?.trim().replace(/\/+$/u, "");
    const clientId = this.env.SEQUENCER_CF_ACCESS_CLIENT_ID?.trim();
    const clientSecret = this.env.SEQUENCER_CF_ACCESS_CLIENT_SECRET?.trim();

    if (!baseUrl || !clientId || !clientSecret) {
      return;
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      "CF-Access-Client-Id": clientId,
      "CF-Access-Client-Secret": clientSecret,
    };

    if (idempotencyKey) {
      headers["Idempotency-Key"] = idempotencyKey;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Sequencer request failed");
    }
  }
}

function resolveRepository(
  env: AppEnv,
  dependencies: LeadRouteDependencies,
): LeadRepository {
  return (
    dependencies.repository ??
    new PostgresLeadRepository(createDirectPostgresExecutor(env))
  );
}

function resolveTurnstile(
  env: AppEnv,
  dependencies: LeadRouteDependencies,
): TurnstileVerifier {
  return dependencies.turnstile ?? new CloudflareTurnstileVerifier(env);
}

function resolveEmailSender(
  env: AppEnv,
  dependencies: LeadRouteDependencies,
): ContentDownloadSender {
  return dependencies.emailSender ?? new ResendContentDownloadEmailSender(env);
}

function resolveEvents(
  env: AppEnv,
  dependencies: LeadRouteDependencies,
): LeadEventCapturer {
  return dependencies.events ?? new PostHogLeadEventCapturer(env);
}

function resolveCrm(
  env: AppEnv,
  dependencies: LeadRouteDependencies,
): CrmRepository {
  return (
    dependencies.crm ?? new PostgresCrmRepository(createDirectPostgresExecutor(env))
  );
}

async function recordCrmEvent(
  env: AppEnv,
  dependencies: LeadRouteDependencies,
  input: {
    email: string;
    eventName: string;
    lifecycleStage: "lead";
    nextStep: string;
    contentLeadId?: string | null;
    emailSubscriptionStatus?: "subscribed" | "unsubscribed";
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  const event = {
    email: input.email,
    eventName: input.eventName,
    eventSource: "capveri-worker",
    lifecycleStage: input.lifecycleStage,
    nextStep: input.nextStep,
    contentLeadId: input.contentLeadId ?? null,
    occurredAt: new Date().toISOString(),
    metadata: input.metadata,
  };
  await resolveCrm(env, dependencies).recordEvent(
    input.emailSubscriptionStatus
      ? { ...event, emailSubscriptionStatus: input.emailSubscriptionStatus }
      : event,
  );
}

function resolveSequencer(
  env: AppEnv,
  dependencies: LeadRouteDependencies,
): SequencerClient {
  return dependencies.sequencer ?? new VentoraSequencerClient(env);
}

function resolveBucket(
  env: AppEnv,
  dependencies: LeadRouteDependencies,
): R2Bucket {
  const bucket = dependencies.bucket ?? env.LEAD_MAGNETS_BUCKET;
  if (!bucket) {
    throw new ConfigError("LEAD_MAGNETS_BUCKET binding is required");
  }

  return bucket;
}

function schedule(c: RouteContext, promise: Promise<void>): void {
  scheduleBestEffort(c, promise, {
    operation: "worker.best_effort.leads",
  });
}

function contentSequenceSlug(source: string | null): string {
  return contentSequenceBySource[source ?? ""] ?? defaultContentSequenceSlug;
}

function amountBucket(amount: string | number | null): string {
  if (amount === null || amount === "") {
    return "unknown";
  }

  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) {
    return "unknown";
  }
  if (parsed < 10_000) {
    return "0-10k";
  }
  if (parsed < 50_000) {
    return "10k-50k";
  }
  if (parsed < 100_000) {
    return "50k-100k";
  }
  if (parsed < 500_000) {
    return "100k-500k";
  }
  if (parsed < 1_000_000) {
    return "500k-1m";
  }

  return "1m+";
}

function outboundAttributionProperties(
  payload: Record<string, unknown>,
): Record<string, string> {
  const properties: Record<string, string> = {};
  for (const field of Object.keys(attributionSchema)) {
    const value = payload[field];
    if (typeof value === "string" && value.trim() !== "") {
      properties[field] = value;
    }
  }

  return properties;
}

function clientIp(headers: Headers): string | null {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null
  );
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}

function apiBaseUrl(url: string): string {
  const parsed = new URL(url);
  return parsed.origin;
}

function filenameForPath(path: string): string {
  return path.split("/").at(-1) ?? "download";
}

function contentTypeForStoragePath(path: string): string {
  if (path.endsWith(".pdf")) {
    return "application/pdf";
  }
  if (path.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  return "application/octet-stream";
}

function emailDomainFor(email: string): string | null {
  return email.trim().toLowerCase().split("@").at(-1) ?? null;
}

async function leadDistinctId(email: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  const digestBytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`capveri-lead:${normalizedEmail}`),
  );
  const digest = [...new Uint8Array(digestBytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const domain = emailDomainFor(normalizedEmail) ?? "unknown";

  return `lead:${domain}:${digest.slice(0, 16)}`;
}
