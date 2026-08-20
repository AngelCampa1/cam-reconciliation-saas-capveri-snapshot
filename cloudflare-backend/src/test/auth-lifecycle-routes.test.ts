import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import { TERMS_HASH, TERMS_VERSION } from "../domain/legal/terms";
import type {
  AuthLifecycleRepository,
  SignupNurtureEvent,
} from "../domain/auth-lifecycle/repository";
import type {
  CrmEventInput,
  CrmRepository,
} from "../domain/crm/repository";
import { createAuthLifecycleRoutes } from "../http/auth-lifecycle-routes";
import type { SequencerClient } from "../http/auth-lifecycle-routes";
import type { AppEnv } from "../env";
import type { AuthVariables } from "../middleware/auth";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const ORG_ID = "22222222-2222-4222-8222-222222222222";
const sentryDsn = "https://public@example.ingest.sentry.io/12345";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

class MemoryAuthLifecycleRepository implements AuthLifecycleRepository {
  organizationName: string | null = "Ventora Labs";
  organizationUserCount = 2;
  otherAdminCount = 1;
  blockingCounts = new Map<string, number>();
  failLegalAcceptance = false;
  failOrganizationName = false;
  failNurture = false;
  legalAcceptances: Array<{
    userId: string;
    organizationId: string;
    acceptedAt: string;
    source: "owner_signup" | "authenticated_legal_gate";
    ipAddress: string | null;
    userAgent: string | null;
  }> = [];
  nurtureEvents: SignupNurtureEvent[][] = [];

  async getOrganizationName(): Promise<string | null> {
    if (this.failOrganizationName) {
      throw new Error("organization unavailable");
    }
    return this.organizationName;
  }

