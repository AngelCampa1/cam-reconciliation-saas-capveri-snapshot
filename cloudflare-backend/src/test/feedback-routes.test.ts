import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type { FeedbackNotificationSender } from "../adapters/email/resend";
import type {
  FeedbackScreenshotStorage,
  StoredFeedbackScreenshot,
} from "../adapters/storage/feedback-screenshots";
import type { TurnstileVerifier } from "../adapters/security/turnstile";
import type {
  FeedbackRecord,
  FeedbackRepository,
  FeedbackStats,
} from "../domain/feedback/repository";
import type { AppEnv } from "../env";
import { createFeedbackRoutes } from "../http/feedback-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const FEEDBACK_ID = "33333333-3333-4333-8333-333333333333";
const SCREENSHOT_KEY = `feedback/${ORG_ID}/screenshot.jpeg`;
const IMAGE_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]);

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryFeedbackRepository implements FeedbackRepository {
  readonly recentRequests: Parameters<
    FeedbackRepository["countRecentForUser"]
  >[0][] = [];
  readonly createdFeedback: Parameters<
    FeedbackRepository["createFeedback"]
  >[0][] = [];
  readonly listRequests: Parameters<FeedbackRepository["listFeedback"]>[0][] =
    [];
  readonly myRequests: Parameters<FeedbackRepository["listMyFeedback"]>[0][] =
    [];
  readonly getRequests: Parameters<FeedbackRepository["getFeedback"]>[0][] = [];
  readonly updateRequests: Parameters<
    FeedbackRepository["updateFeedback"]
  >[0][] = [];
  readonly deleteRequests: Parameters<
    FeedbackRepository["deleteFeedback"]
  >[0][] = [];
  recentCount = 0;
  feedback: FeedbackRecord | null = feedbackRecord();
  stats: FeedbackStats = {
    total: 2,
    byType: { bug: 1, general: 1 },
    byStatus: { new: 2 },
  };

  async countRecentForUser(
    input: Parameters<FeedbackRepository["countRecentForUser"]>[0],
  ): Promise<number> {
    this.recentRequests.push(input);

    return this.recentCount;
  }

  async createFeedback(
    input: Parameters<FeedbackRepository["createFeedback"]>[0],
  ): Promise<FeedbackRecord> {
    this.createdFeedback.push(input);

    return {
      ...feedbackRecord(),
      type: input.type,
      message: input.message,
      pageUrl: input.pageUrl,
      screenshotUrl: input.screenshotUrl,
      userAgent: input.userAgent,
      metadata: input.metadata,
    };
  }

  async listFeedback(
    input: Parameters<FeedbackRepository["listFeedback"]>[0],
  ): Promise<FeedbackRecord[]> {
    this.listRequests.push(input);

    return this.feedback ? [this.feedback] : [];
  }

  async listMyFeedback(
    input: Parameters<FeedbackRepository["listMyFeedback"]>[0],
  ): Promise<FeedbackRecord[]> {
    this.myRequests.push(input);

    return this.feedback ? [this.feedback] : [];
  }

  async getFeedback(
    input: Parameters<FeedbackRepository["getFeedback"]>[0],
  ): Promise<FeedbackRecord | null> {
    this.getRequests.push(input);

    return this.feedback;
  }

  async updateFeedback(
    input: Parameters<FeedbackRepository["updateFeedback"]>[0],
  ): Promise<FeedbackRecord | null> {
    this.updateRequests.push(input);

    return this.feedback
      ? {
          ...this.feedback,
          status: input.status ?? this.feedback.status,
          metadata: input.metadata ?? this.feedback.metadata,
        }
      : null;
  }

  async deleteFeedback(
    input: Parameters<FeedbackRepository["deleteFeedback"]>[0],
  ): Promise<FeedbackRecord | null> {
    this.deleteRequests.push(input);
    const deleted = this.feedback;
    this.feedback = null;

    return deleted;
  }

  async getStats(): Promise<FeedbackStats> {
    return this.stats;
  }
}

class MemoryScreenshotStorage implements FeedbackScreenshotStorage {
  readonly puts: Array<{ key: string; contentType: string }> = [];
  readonly deletes: string[] = [];
  readonly objects = new Map<string, Uint8Array>();

  generateKey(): string {
    return SCREENSHOT_KEY;
  }

