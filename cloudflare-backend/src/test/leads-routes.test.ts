import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type {
  ContentLeadInsert,
  LeadRepository,
} from "../domain/leads/repository";
import type {
  CrmEventInput,
  CrmRepository,
} from "../domain/crm/repository";
import {
  buildDownloadToken,
  buildUnsubscribeToken,
} from "../domain/leads/tokens";
import type { AppEnv } from "../env";
import {
  createLeadRoutes,
  type LeadRouteDependencies,
} from "../http/leads-routes";
import type { AuthVariables } from "../middleware/auth";

class MemoryLeadRepository implements LeadRepository {
  suppressedEmails = new Set<string>();
  recentLeads = new Set<string>();
  inserted: ContentLeadInsert[] = [];
  suppressed: Array<{ email: string; reason: "user_unsubscribe" }> = [];
  unsubscribed: Array<{ email: string; unsubscribedAtIso: string }> = [];

  async isSuppressed(email: string): Promise<boolean> {
    return this.suppressedEmails.has(email);
  }

  async hasRecentLead(input: {
    email: string;
    assetSlug: string;
    createdSinceIso: string;
  }): Promise<boolean> {
    return this.recentLeads.has(`${input.email}:${input.assetSlug}`);
  }

  async insertContentLead(input: ContentLeadInsert): Promise<string> {
    this.inserted.push(input);

    return `lead-${this.inserted.length}`;
  }

  async suppressEmail(input: {
    email: string;
    reason: "user_unsubscribe";
  }): Promise<void> {
    this.suppressed.push(input);
  }

  async markContentLeadsUnsubscribed(input: {
    email: string;
    unsubscribedAtIso: string;
  }): Promise<void> {
    this.unsubscribed.push(input);
  }
}

class MemoryTurnstile {
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

class MemoryEmailSender {
  sent: Array<{ toEmail: string; assetName: string; downloadUrl: string }> = [];

  async sendContentDownload(input: {
    toEmail: string;
    assetName: string;
    downloadUrl: string;
  }): Promise<void> {
    this.sent.push(input);
  }
}

class MemoryEvents {
  captured: Array<{ event: string; email: string }> = [];

  async capture(input: { event: string; email: string }): Promise<void> {
    this.captured.push(input);
  }
}

class MemorySequencer {
  enrollments: Array<{ email: string; sequenceSlug: string }> = [];
  events: Array<{ email: string; event: string }> = [];
  unsubscribes: Array<{ email: string; source: string }> = [];

  async enroll(input: { email: string; sequenceSlug: string }): Promise<void> {
    this.enrollments.push(input);
  }

  async recordEvent(input: { email: string; event: string }): Promise<void> {
    this.events.push(input);
  }

  async unsubscribe(input: { email: string; source: string }): Promise<void> {
    this.unsubscribes.push(input);
  }
}

class MemoryCrmRepository implements CrmRepository {
  readonly events: CrmEventInput[] = [];
  fail = false;

  async recordEvent(input: CrmEventInput): Promise<void> {
    if (this.fail) {
      throw new Error("crm unavailable");
    }
    this.events.push(input);
  }
}

class MemoryR2Bucket {
  objects = new Map<string, string>();

  async get(key: string): Promise<R2ObjectBody | null> {
    const value = this.objects.get(key);
    if (value === undefined) {
      return null;
    }

    return new Response(value) as unknown as R2ObjectBody;
  }
}

function createTestApp(overrides: Partial<LeadRouteDependencies> = {}) {
  const repository =
    (overrides.repository as MemoryLeadRepository | undefined) ??
    new MemoryLeadRepository();
  const turnstile =
    (overrides.turnstile as MemoryTurnstile | undefined) ??
    new MemoryTurnstile();
  const emailSender =
    (overrides.emailSender as MemoryEmailSender | undefined) ??
    new MemoryEmailSender();
  const events =
    (overrides.events as MemoryEvents | undefined) ?? new MemoryEvents();
  const sequencer =
    (overrides.sequencer as MemorySequencer | undefined) ??
    new MemorySequencer();
  const crm =
    (overrides.crm as MemoryCrmRepository | undefined) ??
    new MemoryCrmRepository();
  const bucket =
    (overrides.bucket as MemoryR2Bucket | undefined) ?? new MemoryR2Bucket();
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();

  bucket.objects.set(
    "lead-magnets/2026-06-25/cam-reconciliation-checklist.pdf",
    "pdf-bytes",
  );
  app.route(
    "/api/v1",
    createLeadRoutes({
      repository,
      turnstile,
      emailSender,
      events,
      sequencer,
      crm,
      bucket: bucket as unknown as R2Bucket,
    }),
  );

  return {
    app,
    repository,
    turnstile,
    emailSender,
    events,
    sequencer,
    crm,
    bucket,
  };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
    DOCUMENT_ACCESS_SIGNING_SECRET: "download-secret",
    UNSUBSCRIBE_HMAC_SECRET: "unsubscribe-secret",
    APP_BASE_URL: "https://app.capveri.com",
    MARKETING_BASE_URL: "https://www.capveri.com",
  } as unknown as AppEnv;
}

