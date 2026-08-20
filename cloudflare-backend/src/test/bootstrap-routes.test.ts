import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { JwtVerifier } from "../adapters/auth/verifier";
import type {
  AuthenticatedUserContext,
  AuthRepository,
  ProtectedRecordRepository,
} from "../adapters/db/client";
import type {
  BootstrapRepository,
  DashboardSummary,
  LeakageSummaryResponse,
  PlanSelectionResponse,
} from "../domain/bootstrap/repository";
import { PostgresBootstrapRepository } from "../adapters/db/bootstrap";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";
import type { AppEnv } from "../env";
import { createBootstrapRoutes } from "../http/bootstrap-routes";
import type { AuthVariables } from "../middleware/auth";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

const protectedRecords: ProtectedRecordRepository = {
  async list() {
    return [];
  },
  async update() {
    return undefined;
  },
};

class FakePostgresExecutor implements PostgresExecutor {
  readonly statements: string[] = [];

  constructor(private readonly responses: unknown[][]) {}

  async query<Row>(sql: string): Promise<QueryResult<Row>> {
    this.statements.push(sql);
    const rows = this.responses.shift() ?? [];

    return { rows: rows as Row[] };
  }

  async transaction<Result>(
    operation: (executor: PostgresExecutor) => Promise<Result>,
  ): Promise<Result> {
    return operation(this);
  }
}

class MemoryBootstrapRepository implements BootstrapRepository {
  dashboard: DashboardSummary = {
    property_count: 0,
    unit_count: 0,
    lease_count: 0,
    gl_entry_count: 0,
    pending_reconciliations: 0,
    pending_verifications: 0,
    recent_properties: [],
    recent_activity: [],
    total_recovery_finalized: "0",
    alerts: [
      {
        id: "no-properties",
        type: "action",
        title: "Add your first property",
        description: "Get started by adding a commercial property to manage.",
        href: "/properties/new",
      },
    ],
  };
  leakage: LeakageSummaryResponse = {
    total_recovery_opportunity: "0",
    properties_with_leakage: 0,
    total_underbill_exposure: "0",
    total_overbill_exposure: "0",
    total_billing_exposure: "0",
    properties_with_underbill: 0,
    properties_with_overbill: 0,
    properties_with_billing_exposure: 0,
    has_billing_data: false,
    draft_recovery: "0",
    draft_property_count: 0,
  };
  planSelection: PlanSelectionResponse = {
    plan_id: null,
    billing_period: null,
    unit_count: null,
    building_count: null,
    selected_at: null,
    checkout_required: true,
    has_active_access: false,
    has_paused_subscription: false,
    subscription_status: null,
    trial_days_remaining: null,
  };
  seenOrganizationIds: string[] = [];

  async getDashboardSummary(organizationId: string): Promise<DashboardSummary> {
    this.seenOrganizationIds.push(organizationId);
    return this.dashboard;
  }

  async getLeakageSummary(
    organizationId: string,
  ): Promise<LeakageSummaryResponse> {
    this.seenOrganizationIds.push(organizationId);
    return this.leakage;
  }

  async getPlanSelection(
    organizationId: string,
  ): Promise<PlanSelectionResponse> {
    this.seenOrganizationIds.push(organizationId);
    return this.planSelection;
  }
}

