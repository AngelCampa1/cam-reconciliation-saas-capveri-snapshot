import { describe, expect, it } from "vitest";
import {
  createDbAdapter,
  resolveDbAccessMode,
  validateDatabaseEnvironment,
  type ActorContext,
} from "../adapters/db/client";
import {
  createDirectPostgresExecutor,
  DirectPostgresAdapter,
  type PostgresExecutor,
} from "../adapters/db/postgres";
import { type PostgrestRequest } from "../adapters/db/supabase-compat";
import {
  assertActorContext,
  canBypassOrganization,
  type ProtectedRecord,
  type QueryResult,
} from "../adapters/db/transaction";

const landlordOrgA: ActorContext = {
  userId: "user-landlord-a",
  organizationId: "org-a",
  role: "member",
  isServiceAdmin: false,
  party: "landlord",
  bearerToken: "jwt-landlord-a",
};

const tenantOrgA: ActorContext = {
  userId: "user-tenant-a",
  organizationId: "org-a",
  role: "tenant",
  isServiceAdmin: false,
  party: "tenant",
  bearerToken: "jwt-tenant-a",
};

const serviceAdmin: ActorContext = {
  userId: "user-admin",
  organizationId: "platform",
  role: "admin",
  isServiceAdmin: true,
  party: "landlord",
};

const records: ProtectedRecord[] = [
  {
    id: "record-org-a-public",
    organizationId: "org-a",
    landlordOnly: false,
    value: "org a public",
  },
  {
    id: "record-org-a-landlord",
    organizationId: "org-a",
    landlordOnly: true,
    value: "org a landlord",
  },
  {
    id: "record-org-b-public",
    organizationId: "org-b",
    landlordOnly: false,
    value: "org b public",
  },
];

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

function canRead(actor: ActorContext, record: ProtectedRecord): boolean {
  if (
    !canBypassOrganization(actor) &&
    record.organizationId !== actor.organizationId
  ) {
    return false;
  }

  return !(actor.party === "tenant" && record.landlordOnly);
}

function canWrite(actor: ActorContext, record: ProtectedRecord): boolean {
  if (actor.party === "tenant") {
    return false;
  }

  return (
    canBypassOrganization(actor) ||
    record.organizationId === actor.organizationId
  );
}

function actorFromHeaders(headers: Headers): ActorContext {
  return {
    userId: headers.get("x-capveri-user-id") ?? "",
    organizationId: headers.get("x-capveri-organization-id") ?? "",
    role: (headers.get("x-capveri-role") ?? "") as ActorContext["role"],
    isServiceAdmin: headers.get("x-capveri-is-service-admin") === "true",
    party: (headers.get("x-capveri-party") ?? "") as ActorContext["party"],
  };
}

function createBoundaryExecutor(seed: readonly ProtectedRecord[]): {
  executor: PostgresExecutor;
  statements: RecordedStatement[];
} {
  const statements: RecordedStatement[] = [];
  const rows = seed.map((record) => ({ ...record }));
  let currentActor: ActorContext | undefined;

  return {
    statements,
    executor: {
      async query<Row>(
        sql: string,
        params: readonly unknown[] = [],
      ): Promise<QueryResult<Row>> {
        statements.push({ sql, params });

        if (sql === "begin" || sql === "commit" || sql === "rollback") {
          return { rows: [] };
        }

        if (sql.startsWith("select set_config")) {
          if (params.length < 10) {
            return { rows: [] };
          }

          currentActor = {
            userId: String(params[1]),
            organizationId: String(params[3]),
            role: String(params[5]) as ActorContext["role"],
            isServiceAdmin: params[7] === "true",
            party: String(params[9]) as ActorContext["party"],
          };

          return { rows: [] };
        }

        if (sql.includes("from users")) {
          return {
            rows: [
              {
                id: "user-landlord-a",
                organizationId: "org-a",
                email: "member@example.test",
                fullName: "Member User",
                role: "member",
                isPlatformAdmin: false,
                createdAt: "2026-06-12T00:00:00Z",
                updatedAt: "2026-06-12T00:00:00Z",
              } as Row,
            ],
          };
        }

        if (!currentActor) {
          throw new Error("database session context was not set");
        }
        const actor = currentActor;

        if (sql.includes("from protected_records")) {
          return {
            rows: rows
              .filter((record) => canRead(actor, record))
              .map((record) => ({ ...record }) as Row),
          };
        }

        if (sql.includes("update protected_records")) {
          const id = String(params[0]);
          const value = String(params[1]);
          const record = rows.find((candidate) => candidate.id === id);

          if (!record || !canWrite(actor, record)) {
            return { rows: [] };
          }

          record.value = value;

          return { rows: [{ ...record } as Row] };
        }

        return { rows: [] };
      },
      async transaction<Result>(
        operation: (executor: PostgresExecutor) => Promise<Result>,
      ): Promise<Result> {
        statements.push({ sql: "begin", params: [] });

        try {
          const result = await operation(this);
          statements.push({ sql: "commit", params: [] });

          return result;
        } catch (error) {
          statements.push({ sql: "rollback", params: [] });
          throw error;
        }
      },
    },
  };
}