async function flushSideEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("lead routes", () => {
  it("captures content downloads and schedules fulfillment side effects", async () => {
    const { app, repository, turnstile, emailSender, events, sequencer } =
      createTestApp();
    const response = await app.request(
      "/api/v1/leads/content-download",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.10",
        },
        body: JSON.stringify({
          first_name: "Jane",
          email: "Jane@Example.com",
          company: "Example Co",
          asset_slug: "cam-reconciliation-checklist",
          source: "exit_intent_popup",
          turnstile_token: "token-123",
          utm_source: "linkedin",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Check your email for the download link",
    });
    expect(turnstile.calls).toEqual([
      { token: "token-123", remoteIp: "203.0.113.10" },
    ]);
    expect(repository.inserted).toEqual([
      {
        firstName: "Jane",
        email: "jane@example.com",
        company: "Example Co",
        assetSlug: "cam-reconciliation-checklist",
        source: "exit_intent_popup",
        utmSource: "linkedin",
        utmMedium: null,
        utmCampaign: null,
      },
    ]);

    await flushSideEffects();
    expect(emailSender.sent[0]?.downloadUrl).toContain(
      "/api/v1/leads/download/",
    );
    expect(events.captured[0]).toMatchObject({
      event: "lead_form_submit",
      email: "jane@example.com",
    });
    expect(sequencer.enrollments[0]).toMatchObject({
      email: "jane@example.com",
      sequenceSlug: "capveri-exit-intent-nurture",
    });
  });

  it("treats honeypot content downloads as success without side effects", async () => {
    const { app, repository, turnstile } = createTestApp();
    const response = await app.request(
      "/api/v1/leads/content-download",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "bot@example.com",
          asset_slug: "cam-reconciliation-checklist",
          company_website: "https://bot.example.test",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(turnstile.calls).toHaveLength(0);
    expect(repository.inserted).toHaveLength(0);
  });

  it("rejects invalid Turnstile submissions before writing leads", async () => {
    const turnstile = new MemoryTurnstile();
    turnstile.result = false;
    const { app, repository } = createTestApp({ turnstile });
    const response = await app.request(
      "/api/v1/leads/calculator-unlock",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: "Jane",
          email: "jane@example.com",
          slug: "boma-2024-calculator",
          turnstile_token: "bad-token",
        }),
      },
      env(),
    );

    expect(response.status).toBe(403);
    expect(repository.inserted).toHaveLength(0);
  });

  it("rate limits repeated lead requests by email and asset", async () => {
    const repository = new MemoryLeadRepository();
    repository.recentLeads.add("jane@example.com:cam-reconciliation-checklist");
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/leads/content-download",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "jane@example.com",
          asset_slug: "cam-reconciliation-checklist",
          turnstile_token: "token-123",
        }),
      },
      env(),
    );

    expect(response.status).toBe(429);
  });

  it("records PLG signup leads and sequencer signup events", async () => {
    const { app, repository, sequencer } = createTestApp();
    const response = await app.request(
      "/api/v1/leads/plg-signup",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: "Jane",
          email: "jane@example.com",
          organization_name: "Example Co",
          leakage_amount: "75000",
          turnstile_token: "token-123",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.inserted[0]).toMatchObject({
      email: "jane@example.com",
      assetSlug: "plg_free_audit",
      company: "Example Co",
    });
    await flushSideEffects();
    expect(sequencer.events[0]).toMatchObject({
      email: "jane@example.com",
      event: "signup_completed",
    });
  });

  it("verifies unsubscribe tokens and records suppressions", async () => {
    const { app, repository, sequencer } = createTestApp();
    const token = await buildUnsubscribeToken(
      "jane@example.com",
      "unsubscribe-secret",
    );
    const response = await app.request(
      `/api/v1/leads/unsubscribe?e=${token.emailB64}&t=${token.token}`,
      { method: "POST" },
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.suppressed).toEqual([
      { email: "jane@example.com", reason: "user_unsubscribe" },
    ]);
    expect(repository.unsubscribed[0]?.email).toBe("jane@example.com");
    await flushSideEffects();
    expect(sequencer.unsubscribes[0]).toEqual({
      email: "jane@example.com",
      source: "capveri-unsubscribe-link",
    });
  });

  it("keeps unsubscribe successful when CRM recording fails", async () => {
    const crm = new MemoryCrmRepository();
    crm.fail = true;
    const { app, repository, sequencer } = createTestApp({ crm });
    const token = await buildUnsubscribeToken(
      "jane@example.com",
      "unsubscribe-secret",
    );
    const response = await app.request(
      `/api/v1/leads/unsubscribe?e=${token.emailB64}&t=${token.token}`,
      { method: "POST" },
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.suppressed).toEqual([
      { email: "jane@example.com", reason: "user_unsubscribe" },
    ]);
    await flushSideEffects();
    expect(sequencer.unsubscribes[0]).toEqual({
      email: "jane@example.com",
      source: "capveri-unsubscribe-link",
    });
  });

  it("serves valid signed lead magnet downloads from R2", async () => {
    const { app } = createTestApp();
    const token = await buildDownloadToken(
      {
        email: "jane@example.com",
        assetSlug: "cam-reconciliation-checklist",
        storagePath: "lead-magnets/2026-06-25/cam-reconciliation-checklist.pdf",
        expiresAt: Math.floor(Date.now() / 1000) + 60,
      },
      "download-secret",
    );
    const response = await app.request(
      `/api/v1/leads/download/${encodeURIComponent(token)}`,
      undefined,
      env(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes)).toBe("pdf-bytes");
  });
});
