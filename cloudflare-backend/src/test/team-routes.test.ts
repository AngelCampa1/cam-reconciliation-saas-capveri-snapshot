import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type { SupabaseAdminAuthClient } from "../adapters/auth/supabase-admin";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  TeamInvitationEmailSender,
  TeamWelcomeEmailSender,
} from "../adapters/email/resend";
import type {
  CreateTeamInvitationInput,
  InvitedTeamUser,
  TeamInvitation,
  TeamInvitationValidation,
  TeamMember,
  TeamRepository,
} from "../domain/team/repository";
import { TERMS_HASH, TERMS_VERSION } from "../domain/legal/terms";
import type { AppEnv } from "../env";
import { createTeamRoutes } from "../http/team-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const MEMBER_ID = "33333333-3333-4333-8333-333333333333";
const OWNER_ID = "44444444-4444-4444-8444-444444444444";
const INVITATION_ID = "55555555-5555-4555-8555-555555555555";
const sentryDsn = "https://public@example.ingest.sentry.io/12345";

afterEach(() => {
  vi.unstubAllGlobals();
});

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryTeamRepository implements TeamRepository {
  organizationName = "Ventora Labs";
  readonly createdInvitations: CreateTeamInvitationInput[] = [];
  readonly legalAcceptances: unknown[] = [];
  members = new Map<string, TeamMember>([
    [
      USER_ID,
      member({ id: USER_ID, email: "owner@example.com", role: "admin" }),
    ],
    [
      MEMBER_ID,
      member({ id: MEMBER_ID, email: "member@example.com", role: "viewer" }),
    ],
    [
      OWNER_ID,
      member({ id: OWNER_ID, email: "founder@example.com", role: "owner" }),
    ],
  ]);
  invitations = new Map<string, TeamInvitation>([
    [INVITATION_ID, invitation({ id: INVITATION_ID })],
    [
      "valid-token-valid-token-valid-token-123",
      invitation({
        id: "77777777-7777-4777-8777-777777777777",
        token: "valid-token-valid-token-valid-token-123",
        email: "invited@example.com",
      }),
    ],
  ]);

  async getOrganizationName(): Promise<string | null> {
    return this.organizationName;
  }

  async listMembers(input: { currentUserId: string }): Promise<TeamMember[]> {
    return [...this.members.values()].map((row) => ({
      ...row,
      is_current_user: row.id === input.currentUserId,
    }));
  }

  async getMember(input: {
    memberId: string;
    currentUserId: string;
  }): Promise<TeamMember | null> {
    const row = this.members.get(input.memberId);
    return row
      ? { ...row, is_current_user: row.id === input.currentUserId }
      : null;
  }

  async updateMemberRole(input: {
    memberId: string;
    role: "admin" | "member" | "viewer";
    updatedAt: string;
    currentUserId: string;
  }): Promise<TeamMember | null> {
    const row = this.members.get(input.memberId);
    if (!row || row.role === "owner") {
      return null;
    }
    const updated = {
      ...row,
      role: input.role,
      updated_at: input.updatedAt,
      is_current_user: row.id === input.currentUserId,
    };
    this.members.set(input.memberId, updated);
    return updated;
  }

  async removeMember(input: { memberId: string }): Promise<boolean> {
    const row = this.members.get(input.memberId);
    if (!row || row.role === "owner") {
      return false;
    }
    return this.members.delete(input.memberId);
  }

  async createInvitation(
    input: CreateTeamInvitationInput,
  ): Promise<TeamInvitation> {
    this.createdInvitations.push(input);
    const record = invitation({
      id: input.id,
      email: input.email,
      role: input.role,
      token: input.token,
      organization_id: input.organizationId,
      invited_by: input.invitedBy,
      expires_at: input.expiresAt,
      created_at: input.createdAt,
    });
    this.invitations.set(record.id, record);
    return record;
  }

  async listInvitations(input: {
    includeUsed: boolean;
  }): Promise<TeamInvitation[]> {
    return [...this.invitations.values()].filter(
      (row) => input.includeUsed || (!row.used_at && !row.revoked_at),
    );
  }

  async getInvitation(input: {
    invitationId: string;
  }): Promise<TeamInvitation | null> {
    return this.invitations.get(input.invitationId) ?? null;
  }

  async revokeInvitation(input: {
    invitationId: string;
    revokedAt: string;
  }): Promise<TeamInvitation | null> {
    const row = this.invitations.get(input.invitationId);
    if (!row || row.used_at || row.revoked_at) {
      return null;
    }
    const revoked = { ...row, revoked_at: input.revokedAt };
    this.invitations.set(input.invitationId, revoked);
    return revoked;
  }

  async getInvitationByToken(
    token: string,
  ): Promise<TeamInvitationValidation | null> {
    const row = [...this.invitations.values()].find(
      (candidate) => candidate.token === token,
    );
    return row ? { ...row, organization_name: this.organizationName } : null;
  }

  async upsertInvitedUser(input: {
    id: string;
    organizationId: string;
    email: string;
    fullName: string;
    role: "admin" | "member" | "viewer";
    timestamp: string;
  }): Promise<InvitedTeamUser | null> {
    const row: InvitedTeamUser = {
      id: input.id,
      organization_id: input.organizationId,
      email: input.email,
      full_name: input.fullName,
      role: input.role,
      created_at: input.timestamp,
      updated_at: input.timestamp,
    };
    this.members.set(input.id, {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      role: row.role,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_current_user: false,
    });
    return row;
  }

  async recordLegalAcceptance(input: {
    userId: string;
    organizationId: string;
    acceptedAt: string;
    source: string;
    ipAddress: string | null;
    userAgent: string | null;
  }): Promise<void> {
    this.legalAcceptances.push(input);
  }

  async getUserForInvitationAccept(
    userId: string,
  ): Promise<InvitedTeamUser | null> {
    const row = this.members.get(userId);
    return row
      ? {
          id: row.id,
          organization_id: ORG_ID,
          email: row.email,
          full_name: row.full_name,
          role: row.role,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }
      : null;
  }

  async updateExistingUserInvitationRole(input: {
    userId: string;
    role: "admin" | "member" | "viewer";
    updatedAt: string;
  }): Promise<boolean> {
    const row = this.members.get(input.userId);
    if (!row) {
      return false;
    }
    this.members.set(input.userId, {
      ...row,
      role: input.role,
      updated_at: input.updatedAt,
    });
    return true;
  }

  async markInvitationUsed(input: {
    token: string;
    usedByUserId: string;
    usedAt: string;
  }): Promise<boolean> {
    const row = [...this.invitations.values()].find(
      (candidate) => candidate.token === input.token,
    );
    if (!row || row.used_at) {
      return false;
    }
    const used = {
      ...row,
      used_at: input.usedAt,
      used_by_user_id: input.usedByUserId,
    };
    this.invitations.set(used.id, used);
    return true;
  }
}

