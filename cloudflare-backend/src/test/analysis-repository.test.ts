import { describe, expect, it } from "vitest";
import { PostgresAnalysisRepository } from "../adapters/db/analysis";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const POOL_ID = "44444444-4444-4444-8444-444444444444";
const ANALYSIS_ID = "55555555-5555-4555-8555-555555555555";

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

class QueueExecutor implements PostgresExecutor {
  readonly statements: RecordedStatement[] = [];

  constructor(private readonly responses: unknown[][]) {}

  async query<Row>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.statements.push({ sql, params });
    const rows = this.responses.shift() ?? [];

    return { rows: rows as Row[] };
  }

  async transaction<Result>(
    operation: (executor: PostgresExecutor) => Promise<Result>,
  ): Promise<Result> {
    return operation(this);
  }
}

describe("PostgresAnalysisRepository", () => {
  it("grants full access for active subscriptions", async () => {
    const executor = new QueueExecutor([
      [
        {
          status: "active",
          billingModel: "subscription",
          stripeSubscriptionId: "sub_123",
          currentPeriodEnd: null,
        },
      ],
    ]);
    const repository = new PostgresAnalysisRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(true);
    expect(executor.statements[0]?.sql).toContain("from subscriptions");
    expect(executor.statements[0]?.params).toEqual([ORG_ID]);
  });

  it("falls back to purchased credits for credit-pack billing", async () => {
    const executor = new QueueExecutor([
      [
        {
          status: "active",
          billingModel: "credit_pack",
          stripeSubscriptionId: null,
          currentPeriodEnd: null,
        },
      ],
      [{ exists: true }],
    ]);
    const repository = new PostgresAnalysisRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(true);
    expect(executor.statements[1]?.sql).toContain("from audit_credits");
    expect(executor.statements[1]?.params).toEqual([ORG_ID]);
  });

  it("rejects expired local trials", async () => {
    const executor = new QueueExecutor([
      [
        {
          status: "trialing",
          billingModel: "subscription",
          stripeSubscriptionId: null,
          currentPeriodEnd: "2000-01-01T00:00:00.000Z",
        },
      ],
    ]);
    const repository = new PostgresAnalysisRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(false);
  });

  it("loads property names with organization scope", async () => {
    const executor = new QueueExecutor([[{ name: "Downtown Tower" }]]);
    const repository = new PostgresAnalysisRepository(executor);

    await expect(
      repository.getPropertyName({
        propertyId: PROPERTY_ID,
        organizationId: ORG_ID,
      }),
    ).resolves.toBe("Downtown Tower");
    expect(executor.statements[0]?.sql).toContain(
      "where id = $1 and organization_id = $2",
    );
    expect(executor.statements[0]?.params).toEqual([PROPERTY_ID, ORG_ID]);
  });

  it("lists finalized snapshot years in ascending order", async () => {
    const executor = new QueueExecutor([[{ year: 2024 }, { year: 2025 }]]);
    const repository = new PostgresAnalysisRepository(executor);

    await expect(
      repository.listAvailableYears({
        propertyId: PROPERTY_ID,
        organizationId: ORG_ID,
      }),
    ).resolves.toEqual([2024, 2025]);
    expect(executor.statements[0]?.sql).toContain("and organization_id = $2");
    expect(executor.statements[0]?.sql).toContain("and status = 'finalized'");
  });

  it("filters finalized snapshot years by requested years", async () => {
    const executor = new QueueExecutor([[{ year: 2025 }]]);
    const repository = new PostgresAnalysisRepository(executor);

    await expect(
      repository.listFinalizedSnapshotYears({
        propertyId: PROPERTY_ID,
        years: [2024, 2025],
        organizationId: ORG_ID,
      }),
    ).resolves.toEqual([2025]);
    expect(executor.statements[0]?.sql).toContain("= any($3::int[])");
    expect(executor.statements[0]?.params).toEqual([
      PROPERTY_ID,
      ORG_ID,
      [2024, 2025],
    ]);
  });

  it("loads pool mappings only through organization-owned pools", async () => {
    const executor = new QueueExecutor([
      [
        {
          expense_pool_id: POOL_ID,
          gl_account_pattern: "600%",
          allocation_percentage: "1.0",
        },
      ],
    ]);
    const repository = new PostgresAnalysisRepository(executor);

    await expect(
      repository.listPoolMappings({
        poolIds: [POOL_ID],
        organizationId: ORG_ID,
      }),
    ).resolves.toEqual([
      {
        expense_pool_id: POOL_ID,
        gl_account_pattern: "600%",
        allocation_percentage: "1.0",
      },
    ]);
    expect(executor.statements[0]?.sql).toContain(
      "join properties on properties.id = expense_pools.property_id",
    );
    expect(executor.statements[0]?.sql).toContain(
      "and properties.organization_id = $2",
    );
    expect(executor.statements[0]?.sql).toContain(
      "order by pool_mappings.priority desc",
    );
  });

  it("records anomaly feature use through the database helper", async () => {
    const executor = new QueueExecutor([[]]);
    const repository = new PostgresAnalysisRepository(executor);

    await repository.recordFeatureUse({
      organizationId: ORG_ID,
      featureKey: "anomaly_alerts",
    });

    expect(executor.statements[0]).toEqual({
      sql: "select public.upsert_feature_use($1, $2)",
      params: [ORG_ID, "anomaly_alerts"],
    });
  });

  it("dismisses only active GL analysis rows", async () => {
    const dismissedAt = "2026-06-30T00:00:00.000Z";
    const dismissedByUserId = "66666666-6666-4666-8666-666666666666";
    const executor = new QueueExecutor([
      [
        {
          id: ANALYSIS_ID,
          organization_id: ORG_ID,
          property_id: PROPERTY_ID,
          period_year: 2026,
          analysis_markdown: "analysis",
          token_input: 10,
          token_output: 0,
          ran_at: "2026-06-30T00:00:00.000Z",
          ran_by_user_id: dismissedByUserId,
          dismissed_at: dismissedAt,
          dismissed_by_user_id: dismissedByUserId,
          created_at: "2026-06-30T00:00:00.000Z",
        },
      ],
    ]);
    const repository = new PostgresAnalysisRepository(executor);

    await expect(
      repository.dismissGlAnalysis({
        organizationId: ORG_ID,
        analysisId: ANALYSIS_ID,
        dismissedAt,
        dismissedByUserId,
      }),
    ).resolves.toMatchObject({
      id: ANALYSIS_ID,
      dismissed_at: dismissedAt,
      dismissed_by_user_id: dismissedByUserId,
    });

    expect(executor.statements[0]?.sql).toContain(
      "where id = $3 and organization_id = $4 and dismissed_at is null",
    );
    expect(executor.statements[0]?.params).toEqual([
      dismissedAt,
      dismissedByUserId,
      ANALYSIS_ID,
      ORG_ID,
    ]);
  });

  it("treats an already-dismissed GL analysis guard miss as not found", async () => {
    const repository = new PostgresAnalysisRepository(new QueueExecutor([[]]));

    await expect(
      repository.dismissGlAnalysis({
        organizationId: ORG_ID,
        analysisId: ANALYSIS_ID,
        dismissedAt: "2026-06-30T00:00:00.000Z",
        dismissedByUserId: "66666666-6666-4666-8666-666666666666",
      }),
    ).rejects.toThrow(`Analysis ${ANALYSIS_ID} not found`);
  });
});