function createPostgrestBoundaryFetcher(seed: readonly ProtectedRecord[]): {
  fetcher: (request: PostgrestRequest) => Promise<Response>;
  requests: PostgrestRequest[];
} {
  const requests: PostgrestRequest[] = [];
  const rows = seed.map((record) => ({ ...record }));

  return {
    requests,
    async fetcher(request: PostgrestRequest): Promise<Response> {
      requests.push(request);
      const headers = new Headers(request.init.headers);
      const actor = actorFromHeaders(headers);

      if (request.init.method === "GET") {
        return Response.json(rows.filter((record) => canRead(actor, record)));
      }

      if (request.init.method === "PATCH") {
        const id = new URL(request.url).searchParams
          .get("id")
          ?.replace("eq.", "");
        const patch = JSON.parse(String(request.init.body)) as {
          value: string;
        };
        const record = rows.find((candidate) => candidate.id === id);

        if (!record || !canWrite(actor, record)) {
          return new Response(null, { status: 404 });
        }

        record.value = patch.value;

        return Response.json(record);
      }

      return new Response(null, { status: 405 });
    },
  };
}

describe("database access mode", () => {
  it("requires production to choose an explicit database access mode", () => {
    expect(() => resolveDbAccessMode({ ENVIRONMENT: "production" })).toThrow(
      "Missing required runtime binding: DB_ACCESS_MODE",
    );
    expect(() =>
      validateDatabaseEnvironment({ ENVIRONMENT: "production" }),
    ).toThrow("Missing required runtime binding: DB_ACCESS_MODE");
    expect(() =>
      validateDatabaseEnvironment({
        ENVIRONMENT: "production",
        DB_ACCESS_MODE: "direct-postgres",
      }),
    ).toThrow(
      "DB_PRODUCTION_BOUNDARY must confirm direct-postgres before production database access",
    );
    expect(() =>
      validateDatabaseEnvironment({
        ENVIRONMENT: "production",
        DB_ACCESS_MODE: "postgrest-compat",
        DB_PRODUCTION_BOUNDARY: "postgrest-compat",
        POSTGREST_URL: "https://db.example.test",
      }),
    ).toThrow(
      "SUPABASE_SERVICE_ROLE_KEY is required for postgrest-compat in production",
    );
  });

  it("creates only the configured explicit adapter mode", () => {
    const { executor } = createBoundaryExecutor(records);
    const adapter = createDbAdapter(
      {
        ENVIRONMENT: "production",
        DB_ACCESS_MODE: "direct-postgres",
        DB_PRODUCTION_BOUNDARY: "direct-postgres",
        HYPERDRIVE: { connectionString: "postgres://hyperdrive" } as Hyperdrive,
      },
      { mode: "direct-postgres", executor },
    );

    expect(adapter.mode).toBe("direct-postgres");
  });

  it("prefers Hyperdrive for direct-postgres and rejects production direct URLs", () => {
    const connectionStrings: string[] = [];
    const factory = (connectionString: string): PostgresExecutor => {
      connectionStrings.push(connectionString);
      return createBoundaryExecutor(records).executor;
    };

    createDirectPostgresExecutor(
      {
        ENVIRONMENT: "production",
        HYPERDRIVE: { connectionString: "postgres://hyperdrive" } as Hyperdrive,
        DATABASE_URL: "postgres://direct",
      },
      factory,
    );

    expect(connectionStrings).toEqual(["postgres://hyperdrive"]);
    expect(() =>
      createDirectPostgresExecutor(
        {
          ENVIRONMENT: "production",
          DATABASE_URL: "postgres://direct",
        },
        factory,
      ),
    ).toThrow("HYPERDRIVE binding is required");
  });
});