class MemoryEmailSender implements TeamInvitationEmailSender {
  fail = false;
  readonly sent: Parameters<
    TeamInvitationEmailSender["sendTeamInvitation"]
  >[0][] = [];

  async sendTeamInvitation(
    input: Parameters<TeamInvitationEmailSender["sendTeamInvitation"]>[0],
  ): Promise<void> {
    if (this.fail) {
      throw new Error("team invitation email failed");
    }
    this.sent.push(input);
  }
}

class MemoryWelcomeEmailSender implements TeamWelcomeEmailSender {
  fail = false;
  readonly sent: Parameters<TeamWelcomeEmailSender["sendTeamWelcome"]>[0][] =
    [];

  async sendTeamWelcome(
    input: Parameters<TeamWelcomeEmailSender["sendTeamWelcome"]>[0],
  ): Promise<void> {
    if (this.fail) {
      throw new Error("team welcome email failed");
    }
    this.sent.push(input);
  }
}

class MemoryAuthClient implements SupabaseAdminAuthClient {
  readonly createdUsers: {
    email: string;
    password: string;
    metadata: Record<string, string | boolean>;
  }[] = [];

  async createUser(input: {
    email: string;
    password: string;
    metadata: Record<string, string | boolean>;
  }): Promise<{ id: string; email: string }> {
    this.createdUsers.push(input);
    return {
      id: "99999999-9999-4999-8999-999999999999",
      email: input.email,
    };
  }