  async recordLegalAcceptance(input: {
    userId: string;
    organizationId: string;
    acceptedAt: string;
    source: "owner_signup" | "authenticated_legal_gate";
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void> {
    if (this.failLegalAcceptance) {
      throw new Error("legal insert failed");
    }
    this.legalAcceptances.push(input);
  }

  async upsertSignupNurtureEvents(events: SignupNurtureEvent[]): Promise<void> {
    if (this.failNurture) {
      throw new Error("nurture unavailable");
    }
    this.nurtureEvents.push(events);
  }

  async countOrganizationUsers(): Promise<number> {
    return this.organizationUserCount;
  }

  async countOtherOrganizationAdmins(): Promise<number> {
    return this.otherAdminCount;
  }

  async countRows(input: {
    tableName: string;
    columnName: string;
  }): Promise<number> {
    return (
      this.blockingCounts.get(`${input.tableName}.${input.columnName}`) ?? 0
    );
  }
}

class MemoryWelcomeSender {
  sent: Array<{
    toEmail: string;
    organizationName: string;
    dashboardUrl: string;
  }> = [];
  fail = false;

  async sendWelcomeEmail(input: {
    toEmail: string;
    organizationName: string;
    dashboardUrl: string;
  }): Promise<void> {
    if (this.fail) {
      throw new Error("email unavailable");
    }
    this.sent.push(input);
  }
}

class MemorySequencer implements SequencerClient {
  enrollments: Parameters<SequencerClient["enroll"]>[0][] = [];
  fail = false;

  async enroll(
    input: Parameters<SequencerClient["enroll"]>[0],
  ): Promise<boolean> {
    if (this.fail) {
      throw new Error("sequencer unavailable");
    }
    this.enrollments.push(input);
    return true;
  }
}

class MemoryAnalytics {
  captures: Array<{
    eventName: string;
    organizationId: string;
    properties: Record<string, unknown>;
  }> = [];
  fail = false;

  async capture(
    _env: AppEnv,
    input: {
      eventName: string;
      organizationId: string;
      properties?: Record<string, unknown>;
    },
  ): Promise<void> {
    if (this.fail) {
      throw new Error("analytics unavailable");
    }
    this.captures.push({
      eventName: input.eventName,
      organizationId: input.organizationId,
      properties: input.properties ?? {},
    });
  }
}

class MemoryCrmRepository implements CrmRepository {
  readonly events: CrmEventInput[] = [];

  async recordEvent(input: CrmEventInput): Promise<void> {
    this.events.push(input);
  }
}

class MemoryAuthClient {
  deletedUsers: string[] = [];
  fail = false;

  async deleteUser(userId: string): Promise<void> {
    if (this.fail) {
      throw new Error("delete failed");
    }
    this.deletedUsers.push(userId);
  }
}

describe("auth lifecycle routes", () => {
  it("records owner signup side effects without blocking welcome response", async () => {
    const { app, repository, welcomeSender, sequencer, analytics } =
      createTestApp();

    const response = await app.request(
      "/api/v1/auth/welcome",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(currentTermsAcceptance()),
      },
      testEnv(),
    );
    await flushSideEffects();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(repository.legalAcceptances).toEqual([
      expect.objectContaining({ source: "owner_signup", userId: USER_ID }),
    ]);
    expect(repository.nurtureEvents[0]).toEqual([
      expect.objectContaining({ emailType: "day_1_confirm_plan" }),
      expect.objectContaining({ emailType: "day_2_add_property" }),
      expect.objectContaining({ emailType: "day_3_upload_gl" }),
      expect.objectContaining({ emailType: "day_4_check_sample_report" }),
      expect.objectContaining({ emailType: "day_5_run_reconciliation" }),
      expect.objectContaining({ emailType: "day_6_add_billing" }),
      expect.objectContaining({ emailType: "day_7_get_help" }),
    ]);
    expect(welcomeSender.sent).toEqual([
      {
        toEmail: "owner@example.com",
        organizationName: "Ventora Labs",
        dashboardUrl:
          "https://app.capveri.com/settings/billing?intent=select-plan&source=signup",
      },
    ]);
    expect(sequencer.enrollments.map((row) => row.sequenceSlug)).toEqual([
      "capveri-fulfillment-intro",
      "capveri-signup-daily-next-step",
    ]);
    expect(sequencer.enrollments[1]?.metadata).toMatchObject({
      crmStage: "trial_signup",
      funnelNextStep: "checkout_plan_selected",
      cadence: "daily_until_next_step",
      stopWhen: expect.stringContaining("subscription_active"),
    });
    expect(analytics.captures).toEqual([
      {
        eventName: "signup_completed",
        organizationId: ORG_ID,
        properties: {
          source: "auth_welcome",
        },
      },
    ]);
  });

  it("keeps welcome fire-and-forget when side effects fail", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const repository = new MemoryAuthLifecycleRepository();
    repository.failLegalAcceptance = true;
    repository.failOrganizationName = true;
    repository.failNurture = true;
    const welcomeSender = new MemoryWelcomeSender();
    welcomeSender.fail = true;
    const sequencer = new MemorySequencer();
    sequencer.fail = true;
    const analytics = new MemoryAnalytics();
    analytics.fail = true;
    const { app } = createTestApp({
      repository,
      welcomeSender,
      sequencer,
      analytics,
    });

    const response = await app.request(
      "/api/v1/auth/welcome",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify(currentTermsAcceptance()),
      },
      { ...testEnv(), SENTRY_DSN: sentryDsn },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const sentryBodies = fetchMock.mock.calls.map((call) => String(call[1]?.body));
    expect(sentryBodies.join("\n")).toContain(
      "\"operation\":\"worker.best_effort.auth_welcome.email\"",
    );
    expect(sentryBodies.join("\n")).toContain(
      "\"operation\":\"worker.best_effort.auth_welcome.legal_acceptance\"",
    );
    expect(sentryBodies.join("\n")).toContain(
      "\"operation\":\"worker.best_effort.auth_welcome.analytics\"",
    );
  });

  it("rejects stale legal terms", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      "/api/v1/auth/legal-acceptance/current",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          accepted_terms: true,
          terms_version: "old",
          terms_hash: TERMS_HASH,
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      detail: "You must accept the current CapVeri Terms of Service.",
    });
  });

  it("strictly records authenticated legal acceptance", async () => {
    const { app, repository } = createTestApp();

    const response = await app.request(
      "/api/v1/auth/legal-acceptance/current",
      {
        method: "POST",
        headers: {
          ...jsonAuthHeaders(),
          "CF-Connecting-IP": "203.0.113.10",
          "User-Agent": "vitest",
        },
        body: JSON.stringify(currentTermsAcceptance()),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    expect(repository.legalAcceptances).toEqual([
      {
        userId: USER_ID,
        organizationId: ORG_ID,
        acceptedAt: "2026-06-13T00:00:00.000Z",
        source: "authenticated_legal_gate",
        ipAddress: "203.0.113.10",
        userAgent: "vitest",
      },
    ]);
  });

  it("blocks unsafe account deletion before deleting Supabase auth user", async () => {
    const repository = new MemoryAuthLifecycleRepository();
    repository.organizationUserCount = 1;
    const authClient = new MemoryAuthClient();
    const { app } = createTestApp({ repository, authClient });

    const response = await app.request(
      "/api/v1/auth/account",
      {
        method: "DELETE",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ confirmation: "DELETE" }),
      },
      testEnv(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: expect.stringContaining("last account"),
    });
    expect(authClient.deletedUsers).toEqual([]);
  });

  it("blocks owner deletion when no other organization admin remains", async () => {
    const repository = new MemoryAuthLifecycleRepository();
    repository.otherAdminCount = 0;
    const authClient = new MemoryAuthClient();
    const { app } = createTestApp({ repository, authClient });

    const response = await app.request(
      "/api/v1/auth/account",
      {
        method: "DELETE",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ confirmation: "DELETE" }),
      },
      testEnv(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: expect.stringContaining("another owner or admin"),
    });
    expect(authClient.deletedUsers).toEqual([]);
  });

  it("blocks account deletion for audit history references", async () => {
    const repository = new MemoryAuthLifecycleRepository();
    repository.blockingCounts.set("legal_acceptances.user_id", 1);
    const authClient = new MemoryAuthClient();
    const { app } = createTestApp({ repository, authClient });

    const response = await app.request(
      "/api/v1/auth/account",
      {
        method: "DELETE",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ confirmation: "DELETE" }),
      },
      testEnv(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: expect.stringContaining("legal acceptance history"),
    });
    expect(authClient.deletedUsers).toEqual([]);
  });

  it("blocks later account deletion audit references", async () => {
    const repository = new MemoryAuthLifecycleRepository();
    repository.blockingCounts.set("documents.verified_by", 1);
    const authClient = new MemoryAuthClient();
    const { app } = createTestApp({ repository, authClient });

    const response = await app.request(
      "/api/v1/auth/account",
      {
        method: "DELETE",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ confirmation: "DELETE" }),
      },
      testEnv(),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      detail: expect.stringContaining("document verification history"),
    });
    expect(authClient.deletedUsers).toEqual([]);
  });

  it("deletes the Supabase auth user after safety checks pass", async () => {
    const authClient = new MemoryAuthClient();
    const { app } = createTestApp({ authClient });

    const response = await app.request(
      "/api/v1/auth/account",
      {
        method: "DELETE",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ confirmation: "DELETE" }),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "deleted" });
    expect(authClient.deletedUsers).toEqual([USER_ID]);
  });

  it("requires authentication for every auth lifecycle route", async () => {
    const { app } = createTestApp();

    const legal = await app.request(
      "/api/v1/auth/legal-acceptance/current",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentTermsAcceptance()),
      },
      testEnv(),
    );
    const welcome = await app.request(
      "/api/v1/auth/welcome",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentTermsAcceptance()),
      },
      testEnv(),
    );
    const account = await app.request(
      "/api/v1/auth/account",
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "DELETE" }),
      },
      testEnv(),
    );

    expect(legal.status).toBe(401);
    expect(welcome.status).toBe(401);
    expect(account.status).toBe(401);
  });
});