describe("database actor context", () => {
  it("requires ActorContext for direct database access", async () => {
    const { executor } = createBoundaryExecutor(records);
    const adapter = new DirectPostgresAdapter(executor);

    await expect(
      adapter.protectedRecords.list(undefined as unknown as ActorContext),
    ).rejects.toThrow("ActorContext is required for database access");
  });

  it("rejects malformed actor roles before they reach database policy context", () => {
    expect(() =>
      assertActorContext({
        ...landlordOrgA,
        role: "landlord" as ActorContext["role"],
      }),
    ).toThrow("ActorContext.role is invalid");
  });

  it("allows service admin organization bypass only when explicit at the adapter boundary", async () => {
    const { executor } = createBoundaryExecutor(records);
    const adapter = new DirectPostgresAdapter(executor);

    await expect(
      adapter.protectedRecords
        .list(serviceAdmin)
        .then((visible) => visible.map((record) => record.id)),
    ).resolves.toEqual([
      "record-org-a-public",
      "record-org-a-landlord",
      "record-org-b-public",
    ]);
  });
});

describe("tenant and organization isolation", () => {
  it("prevents org A from reading or updating org B rows through direct-postgres", async () => {
    const { executor } = createBoundaryExecutor(records);
    const adapter = new DirectPostgresAdapter(executor);

    await expect(
      adapter.protectedRecords
        .list(landlordOrgA)
        .then((visible) => visible.map((record) => record.id)),
    ).resolves.toEqual(["record-org-a-public", "record-org-a-landlord"]);
    await expect(
      adapter.protectedRecords.update(landlordOrgA, "record-org-b-public", {
        value: "changed",
      }),
    ).resolves.toBeUndefined();
  });

  it("prevents tenants from reading landlord-only rows through postgrest-compat", async () => {
    const { fetcher } = createPostgrestBoundaryFetcher(records);
    const adapter = createDbAdapter(
      {
        ENVIRONMENT: "production",
        DB_ACCESS_MODE: "postgrest-compat",
        DB_PRODUCTION_BOUNDARY: "postgrest-compat",
        POSTGREST_URL: "https://db.example.test",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
      },
      {
        mode: "postgrest-compat",
        fetcher,
        baseUrl: "https://db.example.test",
      },
    );

    await expect(
      adapter.protectedRecords
        .list(tenantOrgA)
        .then((visible) => visible.map((record) => record.id)),
    ).resolves.toEqual(["record-org-a-public"]);
  });
});

