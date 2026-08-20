import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier, VerifiedJwt } from "../adapters/auth/verifier";
import { JwtVerificationError } from "../adapters/auth/verifier";
import type {
  ActorContext,
  AuthenticatedUserContext,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  OnboardInitResult,
  OnboardUpgradeResult,
  OnboardingRepository,
} from "../domain/onboarding/repository";
import type { AppEnv } from "../env";
import { createOnboardRoutes } from "../http/onboard-routes";
import type { AuthVariables } from "../middleware/auth";

const userId = "aaaabbbb-1111-2222-3333-444455556666";
const orgId = "00000000-0000-0000-0000-000000000001";

class MemoryOnboardingRepository implements OnboardingRepository {
  initResult: OnboardInitResult = {
    state: "created",
    organizationId: orgId,
    userId,
  };
  upgradeResult: OnboardUpgradeResult = { state: "updated" };
  initCalls: Array<{ userId: string }> = [];
  upgradeCalls: Array<{
    userId: string;
    organizationId: string;
    email: string;
    organizationName: string;
  }> = [];

  async initUser(input: { userId: string }): Promise<OnboardInitResult> {
    this.initCalls.push(input);

    return this.initResult;
  }

  async upgradeUser(input: {
    userId: string;
    organizationId: string;
    email: string;
    organizationName: string;
  }): Promise<OnboardUpgradeResult> {
    this.upgradeCalls.push(input);

    return this.upgradeResult;
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
      throw new Error("resend unavailable");
    }

    this.sent.push(input);
  }
}

class MemoryVerifier implements JwtVerifier {
  verified: VerifiedJwt = {
    subject: userId,
    payload: { sub: userId, email: "real@example.com" },
    isActive: true,
  };
  error: Error | null = null;
  tokens: string[] = [];

  async verify(token: string): Promise<VerifiedJwt> {
    this.tokens.push(token);
    if (this.error) {
      throw this.error;
    }

    return this.verified;
  }
}

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

function createTestApp(
  options: {
    repository?: MemoryOnboardingRepository;
    welcomeSender?: MemoryWelcomeSender;
    verifier?: MemoryVerifier;
    authContext?: AuthenticatedUserContext | undefined;
  } = {},
) {
  const repository = options.repository ?? new MemoryOnboardingRepository();
  const welcomeSender = options.welcomeSender ?? new MemoryWelcomeSender();
  const verifier = options.verifier ?? new MemoryVerifier();
  const authContext =
    "authContext" in options ? options.authContext : userContext();
  const db: DbAdapter = {
    mode: "postgrest-compat",
    protectedRecords,
    auth: {
      async resolveUserContext() {
        return authContext;
      },
    },
  };
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();

  app.route(
    "/api/v1",
    createOnboardRoutes({
      repository,
      verifier,
      auth: { verifier, db },
      welcomeSender,
    }),
  );

  return { app, repository, welcomeSender, verifier };
}

function userContext(
  overrides: Partial<AuthenticatedUserContext["user"]> = {},
): AuthenticatedUserContext {
  const user = {
    id: userId,
    organizationId: orgId,
    email: `anon+${userId.slice(0, 8)}@placeholder.capveri.com`,
    fullName: null,
    role: "owner" as const,
    isPlatformAdmin: false,
    createdAt: "2026-06-13T00:00:00Z",
    updatedAt: "2026-06-13T00:00:00Z",
    ...overrides,
  };
  const actor: ActorContext = {
    userId: user.id,
    organizationId: user.organizationId,
    role: user.role,
    isServiceAdmin: user.isPlatformAdmin,
    party: "landlord",
    bearerToken: "valid-token",
  };

  return { actor, user };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
    APP_BASE_URL: "https://app.capveri.com",
  } as unknown as AppEnv;
}

function authHeaders(token = "valid-token") {
  return { authorization: `Bearer ${token}` };
}

