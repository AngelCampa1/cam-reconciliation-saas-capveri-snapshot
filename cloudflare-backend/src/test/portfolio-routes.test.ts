import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import { PostgresPortfolioRepository } from "../adapters/db/portfolio";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";
import type {
  PortfolioDataset,
  PortfolioRepository,
} from "../domain/portfolio/repository";
import type { AppEnv } from "../env";
import { createPortfolioRoutes } from "../http/portfolio-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_A = "33333333-3333-4333-8333-333333333333";
const PROPERTY_B = "44444444-4444-4444-8444-444444444444";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryPortfolioRepository implements PortfolioRepository {
  seenOrganizationIds: string[] = [];
  dataset: PortfolioDataset = {
    properties: [
      { id: PROPERTY_A, name: "Metro Center" },
      { id: PROPERTY_B, name: "Lake Plaza" },
    ],
    finalizedSnapshots: [
      {
        property_id: PROPERTY_A,
        total_recovery: "800.00",
        period_start_date: "2025-01-01",
      },
      {
        property_id: PROPERTY_A,
        total_recovery: "1200.00",
        period_start_date: "2026-01-01",
      },
      {
        property_id: PROPERTY_B,
        total_recovery: "500.00",
        period_start_date: "2026-01-01",
      },
    ],
    billedRows: [
      {
        property_id: PROPERTY_A,
        billed_amount: "900.00",
        period_start_date: "2026-01-01",
      },
    ],
  };

  async loadPortfolioDataset(
    organizationId: string,
  ): Promise<PortfolioDataset> {
    this.seenOrganizationIds.push(organizationId);

    return this.dataset;
  }
}

class FakePostgresExecutor implements PostgresExecutor {
  readonly statements: string[] = [];
  readonly params: unknown[][] = [];

  constructor(private readonly responses: unknown[][]) {}

  async query<Row>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.statements.push(sql);
    this.params.push([...params]);
    const rows = this.responses.shift() ?? [];

    return { rows: rows as Row[] };
  }

  async transaction<Result>(
    operation: (executor: PostgresExecutor) => Promise<Result>,
  ): Promise<Result> {
    return operation(this);
  }
}

function createTestApp(
  options: {
    repository?: MemoryPortfolioRepository;
    role?: AuthVariables["auth"]["actor"]["role"];
  } = {},
) {
  const repository = options.repository ?? new MemoryPortfolioRepository();
  const context = createAuthContext(options.role ?? "member");
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
    createPortfolioRoutes({
      repository,
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    }),
  );

  return { app, repository };
}

function createAuthContext(
  role: AuthVariables["auth"]["actor"]["role"],
): AuthenticatedUserContext {
  const context: AuthenticatedUserContext = {
    user: {
      id: USER_ID,
      organizationId: ORG_ID,
      email: "user@example.test",
      fullName: "Test User",
      role,
      isPlatformAdmin: false,
      createdAt: "2026-06-13T00:00:00Z",
      updatedAt: "2026-06-13T00:00:00Z",
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

  if (role === "tenant") {
    context.tenantUser = {
      id: "77777777-7777-4777-8777-777777777777",
      userId: USER_ID,
      organizationId: ORG_ID,
      contactName: "Tenant User",
      contactEmail: "tenant@example.test",
      createdAt: "2026-06-13T00:00:00Z",
    };
  }

  return context;
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
  } as unknown as AppEnv;
}

const authHeaders = { authorization: "Bearer valid-token" };

describe("portfolio routes", () => {
  it("aggregates the latest finalized portfolio year", async () => {
    const { app, repository } = createTestApp();
    const response = await app.request(
      "/api/v1/portfolio/summary",
      { headers: authHeaders },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      period_year: 2026,
      total_recoverable_cam: "1700",
      total_leakage: "800",
      recovery_rate: expect.closeTo(52.94117647058824),
      properties_with_leakage: 2,
      has_billing_data: true,
      total_recovery_all_years: "2500",
      properties: [
        {
          property_id: PROPERTY_B,
          property_name: "Lake Plaza",
          total_recoverable: "500",
          total_billed: "0",
          leakage: "500",
          recovery_rate: 0,
        },
        {
          property_id: PROPERTY_A,
          property_name: "Metro Center",
          total_recoverable: "1200",
          total_billed: "900",
          leakage: "300",
          recovery_rate: 75,
        },
      ],
    });
    expect(repository.seenOrganizationIds).toEqual([ORG_ID]);
  });

  it("returns an empty portfolio when there are no finalized snapshots", async () => {
    const repository = new MemoryPortfolioRepository();
    repository.dataset = {
      properties: [{ id: PROPERTY_A, name: "Metro Center" }],
      finalizedSnapshots: [],
      billedRows: [],
    };
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/portfolio/summary",
      { headers: authHeaders },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      period_year: null,
      total_recoverable_cam: "0",
      total_leakage: "0",
      recovery_rate: null,
      properties_with_leakage: 0,
      has_billing_data: false,
      total_recovery_all_years: "0",
      properties: [],
    });
  });

  it("forbids tenant actors from landlord portfolio summaries", async () => {
    const { app } = createTestApp({ role: "tenant" });
    const response = await app.request(
      "/api/v1/portfolio/summary",
      { headers: authHeaders },
      env(),
    );

    expect(response.status).toBe(403);
  });
});

describe("postgres portfolio repository", () => {
  it("loads portfolio rows scoped to the organization properties", async () => {
    const executor = new FakePostgresExecutor([
      [
        { id: PROPERTY_A, name: "Metro Center" },
        { id: PROPERTY_B, name: "Lake Plaza" },
      ],
      [
        {
          property_id: PROPERTY_A,
          total_recovery: "1200.00",
          period_start_date: "2026-01-01",
        },
      ],
      [
        {
          property_id: PROPERTY_A,
          billed_amount: "900.00",
          period_start_date: "2026-01-01",
        },
      ],
    ]);
    const repository = new PostgresPortfolioRepository(executor);
    const dataset = await repository.loadPortfolioDataset(ORG_ID);

    expect(dataset.properties).toHaveLength(2);
    expect(dataset.finalizedSnapshots).toHaveLength(1);
    expect(dataset.billedRows).toHaveLength(1);
    expect(executor.statements[0]).toContain("where organization_id = $1");
    expect(executor.statements[1]).toContain("property_id = any($2::uuid[])");
    expect(executor.statements[2]).toContain("property_id = any($2::uuid[])");
    expect(executor.params[1]).toEqual([ORG_ID, [PROPERTY_A, PROPERTY_B]]);
  });

  it("does not query snapshots or billed rows when the org has no properties", async () => {
    const executor = new FakePostgresExecutor([[]]);
    const repository = new PostgresPortfolioRepository(executor);

    await expect(repository.loadPortfolioDataset(ORG_ID)).resolves.toEqual({
      properties: [],
      finalizedSnapshots: [],
      billedRows: [],
    });
    expect(executor.statements).toHaveLength(1);
  });
});
