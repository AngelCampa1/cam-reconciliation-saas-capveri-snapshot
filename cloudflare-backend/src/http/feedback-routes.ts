import { Hono } from "hono";
import { z } from "zod";
import { PostgresFeedbackRepository } from "../adapters/db/feedback";
import { createDirectPostgresExecutor } from "../adapters/db/postgres";
import {
  ResendFeedbackNotificationSender,
  type FeedbackNotification,
  type FeedbackNotificationSender,
} from "../adapters/email/resend";
import {
  createFeedbackScreenshotStorage,
  FEEDBACK_SCREENSHOT_PREFIX,
  MAX_FEEDBACK_SCREENSHOT_BYTES,
  type FeedbackScreenshotStorage,
} from "../adapters/storage/feedback-screenshots";
import { CloudflareTurnstileVerifier } from "../adapters/security/turnstile";
import type { TurnstileVerifier } from "../adapters/security/turnstile";
import type {
  FeedbackRecord,
  FeedbackRepository,
  FeedbackStats,
} from "../domain/feedback/repository";
import type { AppEnv } from "../env";
import {
  authMiddleware,
  type AuthMiddlewareOptions,
  type AuthVariables,
} from "../middleware/auth";
import { ConfigError } from "../platform/cloudflare";
import { errorResponse, HttpError } from "./errors";
import { readMultipartForm } from "./multipart";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type FeedbackRouteDependencies = {
  repository?: FeedbackRepository;
  storage?: FeedbackScreenshotStorage;
  emailSender?: FeedbackNotificationSender;
  turnstile?: TurnstileVerifier;
  rateLimiter?: FeedbackRateLimiter;
  logger?: Pick<Console, "warn">;
  auth?: AuthMiddlewareOptions;
};