  async signInWithPassword(): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    return { accessToken: "access-token", refreshToken: "refresh-token" };
  }

  async deleteUser(): Promise<void> {
    return undefined;
  }
}

class FailingAuthClient extends MemoryAuthClient {
  override async createUser(): Promise<{ id: string; email: string }> {
    throw new Error("Supabase Auth user creation failed: upstream secret body");
  }
}

describe("team admin routes", () => {
  it("lists team members for admins and marks the current user", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      "/api/v1/team/members",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: USER_ID, is_current_user: true }),
        expect.objectContaining({ id: MEMBER_ID, role: "viewer" }),
      ]),
    );
  });

  it("rejects non-admin users", async () => {
    const { app } = createTestApp({ role: "member" });

    const response = await app.request(
      "/api/v1/team/members",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(403);
  });

  it("updates manageable member roles but not owner or self roles", async () => {
    const { app } = createTestApp();

    const updated = await app.request(
      `/api/v1/team/members/${MEMBER_ID}`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ role: "member" }),
      },
      testEnv(),
    );
    const owner = await app.request(
      `/api/v1/team/members/${OWNER_ID}`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ role: "viewer" }),
      },
      testEnv(),
    );
    const self = await app.request(
      `/api/v1/team/members/${USER_ID}`,
      {
        method: "PATCH",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({ role: "viewer" }),
      },
      testEnv(),
    );

    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      id: MEMBER_ID,
      role: "member",
    });
    expect(owner.status).toBe(400);
    expect(self.status).toBe(400);
  });

  it("removes manageable members", async () => {
    const { app, repository } = createTestApp();

    const response = await app.request(
      `/api/v1/team/members/${MEMBER_ID}`,
      { method: "DELETE", headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "removed",
      member_id: MEMBER_ID,
    });
    expect(repository.members.has(MEMBER_ID)).toBe(false);
  });

  it("creates invitations and schedules a team invitation email", async () => {
    const emailSender = new MemoryEmailSender();
    const { app, repository } = createTestApp({ emailSender });

    const response = await app.request(
      "/api/v1/team/invitations",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          email: "New.Member@Example.com",
          role: "admin",
        }),
      },
      testEnv(),
    );
    await Promise.resolve();

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      email: "new.member@example.com",
      role: "admin",
      token: "AQIDBA",
      organization_id: ORG_ID,
      invited_by: USER_ID,
    });
    expect(repository.createdInvitations).toHaveLength(1);
    expect(emailSender.sent).toEqual([
      expect.objectContaining({
        toEmail: "new.member@example.com",
        invitationToken: "AQIDBA",
        organizationName: "Ventora Labs",
        role: "admin",
        signupUrl: "https://www.capveri.com/team/signup?token=AQIDBA",
      }),
    ]);
  });

  it("reports team invitation email failures without failing invitation creation", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const emailSender = new MemoryEmailSender();
    emailSender.fail = true;
    const { app } = createTestApp({ emailSender });

    const response = await app.request(
      "/api/v1/team/invitations",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          email: "New.Member@Example.com",
          role: "admin",
        }),
      },
      { ...testEnv(), SENTRY_DSN: sentryDsn },
    );

    expect(response.status).toBe(201);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      "\"operation\":\"worker.best_effort.team_invitation_email\"",
    );
  });

  it("lists and revokes pending invitations", async () => {
    const { app } = createTestApp();

    const list = await app.request(
      "/api/v1/team/invitations",
      { headers: authHeaders() },
      testEnv(),
    );
    const revoke = await app.request(
      `/api/v1/team/invitations/${INVITATION_ID}`,
      { method: "DELETE", headers: authHeaders() },
      testEnv(),
    );

    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: INVITATION_ID })]),
    );
    expect(revoke.status).toBe(200);
    await expect(revoke.json()).resolves.toEqual({
      status: "revoked",
      invitation_id: INVITATION_ID,
    });
  });

  it("does not auth-gate public team invitation validation paths", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      "/api/v1/team/invitations/public-token/validate",
      {},
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      valid: false,
      error_reason: "not_found",
    });
  });

  it("validates public invitation tokens without enumerating invalid tokens", async () => {
    const { app } = createTestApp();

    const valid = await app.request(
      "/api/v1/team/invitations/valid-token-valid-token-valid-token-123/validate",
      {},
      testEnv(),
    );
    const invalid = await app.request(
      "/api/v1/team/invitations/short/validate",
      {},
      testEnv(),
    );

    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toMatchObject({
      valid: true,
      email: "invited@example.com",
      organization_name: "Ventora Labs",
      role: "member",
    });
    expect(invalid.status).toBe(200);
    await expect(invalid.json()).resolves.toEqual({
      valid: false,
      error_reason: "not_found",
    });
  });

  it("completes public team signup and records legal acceptance", async () => {
    const authClient = new MemoryAuthClient();
    const welcomeEmailSender = new MemoryWelcomeEmailSender();
    const { app, repository } = createTestApp({
      authClient,
      welcomeEmailSender,
    });

    const response = await app.request(
      "/api/v1/team/signup",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "203.0.113.10",
          "User-Agent": "vitest",
        },
        body: JSON.stringify({
          token: "valid-token-valid-token-valid-token-123",
          password: "StrongPass1",
          full_name: "Invited User",
          accepted_terms: true,
          terms_version: TERMS_VERSION,
          terms_hash: TERMS_HASH,
        }),
      },
      testEnv(),
    );
    await Promise.resolve();

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      user_id: "99999999-9999-4999-8999-999999999999",
      access_token: "access-token",
      refresh_token: "refresh-token",
      user: {
        email: "invited@example.com",
        role: "member",
        organization_name: "Ventora Labs",
      },
    });
    expect(authClient.createdUsers).toEqual([
      {
        email: "invited@example.com",
        password: "StrongPass1",
        metadata: {
          full_name: "Invited User",
          invited_by: "team_invitation",
          accepted_terms: true,
        },
      },
    ]);
    expect(repository.legalAcceptances).toEqual([
      expect.objectContaining({
        userId: "99999999-9999-4999-8999-999999999999",
        organizationId: ORG_ID,
        source: "team_invitation_signup",
        ipAddress: "203.0.113.10",
        userAgent: "vitest",
      }),
    ]);
    expect(welcomeEmailSender.sent).toEqual([
      expect.objectContaining({
        toEmail: "invited@example.com",
        fullName: "Invited User",
        organizationName: "Ventora Labs",
        role: "member",
      }),
    ]);
  });

  it("reports team welcome email failures without failing public signup", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    const welcomeEmailSender = new MemoryWelcomeEmailSender();
    welcomeEmailSender.fail = true;
    const { app } = createTestApp({ welcomeEmailSender });

    const response = await app.request(
      "/api/v1/team/signup",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "203.0.113.10",
          "User-Agent": "vitest",
        },
        body: JSON.stringify({
          token: "valid-token-valid-token-valid-token-123",
          password: "StrongPass1",
          full_name: "Invited User",
          accepted_terms: true,
          terms_version: TERMS_VERSION,
          terms_hash: TERMS_HASH,
        }),
      },
      { ...testEnv(), SENTRY_DSN: sentryDsn },
    );

    expect(response.status).toBe(201);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      "\"operation\":\"worker.best_effort.team_welcome_email\"",
    );
  });

  it("returns gone for invalid team signup tokens", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      "/api/v1/team/signup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "missing-token-missing-token-missing-1",
          password: "StrongPass1",
          full_name: "Invited User",
          accepted_terms: true,
          terms_version: TERMS_VERSION,
          terms_hash: TERMS_HASH,
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      detail: {
        message: "Invalid invitation token",
        reason: "not_found",
      },
    });
  });

  it("does not expose upstream auth errors during team signup", async () => {
    const { app } = createTestApp({ authClient: new FailingAuthClient() });

    const response = await app.request(
      "/api/v1/team/signup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "valid-token-valid-token-valid-token-123",
          password: "StrongPass1",
          full_name: "Invited User",
          accepted_terms: true,
          terms_version: TERMS_VERSION,
          terms_hash: TERMS_HASH,
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      detail: "Team operation failed",
      error: {
        code: "team_operation_failed",
        message: "Team operation failed",
      },
    });
  });

  it("accepts invitations for authenticated existing matching users", async () => {
    const { app, repository } = createTestApp({
      email: "invited@example.com",
    });

    const response = await app.request(
      "/api/v1/team/invitations/accept",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          token: "valid-token-valid-token-valid-token-123",
          user_id: USER_ID,
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "Team invitation accepted successfully",
    });
    expect(repository.members.get(USER_ID)?.role).toBe("member");
  });

  it("rejects invitation acceptance for a different authenticated user", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      "/api/v1/team/invitations/accept",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          token: "valid-token-valid-token-valid-token-123",
          user_id: MEMBER_ID,
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(403);
  });
});

