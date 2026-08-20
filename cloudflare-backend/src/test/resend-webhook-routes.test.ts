import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../env";
import type { ResendWebhookEmailForwarder } from "../http/resend-webhook-routes";
import { createResendWebhookRoutes } from "../http/resend-webhook-routes";
import type { AuthVariables } from "../middleware/auth";

// ---------------------------------------------------------------------------
// Test secret (base64-encoded key, no "whsec_" prefix in raw form)
// ---------------------------------------------------------------------------
const TEST_SECRET_BYTES = new TextEncoder().encode(
  "test-svix-secret-32bytes!!",
);
const TEST_SECRET_B64 = btoa(String.fromCharCode(...TEST_SECRET_BYTES));
const TEST_SECRET = `whsec_${TEST_SECRET_B64}`;

const ADMIN_EMAIL = "admin@capveri.com";
const SVIX_ID = "msg_test_12345";

// ---------------------------------------------------------------------------
// In-memory email forwarder for testing
// ---------------------------------------------------------------------------
type ForwardCall = {
  toEmail: string;
  originalFrom: string;
  originalTo: string;
  subject: string;
  html: string | null;
  text: string | null;
};

class MemoryEmailForwarder implements ResendWebhookEmailForwarder {
  calls: ForwardCall[] = [];
  shouldFail = false;

  async forward(input: {
    env: AppEnv;
    toEmail: string;
    originalFrom: string;
    originalTo: string;
    subject: string;
    html: string | null;
    text: string | null;
  }): Promise<void> {
    if (this.shouldFail) {
      throw new Error("forwarding failed");
    }

    this.calls.push({
      toEmail: input.toEmail,
      originalFrom: input.originalFrom,
      originalTo: input.originalTo,
      subject: input.subject,
      html: input.html,
      text: input.text,
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTestApp(forwarder?: ResendWebhookEmailForwarder): {
  app: Hono<{ Bindings: AppEnv; Variables: AuthVariables }>;
  forwarder: MemoryEmailForwarder;
} {
  const mem =
    forwarder instanceof MemoryEmailForwarder
      ? forwarder
      : new MemoryEmailForwarder();

  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route("/", createResendWebhookRoutes({ emailForwarder: mem }));

  return { app, forwarder: mem };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
    DATABASE_URL: "postgres://example",
    RESEND_WEBHOOK_SECRET: TEST_SECRET,
    ADMIN_NOTIFICATION_EMAIL: ADMIN_EMAIL,
  } as unknown as AppEnv;
}

function envWithSentry(): AppEnv {
  return {
    ...env(),
    SENTRY_DSN: "https://public@example.com/123",
  } as AppEnv;
}

async function hmacSha256Base64(
  secretBytes: Uint8Array,
  payload: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  let binary = "";

  for (const byte of new Uint8Array(signature)) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function svixSignedRequest(
  body: object,
  options: {
    secret?: Uint8Array;
    timestamp?: number;
    svixId?: string;
    overrideSignatureHeader?: string;
  } = {},
): Promise<{ method: string; headers: Record<string, string>; body: string }> {
  const rawBody = JSON.stringify(body);
  const ts = options.timestamp ?? Math.floor(Date.now() / 1000);
  const id = options.svixId ?? SVIX_ID;
  const secretBytes = options.secret ?? TEST_SECRET_BYTES;
  const signedContent = `${id}.${ts}.${rawBody}`;
  const sig = await hmacSha256Base64(secretBytes, signedContent);

  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(ts),
      "svix-signature": options.overrideSignatureHeader ?? `v1,${sig}`,
    },
    body: rawBody,
  };
}

function emailReceivedEvent(overrides: Record<string, unknown> = {}): object {
  return {
    type: "email.received",
    data: {
      from: "sender@example.com",
      to: "hello@capveri.com",
      subject: "Test inbound email",
      html: "<p>Hello</p>",
      text: "Hello",
      ...overrides,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resend webhook routes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("signature verification", () => {
    it("accepts a valid signature and returns 200 with {received:true}", async () => {
      const { app, forwarder } = createTestApp();
      const init = await svixSignedRequest(emailReceivedEvent());
      const res = await app.request("/api/v1/webhooks/resend", init, env());

      expect(res.status).toBe(200);

      const json = await res.json();

      expect(json).toEqual({ received: true });
      // Email should have been forwarded
      expect(forwarder.calls).toHaveLength(1);
    });

    it("rejects a missing svix-signature header with 400", async () => {
      const { app } = createTestApp();
      const body = JSON.stringify(emailReceivedEvent());
      const ts = Math.floor(Date.now() / 1000);
      // Omit svix-signature
      const res = await app.request(
        "/api/v1/webhooks/resend",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "svix-id": SVIX_ID,
            "svix-timestamp": String(ts),
          },
          body,
        },
        env(),
      );

      expect(res.status).toBe(400);
    });

    it("rejects a missing svix-timestamp header with 400", async () => {
      const { app } = createTestApp();
      const body = JSON.stringify(emailReceivedEvent());
      // Omit svix-timestamp
      const res = await app.request(
        "/api/v1/webhooks/resend",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "svix-id": SVIX_ID,
            "svix-signature": "v1,invalidsig",
          },
          body,
        },
        env(),
      );

      expect(res.status).toBe(400);
    });

    it("rejects a tampered (invalid) signature with 400", async () => {
      const { app, forwarder } = createTestApp();
      const init = await svixSignedRequest(emailReceivedEvent(), {
        // Correct format but wrong HMAC bytes
        overrideSignatureHeader:
          "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      });
      const res = await app.request("/api/v1/webhooks/resend", init, env());

      expect(res.status).toBe(400);
      // No forwarding should have occurred
      expect(forwarder.calls).toHaveLength(0);
    });

    it("rejects a signature computed with the wrong secret with 400", async () => {
      const { app, forwarder } = createTestApp();
      const wrongSecret = new TextEncoder().encode("wrong-secret-bytes!!!!!!!");
      const init = await svixSignedRequest(emailReceivedEvent(), {
        secret: wrongSecret,
      });
      const res = await app.request("/api/v1/webhooks/resend", init, env());

      expect(res.status).toBe(400);
      expect(forwarder.calls).toHaveLength(0);
    });

    it("rejects a stale timestamp (>5 min old) with 400", async () => {
      const { app } = createTestApp();
      const staleTs = Math.floor(Date.now() / 1000) - 400;
      const init = await svixSignedRequest(emailReceivedEvent(), {
        timestamp: staleTs,
      });
      const res = await app.request("/api/v1/webhooks/resend", init, env());

      expect(res.status).toBe(400);
    });

    it("rejects malformed JSON body with 400", async () => {
      const { app } = createTestApp();
      const rawBody = "not json {{{";
      const ts = Math.floor(Date.now() / 1000);
      const signedContent = `${SVIX_ID}.${ts}.${rawBody}`;
      const sig = await hmacSha256Base64(TEST_SECRET_BYTES, signedContent);
      const res = await app.request(
        "/api/v1/webhooks/resend",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "svix-id": SVIX_ID,
            "svix-timestamp": String(ts),
            "svix-signature": `v1,${sig}`,
          },
          body: rawBody,
        },
        env(),
      );

      expect(res.status).toBe(400);
    });
  });

