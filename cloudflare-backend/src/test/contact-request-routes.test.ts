import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  CloudflareTurnstileVerifier,
  resolveTurnstileSiteverifyUrl,
} from "../adapters/security/turnstile";
import {
  CONTACT_REQUEST_SUCCESS_MESSAGE,
  ContactRequestService,
} from "../domain/contact/contact-request-service";
import type { AppEnv } from "../env";
import { createContactRequestRoutes } from "../http/contact-request-routes";
import type { AuthVariables } from "../middleware/auth";

class MemoryTurnstileVerifier {
  calls: Array<{ token: string | null; remoteIp: string | null }> = [];
  result = true;

  async verify(input: {
    token: string | null;
    remoteIp: string | null;
  }): Promise<boolean> {
    this.calls.push(input);

    return this.result;
  }
}

class MemoryRateLimiter {
  calls: Array<{ key: string; limit: number; windowSeconds: number }> = [];
  result = true;

  async check(input: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<boolean> {
    this.calls.push(input);

    return this.result;
  }
}

class MemoryContactEmailSender {
  calls: Array<{
    adminEmail: string;
    name: string;
    email: string;
    inquiryType: string;
  }> = [];
  fail = false;
  failureMessage = "resend unavailable";

  async sendContactNotification(input: {
    adminEmail: string;
    name: string;
    email: string;
    inquiryType: string;
  }): Promise<void> {
    if (this.fail) {
      throw new Error(this.failureMessage);
    }

    this.calls.push(input);
  }
}

class MemoryLogger {
  errors: Array<{ message: string; metadata: unknown }> = [];

  error(message: string, metadata: unknown): void {
    this.errors.push({ message, metadata });
  }
}

function createTestApp(
  options: {
    turnstile?: MemoryTurnstileVerifier;
    rateLimiter?: MemoryRateLimiter;
    emailSender?: MemoryContactEmailSender;
    logger?: MemoryLogger;
    reportNotificationFailure?: (error: unknown) => Promise<void> | void;
  } = {},
) {
  const turnstile = options.turnstile ?? new MemoryTurnstileVerifier();
  const rateLimiter = options.rateLimiter ?? new MemoryRateLimiter();
  const emailSender = options.emailSender ?? new MemoryContactEmailSender();
  const logger = options.logger ?? new MemoryLogger();
  const service = new ContactRequestService({
    turnstile,
    rateLimiter,
    emailSender,
    adminEmail: "admin@example.test",
    logger,
    ...(options.reportNotificationFailure
      ? { reportNotificationFailure: options.reportNotificationFailure }
      : {}),
  });
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();

  app.route("/api/v1", createContactRequestRoutes({ service }));

  return { app, turnstile, rateLimiter, emailSender, logger };
}

function requestBody(overrides: Record<string, unknown> = {}) {
  return {
    name: "Jane Tenant",
    email: "Jane@Example.com",
    inquiry_type: "demo",
    company: "Example Co",
    phone: "555-0100",
    message: "I want to learn more.",
    turnstile_token: "token-123",
    ...overrides,
  };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
  } as unknown as AppEnv;
}

