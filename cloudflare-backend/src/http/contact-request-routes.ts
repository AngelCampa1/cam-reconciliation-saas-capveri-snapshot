import { Hono } from "hono";
import { z } from "zod";
import { ResendContactNotificationSender } from "../adapters/email/resend";
import { CloudflareTurnstileVerifier } from "../adapters/security/turnstile";
import {
  CONTACT_REQUEST_SUCCESS_MESSAGE,
  ContactRequestService,
  type ContactRateLimiter,
} from "../domain/contact/contact-request-service";
import type { AppEnv } from "../env";
import type { AuthVariables } from "../middleware/auth";
import { ConfigError } from "../platform/cloudflare";
import { captureWorkerException } from "../platform/sentry";
import { HttpError, errorResponse } from "./errors";

type RouteBindings = { Bindings: AppEnv; Variables: AuthVariables };

export type ContactRequestRouteDependencies = {
  service?: ContactRequestService;
};

const optionalNullableString = (maxLength: number) =>
  z.string().trim().max(maxLength).nullable().optional();

const contactRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  inquiry_type: z.string().trim().min(1).max(50),
  company: optionalNullableString(200),
  phone: optionalNullableString(50),
  message: optionalNullableString(5000),
  turnstile_token: z.string().max(2048).nullable().optional(),
  company_website: optionalNullableString(200),
});

export function createContactRequestRoutes(
  dependencies: ContactRequestRouteDependencies = {},
): Hono<RouteBindings> {
  const app = new Hono<RouteBindings>();

  app.onError((error, c) => errorResponse(c, error));

  app.post("/contact-requests", async (c) => {
    const payload = contactRequestSchema.parse(await parseJsonBody(c));
    const service = dependencies.service ?? createService(c.env);

    await service.submit({
      name: payload.name,
      email: payload.email,
      inquiryType: payload.inquiry_type,
      company: payload.company ?? null,
      phone: payload.phone ?? null,
      message: payload.message ?? null,
      turnstileToken: payload.turnstile_token ?? null,
      companyWebsite: payload.company_website ?? null,
      remoteIp: clientIp(c.req.raw.headers),
    });

    return c.json(
      { success: true, message: CONTACT_REQUEST_SUCCESS_MESSAGE },
      201,
    );
  });

  return app;
}

function createService(env: AppEnv): ContactRequestService {
  return new ContactRequestService({
    turnstile: new CloudflareTurnstileVerifier(env),
    rateLimiter: new DurableObjectContactRateLimiter(env),
    emailSender: new ResendContactNotificationSender(env),
    adminEmail: requireBinding(
      env.ADMIN_NOTIFICATION_EMAIL,
      "ADMIN_NOTIFICATION_EMAIL",
    ),
    logger: console,
    reportNotificationFailure: (error) =>
      captureWorkerException(env, error, {
        operation: "worker.contact_request.notification",
        method: "POST",
        path: "/api/v1/contact-requests",
        statusCode: 500,
      }),
  });
}

class DurableObjectContactRateLimiter implements ContactRateLimiter {
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

function clientIp(headers: Headers): string | null {
  const cfConnectingIp = headers.get("cf-connecting-ip");

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

async function parseJsonBody(c: { req: { json: () => Promise<unknown> } }) {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be valid JSON");
  }
}

function requireBinding(value: string | undefined, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`Missing required runtime binding: ${name}`);
  }

  return value;
}