function createTestApp(
  options: {
    role?: AuthVariables["auth"]["actor"]["role"];
    email?: string;
    authClient?: SupabaseAdminAuthClient;
    emailSender?: TeamInvitationEmailSender;
    welcomeEmailSender?: TeamWelcomeEmailSender;
  } = {},
): {
  app: Hono<{ Bindings: AppEnv; Variables: AuthVariables }>;
  repository: MemoryTeamRepository;
} {
  const repository = new MemoryTeamRepository();
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createTeamRoutes({
      repository,
      authClient: options.authClient ?? new MemoryAuthClient(),
      emailSender: options.emailSender ?? new MemoryEmailSender(),
      welcomeEmailSender:
        options.welcomeEmailSender ?? new MemoryWelcomeEmailSender(),
      clock: () => new Date("2026-06-13T00:00:00.000Z"),
      randomUuid: () => "66666666-6666-4666-8666-666666666666",
      randomBytes: () => new Uint8Array([1, 2, 3, 4]),
      auth: {
        verifier: jwtVerifier(),
        db: {
          mode: "postgrest-compat",
          auth: authRepository(options.role ?? "admin", options.email),
          protectedRecords,
        },
      },
    }),
  );
  return { app, repository };
}

function member(
  input: Partial<TeamMember> & { id: string; email: string },
): TeamMember {
  return {
    full_name: null,
    role: "member",
    created_at: "2026-06-13T00:00:00Z",
    updated_at: "2026-06-13T00:00:00Z",
    is_current_user: false,
    ...input,
  };
}