  describe("email.received event", () => {
    it("forwards inbound email to admin with correct fields", async () => {
      const { app, forwarder } = createTestApp();
      const event = emailReceivedEvent({
        from: "tenant@example.com",
        to: "support@capveri.com",
        subject: "CAM question",
        html: "<p>Hi there</p>",
        text: "Hi there",
      });
      const init = await svixSignedRequest(event);
      await app.request("/api/v1/webhooks/resend", init, env());

      expect(forwarder.calls).toHaveLength(1);

      const call = forwarder.calls[0]!;

      expect(call.toEmail).toBe(ADMIN_EMAIL);
      expect(call.originalFrom).toBe("tenant@example.com");
      expect(call.originalTo).toBe("support@capveri.com");
      expect(call.subject).toBe("CAM question");
      expect(call.html).toBe("<p>Hi there</p>");
      expect(call.text).toBe("Hi there");
    });

    it("does not forward email to non-capveri.com recipient", async () => {
      const { app, forwarder } = createTestApp();
      const event = emailReceivedEvent({
        to: "someone@gmail.com",
      });
      const init = await svixSignedRequest(event);
      const res = await app.request("/api/v1/webhooks/resend", init, env());

      expect(res.status).toBe(200);
      expect(forwarder.calls).toHaveLength(0);
    });

    it("ignores unknown event types without forwarding", async () => {
      const { app, forwarder } = createTestApp();
      const event = { type: "email.bounced", data: {} };
      const init = await svixSignedRequest(event);
      const res = await app.request("/api/v1/webhooks/resend", init, env());

      expect(res.status).toBe(200);
      expect(forwarder.calls).toHaveLength(0);
    });

    it("returns 200 even when forwarding fails (no Resend retries)", async () => {
      const mem = new MemoryEmailForwarder();
      mem.shouldFail = true;
      const { app } = createTestApp(mem);
      const event = emailReceivedEvent();
      const init = await svixSignedRequest(event);
      const sentryFetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response(null, { status: 200 }));
      const res = await app.request(
        "/api/v1/webhooks/resend",
        init,
        envWithSentry(),
      );

      expect(res.status).toBe(200);

      const json = await res.json();

      expect(json).toEqual({ received: true });
      expect(sentryFetch).toHaveBeenCalledTimes(1);
      const [, initArg] = sentryFetch.mock.calls[0]!;
      expect(String(initArg?.body)).toContain(
        "worker.resend_webhook.forward_inbound_email",
      );
    });
  });

  describe("timing-safe comparison", () => {
    it("rejects a signature that differs only in the last character", async () => {
      const { app } = createTestApp();
      // Compute real signature then flip the last char
      const rawBody = JSON.stringify(emailReceivedEvent());
      const ts = Math.floor(Date.now() / 1000);
      const signedContent = `${SVIX_ID}.${ts}.${rawBody}`;
      const realSig = await hmacSha256Base64(TEST_SECRET_BYTES, signedContent);

      // Flip the last character to produce a one-character-off forgery.
      const lastChar = realSig.slice(-1);
      const flippedChar = lastChar === "A" ? "B" : "A";
      const tamperedSig = realSig.slice(0, -1) + flippedChar;

      const res = await app.request(
        "/api/v1/webhooks/resend",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "svix-id": SVIX_ID,
            "svix-timestamp": String(ts),
            "svix-signature": `v1,${tamperedSig}`,
          },
          body: rawBody,
        },
        env(),
      );

      expect(res.status).toBe(400);
    });
  });
});