  validateContentType(contentType: string): boolean {
    return ["image/gif", "image/jpeg", "image/png", "image/webp"].includes(
      contentType,
    );
  }

  validateFileSize(content: { readonly byteLength: number }): boolean {
    return content.byteLength <= 5 * 1024 * 1024;
  }

  async putScreenshot(
    key: string,
    content: Uint8Array | ArrayBuffer,
    contentType: string,
  ): Promise<StoredFeedbackScreenshot> {
    const bytes =
      content instanceof Uint8Array ? content : new Uint8Array(content);
    this.puts.push({ key, contentType });
    this.objects.set(key, bytes);

    return { key, contentType, size: bytes.byteLength };
  }

  async getScreenshotBytes(key: string): Promise<Uint8Array | undefined> {
    return this.objects.get(key);
  }

  async headScreenshot(
    key: string,
  ): Promise<StoredFeedbackScreenshot | undefined> {
    const bytes = this.objects.get(key);

    return bytes
      ? { key, contentType: "image/jpeg", size: bytes.byteLength }
      : undefined;
  }

  async deleteScreenshot(key: string): Promise<void> {
    this.deletes.push(key);
    this.objects.delete(key);
  }
}

class MemoryEmailSender implements FeedbackNotificationSender {
  readonly notifications: Parameters<
    FeedbackNotificationSender["sendFeedbackNotification"]
  >[0][] = [];
  error: Error | undefined;

  async sendFeedbackNotification(
    input: Parameters<
      FeedbackNotificationSender["sendFeedbackNotification"]
    >[0],
  ): Promise<void> {
    this.notifications.push(input);

    if (this.error) {
      throw this.error;
    }
  }
}

class MemoryTurnstileVerifier implements TurnstileVerifier {
  readonly calls: Parameters<TurnstileVerifier["verify"]>[0][] = [];
  result = true;

  async verify(
    input: Parameters<TurnstileVerifier["verify"]>[0],
  ): Promise<boolean> {
    this.calls.push(input);

    return this.result;
  }
}

class MemoryRateLimiter {
  readonly checks: Array<{
    key: string;
    limit: number;
    windowSeconds: number;
  }> = [];
  allowed = true;

  async check(input: {
    key: string;
    limit: number;
    windowSeconds: number;
  }): Promise<boolean> {
    this.checks.push(input);

    return this.allowed;
  }
}

