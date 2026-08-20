import { Hono } from "hono";
import { resendApiBaseUrl } from "../adapters/email/resend";
import type { AppEnv } from "../env";
import type { AuthVariables } from "../middleware/auth";
import { requireRuntimeSecret } from "../platform/cloudflare";
import { captureWorkerException } from "../platform/sentry";
import { errorResponse, HttpError } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

// Only forward emails destined for CapVeri-owned domains.
const CAPVERI_DOMAINS = new Set(["capveri.com"]);

export type ResendWebhookEmailForwarder = {
  forward(input: {
    env: AppEnv;
    toEmail: string;
    originalFrom: string;
    originalTo: string;
    subject: string;
    html: string | null;
    text: string | null;
  }): Promise<void>;
};

export type ResendWebhookRouteDependencies = {
  emailForwarder?: ResendWebhookEmailForwarder;
};

export function createResendWebhookRoutes(
  dependencies: ResendWebhookRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));

  app.post("/api/v1/webhooks/resend", async (c) => {
    const rawBody = await c.req.text();
    const signatureHeader = c.req.header("svix-signature") ?? null;
    const timestampHeader = c.req.header("svix-timestamp") ?? null;
    const idHeader = c.req.header("svix-id") ?? null;

    if (!signatureHeader || !timestampHeader || !idHeader) {
      throw new HttpError(
        400,
        "missing_signature",
        "Missing svix-signature header",
      );
    }

    const secret = requireRuntimeSecret(c.env, "RESEND_WEBHOOK_SECRET");

    await verifySvixSignature({
      rawBody,
      svixId: idHeader,
      svixTimestamp: timestampHeader,
      svixSignature: signatureHeader,
      secret,
    });

    let event: unknown;

    try {
      event = JSON.parse(rawBody);
    } catch {
      throw new HttpError(400, "invalid_json", "Invalid JSON payload");
    }

    if (!isRecord(event)) {
      throw new HttpError(400, "invalid_json", "Payload must be an object");
    }

    const eventType = readString(event.type);

    if (eventType === "email.received") {
      const data = isRecord(event.data) ? event.data : null;
      const forwarder =
        dependencies.emailForwarder ?? new ResendEmailForwarder();

      await handleInboundEmail({ data, env: c.env, forwarder });
    }

    return c.json({ received: true });
  });

  return app;
}

// ---------------------------------------------------------------------------
// Svix signature verification (HMAC-SHA256)
// Resend uses Svix for webhook delivery.
// Signed content: "<svix-id>.<svix-timestamp>.<raw-body>"
// Header format: "v1,<base64-signature> v1,<base64-signature> ..."
// ---------------------------------------------------------------------------

async function verifySvixSignature(input: {
  rawBody: string;
  svixId: string;
  svixTimestamp: string;
  svixSignature: string;
  secret: string;
}): Promise<void> {
  // Parse timestamp and enforce a 5-minute staleness window.
  const timestamp = Number(input.svixTimestamp);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    throw new HttpError(400, "malformed_signature", "Invalid svix-timestamp");
  }

  const nowSeconds = Math.floor(Date.now() / 1000);

  if (Math.abs(nowSeconds - timestamp) > 300) {
    throw new HttpError(400, "stale_signature", "Svix signature is stale");
  }

  // Signed content per Svix spec.
  const signedContent = `${input.svixId}.${input.svixTimestamp}.${input.rawBody}`;

  // Svix secrets are base64-encoded; strip the optional "whsec_" prefix.
  const rawSecret = input.secret.startsWith("whsec_")
    ? input.secret.slice("whsec_".length)
    : input.secret;

  const secretBytes = base64Decode(rawSecret);
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signatureBytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent),
  );
  const expectedBase64 = base64Encode(new Uint8Array(signatureBytes));

  // svix-signature header: "v1,<base64> v1,<base64> ..."
  // (space-separated; each entry is "v1,<hash>")
  const receivedSignatures = input.svixSignature.split(" ").flatMap((part) => {
    const comma = part.indexOf(",");

    if (comma === -1) {
      return [];
    }

    const prefix = part.slice(0, comma);
    const value = part.slice(comma + 1);

    return prefix === "v1" && value.length > 0 ? [value] : [];
  });

  if (receivedSignatures.length === 0) {
    throw new HttpError(
      400,
      "malformed_signature",
      "No v1 signatures in svix-signature header",
    );
  }

  const matched = receivedSignatures.some((received) =>
    constantTimeEqualBase64(expectedBase64, received),
  );

  if (!matched) {
    throw new HttpError(400, "invalid_signature", "Invalid webhook signature");
  }
}