function createTestApp(
  options: {
    repository?: MemoryAuthLifecycleRepository;
    welcomeSender?: MemoryWelcomeSender;
    sequencer?: MemorySequencer;
    analytics?: MemoryAnalytics;
    crm?: MemoryCrmRepository;
    authClient?: MemoryAuthClient;
    role?: AuthVariables["auth"]["actor"]["role"];
  } = {},
): {
  app: Hono<{ Bindings: AppEnv; Variables: AuthVariables }>;
  repository: MemoryAuthLifecycleRepository;
  welcomeSender: MemoryWelcomeSender;
  sequencer: MemorySequencer;
  analytics: MemoryAnalytics;
  crm: MemoryCrmRepository;
  authClient: MemoryAuthClient;
} {
  const repository = options.repository ?? new MemoryAuthLifecycleRepository();
  const welcomeSender = options.welcomeSender ?? new MemoryWelcomeSender();
  const sequencer = options.sequencer ?? new MemorySequencer();
  const analytics = options.analytics ?? new MemoryAnalytics();
  const crm = options.crm ?? new MemoryCrmRepository();
  const authClient = options.authClient ?? new MemoryAuthClient();
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createAuthLifecycleRoutes({
      repository,
      welcomeSender,
      sequencer,
      analytics,
      crm,
      authClient,
      clock: () => new Date("2026-06-13T00:00:00.000Z"),
      auth: {
        verifier: jwtVerifier(),
        db: {
          mode: "postgrest-compat",
          auth: authRepository(options.role ?? "owner"),
          protectedRecords,
        },
      },
    }),
  );
  return {
    app,
    repository,
    welcomeSender,
    sequencer,
    analytics,
    crm,
    authClient,
  };
}

function currentTermsAcceptance() {
  return {
    accepted_terms: true,
    terms_version: TERMS_VERSION,
    terms_hash: TERMS_HASH,
  };
}

function authHeaders(): Record<string, string> {
  return { Authorization: "Bearer valid-token" };
}

function jsonAuthHeaders(): Record<string, string> {
  return { ...authHeaders(), "Content-Type": "application/json" };
}

function jwtVerifier(): JwtVerifier {
  return {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
}

function authRepository(
  role: AuthVariables["auth"]["actor"]["role"],
): DbAdapter["auth"] & AuthRepository {
  return {
    async resolveUserContext(): Promise<AuthenticatedUserContext> {
      return {
        actor: {
          userId: USER_ID,
          organizationId: ORG_ID,
          role,
          isServiceAdmin: false,
          party: role === "tenant" ? "tenant" : "landlord",
          bearerToken: "valid-token",
        },
        user: {
          id: USER_ID,
          organizationId: ORG_ID,
          email: "owner@example.com",
          fullName: "Owner User",
          role,
          isPlatformAdmin: false,
          createdAt: "2026-06-13T00:00:00Z",
          updatedAt: "2026-06-13T00:00:00Z",
        },
      };
    },
  };
}

function testEnv(): AppEnv {
  return {
    ENVIRONMENT: "development",
    APP_VERSION: "0.1.0",
    APP_BASE_URL: "https://app.capveri.com",
    DATABASE_URL: "postgres://example",
    PROTECTED_RECORDS: protectedRecords,
  } as unknown as AppEnv;
}

async function flushSideEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