type FeedbackRateLimiter = {
  check(input: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<boolean>;
};

const FEEDBACK_RATE_LIMIT_COUNT = 3;
const FEEDBACK_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const SCREENSHOT_SIGNED_URL_TTL_SECONDS = 60 * 60;

const uuidSchema = z.string().uuid();
const feedbackTypeSchema = z.enum(["bug", "feature_request", "general"]);
const feedbackStatusSchema = z.enum([
  "new",
  "reviewed",
  "resolved",
  "dismissed",
]);
const createFeedbackSchema = z.object({
  type: feedbackTypeSchema,
  message: z.string().min(10).max(5000),
  page_url: z.string().max(2000),
  screenshot_url: z.string().max(4000).nullable().optional(),
  user_agent: z.string().max(500).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
const marketingFeedbackSchema = z.object({
  type: feedbackTypeSchema,
  message: z.string().min(10).max(2000),
  page_url: z.string().max(2000).default(""),
  user_agent: z.string().max(500).nullable().optional(),
  turnstile_token: z.string().max(2048).nullable().optional(),
  company_website: z.string().max(200).nullable().optional(),
});
const listFeedbackQuerySchema = z.object({
  type: feedbackTypeSchema.optional(),
  status: feedbackStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
});
const updateFeedbackSchema = z.object({
  status: feedbackStatusSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
const deleteScreenshotSchema = z.object({
  storage_path: z.string().min(1).max(4000),
});
const screenshotAccessQuerySchema = z.object({
  key: z.string().min(1),
  org_id: uuidSchema,
  expires: z.coerce.number().int().positive(),
  signature: z.string().min(64),
});

export function createFeedbackRoutes(
  dependencies: FeedbackRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));

  app.post("/feedback/marketing", async (c) => {
    const payload = marketingFeedbackSchema.parse(await parseJsonBody(c));

    if (payload.company_website) {
      return c.json({ status: "ok" });
    }

    const remoteIp = clientIp(c.req.raw.headers) ?? "unknown";
    const isRelaxedEnvironment = isRelaxedMarketingRateLimitEnvironment(
      c.env.ENVIRONMENT,
    );
    const allowed = await resolveRateLimiter(c.env, dependencies).check({
      key: `marketing-feedback:${remoteIp}`,
      limit: isRelaxedEnvironment ? 100 : 5,
      windowSeconds: isRelaxedEnvironment ? 60 : 60 * 60,
    });

    if (!allowed) {
      throw new HttpError(
        429,
        "rate_limit_exceeded",
        "Rate limit exceeded. Please try again later.",
      );
    }

    const verified = await resolveTurnstile(c.env, dependencies).verify({
      token: payload.turnstile_token ?? null,
      remoteIp,
    });

    if (!verified) {
      throw new HttpError(
        403,
        "forbidden",
        "Verification failed. Please try again.",
      );
    }

    await sendBestEffortFeedbackNotification(c.env, dependencies, {
      build: (adminEmail) => ({
        feedbackType: payload.type,
        message: payload.message,
        pageUrl: payload.page_url,
        userEmail: "anonymous (marketing site)",
        userId: "n/a",
        organizationId: "n/a",
        adminEmail,
      }),
      logMessage: "Failed to send marketing feedback notification",
    });

    return c.json({ status: "ok" });
  });

  app.get("/feedback/screenshot-file", async (c) => {
    const query = screenshotAccessQuerySchema.parse(c.req.query());

    if (query.expires < Math.floor(Date.now() / 1000)) {
      throw new HttpError(
        403,
        "screenshot_url_expired",
        "Screenshot URL expired",
      );
    }

    validateScreenshotKeyForOrganization(query.key, query.org_id);
    const expectedSignature = await signScreenshotAccessUrl({
      secret: requireScreenshotSigningSecret(c.env),
      key: query.key,
      organizationId: query.org_id,
      expires: query.expires,
    });

    if (!constantTimeEqual(query.signature, expectedSignature)) {
      throw new HttpError(
        403,
        "invalid_screenshot_signature",
        "Invalid screenshot URL",
      );
    }

    const storage = resolveStorage(c.env, dependencies);
    const [metadata, bytes] = await Promise.all([
      storage.headScreenshot(query.key),
      storage.getScreenshotBytes(query.key),
    ]);

    if (!bytes) {
      throw new HttpError(
        404,
        "feedback_screenshot_not_found",
        "Feedback screenshot not found",
      );
    }

    return new Response(bytes, {
      headers: {
        "cache-control": "private, max-age=300",
        "content-length": String(bytes.byteLength),
        "content-type": metadata?.contentType ?? "application/octet-stream",
        "x-content-type-options": "nosniff",
      },
    });
  });

  app.use("/feedback/*", authMiddleware(dependencies.auth));

  app.post("/feedback", async (c) => {
    const payload = createFeedbackSchema.parse(await parseJsonBody(c));
    const auth = c.get("auth");
    const repository = resolveRepository(c.env, dependencies);
    const recentCount = await repository.countRecentForUser({
      userId: auth.actor.userId,
      sinceIso: new Date(
        Date.now() - FEEDBACK_RATE_LIMIT_WINDOW_SECONDS * 1000,
      ).toISOString(),
    });

    if (recentCount >= FEEDBACK_RATE_LIMIT_COUNT) {
      throw new HttpError(
        429,
        "rate_limit_exceeded",
        `Rate limit exceeded. Maximum ${FEEDBACK_RATE_LIMIT_COUNT} submissions per hour.`,
      );
    }

    const screenshotPath = await resolveFeedbackScreenshotPath({
      screenshotReference: payload.screenshot_url ?? null,
      organizationId: auth.actor.organizationId,
      env: c.env,
    });
    const feedback = await repository.createFeedback({
      userId: auth.actor.userId,
      organizationId: auth.actor.organizationId,
      type: payload.type,
      message: payload.message,
      pageUrl: payload.page_url,
      screenshotUrl: screenshotPath,
      userAgent: payload.user_agent ?? null,
      metadata: payload.metadata,
    });
    const responseFeedback = await withSignedScreenshotUrl({
      feedback,
      env: c.env,
      dependencies,
      origin: new URL(c.req.url).origin,
    });

    await sendBestEffortFeedbackNotification(c.env, dependencies, {
      build: (adminEmail) => ({
        feedbackType: payload.type,
        message: payload.message,
        pageUrl: payload.page_url,
        userEmail: c.get("auth").user.email,
        userId: auth.actor.userId,
        organizationId: auth.actor.organizationId,
        screenshotUrl: responseFeedback.screenshot_url,
        adminEmail,
      }),
      logMessage: "Failed to send feedback notification",
    });

    return c.json(responseFeedback, 201);
  });

  app.get("/feedback", async (c) => {
    requireAdmin(c.get("auth").actor);

    const query = listFeedbackQuerySchema.parse(c.req.query());
    const auth = c.get("auth");
    const feedback = await resolveRepository(c.env, dependencies).listFeedback({
      organizationId: auth.actor.organizationId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      page: query.page,
      perPage: query.per_page,
    });

    return c.json(
      await Promise.all(
        feedback.map((record) =>
          withSignedScreenshotUrl({
            feedback: record,
            env: c.env,
            dependencies,
            origin: new URL(c.req.url).origin,
          }),
        ),
      ),
    );
  });

  app.get("/feedback/my", async (c) => {
    const auth = c.get("auth");
    const feedback = await resolveRepository(
      c.env,
      dependencies,
    ).listMyFeedback({
      userId: auth.actor.userId,
      limit: 20,
    });

    return c.json(feedback.map(toFeedbackResponse));
  });

  app.get("/feedback/stats/summary", async (c) => {
    requireAdmin(c.get("auth").actor);

    const stats = await resolveRepository(c.env, dependencies).getStats(
      c.get("auth").actor.organizationId,
    );

    return c.json(toStatsResponse(stats));
  });

  app.post("/feedback/screenshot", async (c) => {
    const auth = c.get("auth");
    rejectClearlyOversizedUpload(c.req.header("content-length"));

    const form = await readMultipartForm(c);
    const file = form.get("file");

    if (!(file instanceof File)) {
      throw new HttpError(400, "missing_file", "A screenshot file is required");
    }

    const contentType = file.type || "application/octet-stream";
    const storage = resolveStorage(c.env, dependencies);

    if (!storage.validateContentType(contentType)) {
      throw new HttpError(400, "invalid_file_type", "File must be an image");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    if (!storage.validateFileSize(bytes)) {
      throw new HttpError(
        400,
        "file_too_large",
        "File too large. Maximum size is 5MB.",
      );
    }

    const storagePath = storage.generateKey({
      organizationId: auth.actor.organizationId,
      contentType,
    });

    await storage.putScreenshot(storagePath, bytes, contentType);

    return c.json(
      {
        url: await createScreenshotAccessUrl({
          key: storagePath,
          origin: new URL(c.req.url).origin,
          secret: requireScreenshotSigningSecret(c.env),
          organizationId: auth.actor.organizationId,
        }),
        storage_path: storagePath,
      },
      201,
    );
  });

  app.delete("/feedback/screenshot", async (c) => {
    const auth = c.get("auth");
    const payload = deleteScreenshotSchema.parse(await parseJsonBody(c));

    validateScreenshotKeyForOrganization(
      payload.storage_path,
      auth.actor.organizationId,
    );
    await resolveStorage(c.env, dependencies).deleteScreenshot(
      payload.storage_path,
    );

    return c.body(null, 204);
  });

  app.get("/feedback/:feedbackId", async (c) => {
    requireAdmin(c.get("auth").actor);

    const feedbackId = uuidSchema.parse(c.req.param("feedbackId"));
    const auth = c.get("auth");
    const feedback = await resolveRepository(c.env, dependencies).getFeedback({
      feedbackId,
      organizationId: auth.actor.organizationId,
    });

    if (!feedback) {
      throw new HttpError(404, "feedback_not_found", "Feedback not found");
    }

    return c.json(
      await withSignedScreenshotUrl({
        feedback,
        env: c.env,
        dependencies,
        origin: new URL(c.req.url).origin,
      }),
    );
  });

  app.patch("/feedback/:feedbackId", async (c) => {
    requireAdmin(c.get("auth").actor);

    const feedbackId = uuidSchema.parse(c.req.param("feedbackId"));
    const payload = updateFeedbackSchema.parse(await parseJsonBody(c));

    if (payload.status === undefined && payload.metadata === undefined) {
      throw new HttpError(400, "no_updates", "No updates provided");
    }

    const feedback = await resolveRepository(
      c.env,
      dependencies,
    ).updateFeedback({
      feedbackId,
      organizationId: c.get("auth").actor.organizationId,
      ...(payload.status ? { status: payload.status } : {}),
      ...(payload.metadata !== undefined ? { metadata: payload.metadata } : {}),
    });

    if (!feedback) {
      throw new HttpError(404, "feedback_not_found", "Feedback not found");
    }

    return c.json(toFeedbackResponse(feedback));
  });

  app.delete("/feedback/:feedbackId", async (c) => {
    requireAdmin(c.get("auth").actor);

    const feedbackId = uuidSchema.parse(c.req.param("feedbackId"));
    const organizationId = c.get("auth").actor.organizationId;
    const repository = resolveRepository(c.env, dependencies);
    const feedback = await repository.getFeedback({
      feedbackId,
      organizationId,
    });

    if (!feedback) {
      throw new HttpError(404, "feedback_not_found", "Feedback not found");
    }

    if (feedback.metadata.prod_e2e !== true) {
      throw new HttpError(
        403,
        "feedback_delete_forbidden",
        "Only production E2E feedback can be deleted",
      );
    }

    if (feedback.screenshotUrl?.startsWith(FEEDBACK_SCREENSHOT_PREFIX)) {
      validateScreenshotKeyForOrganization(
        feedback.screenshotUrl,
        organizationId,
      );
      await resolveStorage(c.env, dependencies).deleteScreenshot(
        feedback.screenshotUrl,
      );
    }

    await repository.deleteFeedback({
      feedbackId,
      organizationId,
    });

    return c.body(null, 204);
  });

  return app;
}

function toFeedbackResponse(feedback: FeedbackRecord) {
  return {
    id: feedback.id,
    user_id: feedback.userId,
    organization_id: feedback.organizationId,
    type: feedback.type,
    status: feedback.status,
    message: feedback.message,
    page_url: feedback.pageUrl,
    screenshot_url: feedback.screenshotUrl,
    user_agent: feedback.userAgent,
    metadata: feedback.metadata,
    created_at: feedback.createdAt,
    updated_at: feedback.updatedAt,
  };
}

function toStatsResponse(stats: FeedbackStats) {
  return {
    total: stats.total,
    by_type: stats.byType,
    by_status: stats.byStatus,
  };
}

async function withSignedScreenshotUrl(input: {
  feedback: FeedbackRecord;
  env: AppEnv;
  dependencies: FeedbackRouteDependencies;
  origin: string;
}) {
  const response = toFeedbackResponse(input.feedback);

  if (
    input.feedback.screenshotUrl?.startsWith(FEEDBACK_SCREENSHOT_PREFIX) ===
    true
  ) {
    response.screenshot_url = await createScreenshotAccessUrl({
      key: input.feedback.screenshotUrl,
      origin: input.origin,
      secret: requireScreenshotSigningSecret(input.env),
      organizationId: input.feedback.organizationId,
    });
  }

  return response;
}

async function resolveFeedbackScreenshotPath(input: {
  screenshotReference: string | null;
  organizationId: string;
  env: AppEnv;
}): Promise<string | null> {
  const { screenshotReference, organizationId } = input;

  if (!screenshotReference) {
    return null;
  }

  if (screenshotReference.startsWith(FEEDBACK_SCREENSHOT_PREFIX)) {
    validateScreenshotKeyForOrganization(screenshotReference, organizationId);

    return screenshotReference;
  }

  let parsed: URL;

  try {
    parsed = new URL(screenshotReference);
  } catch {
    throw invalidScreenshotReference();
  }

  if (!parsed.pathname.endsWith("/api/v1/feedback/screenshot-file")) {
    throw invalidScreenshotReference();
  }

  const query = screenshotAccessQuerySchema.parse(
    Object.fromEntries(parsed.searchParams.entries()),
  );

  if (query.org_id !== organizationId) {
    throw invalidScreenshotReference();
  }

  if (query.expires < Math.floor(Date.now() / 1000)) {
    throw invalidScreenshotReference();
  }

  validateScreenshotKeyForOrganization(query.key, organizationId);
  const expectedSignature = await signScreenshotAccessUrl({
    secret: requireScreenshotSigningSecret(input.env),
    key: query.key,
    organizationId,
    expires: query.expires,
  });

  if (!constantTimeEqual(query.signature, expectedSignature)) {
    throw invalidScreenshotReference();
  }

  return query.key;
}

function invalidScreenshotReference(): HttpError {
  return new HttpError(
    400,
    "invalid_screenshot_reference",
    "Screenshot reference must be a current signed CapVeri feedback screenshot URL",
  );
}

function validateScreenshotKeyForOrganization(
  key: string,
  organizationId: string,
): void {
  const expectedPrefix = `${FEEDBACK_SCREENSHOT_PREFIX}${organizationId}/`;

  if (!key.startsWith(expectedPrefix)) {
    throw new HttpError(
      400,
      "invalid_screenshot_path",
      "Screenshot path is outside the current organization",
    );
  }

  const filename = key.slice(expectedPrefix.length);

  if (
    filename === "" ||
    filename === "." ||
    filename === ".." ||
    filename.includes("/") ||
    filename.includes("\\") ||
    !/\.(gif|jpe?g|png|webp)$/iu.test(filename)
  ) {
    throw new HttpError(
      400,
      "invalid_screenshot_path",
      "Screenshot path is not a valid feedback screenshot object",
    );
  }
}

async function createScreenshotAccessUrl(input: {
  key: string;
  origin: string;
  secret: string;
  organizationId: string;
}): Promise<string> {
  const expires =
    Math.floor(Date.now() / 1000) + SCREENSHOT_SIGNED_URL_TTL_SECONDS;
  const signature = await signScreenshotAccessUrl({
    secret: input.secret,
    key: input.key,
    organizationId: input.organizationId,
    expires,
  });
  const url = new URL("/api/v1/feedback/screenshot-file", input.origin);
  url.searchParams.set("key", input.key);
  url.searchParams.set("org_id", input.organizationId);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature);

  return url.toString();
}

async function signScreenshotAccessUrl(input: {
  secret: string;
  key: string;
  organizationId: string;
  expires: number;
}): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(input.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(
      [input.key, input.organizationId, input.expires].join("."),
    ),
  );

  return bytesToHex(new Uint8Array(signature));
}

function requireScreenshotSigningSecret(env: AppEnv): string {
  if (!env.DOCUMENT_ACCESS_SIGNING_SECRET) {
    throw new HttpError(
      500,
      "screenshot_signing_not_configured",
      "Feedback screenshot signing is not configured",
    );
  }

  return env.DOCUMENT_ACCESS_SIGNING_SECRET;
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function rejectClearlyOversizedUpload(contentLength: string | undefined): void {
  if (!contentLength) {
    return;
  }

  const parsed = Number.parseInt(contentLength, 10);

  if (
    Number.isFinite(parsed) &&
    parsed > MAX_FEEDBACK_SCREENSHOT_BYTES + 1024 * 1024
  ) {
    throw new HttpError(
      400,
      "file_too_large",
      "File too large. Maximum size is 5MB.",
    );
  }
}

function requireAdmin(actor: AuthVariables["auth"]["actor"]): void {
  if (
    actor.party === "landlord" &&
    (actor.role === "owner" || actor.role === "admin")
  ) {
    return;
  }

  throw new HttpError(
    403,
    "insufficient_permissions",
    "Admin privileges required",
  );
}

function isRelaxedMarketingRateLimitEnvironment(
  environment: string | undefined,
): boolean {
  return environment === "development" || environment === "test";
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(
      422,
      "validation_error",
      "Request body must be valid JSON",
    );
  }
}

function clientIp(headers: Headers): string | null {
  const cfConnectingIp = headers.get("cf-connecting-ip");

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

function resolveRepository(
  env: AppEnv,
  dependencies: FeedbackRouteDependencies,
): FeedbackRepository {
  return (
    dependencies.repository ??
    new PostgresFeedbackRepository(createDirectPostgresExecutor(env))
  );
}

function resolveStorage(
  env: AppEnv,
  dependencies: FeedbackRouteDependencies,
): FeedbackScreenshotStorage {
  return dependencies.storage ?? createFeedbackScreenshotStorage(env);
}

function resolveEmailSender(
  env: AppEnv,
  dependencies: FeedbackRouteDependencies,
): FeedbackNotificationSender {
  return dependencies.emailSender ?? new ResendFeedbackNotificationSender(env);
}

async function sendBestEffortFeedbackNotification(
  env: AppEnv,
  dependencies: FeedbackRouteDependencies,
  input: {
    build: (adminEmail: string) => FeedbackNotification;
    logMessage: string;
  },
): Promise<void> {
  try {
    const adminEmail = requireBinding(
      env.ADMIN_NOTIFICATION_EMAIL,
      "ADMIN_NOTIFICATION_EMAIL",
    );
    await resolveEmailSender(env, dependencies).sendFeedbackNotification(
      input.build(adminEmail),
    );
  } catch (error) {
    dependencies.logger?.warn(input.logMessage, {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function resolveTurnstile(
  env: AppEnv,
  dependencies: FeedbackRouteDependencies,
): TurnstileVerifier {
  return dependencies.turnstile ?? new CloudflareTurnstileVerifier(env);
}

function resolveRateLimiter(
  env: AppEnv,
  dependencies: FeedbackRouteDependencies,
): FeedbackRateLimiter {
  return dependencies.rateLimiter ?? new DurableObjectFeedbackRateLimiter(env);
}

class DurableObjectFeedbackRateLimiter implements FeedbackRateLimiter {
  constructor(private readonly env: AppEnv) {}

  async check(input: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<boolean> {
    const id = this.env.RATE_LIMITER.idFromName(input.key);
    const stub = this.env.RATE_LIMITER.get(id);
    const response = await stub.fetch("https://rate-limit.local/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error("Rate limiter request failed");
    }

    const payload = (await response.json()) as { allowed?: boolean };

    return payload.allowed === true;
  }
}

function requireBinding(value: string | undefined, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`Missing required runtime binding: ${name}`);
  }

  return value;
}
