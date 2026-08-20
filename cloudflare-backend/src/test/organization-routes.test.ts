import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import { PostgresOrganizationRepository } from "../adapters/db/organization";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";
import type {
  OrganizationRepository,
  OrganizationSettings,
  RawOrganizationSettings,
} from "../domain/organization/repository";
import type { AppEnv } from "../env";
import { createOrganizationRoutes } from "../http/organization-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG_ID = "99999999-9999-4999-8999-999999999999";
const USER_ID = "22222222-2222-4222-8222-222222222222";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

const defaultSettings: OrganizationSettings = {
  timezone: "America/New_York",
  default_currency: "USD",
  fiscal_year_end_month: 12,
  contact_name: null,
  contact_title: null,
  contact_company: null,
  contact_phone: null,
  contact_email: null,
  contact_address: null,
};

class MemoryOrganizationRepository implements OrganizationRepository {
  readonly properties = [
    { id: "property-a", organization_id: ORG_ID },
    { id: "property-b", organization_id: ORG_ID },
    { id: "property-c", organization_id: OTHER_ORG_ID },
  ];
  readonly users = [
    { id: USER_ID, organization_id: ORG_ID },
    { id: "user-b", organization_id: ORG_ID },
    { id: "user-c", organization_id: OTHER_ORG_ID },
  ];
  settings: RawOrganizationSettings | null = null;
  updatedSettings: RawOrganizationSettings | null = null;

  async getUsage(organizationId: string) {
    return {
      properties: this.properties.filter(
        (property) => property.organization_id === organizationId,
      ).length,
      users: this.users.filter(
        (user) => user.organization_id === organizationId,
      ).length,
    };
  }

  async getSettings() {
    return this.settings
      ? { raw: this.settings, settings: normalizeTestSettings(this.settings) }
      : null;
  }

  async updateSettings(input: {
    organizationId: string;
    settings: RawOrganizationSettings;
  }) {
    this.updatedSettings = input.settings;
    this.settings = input.settings;

    return input.organizationId === ORG_ID
      ? { raw: input.settings, settings: normalizeTestSettings(input.settings) }
      : null;
  }
}

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

function createRecordingExecutor(): {
  executor: PostgresExecutor;
  statements: RecordedStatement[];
  settings: RawOrganizationSettings | null;
} {
  const statements: RecordedStatement[] = [];
  let storedSettings: RawOrganizationSettings | null = {
    ...defaultSettings,
    timezone: "America/Chicago",
    billing_activation: { checkout_required: true },
  };

  return {
    statements,
    get settings() {
      return storedSettings;
    },
    executor: {
      async query<Row>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<QueryResult<Row>> {
        statements.push({ sql, params });

        if (sql.includes("from properties") && sql.includes("from users")) {
          return {
            rows: [{ properties: "2", users: "3" } as Row],
          };
        }

        if (sql.startsWith("select settings from organizations")) {
          return {
            rows: storedSettings ? [{ settings: storedSettings } as Row] : [],
          };
        }

        if (sql.startsWith("update organizations")) {
          storedSettings = params[1] as RawOrganizationSettings;

          return {
            rows: [{ settings: storedSettings } as Row],
          };
        }

        return { rows: [] };
      },
      async transaction<Result>(
        operation: (executor: PostgresExecutor) => Promise<Result>,
      ) {
        return operation(this);
      },
    },
  };
}

function createAuthContext(
  role: AuthVariables["auth"]["actor"]["role"] = "member",
): AuthenticatedUserContext {
  return {
    user: {
      id: USER_ID,
      organizationId: ORG_ID,
      email: "user@example.test",
      fullName: "Test User",
      role,
      isPlatformAdmin: false,
      createdAt: "2026-06-12T00:00:00Z",
      updatedAt: "2026-06-12T00:00:00Z",
    },
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

function createTestApp(options: {
  repository?: MemoryOrganizationRepository;
  role?: AuthVariables["auth"]["actor"]["role"];
}) {
  const repository = options.repository ?? new MemoryOrganizationRepository();
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
    createOrganizationRoutes({
      repository,
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    }),
  );

  return { app, repository };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
  } as unknown as AppEnv;
}

function normalizeTestSettings(
  settings: RawOrganizationSettings,
): OrganizationSettings {
  return {
    ...defaultSettings,
    timezone:
      typeof settings.timezone === "string"
        ? settings.timezone
        : defaultSettings.timezone,
    default_currency:
      typeof settings.default_currency === "string"
        ? settings.default_currency
        : defaultSettings.default_currency,
    fiscal_year_end_month:
      typeof settings.fiscal_year_end_month === "number"
        ? settings.fiscal_year_end_month
        : defaultSettings.fiscal_year_end_month,
    contact_name:
      typeof settings.contact_name === "string" ? settings.contact_name : null,
    contact_title:
      typeof settings.contact_title === "string"
        ? settings.contact_title
        : null,
    contact_company:
      typeof settings.contact_company === "string"
        ? settings.contact_company
        : null,
    contact_phone:
      typeof settings.contact_phone === "string"
        ? settings.contact_phone
        : null,
    contact_email:
      typeof settings.contact_email === "string"
        ? settings.contact_email
        : null,
    contact_address:
      typeof settings.contact_address === "string"
        ? settings.contact_address
        : null,
  };
}

