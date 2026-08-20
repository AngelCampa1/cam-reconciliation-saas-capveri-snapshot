import { ZodError } from "zod";
import type { AppEnv } from "../env";
import { HttpError } from "../http/errors";

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gu;
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu;
const IP_RE =
  /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/gu;

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "secret",
  "api_key",
  "authorization",
  "cookie",
]);

export type WorkerSentryContext = {
  operation: string;
  method?: string;
  path?: string;
  statusCode?: number;
};

type SentryDsn = {
  dsn: string;
  endpoint: string;
  publicKey: string;
};

function scrubString(value: string): string {
  return value
    .replace(JWT_RE, "[token]")
    .replace(EMAIL_RE, "[email]")
    .replace(IP_RE, "[ip]");
}

function scrubValue(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item));
  }
  if (value !== null && typeof value === "object") {
    const scrubbed: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      scrubbed[key] = SENSITIVE_KEYS.has(key.toLowerCase())
        ? "[redacted]"
        : scrubValue(nestedValue);
    }
    return scrubbed;
  }
  return value;
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function shouldReport(error: unknown, statusCode?: number): boolean {
  if (error instanceof ZodError) {
    return false;
  }
  if (error instanceof HttpError) {
    return error.status >= 500;
  }
  if (typeof statusCode === "number") {
    return statusCode >= 500;
  }
  return error instanceof Error;
}

function parseDsn(dsn: string): SentryDsn | null {
  try {
    const parsed = new URL(dsn);
    const publicKey = parsed.username;
    const projectId = parsed.pathname.split("/").filter(Boolean).at(-1);

    if (!publicKey || !projectId) {
      return null;
    }

    return {
      dsn,
      endpoint: `${parsed.origin}/api/${projectId}/envelope/`,
      publicKey,
    };
  } catch {
    return null;
  }
}

function eventId(): string {
  return crypto.randomUUID().replace(/-/gu, "");
}

export async function captureWorkerException(
  env: Partial<AppEnv>,
  error: unknown,
  context: WorkerSentryContext,
): Promise<void> {
  if (!shouldReport(error, context.statusCode)) {
    return;
  }

  const dsn = typeof env.SENTRY_DSN === "string" ? env.SENTRY_DSN.trim() : "";
  if (!dsn) {
    return;
  }

  const parsed = parseDsn(dsn);
  if (!parsed) {
    return;
  }

  const normalizedError = toError(error);
  const sentAt = new Date().toISOString();
  const event = {
    event_id: eventId(),
    timestamp: sentAt,
    platform: "javascript",
    level: "error",
    environment: env.ENVIRONMENT,
    release: env.APP_VERSION,
    exception: {
      values: [
        {
          type: normalizedError.name || "Error",
          value: scrubString(normalizedError.message),
          mechanism: { type: "cloudflare-worker", handled: true },
        },
      ],
    },
    tags: {
      surface: "cloudflare-backend",
      operation: context.operation,
      ...(context.method ? { method: context.method } : {}),
      ...(context.path ? { path: context.path } : {}),
      ...(context.statusCode !== undefined
        ? { status_code: String(context.statusCode) }
        : {}),
    },
    extra: scrubValue({
      stack: normalizedError.stack,
    }),
  };

  const envelope = [
    JSON.stringify({ event_id: event.event_id, dsn: parsed.dsn, sent_at: sentAt }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");

  try {
    await fetch(parsed.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=capveri-cloudflare-worker/1.0`,
      },
      body: envelope,
    });
  } catch {
    // Reporting must never become the user-facing or retry-path failure.
  }
}