function createAuthContext(
  role: AuthVariables["auth"]["actor"]["role"] = "member",
): AuthenticatedUserContext {
  const context: AuthenticatedUserContext = {
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

  if (role === "tenant") {
    context.tenantUser = {
      id: "77777777-7777-4777-8777-777777777777",
      userId: USER_ID,
      organizationId: ORG_ID,
      contactName: "Tenant User",
      contactEmail: "tenant@example.test",
      createdAt: "2026-06-12T00:00:00Z",
    };
  }

  return context;
}

function createTestApp(options: {
  repository?: MemoryBootstrapRepository;
  role?: AuthVariables["auth"]["actor"]["role"];
}) {
  const repository = options.repository ?? new MemoryBootstrapRepository();
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
    createBootstrapRoutes({
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

describe("bootstrap routes", () => {
  it("returns the empty organization dashboard alert", async () => {
    const { app } = createTestApp({});
    const response = await app.request(
      "/api/v1/dashboard",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      property_count: 0,
      unit_count: 0,
      lease_count: 0,
      gl_entry_count: 0,
      pending_reconciliations: 0,
      pending_verifications: 0,
      recent_properties: [],
      recent_activity: [],
      total_recovery_finalized: "0",
      alerts: [
        {
          id: "no-properties",
          type: "action",
          title: "Add your first property",
          description: "Get started by adding a commercial property to manage.",
          href: "/properties/new",
        },
      ],
    });
  });

  it("returns dashboard counts and recent activity scoped to the actor organization", async () => {
    const repository = new MemoryBootstrapRepository();
    repository.dashboard = {
      property_count: 2,
      unit_count: 8,
      lease_count: 3,
      gl_entry_count: 12,
      pending_reconciliations: 1,
      pending_verifications: 2,
      recent_properties: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Metro Center",
          unit_count: 4,
          last_reconciliation: "Finalized (2026-06-10)",
        },
      ],
      recent_activity: [
        {
          id: "66666666-6666-4666-8666-666666666666",
          type: "upload",
          title: "Document uploaded",
          description: "cam.pdf",
          timestamp: "2026-06-12T16:00:00.000Z",
          href: "/extractions",
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          type: "lease",
          title: "Lease added",
          description: "Tenant A",
          timestamp: "2026-06-12T15:00:00.000Z",
          href: "/properties/33333333-3333-4333-8333-333333333333",
        },
      ],
      total_recovery_finalized: "1250.50",
      alerts: [
        {
          id: "pending-verifications",
          type: "warning",
          title: "Documents need review",
          description: "2 document(s) awaiting verification.",
          href: "/extractions",
          count: 2,
        },
      ],
    };
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/dashboard",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      property_count: 2,
      pending_verifications: 2,
      total_recovery_finalized: "1250.50",
      recent_activity: [
        expect.objectContaining({ type: "upload" }),
        expect.objectContaining({ type: "lease" }),
      ],
    });
    expect(repository.seenOrganizationIds).toEqual([ORG_ID]);
  });

  it("returns leakage opportunity and draft metrics", async () => {
    const repository = new MemoryBootstrapRepository();
    repository.leakage = {
      total_recovery_opportunity: "700",
      properties_with_leakage: 1,
      total_underbill_exposure: "700",
      total_overbill_exposure: "125",
      total_billing_exposure: "825",
      properties_with_underbill: 1,
      properties_with_overbill: 1,
      properties_with_billing_exposure: 2,
      has_billing_data: true,
      draft_recovery: "125",
      draft_property_count: 2,
    };
    const { app } = createTestApp({ repository });
    const response = await app.request(
      "/api/v1/dashboard/leakage-summary",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(repository.leakage);
  });

  it("forbids tenant actors from landlord dashboard and leakage summaries", async () => {
    const { app } = createTestApp({ role: "tenant" });
    const dashboardResponse = await app.request(
      "/api/v1/dashboard",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );
    const leakageResponse = await app.request(
      "/api/v1/dashboard/leakage-summary",
      { headers: { authorization: "Bearer valid-token" } },
      env(),
    );

    expect(dashboardResponse.status).toBe(403);
    expect(leakageResponse.status).toBe(403);
  });
});