async function flushSideEffects(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("onboard routes", () => {
  it("bootstraps an onboarding organization and user from a valid JWT", async () => {
    const { app, repository, verifier } = createTestApp();
    const response = await app.request(
      "/api/v1/onboard/init",
      { method: "POST", headers: authHeaders() },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      organization_id: orgId,
      user_id: userId,
      already_existed: false,
    });
    expect(verifier.tokens).toEqual(["valid-token"]);
    expect(repository.initCalls).toEqual([{ userId }]);
  });

  it("returns existing bootstrap rows idempotently", async () => {
    const repository = new MemoryOnboardingRepository();
    repository.initResult = {
      state: "already_exists",
      organizationId: "existing-org",
      userId,
    };
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/onboard/init",
      { method: "POST", headers: authHeaders() },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      organization_id: "existing-org",
      already_existed: true,
    });
  });

  it("rejects missing, invalid, and inactive init tokens", async () => {
    const invalidVerifier = new MemoryVerifier();
    invalidVerifier.error = new JwtVerificationError();
    const inactiveVerifier = new MemoryVerifier();
    inactiveVerifier.verified = {
      subject: userId,
      payload: { sub: userId },
      isActive: false,
    };
    const missing = await createTestApp().app.request(
      "/api/v1/onboard/init",
      { method: "POST" },
      env(),
    );
    const invalid = await createTestApp({
      verifier: invalidVerifier,
    }).app.request(
      "/api/v1/onboard/init",
      { method: "POST", headers: authHeaders("bad-token") },
      env(),
    );
    const inactive = await createTestApp({
      verifier: inactiveVerifier,
    }).app.request(
      "/api/v1/onboard/init",
      { method: "POST", headers: authHeaders() },
      env(),
    );

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(inactive.status).toBe(403);
  });

  it("upgrades the local onboarding user when JWT email matches payload email", async () => {
    const { app, repository, welcomeSender } = createTestApp();
    const response = await app.request(
      "/api/v1/onboard/upgrade",
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          email: "real@example.com",
          organization_name: "Acme Corp",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(repository.upgradeCalls).toEqual([
      {
        userId,
        organizationId: orgId,
        email: "real@example.com",
        organizationName: "Acme Corp",
      },
    ]);
    await flushSideEffects();
    expect(welcomeSender.sent[0]).toEqual({
      toEmail: "real@example.com",
      organizationName: "Acme Corp",
      dashboardUrl: "https://app.capveri.com/dashboard",
    });
  });

  it("requires auth for upgrade", async () => {
    const response = await createTestApp().app.request(
      "/api/v1/onboard/upgrade",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "real@example.com" }),
      },
      env(),
    );

    expect(response.status).toBe(401);
  });

  it("rejects upgrade email mismatch before writing local rows", async () => {
    const { app, repository, welcomeSender } = createTestApp();
    const response = await app.request(
      "/api/v1/onboard/upgrade",
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ email: "attacker@example.com" }),
      },
      env(),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      detail: "Email must match the authenticated Supabase account",
    });
    expect(repository.upgradeCalls).toHaveLength(0);
    expect(welcomeSender.sent).toHaveLength(0);
  });

  it("returns 404 when upgrade is called before init created a user row", async () => {
    const repository = new MemoryOnboardingRepository();
    repository.upgradeResult = { state: "user_not_found" };
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/onboard/upgrade",
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ email: "real@example.com" }),
      },
      env(),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      detail: "User record not found. Call /onboard/init first.",
    });
  });

  it("falls back organization name and swallows welcome email failures", async () => {
    const welcomeSender = new MemoryWelcomeSender();
    welcomeSender.fail = true;
    const { app, repository } = createTestApp({ welcomeSender });
    const response = await app.request(
      "/api/v1/onboard/upgrade",
      {
        method: "PATCH",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ email: "real@example.com" }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.upgradeCalls[0]?.organizationName).toBe("Real");
  });
});