describe("contact request routes", () => {
  it("submits contact requests after Turnstile and rate limit checks", async () => {
    const { app, turnstile, rateLimiter, emailSender } = createTestApp();
    const response = await app.request(
      "/api/v1/contact-requests",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.10",
        },
        body: JSON.stringify(requestBody()),
      },
      env(),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: CONTACT_REQUEST_SUCCESS_MESSAGE,
    });
    expect(turnstile.calls).toEqual([
      { token: "token-123", remoteIp: "203.0.113.10" },
    ]);
    expect(rateLimiter.calls).toEqual([
      { key: "contact:jane@example.com", limit: 3, windowSeconds: 86_400 },
    ]);
    expect(emailSender.calls[0]).toMatchObject({
      adminEmail: "admin@example.test",
      name: "Jane Tenant",
      email: "Jane@Example.com",
      inquiryType: "demo",
    });
  });

  it("treats honeypot submissions as success without side effects", async () => {
    const { app, turnstile, rateLimiter, emailSender } = createTestApp();
    const response = await app.request(
      "/api/v1/contact-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          requestBody({ company_website: "https://bot.example.test" }),
        ),
      },
      env(),
    );

    expect(response.status).toBe(201);
    expect(turnstile.calls).toHaveLength(0);
    expect(rateLimiter.calls).toHaveLength(0);
    expect(emailSender.calls).toHaveLength(0);
  });

  it("rejects oversized Turnstile tokens before verification", async () => {
    const { app, turnstile } = createTestApp();
    const response = await app.request(
      "/api/v1/contact-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          requestBody({ turnstile_token: "x".repeat(2049) }),
        ),
      },
      env(),
    );

    expect(response.status).toBe(422);
    expect(turnstile.calls).toHaveLength(0);
  });

  it("rejects invalid Turnstile verification", async () => {
    const turnstile = new MemoryTurnstileVerifier();
    turnstile.result = false;
    const { app, rateLimiter, emailSender } = createTestApp({ turnstile });
    const response = await app.request(
      "/api/v1/contact-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody()),
      },
      env(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "forbidden",
        message: "Verification failed. Please try again.",
      },
    });
    expect(rateLimiter.calls).toHaveLength(0);
    expect(emailSender.calls).toHaveLength(0);
  });

  it("rate limits repeated contact submissions by email", async () => {
    const rateLimiter = new MemoryRateLimiter();
    rateLimiter.result = false;
    const { app, emailSender } = createTestApp({ rateLimiter });
    const response = await app.request(
      "/api/v1/contact-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody()),
      },
      env(),
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "rate_limit_exceeded" },
    });
    expect(emailSender.calls).toHaveLength(0);
  });

  it("swallows Resend failures and keeps the user-facing success response", async () => {
    const emailSender = new MemoryContactEmailSender();
    emailSender.fail = true;
    emailSender.failureMessage =
      "Resend failed for Jane@Example.com and jane@example.com";
    const logger = new MemoryLogger();
    const reportNotificationFailure = vi.fn();
    const { app } = createTestApp({
      emailSender,
      logger,
      reportNotificationFailure,
    });
    const response = await app.request(
      "/api/v1/contact-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody()),
      },
      env(),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: CONTACT_REQUEST_SUCCESS_MESSAGE,
    });
    expect(logger.errors).toEqual([
      {
        message: "Failed to send contact notification",
        metadata: {
          inquiryType: "demo",
          error:
            "Resend failed for [redacted-email] and [redacted-email]",
        },
      },
    ]);
    expect(JSON.stringify(logger.errors)).not.toContain("Jane@Example.com");
    expect(JSON.stringify(logger.errors)).not.toContain("jane@example.com");
    expect(reportNotificationFailure).toHaveBeenCalledOnce();
    expect(reportNotificationFailure.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        message: "Resend failed for Jane@Example.com and jane@example.com",
      }),
    );
  });

  it("keeps contact success response when notification reporting fails", async () => {
    const emailSender = new MemoryContactEmailSender();
    emailSender.fail = true;
    const { app } = createTestApp({
      emailSender,
      reportNotificationFailure: async () => {
        throw new Error("sentry transport failed");
      },
    });

    const response = await app.request(
      "/api/v1/contact-requests",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody()),
      },
      env(),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: CONTACT_REQUEST_SUCCESS_MESSAGE,
    });
  });

  it("fails closed when Turnstile transport fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new Error("network unavailable");
    };

    try {
      const verifier = new CloudflareTurnstileVerifier({
        TURNSTILE_SECRET_KEY: "secret",
      } as AppEnv);

      await expect(
        verifier.verify({ token: "token", remoteIp: "203.0.113.10" }),
      ).resolves.toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("allows a loopback Turnstile endpoint outside production only", () => {
    expect(
      resolveTurnstileSiteverifyUrl({
        ENVIRONMENT: "development",
        TURNSTILE_SITEVERIFY_URL: "http://127.0.0.1:8799/turnstile",
      } as unknown as AppEnv),
    ).toBe("http://127.0.0.1:8799/turnstile");
    expect(
      resolveTurnstileSiteverifyUrl({
        ENVIRONMENT: "production",
        TURNSTILE_SITEVERIFY_URL: "http://127.0.0.1:8799/turnstile",
      } as unknown as AppEnv),
    ).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(
      resolveTurnstileSiteverifyUrl({
        ENVIRONMENT: "development",
        TURNSTILE_SITEVERIFY_URL: "https://example.com/turnstile",
      } as unknown as AppEnv),
    ).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
  });
});
