import { DurableObject } from "cloudflare:workers";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppEnv, RuntimeSecrets } from "../env";
import { HttpError } from "../http/errors";

export type RequiredSecretName = keyof Pick<
  RuntimeSecrets,
  | "OPENROUTER_API_KEY"
  | "STRIPE_SECRET_KEY"
  | "STRIPE_WEBHOOK_SECRET"
  | "CHECKOUT_OFFER_TOKEN_SECRET"
  | "RESEND_API_KEY"
  | "RESEND_WEBHOOK_SECRET"
  | "TURNSTILE_SECRET_KEY"
  | "DOCUMENT_ACCESS_SIGNING_SECRET"
  | "UNSUBSCRIBE_HMAC_SECRET"
>;

export class ConfigError extends HttpError {
  constructor(message: string, status: ContentfulStatusCode = 500) {
    super(status, "config_error", message);
  }
}

export function requireRuntimeSecret(
  env: Partial<AppEnv>,
  name: RequiredSecretName,
): string {
  const value = env[name];

  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`Missing required runtime secret: ${name}`);
  }

  return value;
}

export function requireRuntimeSecrets(
  env: Partial<AppEnv>,
  names: readonly RequiredSecretName[],
): Record<RequiredSecretName, string> {
  return names.reduce<Record<RequiredSecretName, string>>(
    (secrets, name) => ({
      ...secrets,
      [name]: requireRuntimeSecret(env, name),
    }),
    {} as Record<RequiredSecretName, string>,
  );
}

type RuntimeValidationEnv = {
  ENVIRONMENT?: string;
  CHECKOUT_OFFER_TOKEN_SECRET?: string;
  DOCUMENT_ACCESS_SIGNING_SECRET?: string;
  UNSUBSCRIBE_HMAC_SECRET?: string;
};

export function validateRuntimeEnvironment(env: RuntimeValidationEnv): void {
  if (env.ENVIRONMENT !== "production") {
    return;
  }

  if (
    typeof env.DOCUMENT_ACCESS_SIGNING_SECRET !== "string" ||
    env.DOCUMENT_ACCESS_SIGNING_SECRET.trim() === ""
  ) {
    throw new ConfigError(
      "Missing required runtime secret: DOCUMENT_ACCESS_SIGNING_SECRET",
    );
  }

  if (
    typeof env.CHECKOUT_OFFER_TOKEN_SECRET !== "string" ||
    env.CHECKOUT_OFFER_TOKEN_SECRET.trim() === ""
  ) {
    throw new ConfigError(
      "Missing required runtime secret: CHECKOUT_OFFER_TOKEN_SECRET",
    );
  }

  if (
    typeof env.UNSUBSCRIBE_HMAC_SECRET !== "string" ||
    env.UNSUBSCRIBE_HMAC_SECRET.trim() === ""
  ) {
    throw new ConfigError(
      "Missing required runtime secret: UNSUBSCRIBE_HMAC_SECRET",
    );
  }
}

export class RateLimiterDurableObject extends DurableObject {
  override async fetch(request: Request): Promise<Response> {
    if (
      new URL(request.url).pathname !== "/check" ||
      request.method !== "POST"
    ) {
      return Response.json({ status: "ready" });
    }

    const payload = (await request.json()) as {
      key?: unknown;
      limit?: unknown;
      windowSeconds?: unknown;
    };

    if (
      typeof payload.key !== "string" ||
      typeof payload.limit !== "number" ||
      typeof payload.windowSeconds !== "number"
    ) {
      return Response.json(
        { error: "invalid_rate_limit_request" },
        { status: 400 },
      );
    }

    const now = Date.now();
    const windowStart = now - payload.windowSeconds * 1000;
    const timestamps = (
      (await this.ctx.storage.get<number[]>(payload.key)) ?? []
    ).filter((timestamp) => timestamp > windowStart);
    const allowed = timestamps.length < payload.limit;

    if (allowed) {
      timestamps.push(now);
      await this.ctx.storage.put(payload.key, timestamps);
    }

    return Response.json({
      allowed,
      remaining: Math.max(payload.limit - timestamps.length, 0),
    });
  }
}

export class AiContextNonceDurableObject extends DurableObject {
  override async fetch(request: Request): Promise<Response> {
    if (
      new URL(request.url).pathname !== "/consume" ||
      request.method !== "POST"
    ) {
      return Response.json({ status: "ready" });
    }

    const payload = (await request.json()) as {
      nonce?: unknown;
      timestamp?: unknown;
    };

    if (typeof payload.nonce !== "string" || payload.nonce.trim() === "") {
      return Response.json({ consumed: false }, { status: 400 });
    }

    if (typeof payload.timestamp !== "string") {
      return Response.json({ consumed: false }, { status: 400 });
    }

    const timestampMs = Date.parse(payload.timestamp);
    if (!Number.isFinite(timestampMs)) {
      return Response.json({ consumed: false });
    }

    const now = Date.now();
    const maxSkewMs = 5 * 60 * 1000;
    const expiresAt = timestampMs + maxSkewMs;
    if (expiresAt <= now) {
      return Response.json({ consumed: false });
    }

    const existing = await this.ctx.storage.get<number>(payload.nonce);
    if (existing && existing > now) {
      return Response.json({ consumed: false });
    }

    await this.ctx.storage.put(payload.nonce, expiresAt);
    await this.ctx.storage.setAlarm(expiresAt + 60_000);

    return Response.json({ consumed: true });
  }

  override async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll();
  }
}
