import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  ComparisonResult,
  StoredComparisonRun,
  StoredComparisonRunSummary,
} from "../domain/comparison/model";
import type {
  ComparisonRepository,
  ComparisonRunInput,
  ExplicitComparisonInput,
  GetComparisonRunInput,
  ListComparisonRunsInput,
  PersistComparisonRunInput,
} from "../domain/comparison/repository";
import type { AppEnv } from "../env";
import { createComparisonRoutes } from "../http/comparison-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const RUN_ID = "44444444-4444-4444-8444-444444444444";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class MemoryComparisonRepository implements ComparisonRepository {
  readonly actualInputs: ComparisonRunInput[] = [];
  readonly explicitInputs: ExplicitComparisonInput[] = [];
  readonly createInputs: PersistComparisonRunInput[] = [];
  readonly listInputs: ListComparisonRunsInput[] = [];
  readonly getInputs: GetComparisonRunInput[] = [];
  getRunResult: StoredComparisonRun | null = storedRun();

  async compareActualBilled(
    input: ComparisonRunInput,
  ): Promise<ComparisonResult> {
    this.actualInputs.push(input);

    return comparisonResult();
  }

  async compareExplicit(
    input: ExplicitComparisonInput,
  ): Promise<ComparisonResult> {
    this.explicitInputs.push(input);

    return comparisonResult();
  }

  async createRun(
    input: PersistComparisonRunInput,
  ): Promise<StoredComparisonRun> {
    this.createInputs.push(input);

    return storedRun();
  }

  async listRuns(
    input: ListComparisonRunsInput,
  ): Promise<StoredComparisonRunSummary[]> {
    this.listInputs.push(input);

    return [storedRun()];
  }

  async getRun(
    input: GetComparisonRunInput,
  ): Promise<StoredComparisonRun | null> {
    this.getInputs.push(input);

    return this.getRunResult;
  }
}

function createTestApp() {
  const repository = new MemoryComparisonRepository();
  const verifier: JwtVerifier = {
    async verify() {
      return { subject: USER_ID, payload: { sub: USER_ID }, isActive: true };
    },
  };
  const auth: AuthRepository = {
    async resolveUserContext() {
      return createAuthContext();
    },
  };
  const app = new Hono<{ Bindings: AppEnv; Variables: AuthVariables }>();
  app.route(
    "/api/v1",
    createComparisonRoutes({
      repository,
      auth: {
        verifier,
        db: { mode: "postgrest-compat", auth, protectedRecords },
      },
    }),
  );

  return { app, repository };
}

function createAuthContext(): AuthenticatedUserContext {
  return {
    user: {
      id: USER_ID,
      organizationId: ORG_ID,
      email: "user@example.test",
      fullName: "Test User",
      role: "admin",
      isPlatformAdmin: false,
      createdAt: "2026-06-13T00:00:00Z",
      updatedAt: "2026-06-13T00:00:00Z",
    },
    actor: {
      userId: USER_ID,
      organizationId: ORG_ID,
      role: "admin",
      isServiceAdmin: false,
      party: "landlord",
      bearerToken: "valid-token",
    },
  };
}

function env(): AppEnv {
  return {
    ENVIRONMENT: "test",
    APP_VERSION: "test",
  } as unknown as AppEnv;
}

function authHeaders() {
  return { authorization: "Bearer valid-token" };
}

async function jsonObject(
  response: Response,
): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Expected JSON object response");
  }

  return body as Record<string, unknown>;
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected object value");
  }

  return value as Record<string, unknown>;
}

