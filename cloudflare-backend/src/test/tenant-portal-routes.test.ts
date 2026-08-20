import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  DbAdapter,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  TenantDashboard,
  TenantEmailPreferences,
  TenantEmailPreferencesPatch,
  TenantNotification,
  TenantPortalRepository,
} from "../domain/tenant-portal/repository";
import type { AppEnv } from "../env";
import { createTenantPortalRoutes } from "../http/tenant-portal-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_USER_ID = "33333333-3333-4333-8333-333333333333";
const NOTIFICATION_ID = "44444444-4444-4444-8444-444444444444";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryTenantPortalRepository implements TenantPortalRepository {
  dashboard: TenantDashboard = {
    leases: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        property: {
          id: "66666666-6666-4666-8666-666666666666",
          name: "Market Plaza",
          address: "100 Main St, Dallas, TX 75201",
        },
        unit: {
          id: "77777777-7777-4777-8777-777777777777",
          unit_number: "101",
          rentable_sqft: "2500",
        },
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        pro_rata_share: "0.125",
        base_year: 2025,
      },
    ],
    statements: [
      {
        id: "88888888-8888-4888-8888-888888888888",
        property_name: "Market Plaza",
        period_start: "2026-01-01",
        period_end: "2026-12-31",
        tenant_share: "1234.56",
        status: "pending",
        pdf_url:
          "/api/v1/tenant/statements/88888888-8888-4888-8888-888888888888/pdf",
        created_at: "2026-06-13",
      },
    ],
    unread_notifications: 1,
  };
  notifications: TenantNotification[] = [
    {
      id: NOTIFICATION_ID,
      tenant_user_id: TENANT_USER_ID,
      notification_type: "new_statement",
      title: "New statement",
      message: "Your CAM statement is ready.",
      link_url: "/tenant/dashboard",
      related_entity_id: null,
      read_at: null,
      created_at: "2026-06-13T00:00:00.000Z",
    },
  ];
  preferences: TenantEmailPreferences | null = null;

  async getDashboard(input: {
    tenantUserId: string;
    organizationId: string;
  }): Promise<TenantDashboard> {
    expect(input).toEqual({
      tenantUserId: TENANT_USER_ID,
      organizationId: ORG_ID,
    });
    return this.dashboard;
  }

  async listNotifications(input: {
    tenantUserId: string;
    unreadOnly: boolean;
    skip: number;
    limit: number;
  }): Promise<TenantNotification[]> {
    expect(input.tenantUserId).toBe(TENANT_USER_ID);
    const rows = input.unreadOnly
      ? this.notifications.filter((row) => !row.read_at)
      : this.notifications;
    return rows.slice(input.skip, input.skip + input.limit);
  }

  async markNotificationRead(input: {
    tenantUserId: string;
    notificationId: string;
    readAt: string;
  }): Promise<boolean> {
    const row = this.notifications.find(
      (notification) =>
        notification.id === input.notificationId &&
        notification.tenant_user_id === input.tenantUserId,
    );
    if (!row) {
      return false;
    }
    row.read_at = input.readAt;
    return true;
  }

  async markAllNotificationsRead(input: {
    tenantUserId: string;
    readAt: string;
  }): Promise<number> {
    let count = 0;
    for (const row of this.notifications) {
      if (row.tenant_user_id === input.tenantUserId && !row.read_at) {
        row.read_at = input.readAt;
        count += 1;
      }
    }
    return count;
  }

  async getEmailPreferences(input: {
    tenantUserId: string;
    timestamp: string;
  }): Promise<TenantEmailPreferences> {
    return (
      this.preferences ?? {
        tenant_user_id: input.tenantUserId,
        new_statement_emails: true,
        dispute_update_emails: true,
        reminder_emails: true,
        marketing_emails: false,
        updated_at: input.timestamp,
      }
    );
  }

  async updateEmailPreferences(input: {
    tenantUserId: string;
    patch: TenantEmailPreferencesPatch;
    updatedAt: string;
  }): Promise<TenantEmailPreferences | null> {
    this.preferences = {
      tenant_user_id: input.tenantUserId,
      new_statement_emails: true,
      dispute_update_emails: true,
      reminder_emails: true,
      marketing_emails: false,
      ...(this.preferences ?? {}),
      ...input.patch,
      updated_at: input.updatedAt,
    };
    return this.preferences;
  }
}

