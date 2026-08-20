import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { SupabaseAdminAuthClient } from "../adapters/auth/supabase-admin";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type { TenantInvitationEmailSender } from "../adapters/email/resend";
import type {
  CreateTenantInvitationInput,
  TenantAuthRepository,
  TenantInvitation,
  TenantUser,
} from "../domain/tenant-auth/repository";
import { TERMS_HASH, TERMS_VERSION } from "../domain/legal/terms";
import type { AppEnv } from "../env";
import { createTenantAuthRoutes } from "../http/tenant-auth-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const LEASE_ID = "33333333-3333-4333-8333-333333333333";
const INVITATION_ID = "44444444-4444-4444-8444-444444444444";
const AUTH_USER_ID = "55555555-5555-4555-8555-555555555555";
const TENANT_USER_ID = "66666666-6666-4666-8666-666666666666";
const VALID_TOKEN = "valid-tenant-token-valid-tenant-token-1";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryTenantAuthRepository implements TenantAuthRepository {
  readonly createdInvitations: CreateTenantInvitationInput[] = [];
  readonly portalUsers: unknown[] = [];
  readonly leaseLinks: unknown[] = [];
  readonly legalAcceptances: unknown[] = [];
  invitations = new Map<string, TenantInvitation>([
    [INVITATION_ID, invitation()],
  ]);
  tenantUsers = new Map<string, TenantUser>();
  leaseExists = true;

  async getInvitationByToken(token: string): Promise<TenantInvitation | null> {
    return (
      [...this.invitations.values()].find((row) => row.token === token) ?? null
    );
  }

  async createInvitation(
    input: CreateTenantInvitationInput,
  ): Promise<TenantInvitation> {
    this.createdInvitations.push(input);
    const record = invitation({
      id: input.id,
      email: input.email,
      lease_id: input.leaseId,
      token: input.token,
      organization_id: input.organizationId,
      invited_by: input.invitedBy,
      expires_at: input.expiresAt,
      created_at: input.createdAt,
    });
    this.invitations.set(record.id, record);
    return record;
  }

  async leaseBelongsToOrganization(): Promise<boolean> {
    return this.leaseExists;
  }

  async upsertPortalUser(input: {
    userId: string;
    organizationId: string;
    email: string;
    contactName: string;
    timestamp: string;
  }): Promise<void> {
    this.portalUsers.push(input);
  }

  async createTenantUser(input: {
    id: string;
    userId: string;
    organizationId: string;
    contactName: string;
    contactEmail: string;
    createdAt: string;
  }): Promise<TenantUser | null> {
    const row: TenantUser = {
      id: input.id,
      user_id: input.userId,
      organization_id: input.organizationId,
      contact_name: input.contactName,
      contact_email: input.contactEmail,
      created_at: input.createdAt,
    };
    this.tenantUsers.set(row.id, row);
    return row;
  }

  async linkTenantToLease(input: {
    tenantUserId: string;
    leaseId: string;
    createdAt: string;
  }): Promise<void> {
    this.leaseLinks.push(input);
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

  async markInvitationUsed(input: {
    token: string;
    organizationId: string;
    usedAt: string;
  }): Promise<boolean> {
    const row = await this.getInvitationByToken(input.token);
    if (
      !row ||
      row.used_at ||
      row.is_revoked ||
      row.organization_id !== input.organizationId
    ) {
      return false;
    }
    this.invitations.set(row.id, { ...row, used_at: input.usedAt });
    return true;
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
    return { id: AUTH_USER_ID, email: input.email };
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

class RevokingAuthClient extends MemoryAuthClient {
  constructor(private readonly repository: MemoryTenantAuthRepository) {
    super();
  }

  override async createUser(
    input: Parameters<MemoryAuthClient["createUser"]>[0],
  ): ReturnType<MemoryAuthClient["createUser"]> {
    const row = this.repository.invitations.get(INVITATION_ID);
    if (row) {
      this.repository.invitations.set(row.id, {
        ...row,
        is_revoked: true,
      });
    }
    return super.createUser(input);
  }
}

class MemoryEmailSender implements TenantInvitationEmailSender {
  readonly sent: Parameters<
    TenantInvitationEmailSender["sendTenantInvitation"]
  >[0][] = [];

  async sendTenantInvitation(
    input: Parameters<TenantInvitationEmailSender["sendTenantInvitation"]>[0],
  ): Promise<void> {
    this.sent.push(input);
  }
}

describe("tenant auth routes", () => {
  it("validates tenant invitations publicly without auth", async () => {
    const { app } = createTestApp();

    const valid = await app.request(
      `/api/v1/tenant/invitations/${VALID_TOKEN}/validate`,
      {},
      testEnv(),
    );
    const invalid = await app.request(
      "/api/v1/tenant/invitations/short/validate",
      {},
      testEnv(),
    );

    expect(valid.status).toBe(200);
    await expect(valid.json()).resolves.toMatchObject({
      valid: true,
      email: "tenant@example.com",
      lease_id: LEASE_ID,
      organization_id: ORG_ID,
    });
    expect(invalid.status).toBe(200);
    await expect(invalid.json()).resolves.toEqual({
      valid: false,
      error_reason: "not_found",
    });
  });

  it("completes tenant signup and links the tenant to the lease", async () => {
    const authClient = new MemoryAuthClient();
    const { app, repository } = createTestApp({ authClient });

    const response = await app.request(
      "/api/v1/tenant/signup",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "203.0.113.11",
          "User-Agent": "vitest",
        },
        body: JSON.stringify({
          token: VALID_TOKEN,
          password: "StrongPass1",
          contact_name: "Tenant User",
          accepted_terms: true,
          terms_version: TERMS_VERSION,
          terms_hash: TERMS_HASH,
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      user_id: AUTH_USER_ID,
      access_token: "access-token",
      refresh_token: "refresh-token",
      tenant_user: {
        id: TENANT_USER_ID,
        user_id: AUTH_USER_ID,
        contact_email: "tenant@example.com",
      },
    });
    expect(authClient.createdUsers).toEqual([
      {
        email: "tenant@example.com",
        password: "StrongPass1",
        metadata: {
          contact_name: "Tenant User",
          invited_by: "tenant_portal",
          accepted_terms: true,
        },
      },
    ]);
    expect(repository.leaseLinks).toEqual([
      {
        tenantUserId: TENANT_USER_ID,
        leaseId: LEASE_ID,
        createdAt: "2026-06-13T00:00:00.000Z",
      },
    ]);
    expect(repository.legalAcceptances).toEqual([
      expect.objectContaining({
        userId: AUTH_USER_ID,
        organizationId: ORG_ID,
        source: "tenant_invitation_signup",
        ipAddress: "203.0.113.11",
        userAgent: "vitest",
      }),
    ]);
  });

  it("returns gone for invalid tenant signup tokens", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      "/api/v1/tenant/signup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: "missing-token-missing-token-missing-1",
          password: "StrongPass1",
          contact_name: "Tenant User",
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
        error: "Invalid invitation",
        reason: "not_found",
      },
    });
  });

  it("does not consume an invitation revoked after signup validation", async () => {
    const repository = new MemoryTenantAuthRepository();
    const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
    app.route(
      "/api/v1",
      createTenantAuthRoutes({
        repository,
        authClient: new RevokingAuthClient(repository),
        emailSender: new MemoryEmailSender(),
        clock: () => new Date("2026-06-13T00:00:00.000Z"),
        randomUuid: () => TENANT_USER_ID,
        randomBytes: () => new Uint8Array([1, 2, 3, 4]),
        auth: {
          verifier: jwtVerifier(),
          db: {
            mode: "postgrest-compat",
            auth: authRepository("admin"),
            protectedRecords,
          },
        },
      }),
    );

    const response = await app.request(
      "/api/v1/tenant/signup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: VALID_TOKEN,
          password: "StrongPass1",
          contact_name: "Tenant User",
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
        error: "Invalid invitation",
        reason: "used",
      },
    });
    expect(repository.invitations.get(INVITATION_ID)).toMatchObject({
      is_revoked: true,
      used_at: null,
    });
  });

  it("does not expose upstream auth errors during tenant signup", async () => {
    const { app } = createTestApp({ authClient: new FailingAuthClient() });

    const response = await app.request(
      "/api/v1/tenant/signup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: VALID_TOKEN,
          password: "StrongPass1",
          contact_name: "Tenant User",
          accepted_terms: true,
          terms_version: TERMS_VERSION,
          terms_hash: TERMS_HASH,
        }),
      },
      testEnv(),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      detail: "Tenant auth failed",
      error: {
        code: "tenant_auth_failed",
        message: "Tenant auth failed",
      },
    });
  });

  it("creates tenant invitations for admins and sends email", async () => {
    const emailSender = new MemoryEmailSender();
    const { app, repository } = createTestApp({ emailSender });

    const response = await app.request(
      "/api/v1/tenant/invitations",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          email: "New.Tenant@Example.com",
          lease_id: LEASE_ID,
        }),
      },
      testEnv(),
    );
    await Promise.resolve();

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      email: "new.tenant@example.com",
      lease_id: LEASE_ID,
      token: "AQIDBA",
      organization_id: ORG_ID,
      invited_by: USER_ID,
    });
    expect(repository.createdInvitations).toHaveLength(1);
    expect(emailSender.sent).toEqual([
      expect.objectContaining({
        toEmail: "new.tenant@example.com",
        invitationToken: "AQIDBA",
        signupUrl: "https://app.capveri.com/tenant/signup?token=AQIDBA",
      }),
    ]);
  });

  it("rejects tenant invitation creation for non-admins", async () => {
    const { app } = createTestApp({ role: "member" });

    const response = await app.request(
      "/api/v1/tenant/invitations",
      {
        method: "POST",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          email: "new.tenant@example.com",
          lease_id: LEASE_ID,
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
    authClient?: SupabaseAdminAuthClient;
    emailSender?: TenantInvitationEmailSender;
  } = {},
): {
  app: Hono<{ Bindings: AppEnv; Variables: AuthVariables }>;
  repository: MemoryTenantAuthRepository;
} {
  const repository = new MemoryTenantAuthRepository();
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createTenantAuthRoutes({
      repository,
      authClient: options.authClient ?? new MemoryAuthClient(),
      emailSender: options.emailSender ?? new MemoryEmailSender(),
      clock: () => new Date("2026-06-13T00:00:00.000Z"),
      randomUuid: () => TENANT_USER_ID,
      randomBytes: () => new Uint8Array([1, 2, 3, 4]),
      auth: {
        verifier: jwtVerifier(),
        db: {
          mode: "postgrest-compat",
          auth: authRepository(options.role ?? "admin"),
          protectedRecords,
        },
      },
    }),
  );
  return { app, repository };
}

function invitation(input: Partial<TenantInvitation> = {}): TenantInvitation {
  return {
    id: INVITATION_ID,
    email: "tenant@example.com",
    lease_id: LEASE_ID,
    token: VALID_TOKEN,
    organization_id: ORG_ID,
    invited_by: USER_ID,
    expires_at: "2026-06-20T00:00:00.000Z",
    used_at: null,
    is_revoked: false,
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
          email: "admin@example.com",
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
    APP_BASE_URL: "https://app.capveri.com",
    RESEND_API_KEY: "resend",
    RESEND_FROM_ADDRESS: "CapVeri <hello@capveri.com>",
    PROTECTED_RECORDS: protectedRecords,
  } as unknown as AppEnv;
}