describe("comparison routes", () => {
  it("runs default actual-billed comparison from query parameters", async () => {
    const { app, repository } = createTestApp();
    const response = await app.request(
      `/api/v1/comparison/${PROPERTY_ID}?period_start=2026-01-01&period_end=2026-12-31&tolerance=0.05&include_drafts=true`,
      { headers: authHeaders() },
      env(),
    );
    const body = await jsonObject(response);

    expect(response.status).toBe(200);
    expect(body.property_id).toBe(PROPERTY_ID);
    expect(repository.actualInputs).toEqual([
      {
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        tolerance: "0.05",
        includeDrafts: true,
      },
    ]);
  });

  it("runs explicit comparison and persists runs", async () => {
    const { app, repository } = createTestApp();
    const explicitResponse = await app.request(
      `/api/v1/comparison/${PROPERTY_ID}`,
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          charges: [{ tenant_name: "Acme Retail", amount: "125.00" }],
        }),
      },
      env(),
    );
    const createRunResponse = await app.request(
      `/api/v1/comparison/${PROPERTY_ID}/runs`,
      {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify({
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          charges: null,
        }),
      },
      env(),
    );

    expect(explicitResponse.status).toBe(200);
    expect(createRunResponse.status).toBe(201);
    expect(repository.explicitInputs[0]?.charges).toEqual([
      { tenant_name: "Acme Retail", amount: "125.00" },
    ]);
    expect(repository.createInputs[0]).toEqual(
      expect.objectContaining({
        organizationId: ORG_ID,
        userId: USER_ID,
        propertyId: PROPERTY_ID,
        charges: null,
      }),
    );
  });

  it("rejects impossible calendar dates in the comparison period", async () => {
    for (const badDate of ["2026-02-30", "2026-13-01", "2026-04-31"]) {
      const { app, repository } = createTestApp();
      const response = await app.request(
        `/api/v1/comparison/${PROPERTY_ID}`,
        {
          method: "POST",
          headers: { ...authHeaders(), "content-type": "application/json" },
          body: JSON.stringify({
            period_start: badDate,
            period_end: "2026-12-31",
            charges: [{ tenant_name: "Acme Retail", amount: "125.00" }],
          }),
        },
        env(),
      );

      expect(response.status).toBe(422);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "validation_error" },
      });
      expect(repository.explicitInputs).toHaveLength(0);
    }
  });

  it("lists and fetches stored comparison runs", async () => {
    const { app, repository } = createTestApp();
    const listResponse = await app.request(
      `/api/v1/comparison/${PROPERTY_ID}/runs?limit=25&offset=5`,
      { headers: authHeaders() },
      env(),
    );
    const getResponse = await app.request(
      `/api/v1/comparison/runs/${RUN_ID}`,
      { headers: authHeaders() },
      env(),
    );
    const listBody: unknown = await listResponse.json();
    const getBody = await jsonObject(getResponse);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listBody)).toBe(true);
    expect(getResponse.status).toBe(200);
    expect(getBody.id).toBe(RUN_ID);
    expect(repository.listInputs[0]).toEqual({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      limit: 25,
      offset: 5,
    });
    expect(repository.getInputs[0]).toEqual({
      organizationId: ORG_ID,
      runId: RUN_ID,
    });
  });

  it("rejects invalid periods and missing runs", async () => {
    const { app, repository } = createTestApp();
    repository.getRunResult = null;
    const invalidPeriodResponse = await app.request(
      `/api/v1/comparison/${PROPERTY_ID}?period_start=2026-12-31&period_end=2026-01-01`,
      { headers: authHeaders() },
      env(),
    );
    const missingRunResponse = await app.request(
      `/api/v1/comparison/runs/${RUN_ID}`,
      { headers: authHeaders() },
      env(),
    );
    const invalidBody = await jsonObject(invalidPeriodResponse);
    const missingBody = await jsonObject(missingRunResponse);

    expect(invalidPeriodResponse.status).toBe(400);
    expect(objectValue(invalidBody.error).code).toBe("invalid_period");
    expect(missingRunResponse.status).toBe(404);
    expect(objectValue(missingBody.error).code).toBe(
      "comparison_run_not_found",
    );
  });
});

function comparisonResult(): ComparisonResult {
  return {
    property_id: PROPERTY_ID,
    period_start: "2026-01-01",
    period_end: "2026-12-31",
    tolerance: "0.01",
    tenants: [
      {
        lease_id: "lease-1",
        tenant_name: "Acme Retail",
        match_status: "matched",
        match_note: null,
        capveri_correct: "100",
        actual_charged: "125",
        variance: "25",
        direction: "overcharge",
        abs_variance: "25",
        variance_pct: "25.00",
        pool_breakdowns: null,
      },
    ],
    total_capveri_correct: "100",
    total_actual_charged: "125",
    total_net_variance: "25",
    total_overcharge: "25",
    total_undercharge: "0",
    overcharge_count: 1,
    undercharge_count: 0,
    match_count: 0,
  };
}

function storedRun(): StoredComparisonRun {
  return {
    ...comparisonResult(),
    id: RUN_ID,
    source: "actual_billed",
    created_by: USER_ID,
    created_at: "2026-06-13T00:00:00.000Z",
    findings: comparisonResult().tenants,
  };
}