// ---------------------------------------------------------------------------
// Inbound email handling
// ---------------------------------------------------------------------------

async function handleInboundEmail(input: {
  data: Record<string, unknown> | null;
  env: AppEnv;
  forwarder: ResendWebhookEmailForwarder;
}): Promise<void> {
  if (!input.data) {
    return;
  }

  const originalFrom = readString(input.data.from);
  const originalTo = readString(input.data.to);
  const subject = readString(input.data.subject) ?? "(No Subject)";
  const html = readString(input.data.html);
  const text = readString(input.data.text);

  // Only process emails destined for CapVeri-owned domains.
  if (!isCapveriRecipient(originalTo)) {
    return;
  }

  const adminEmail = input.env.ADMIN_NOTIFICATION_EMAIL;

  if (!adminEmail) {
    return;
  }

  // Best-effort: swallow errors so Resend does not retry on forwarding failure.
  try {
    await input.forwarder.forward({
      env: input.env,
      toEmail: adminEmail,
      originalFrom: originalFrom ?? "unknown@unknown.com",
      originalTo: originalTo ?? "unknown@unknown.com",
      subject,
      html,
      text,
    });
  } catch (error) {
    // Keep webhook success semantics so Resend does not retry, but report the
    // hidden forwarding failure for operations follow-up.
    await captureWorkerException(input.env, error, {
      operation: "worker.resend_webhook.forward_inbound_email",
      method: "POST",
      path: "/api/v1/webhooks/resend",
    });
  }
}

function isCapveriRecipient(to: string | null): boolean {
  if (!to) {
    return false;
  }

  const atIndex = to.lastIndexOf("@");

  if (atIndex === -1) {
    return false;
  }

  const domain = to.slice(atIndex + 1).toLowerCase();

  return CAPVERI_DOMAINS.has(domain);
}

// ---------------------------------------------------------------------------
// Default email forwarder — calls Resend API directly.
// ---------------------------------------------------------------------------

class ResendEmailForwarder implements ResendWebhookEmailForwarder {
  async forward(input: {
    env: AppEnv;
    toEmail: string;
    originalFrom: string;
    originalTo: string;
    subject: string;
    html: string | null;
    text: string | null;
  }): Promise<void> {
    const apiKey = requireRuntimeSecret(input.env, "RESEND_API_KEY");
    const fromAddress =
      input.env.RESEND_FROM_ADDRESS ?? "CapVeri <angel.campa@capveri.com>";
    const forwardedSubject = `[Fwd: ${input.originalTo}] ${input.subject}`;

    const body: Record<string, unknown> = {
      from: fromAddress,
      to: input.toEmail,
      subject: forwardedSubject,
      reply_to: input.originalFrom,
    };

    if (input.html) {
      body.html = buildForwardHtml(input);
    }

    if (input.text) {
      body.text = `From: ${input.originalFrom}\nTo: ${input.originalTo}\nSubject: ${input.subject}\n\n${input.text}`;
    }

    const response = await fetch(`${resendApiBaseUrl(input.env)}/emails`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Resend API error: ${response.status}`);
    }
  }
}

function buildForwardHtml(input: {
  originalFrom: string;
  originalTo: string;
  subject: string;
  html: string | null;
}): string {
  const esc = (s: string) =>
    s
      .replace(/&/gu, "&amp;")
      .replace(/</gu, "&lt;")
      .replace(/>/gu, "&gt;")
      .replace(/"/gu, "&quot;");

  return [
    "<!doctype html><html><body",
    ' style="font-family: Arial, sans-serif; color: #172033; line-height: 1.6;">',
    `<p><strong>From:</strong> ${esc(input.originalFrom)}</p>`,
    `<p><strong>To:</strong> ${esc(input.originalTo)}</p>`,
    `<p><strong>Subject:</strong> ${esc(input.subject)}</p>`,
    "<hr/>",
    input.html ?? "",
    "</body></html>",
  ].join("");
}

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function constantTimeEqualBase64(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let diff = 0;

  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return diff === 0;
}

function base64Decode(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function base64Encode(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}