describe("organization routes", () => {
  it("returns organization-scoped usage counts", async () => {
    const { app } = createTestApp({});
    const response = await app.request(
      "/api/v1/organization/usage",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      properties: 2,
      users: 2,
    });
  });

  it("returns default settings when organization settings are empty", async () => {
    const { app } = createTestApp({});
    const response = await app.request(
      "/api/v1/organization/settings",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      organization_id: ORG_ID,
      ...defaultSettings,
    });
  });

  it("preserves optional contact fields when present", async () => {
    const repository = new MemoryOrganizationRepository();
    repository.settings = {
      ...defaultSettings,
      contact_name: "Jordan Lee",
      contact_title: "Asset Manager",
      contact_company: "CapVeri Holdings",
      contact_phone: "555-0100",
      contact_email: "jordan@example.test",
      contact_address: "100 Main St",
    };
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/organization/settings",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      contact_name: "Jordan Lee",
      contact_title: "Asset Manager",
      contact_company: "CapVeri Holdings",
      contact_phone: "555-0100",
      contact_email: "jordan@example.test",
      contact_address: "100 Main St",
    });
  });

  it("requires owner role for settings updates", async () => {
    const responses = await Promise.all(
      (["admin", "member", "tenant"] as const).map((role) =>
        createTestApp({ role }).app.request(
          "/api/v1/organization/settings",
          {
            method: "PATCH",
            headers: {
              authorization: "Bearer valid-token",
              "content-type": "application/json",
            },
            body: JSON.stringify({ timezone: "America/Chicago" }),
          },
          env(),
        ),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 403,
    ]);
  });

  it("forbids tenant actors from reading organization endpoints", async () => {
    const usageResponse = await createTestApp({ role: "tenant" }).app.request(
      "/api/v1/organization/usage",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const settingsResponse = await createTestApp({
      role: "tenant",
    }).app.request(
      "/api/v1/organization/settings",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(usageResponse.status).toBe(403);
    expect(settingsResponse.status).toBe(403);
  });

  it("merges partial settings updates and clears explicit nullable fields", async () => {
    const repository = new MemoryOrganizationRepository();
    repository.settings = {
      ...defaultSettings,
      timezone: "America/Los_Angeles",
      contact_name: "Existing Contact",
      billing_activation: { checkout_required: true },
    };
    const { app } = createTestApp({ repository, role: "owner" });
    const response = await app.request(
      "/api/v1/organization/settings",
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          default_currency: "CAD",
          contact_name: null,
          contact_phone: "555-0199",
        }),
      },
      env(),
    );

    expect(response.status).toBe(200);
    expect(repository.updatedSettings).toEqual({
      ...defaultSettings,
      timezone: "America/Los_Angeles",
      default_currency: "CAD",
      contact_name: null,
      contact_phone: "555-0199",
      billing_activation: { checkout_required: true },
    });
    await expect(response.json()).resolves.toMatchObject({
      organization_id: ORG_ID,
      default_currency: "CAD",
      contact_name: null,
      contact_phone: "555-0199",
    });
  });

  it("validates fiscal year month and string length constraints", async () => {
    const monthResponse = await createTestApp({ role: "owner" }).app.request(
      "/api/v1/organization/settings",
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ fiscal_year_end_month: 13 }),
      },
      env(),
    );
    const lengthResponse = await createTestApp({ role: "owner" }).app.request(
      "/api/v1/organization/settings",
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ contact_phone: "1".repeat(51) }),
      },
      env(),
    );

    expect(monthResponse.status).toBe(422);
    expect(lengthResponse.status).toBe(422);
  });

  it("returns validation errors for malformed JSON bodies", async () => {
    const response = await createTestApp({ role: "owner" }).app.request(
      "/api/v1/organization/settings",
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer valid-token",
          "content-type": "application/json",
        },
        body: "{",
      },
      env(),
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      detail: "request: Invalid JSON",
      error: { code: "validation_error" },
    });
  });
});

describe("organization Postgres adapter", () => {
  it("uses organization-scoped SQL for usage counts", async () => {
    const { executor, statements } = createRecordingExecutor();
    const repository = new PostgresOrganizationRepository(executor);

    await expect(repository.getUsage(ORG_ID)).resolves.toEqual({
      properties: 2,
      users: 3,
    });

    expect(statements[0]).toEqual({
      sql: [
        "select",
        "(select count(*) from properties where organization_id = $1) as properties,",
        "(select count(*) from users where organization_id = $1) as users",
      ].join(" "),
      params: [ORG_ID],
    });
  });

  it("scopes settings reads and updates by organization id", async () => {
    const { executor, statements } = createRecordingExecutor();
    const repository = new PostgresOrganizationRepository(executor);

    await expect(repository.getSettings(ORG_ID)).resolves.toMatchObject({
      raw: { billing_activation: { checkout_required: true } },
      settings: { timezone: "America/Chicago" },
    });
    await expect(
      repository.updateSettings({
        organizationId: ORG_ID,
        settings: {
          ...defaultSettings,
          timezone: "America/Denver",
          billing_activation: { checkout_required: true },
        },
      }),
    ).resolves.toMatchObject({
      raw: { billing_activation: { checkout_required: true } },
      settings: { timezone: "America/Denver" },
    });

    expect(statements[0]).toEqual({
      sql: "select settings from organizations where id = $1",
      params: [ORG_ID],
    });
    expect(statements[1]).toEqual({
      sql: [
        "update organizations",
        "set settings = $2",
        "where id = $1",
        "returning settings",
      ].join(" "),
      params: [
        ORG_ID,
        {
          ...defaultSettings,
          timezone: "America/Denver",
          billing_activation: { checkout_required: true },
        },
      ],
    });
  });
});