describe("postgres bootstrap repository", () => {
  it("aggregates dashboard counts, activity, recovery, and alerts", async () => {
    const executor = new FakePostgresExecutor([
      [
        {
          property_count: "1",
          unit_count: "3",
          lease_count: "2",
          gl_entry_count: "9",
          pending_reconciliations: "1",
          pending_verifications: "2",
        },
      ],
      [
        {
          id: "33333333-3333-4333-8333-333333333333",
          name: "Metro Center",
          unit_count: "3",
          snapshot_status: "finalized",
          snapshot_created_at: "2026-06-10T00:00:00Z",
        },
      ],
      [
        {
          id: "66666666-6666-4666-8666-666666666666",
          type: "upload",
          title: "Document uploaded",
          description: "lease.pdf",
          timestamp: "2026-06-12T16:00:00Z",
          href: "/extractions",
        },
      ],
      [{ total: "1250.50" }],
    ]);
    const repository = new PostgresBootstrapRepository(executor);
    const summary = await repository.getDashboardSummary(ORG_ID);

    expect(summary).toMatchObject({
      property_count: 1,
      unit_count: 3,
      lease_count: 2,
      gl_entry_count: 9,
      pending_reconciliations: 1,
      pending_verifications: 2,
      recent_properties: [
        expect.objectContaining({
          unit_count: 3,
          last_reconciliation: "Finalized (2026-06-10)",
        }),
      ],
      recent_activity: [expect.objectContaining({ type: "upload" })],
      total_recovery_finalized: "1250.50",
      alerts: [expect.objectContaining({ id: "pending-verifications" })],
    });
    expect(executor.statements.join(" ")).toContain(
      "properties.organization_id = $1",
    );
    expect(summary.alerts.map((alert) => alert.id)).toEqual([
      "pending-verifications",
    ]);
  });

  it("aggregates leakage and draft recovery metrics", async () => {
    const executor = new FakePostgresExecutor([
      [
        {
          total_recovery_opportunity: "700",
          properties_with_leakage: "1",
          total_underbill_exposure: "700",
          total_overbill_exposure: "125",
          total_billing_exposure: "825",
          properties_with_underbill: "1",
          properties_with_overbill: "1",
          properties_with_billing_exposure: "2",
          has_billing_data: true,
          draft_recovery: "125",
          draft_property_count: "2",
        },
      ],
    ]);
    const repository = new PostgresBootstrapRepository(executor);

    await expect(repository.getLeakageSummary(ORG_ID)).resolves.toEqual({
      total_recovery_opportunity: "700",
      properties_with_leakage: 1,
      total_underbill_exposure: "700",
      total_overbill_exposure: "125",
      total_billing_exposure: "825",
      properties_with_underbill: 1,
      properties_with_overbill: 1,
      properties_with_billing_exposure: 2,
      has_billing_data: true,
      draft_recovery: "125",
      draft_property_count: 2,
    });
    expect(executor.statements[0]).toContain("total_billing_exposure");
    expect(executor.statements[0]).toContain("status = 'draft'");
  });

  it("computes active trial plan selection with remaining days", async () => {
    const periodEnd = new Date(Date.now() + 2.2 * 86_400_000).toISOString();
    const executor = new FakePostgresExecutor([
      [
        {
          settings: {
            billing_activation: {
              plan_id: "reconcile",
              billing_period: "annual",
              unit_count: 25,
              building_count: 1,
              selected_at: "2026-06-12T00:00:00Z",
            },
          },
        },
      ],
      [
        {
          status: "trialing",
          billing_model: "subscription",
          stripe_subscription_id: null,
          current_period_end: periodEnd,
        },
      ],
      [{ exists: false }],
    ]);
    const repository = new PostgresBootstrapRepository(executor);
    const result = await repository.getPlanSelection(ORG_ID);

    expect(result).toMatchObject({
      plan_id: "reconcile",
      billing_period: "annual",
      unit_count: 25,
      building_count: 1,
      checkout_required: false,
      has_active_access: true,
      has_paused_subscription: false,
      subscription_status: "trialing",
    });
    expect(result.trial_days_remaining).toBeGreaterThanOrEqual(2);
  });

  it("treats expired no-card trials as paused without active access", async () => {
    const executor = new FakePostgresExecutor([
      [{ settings: {} }],
      [
        {
          status: "trialing",
          billing_model: "subscription",
          stripe_subscription_id: null,
          current_period_end: "2026-01-01T00:00:00Z",
        },
      ],
      [{ exists: false }],
    ]);
    const repository = new PostgresBootstrapRepository(executor);

    await expect(repository.getPlanSelection(ORG_ID)).resolves.toMatchObject({
      checkout_required: false,
      has_active_access: false,
      has_paused_subscription: true,
      subscription_status: "paused",
      trial_days_remaining: null,
    });
  });
});