function invitation(input: Partial<TeamInvitation> = {}): TeamInvitation {
  return {
    id: INVITATION_ID,
    email: "pending@example.com",
    role: "member",
    token: "pending-token",
    organization_id: ORG_ID,
    invited_by: USER_ID,
    expires_at: "2026-06-20T00:00:00.000Z",
    used_at: null,
    used_by_user_id: null,
    revoked_at: null,
    created_at: "2026-06-13T00:00:00.000Z",
    ...input,
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
  email = "admin@example.com",
): DbAdapter["auth"] & AuthRepository {
  return {
    async resolveUserContext(): Promise<AuthenticatedUserContext> {
      return {
        actor: {
          userId: USER_ID,
          organizationId: ORG_ID,
          role,
          isServiceAdmin: false,
          party: "landlord",
          bearerToken: "valid-token",
        },
        user: {
          id: USER_ID,
          organizationId: ORG_ID,
          email,
          fullName: "Admin User",
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
    DATABASE_URL: "postgres://example",
    MARKETING_BASE_URL: "https://www.capveri.com",
    RESEND_API_KEY: "resend",
    RESEND_FROM_ADDRESS: "CapVeri <hello@capveri.com>",
    PROTECTED_RECORDS: protectedRecords,
  } as unknown as AppEnv;
}