describe("database context propagation", () => {
  const landlordWithoutBearerToken: ActorContext = {
    userId: landlordOrgA.userId,
    organizationId: landlordOrgA.organizationId,
    role: landlordOrgA.role,
    isServiceAdmin: landlordOrgA.isServiceAdmin,
    party: landlordOrgA.party,
  };

  it("sets direct postgres session variables before protected business queries", async () => {
    const { executor, statements } = createBoundaryExecutor(records);
    const adapter = new DirectPostgresAdapter(executor);

    await adapter.protectedRecords.list(landlordOrgA);

    expect(statements.map((statement) => statement.sql)).toEqual([
      "begin",
      "select set_config($1, $2, true), set_config($3, $4, true), set_config($5, $6, true), set_config($7, $8, true), set_config($9, $10, true)",
      'select id, organization_id as "organizationId", landlord_only as "landlordOnly", value from protected_records order by id',
      "commit",
    ]);
    expect(statements[1]?.params).toEqual([
      "app.user_id",
      "user-landlord-a",
      "app.organization_id",
      "org-a",
      "app.role",
      "member",
      "app.is_service_admin",
      "false",
      "app.party",
      "landlord",
    ]);
  });

  it("sets PostgREST compatibility headers before protected queries", async () => {
    const { fetcher, requests } = createPostgrestBoundaryFetcher(records);
    const adapter = createDbAdapter(
      {
        ENVIRONMENT: "production",
        DB_ACCESS_MODE: "postgrest-compat",
        DB_PRODUCTION_BOUNDARY: "postgrest-compat",
        POSTGREST_URL: "https://db.example.test",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
      },
      {
        mode: "postgrest-compat",
        fetcher,
        baseUrl: "https://db.example.test",
      },
    );

    await adapter.protectedRecords.list(tenantOrgA);

    const headers = requests[0]?.init.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("x-capveri-user-id")).toBe("user-tenant-a");
    expect((headers as Headers).get("authorization")).toBe(
      "Bearer jwt-tenant-a",
    );
    expect((headers as Headers).get("x-capveri-organization-id")).toBe("org-a");
    expect((headers as Headers).get("x-capveri-role")).toBe("tenant");
    expect((headers as Headers).get("x-capveri-is-service-admin")).toBe(
      "false",
    );
    expect((headers as Headers).get("x-capveri-party")).toBe("tenant");
    expect(requests[0]?.url).toBe(
      "https://db.example.test/protected_records?select=id,organizationId:organization_id,landlordOnly:landlord_only,value&order=id.asc",
    );
  });

  it("sets direct postgres auth subject before resolving the user profile", async () => {
    const { executor, statements } = createBoundaryExecutor(records);
    const adapter = new DirectPostgresAdapter(executor);

    await expect(
      adapter.auth.resolveUserContext("user-landlord-a", "jwt-landlord-a"),
    ).resolves.toMatchObject({
      actor: {
        userId: "user-landlord-a",
        organizationId: "org-a",
        role: "member",
        party: "landlord",
        bearerToken: "jwt-landlord-a",
      },
    });

    expect(statements.map((statement) => statement.sql).slice(0, 3)).toEqual([
      "begin",
      "select set_config($1, $2, true), set_config($3, $4, true)",
      'select id, organization_id as "organizationId", email, full_name as "fullName", role, coalesce(is_platform_admin, false) as "isPlatformAdmin", created_at as "createdAt", updated_at as "updatedAt" from users where id = $1',
    ]);
    expect(statements[1]?.params).toEqual([
      "request.jwt.claim.sub",
      "user-landlord-a",
      "app.user_id",
      "user-landlord-a",
    ]);
  });

  it("uses service-role authorization only for explicit service admin actors", async () => {
    const { fetcher, requests } = createPostgrestBoundaryFetcher(records);
    const adapter = createDbAdapter(
      {
        ENVIRONMENT: "production",
        DB_ACCESS_MODE: "postgrest-compat",
        DB_PRODUCTION_BOUNDARY: "postgrest-compat",
        POSTGREST_URL: "https://db.example.test",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
      },
      {
        mode: "postgrest-compat",
        fetcher,
        baseUrl: "https://db.example.test",
      },
    );

    await adapter.protectedRecords.list(serviceAdmin);

    const headers = requests[0]?.init.headers;
    expect(headers).toBeInstanceOf(Headers);
    expect((headers as Headers).get("authorization")).toBe(
      "Bearer service-role",
    );
  });

  it("does not grant PostGREST service-role access for non-admin service flags", async () => {
    const { fetcher } = createPostgrestBoundaryFetcher(records);
    const adapter = createDbAdapter(
      {
        ENVIRONMENT: "production",
        DB_ACCESS_MODE: "postgrest-compat",
        DB_PRODUCTION_BOUNDARY: "postgrest-compat",
        POSTGREST_URL: "https://db.example.test",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
      },
      {
        mode: "postgrest-compat",
        fetcher,
        baseUrl: "https://db.example.test",
      },
    );

    await expect(
      adapter.protectedRecords.list({
        ...landlordWithoutBearerToken,
        isServiceAdmin: true,
      }),
    ).rejects.toThrow("ActorContext.bearerToken is required");
  });
});