describe("tenant portal routes", () => {
  it("returns tenant dashboard data for tenant users", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      "/api/v1/tenant/dashboard",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      leases: [expect.objectContaining({ pro_rata_share: "0.125" })],
      statements: [expect.objectContaining({ tenant_share: "1234.56" })],
      unread_notifications: 1,
    });
  });

  it("rejects landlord users from tenant portal routes", async () => {
    const { app } = createTestApp({ party: "landlord", role: "admin" });

    const response = await app.request(
      "/api/v1/tenant/dashboard",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(403);
  });

  it("lists and marks tenant notifications", async () => {
    const { app } = createTestApp();

    const list = await app.request(
      "/api/v1/tenant/notifications?unread_only=true&skip=0&limit=20",
      { headers: authHeaders() },
      testEnv(),
    );
    const mark = await app.request(
      `/api/v1/tenant/notifications/${NOTIFICATION_ID}/read`,
      { method: "POST", headers: authHeaders() },
      testEnv(),
    );
    const after = await app.request(
      "/api/v1/tenant/notifications?unread_only=true",
      { headers: authHeaders() },
      testEnv(),
    );

    expect(list.status).toBe(200);
    await expect(list.json()).resolves.toHaveLength(1);
    expect(mark.status).toBe(200);
    await expect(mark.json()).resolves.toEqual({ status: "ok" });
    await expect(after.json()).resolves.toEqual([]);
  });

  it("marks all notifications read", async () => {
    const { app } = createTestApp();

    const response = await app.request(
      "/api/v1/tenant/notifications/read-all",
      { method: "POST", headers: authHeaders() },
      testEnv(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ marked_read: 1 });
  });

  it("gets default preferences and applies partial updates", async () => {
    const { app } = createTestApp();

    const defaults = await app.request(
      "/api/v1/tenant/notifications/preferences",
      { headers: authHeaders() },
      testEnv(),
    );
    const updated = await app.request(
      "/api/v1/tenant/notifications/preferences",
      {
        method: "PUT",
        headers: jsonAuthHeaders(),
        body: JSON.stringify({
          marketing_emails: true,
          reminder_emails: null,
        }),
      },
      testEnv(),
    );

    expect(defaults.status).toBe(200);
    await expect(defaults.json()).resolves.toMatchObject({
      tenant_user_id: TENANT_USER_ID,
      new_statement_emails: true,
      marketing_emails: false,
    });
    expect(updated.status).toBe(200);
    await expect(updated.json()).resolves.toMatchObject({
      tenant_user_id: TENANT_USER_ID,
      reminder_emails: true,
      marketing_emails: true,
    });
  });
});

function createTestApp(
  options: {
    party?: AuthVariables["auth"]["actor"]["party"];
    role?: AuthVariables["auth"]["actor"]["role"];
  } = {},
): {
  app: Hono<{ Bindings: AppEnv; Variables: AuthVariables }>;
  repository: MemoryTenantPortalRepository;
} {
  const repository = new MemoryTenantPortalRepository();
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createTenantPortalRoutes({
      repository,
      clock: () => new Date("2026-06-13T00:00:00.000Z"),
      auth: {
        verifier: jwtVerifier(),
        db: {
          mode: "postgrest-compat",
          auth: authRepository(options),
          protectedRecords,
        },
      },
    }),
  );
  return { app, repository };
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

function authRepository(options: {
  party?: AuthVariables["auth"]["actor"]["party"];
  role?: AuthVariables["auth"]["actor"]["role"];
}): DbAdapter["auth"] & AuthRepository {
  return {
    async resolveUserContext(): Promise<AuthenticatedUserContext> {
      const party = options.party ?? "tenant";
      const role = options.role ?? (party === "tenant" ? "tenant" : "admin");
      const actor: AuthenticatedUserContext["actor"] = {
        userId: USER_ID,
        organizationId: ORG_ID,
        role,
        isServiceAdmin: false,
        party,
        bearerToken: "valid-token",
      };
      return {
        actor,
        user: {
          id: USER_ID,
          organizationId: ORG_ID,
          email: "tenant@example.com",
          fullName: "Tenant User",
          role,
          isPlatformAdmin: false,
          createdAt: "2026-06-13T00:00:00Z",
          updatedAt: "2026-06-13T00:00:00Z",
        },
        ...(party === "tenant"
          ? {
              tenantUser: {
                id: TENANT_USER_ID,
                userId: USER_ID,
                organizationId: ORG_ID,
                contactName: "Tenant User",
                contactEmail: "tenant@example.com",
                createdAt: "2026-06-13T00:00:00Z",
              },
            }
          : {}),
      };
    },
  };
}

function testEnv(): AppEnv {
  return {
    ENVIRONMENT: "development",
    APP_VERSION: "0.1.0",
    DATABASE_URL: "postgres://example",
    PROTECTED_RECORDS: protectedRecords,
  } as unknown as AppEnv;
}