function createTestApp(options: {
  role?: AuthVariables["auth"]["actor"]["role"];
  repository?: MemoryFeedbackRepository;
  storage?: MemoryScreenshotStorage;
  emailSender?: MemoryEmailSender;
  turnstile?: MemoryTurnstileVerifier;
  rateLimiter?: MemoryRateLimiter;
}) {
  const repository = options.repository ?? new MemoryFeedbackRepository();
  const storage = options.storage ?? new MemoryScreenshotStorage();
  const emailSender = options.emailSender ?? new MemoryEmailSender();
  const turnstile = options.turnstile ?? new MemoryTurnstileVerifier();
  const rateLimiter = options.rateLimiter ?? new MemoryRateLimiter();
  const context = createAuthContext(options.role);
  const verifier: JwtVerifier = {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
  const auth: AuthRepository = {
    async resolveUserContext() {
      return context;
    },
  };
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();

  app.route(
    "/api/v1",
    createFeedbackRoutes({
      repository,
      storage,
      emailSender,
      turnstile,
      rateLimiter,
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    }),
  );

  return { app, repository, storage, emailSender, turnstile, rateLimiter };
}

function createAuthContext(
  role: AuthVariables["auth"]["actor"]["role"] = "admin",
): AuthenticatedUserContext {
  const user: AuthenticatedUserContext["user"] = {
    id: USER_ID,
    organizationId: ORG_ID,
    email: "admin@example.test",
    fullName: "Admin User",
    role,
    isPlatformAdmin: false,
    createdAt: "2026-06-13T00:00:00Z",
    updatedAt: "2026-06-13T00:00:00Z",
  };

  return {
    user,
    actor: {
      userId: USER_ID,
      organizationId: ORG_ID,
      role,
      isServiceAdmin: false,
      party: role === "tenant" ? "tenant" : "landlord",
      bearerToken: "valid-token",
    },
  };
}

function feedbackRecord(): FeedbackRecord {
  return {
    id: FEEDBACK_ID,
    userId: USER_ID,
    organizationId: ORG_ID,
    type: "bug",
    status: "new",
    message: "This is a useful bug report",
    pageUrl: "/dashboard",
    screenshotUrl: SCREENSHOT_KEY,
    userAgent: "Vitest",
    metadata: { viewport: { width: 1200, height: 800 } },
    createdAt: "2026-06-13T00:00:00Z",
    updatedAt: "2026-06-13T00:00:01Z",
  };
}

function env(overrides: Record<string, unknown> = {}): AppEnv {
  const values: Record<string, unknown> = {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
    ADMIN_NOTIFICATION_EMAIL: "admin@example.test",
    DOCUMENT_ACCESS_SIGNING_SECRET: "unit-test-screenshot-signing-secret",
    ...overrides,
  };

  return values as unknown as AppEnv;
}

function createBody(overrides: Record<string, unknown> = {}) {
  return {
    type: "bug",
    message: "This is a useful bug report",
    page_url: "/dashboard",
    user_agent: "Vitest",
    metadata: { viewport: { width: 1200, height: 800 } },
    ...overrides,
  };
}

function imageBody(): FormData {
  const body = new FormData();
  body.set(
    "file",
    new File([IMAGE_BYTES], "screenshot.jpg", { type: "image/jpeg" }),
  );

  return body;
}

describe("feedback routes", () => {
  it("creates authenticated feedback, stores screenshot paths, and sends notification", async () => {
    const repository = new MemoryFeedbackRepository();
    const emailSender = new MemoryEmailSender();
    const { app } = createTestApp({ repository, emailSender });
    const response = await app.request(
      "/api/v1/feedback",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(createBody({ screenshot_url: SCREENSHOT_KEY })),
      },
      env(),
    );

    expect(response.status).toBe(201);
    const body = await response.json<Record<string, unknown>>();
    expect(body).toMatchObject({
      id: FEEDBACK_ID,
      type: "bug",
      status: "new",
      user_id: USER_ID,
      organization_id: ORG_ID,
    });
    expect(String(body.screenshot_url)).toMatch(
      /^http:\/\/localhost\/api\/v1\/feedback\/screenshot-file\?key=feedback%2F/,
    );
    expect(repository.createdFeedback).toEqual([
      {
        userId: USER_ID,
        organizationId: ORG_ID,
        type: "bug",
        message: "This is a useful bug report",
        pageUrl: "/dashboard",
        screenshotUrl: SCREENSHOT_KEY,
        userAgent: "Vitest",
        metadata: { viewport: { width: 1200, height: 800 } },
      },
    ]);
    expect(emailSender.notifications[0]).toMatchObject({
      adminEmail: "admin@example.test",
      feedbackType: "bug",
      userEmail: "admin@example.test",
    });
  });

  it("rejects feedback screenshot paths outside the user organization", async () => {
    const repository = new MemoryFeedbackRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/feedback",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(
          createBody({
            screenshot_url:
              "feedback/99999999-9999-4999-8999-999999999999/screenshot.jpg",
          }),
        ),
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(repository.createdFeedback).toEqual([]);
  });

  it("rejects arbitrary screenshot references on new feedback", async () => {
    const repository = new MemoryFeedbackRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/feedback",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(
          createBody({
            screenshot_url: "https://tracking.example/screenshot.png",
          }),
        ),
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(repository.createdFeedback).toEqual([]);
  });

  it("rejects malformed same-org feedback screenshot keys", async () => {
    const repository = new MemoryFeedbackRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/feedback",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(
          createBody({
            screenshot_url: `feedback/${ORG_ID}/../bad.jpeg`,
          }),
        ),
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(repository.createdFeedback).toEqual([]);
  });

  it("rate limits authenticated feedback before inserting", async () => {
    const repository = new MemoryFeedbackRepository();
    repository.recentCount = 3;
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/feedback",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(createBody()),
      },
      env(),
    );

    expect(response.status).toBe(429);
    expect(repository.createdFeedback).toEqual([]);
  });

  it("keeps feedback submission successful when notification config is missing", async () => {
    const repository = new MemoryFeedbackRepository();
    const emailSender = new MemoryEmailSender();
    const { app } = createTestApp({ repository, emailSender });
    const response = await app.request(
      "/api/v1/feedback",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(createBody()),
      },
      env({ ADMIN_NOTIFICATION_EMAIL: undefined }),
    );

    expect(response.status).toBe(201);
    expect(repository.createdFeedback).toHaveLength(1);
    expect(emailSender.notifications).toEqual([]);
  });

  it("lists admin feedback with filters and signs stored screenshots", async () => {
    const repository = new MemoryFeedbackRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/feedback?type=bug&status=new&page=2&per_page=10",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    const body = await response.json<Array<Record<string, unknown>>>();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: FEEDBACK_ID,
      type: "bug",
      status: "new",
      page_url: "/dashboard",
    });
    expect(repository.listRequests).toEqual([
      {
        organizationId: ORG_ID,
        type: "bug",
        status: "new",
        page: 2,
        perPage: 10,
      },
    ]);
  });

  it("blocks non-admin users from the admin feedback list", async () => {
    const repository = new MemoryFeedbackRepository();
    const { app } = createTestApp({ repository, role: "member" });
    const response = await app.request(
      "/api/v1/feedback",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(403);
    expect(repository.listRequests).toEqual([]);
  });

  it("loads one admin feedback item with a signed screenshot URL", async () => {
    const repository = new MemoryFeedbackRepository();
    const { app } = createTestApp({ repository });
    const response = await app.request(
      `/api/v1/feedback/${FEEDBACK_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    const body = await response.json<Record<string, unknown>>();
    expect(body).toMatchObject({
      id: FEEDBACK_ID,
      organization_id: ORG_ID,
      screenshot_url: expect.stringContaining(
        "/api/v1/feedback/screenshot-file",
      ),
    });
    expect(repository.getRequests).toEqual([
      { feedbackId: FEEDBACK_ID, organizationId: ORG_ID },
    ]);
  });

  it("returns 404 for missing feedback details and blocks non-admin detail access", async () => {
    const repository = new MemoryFeedbackRepository();
    repository.feedback = null;
    const missing = createTestApp({ repository });
    const forbidden = createTestApp({ role: "member" });
    const missingResponse = await missing.app.request(
      `/api/v1/feedback/${FEEDBACK_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const forbiddenResponse = await forbidden.app.request(
      `/api/v1/feedback/${FEEDBACK_ID}`,
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(missingResponse.status).toBe(404);
    expect(forbiddenResponse.status).toBe(403);
    expect(forbidden.repository.getRequests).toEqual([]);
  });

  it("returns feedback stats using FastAPI response keys", async () => {
    const { app } = createTestApp({});
    const response = await app.request(
      "/api/v1/feedback/stats/summary",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      total: 2,
      by_type: { bug: 1, general: 1 },
      by_status: { new: 2 },
    });
  });

  it("updates feedback status and rejects empty patches", async () => {
    const repository = new MemoryFeedbackRepository();
    const { app } = createTestApp({ repository });
    const empty = await app.request(
      `/api/v1/feedback/${FEEDBACK_ID}`,
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      },
      env(),
    );
    const response = await app.request(
      `/api/v1/feedback/${FEEDBACK_ID}`,
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "reviewed" }),
      },
      env(),
    );

    expect(empty.status).toBe(400);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: FEEDBACK_ID,
      status: "reviewed",
    });
    expect(repository.updateRequests).toEqual([
      {
        feedbackId: FEEDBACK_ID,
        organizationId: ORG_ID,
        status: "reviewed",
      },
    ]);
  });

  it("deletes admin feedback and its stored screenshot", async () => {
    const repository = new MemoryFeedbackRepository();
    repository.feedback = {
      ...feedbackRecord(),
      metadata: { prod_e2e: true },
    };
    const storage = new MemoryScreenshotStorage();
    await storage.putScreenshot(SCREENSHOT_KEY, IMAGE_BYTES, "image/jpeg");
    const { app } = createTestApp({ repository, storage });

    const response = await app.request(
      `/api/v1/feedback/${FEEDBACK_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(204);
    expect(repository.deleteRequests).toEqual([
      { feedbackId: FEEDBACK_ID, organizationId: ORG_ID },
    ]);
    expect(storage.deletes).toEqual([SCREENSHOT_KEY]);
    expect(await storage.headScreenshot(SCREENSHOT_KEY)).toBeUndefined();
  });

  it("retains normal feedback rows even for admin delete requests", async () => {
    const repository = new MemoryFeedbackRepository();
    const storage = new MemoryScreenshotStorage();
    await storage.putScreenshot(SCREENSHOT_KEY, IMAGE_BYTES, "image/jpeg");
    const { app } = createTestApp({ repository, storage });

    const response = await app.request(
      `/api/v1/feedback/${FEEDBACK_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(response.status).toBe(403);
    expect(repository.deleteRequests).toEqual([]);
    expect(storage.deletes).toEqual([]);
    expect(await storage.headScreenshot(SCREENSHOT_KEY)).toBeDefined();
  });

  it("returns 404 for missing feedback deletes and blocks non-admin deletes", async () => {
    const missingRepository = new MemoryFeedbackRepository();
    missingRepository.feedback = null;
    const missing = createTestApp({ repository: missingRepository });
    const forbidden = createTestApp({ role: "member" });

    const missingResponse = await missing.app.request(
      `/api/v1/feedback/${FEEDBACK_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );
    const forbiddenResponse = await forbidden.app.request(
      `/api/v1/feedback/${FEEDBACK_ID}`,
      {
        method: "DELETE",
        headers: { authorization: "Bearer valid-token" },
      },
      env(),
    );

    expect(missingResponse.status).toBe(404);
    expect(forbiddenResponse.status).toBe(403);
    expect(forbidden.repository.deleteRequests).toEqual([]);
  });

  it("uploads screenshots to R2 and serves them through signed URLs", async () => {
    const storage = new MemoryScreenshotStorage();
    const { app } = createTestApp({ storage });
    const upload = await app.request(
      "/api/v1/feedback/screenshot",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: imageBody(),
      },
      env(),
    );

    expect(upload.status).toBe(201);
    const payload = await upload.json<Record<string, string>>();
    expect(payload.storage_path).toBe(SCREENSHOT_KEY);
    expect(storage.puts).toEqual([
      { key: SCREENSHOT_KEY, contentType: "image/jpeg" },
    ]);

    if (!payload.url) {
      throw new TypeError("Expected screenshot upload URL");
    }
    const file = await app.request(payload.url, {}, env());

    expect(file.status).toBe(200);
    expect(file.headers.get("content-type")).toBe("image/jpeg");
    await expect(file.arrayBuffer()).resolves.toEqual(IMAGE_BYTES.buffer);
  });

  it("deletes an uploaded screenshot without requiring a feedback row", async () => {
    const storage = new MemoryScreenshotStorage();
    await storage.putScreenshot(SCREENSHOT_KEY, IMAGE_BYTES, "image/jpeg");
    const { app } = createTestApp({ storage });

    const response = await app.request(
      "/api/v1/feedback/screenshot",
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ storage_path: SCREENSHOT_KEY }),
      },
      env(),
    );

    expect(response.status).toBe(204);
    expect(storage.deletes).toEqual([SCREENSHOT_KEY]);
    expect(await storage.headScreenshot(SCREENSHOT_KEY)).toBeUndefined();
  });

  it("rejects screenshot deletes outside the current organization", async () => {
    const storage = new MemoryScreenshotStorage();
    const { app } = createTestApp({ storage });
    const response = await app.request(
      "/api/v1/feedback/screenshot",
      {
        method: "DELETE",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          storage_path:
            "feedback/99999999-9999-4999-8999-999999999999/other.jpeg",
        }),
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(storage.deletes).toEqual([]);
  });

  it("accepts the signed screenshot URL returned by upload when creating feedback", async () => {
    const storage = new MemoryScreenshotStorage();
    const repository = new MemoryFeedbackRepository();
    const { app } = createTestApp({ repository, storage });
    const upload = await app.request(
      "/api/v1/feedback/screenshot",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body: imageBody(),
      },
      env(),
    );
    const payload = await upload.json<Record<string, string>>();

    if (!payload.url) {
      throw new TypeError("Expected screenshot upload URL");
    }

    const response = await app.request(
      "/api/v1/feedback",
      {
        method: "POST",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify(createBody({ screenshot_url: payload.url })),
      },
      env(),
    );

    expect(response.status).toBe(201);
    expect(repository.createdFeedback[0]?.screenshotUrl).toBe(SCREENSHOT_KEY);
  });

  it("rejects non-image screenshot uploads", async () => {
    const body = new FormData();
    body.set(
      "file",
      new File([IMAGE_BYTES], "note.txt", { type: "text/plain" }),
    );
    const storage = new MemoryScreenshotStorage();
    const { app } = createTestApp({ storage });
    const response = await app.request(
      "/api/v1/feedback/screenshot",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body,
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(storage.puts).toEqual([]);
  });

  it("rejects svg screenshot uploads", async () => {
    const body = new FormData();
    body.set(
      "file",
      new File(["<svg><script>alert(1)</script></svg>"], "bad.svg", {
        type: "image/svg+xml",
      }),
    );
    const storage = new MemoryScreenshotStorage();
    const { app } = createTestApp({ storage });
    const response = await app.request(
      "/api/v1/feedback/screenshot",
      {
        method: "POST",
        headers: { authorization: "Bearer valid-token" },
        body,
      },
      env(),
    );

    expect(response.status).toBe(400);
    expect(storage.puts).toEqual([]);
  });

  it("rejects expired, tampered, and org-mismatched signed screenshot URLs", async () => {
    const storage = new MemoryScreenshotStorage();
    await storage.putScreenshot(SCREENSHOT_KEY, IMAGE_BYTES, "image/jpeg");
    const { app } = createTestApp({ storage });
    const expiredUrl = await signedScreenshotUrl({
      key: SCREENSHOT_KEY,
      orgId: ORG_ID,
      expires: Math.floor(Date.now() / 1000) - 10,
    });
    const tamperedUrl = await signedScreenshotUrl({
      key: SCREENSHOT_KEY,
      orgId: ORG_ID,
      expires: Math.floor(Date.now() / 1000) + 60,
    });
    const mismatchedUrl = await signedScreenshotUrl({
      key: SCREENSHOT_KEY,
      orgId: "99999999-9999-4999-8999-999999999999",
      expires: Math.floor(Date.now() / 1000) + 60,
    });
    const tampered = new URL(tamperedUrl);
    tampered.searchParams.set("signature", "0".repeat(64));
    const responses = await Promise.all([
      app.request(expiredUrl, {}, env()),
      app.request(tampered.toString(), {}, env()),
      app.request(mismatchedUrl, {}, env()),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 400,
    ]);
  });

  it("accepts marketing feedback only after turnstile and rate-limit checks", async () => {
    const rateLimiter = new MemoryRateLimiter();
    const turnstile = new MemoryTurnstileVerifier();
    const emailSender = new MemoryEmailSender();
    const { app } = createTestApp({ rateLimiter, turnstile, emailSender });
    const response = await app.request(
      "/api/v1/feedback/marketing",
      {
        method: "POST",
        headers: {
          "cf-connecting-ip": "203.0.113.10",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: "general",
          message: "This public page needs more detail.",
          page_url: "/",
          turnstile_token: "token-123",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(rateLimiter.checks).toEqual([
      {
        key: "marketing-feedback:203.0.113.10",
        limit: 100,
        windowSeconds: 60,
      },
    ]);
    expect(turnstile.calls).toEqual([
      { token: "token-123", remoteIp: "203.0.113.10" },
    ]);
    expect(emailSender.notifications[0]).toMatchObject({
      userEmail: "anonymous (marketing site)",
      organizationId: "n/a",
    });
  });

  it("silently accepts marketing honeypot submissions", async () => {
    const rateLimiter = new MemoryRateLimiter();
    const turnstile = new MemoryTurnstileVerifier();
    const emailSender = new MemoryEmailSender();
    const { app } = createTestApp({ rateLimiter, turnstile, emailSender });
    const response = await app.request(
      "/api/v1/feedback/marketing",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "general",
          message: "This public page needs more detail.",
          company_website: "bot.example",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(rateLimiter.checks).toEqual([]);
    expect(turnstile.calls).toEqual([]);
    expect(emailSender.notifications).toEqual([]);
  });
});

async function signedScreenshotUrl(input: {
  key: string;
  orgId: string;
  expires: number;
}): Promise<string> {
  const secret = "unit-test-screenshot-signing-secret";
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode([input.key, input.orgId, input.expires].join(".")),
  );
  const url = new URL("http://localhost/api/v1/feedback/screenshot-file");
  url.searchParams.set("key", input.key);
  url.searchParams.set("org_id", input.orgId);
  url.searchParams.set("expires", String(input.expires));
  url.searchParams.set("signature", bytesToHex(new Uint8Array(signature)));

  return url.toString();
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
