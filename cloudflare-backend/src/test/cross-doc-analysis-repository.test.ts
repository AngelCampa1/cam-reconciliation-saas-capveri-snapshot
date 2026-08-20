import { describe, expect, it } from "vitest";
import { PostgresCrossDocAnalysisRepository } from "../adapters/db/cross-doc-analysis";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";

const ORG_ID = "11111111-1111-4111-8111-111111111111";

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

describe("PostgresCrossDocAnalysisRepository", () => {
  it("grants full access for active subscriptions without database helper functions", async () => {
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
    const repository = new PostgresCrossDocAnalysisRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(true);
    expect(executor.statements[0]?.sql).toContain("from subscriptions");
    expect(executor.statements[0]?.sql).not.toContain("has_full_access");
    expect(executor.statements[0]?.params).toEqual([ORG_ID]);
  });

  it("falls back to purchased credits for credit-pack access", async () => {
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
    const repository = new PostgresCrossDocAnalysisRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(true);
    expect(executor.statements[1]?.sql).toContain("from audit_credits");
    expect(executor.statements[1]?.params).toEqual([ORG_ID]);
  });

  it("falls back to purchased credits when no subscription row exists", async () => {
    const executor = new QueueExecutor([[], [{ exists: true }]]);
    const repository = new PostgresCrossDocAnalysisRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(true);
    expect(executor.statements[0]?.sql).toContain("from subscriptions");
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
    const repository = new PostgresCrossDocAnalysisRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(false);
  });

  it("assembles lease terms from recovery_profile without querying removed lease columns", async () => {
    const executor = new QueueExecutor([
      [{ name: "Profile Tower" }],
      [
        {
          id: "22222222-2222-4222-8222-222222222222",
          tenant_name: "Profile Tenant",
          recovery_profile: {
            base_year: 2023,
            pro_rata_share: "0.125",
            cap_type: "none",
          },
          start_date: "2023-01-01",
          end_date: "2028-12-31",
        },
      ],
      [
        {
          lease_id: "22222222-2222-4222-8222-222222222222",
          verified_at: "2026-01-02T03:04:05.000Z",
        },
      ],
      [],
      [],
      [],
      [],
      [{ auditor_overrides: null }],
      [{ auditor_config: null }],
      [],
    ]);
    const repository = new PostgresCrossDocAnalysisRepository(executor);

    const assembled = await repository.assembleCrossDocInput({
      propertyId: "33333333-3333-4333-8333-333333333333",
      periodYear: 2026,
      organizationId: ORG_ID,
    });

    const leaseQuery = executor.statements[1]?.sql ?? "";
    expect(leaseQuery).toContain("recovery_profile");
    expect(leaseQuery).not.toContain("pro_rata_share,");
    expect(leaseQuery).not.toContain("base_year,");
    expect(assembled.lease_contexts[0]?.base_year).toBe(2023);
    expect(assembled.lease_contexts[0]?.pro_rata_share).toBe("0.125");
    expect(assembled.data_availability.has_verified_leases).toBe(true);
  });

  it("assembles sampled GL entries and CAM statement contexts for model review", async () => {
    const propertyId = "33333333-3333-4333-8333-333333333333";
    const leaseId = "22222222-2222-4222-8222-222222222222";
    const poolId = "77777777-7777-4777-8777-777777777777";
    const executor = new QueueExecutor([
      [{ name: "Semantic Tower" }],
      [
        {
          id: leaseId,
          tenant_name: "Semantic Tenant",
          recovery_profile: {
            base_year: 2025,
            pro_rata_share: "0.2",
          },
          start_date: "2026-01-01",
          end_date: "2031-12-31",
        },
      ],
      [{ lease_id: leaseId, verified_at: "2026-01-02T03:04:05.000Z" }],
      [
        {
          id: poolId,
          name: "Capital",
          pool_type: "capital",
          is_gross_up_applicable: false,
        },
      ],
      [
        {
          expense_pool_id: poolId,
          gl_account_pattern: "15*",
          allocation_percentage: "1",
        },
      ],
      [
        {
          amount: "90000.00",
          account_code: "1500",
          account_description: "Building Improvements",
          vendor_name: "BuildCo",
          description: "Capital roof project in CAM package",
        },
      ],
      [{ id: "88888888-8888-4888-8888-888888888888" }],
      [
        {
          lease_id: leaseId,
          tenant_name: "Semantic Tenant",
          pool_id: poolId,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          billed_amount: "100000.00",
        },
        {
          lease_id: leaseId,
          tenant_name: "Semantic Tenant",
          pool_id: poolId,
          period_start: "2026-01-01",
          period_end: "2026-12-31",
          billed_amount: "9000.00",
        },
      ],
      [{ auditor_overrides: null }],
      [{ auditor_config: null }],
      [],
    ]);
    const repository = new PostgresCrossDocAnalysisRepository(executor);

    const assembled = await repository.assembleCrossDocInput({
      propertyId,
      periodYear: 2026,
      organizationId: ORG_ID,
    });

    expect(assembled.gl_pool_contexts[0]?.sample_entries?.[0]).toMatchObject({
      account_code: "1500",
      account_description: "Building Improvements",
      amount: "90000",
      vendor_name: "BuildCo",
      description: "Capital roof project in CAM package",
    });
    expect(
      assembled.cam_statement_contexts?.map((row) => row.billed_amount),
    ).toEqual(["100000.00", "9000.00"]);
    const camStatementQuery = executor.statements.find((statement) =>
      statement.sql.includes("order by"),
    )?.sql;
    expect(camStatementQuery).toContain(
      "order by actual_billed_amounts.billed_amount desc",
    );
    expect(camStatementQuery).not.toContain("order by billed_amount desc");
  });

  it("merges finding decisions with an atomic update returning the requested key", async () => {
    const findingId = "44444444-4444-4444-8444-444444444444";
    const executor = new QueueExecutor([
      [
        {
          merged_decisions: {
            [findingId]: {
              decision: "accepted",
              reason: "reviewed",
            },
          },
        },
      ],
    ]);
    const repository = new PostgresCrossDocAnalysisRepository(executor);

    await expect(
      repository.mergeFindingDecision({
        analysisId: "55555555-5555-4555-8555-555555555555",
        organizationId: ORG_ID,
        findingId,
        decision: {
          decision: "accepted",
          reason: "reviewed",
          user_id: "66666666-6666-4666-8666-666666666666",
          decided_at: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).resolves.toHaveProperty(findingId);
    expect(executor.statements[0]?.sql).toContain("update cross_doc_analyses");
    expect(executor.statements[0]?.sql).toContain("jsonb_array_elements");
    expect(executor.statements[0]?.sql).toContain("finding->>'id' = $3");
    expect(executor.statements[0]?.sql).not.toContain("merge_finding_decision");
  });

  it("returns null when a finding decision update does not return the requested key", async () => {
    const executor = new QueueExecutor([]);
    const repository = new PostgresCrossDocAnalysisRepository(executor);

    await expect(
      repository.mergeFindingDecision({
        analysisId: "55555555-5555-4555-8555-555555555555",
        organizationId: ORG_ID,
        findingId: "44444444-4444-4444-8444-444444444444",
        decision: {
          decision: "dismissed",
          reason: "missing",
          user_id: "66666666-6666-4666-8666-666666666666",
          decided_at: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).resolves.toBeNull();
  });

  it("guards in-review status updates with the expected pending status", async () => {
    const executor = new QueueExecutor([
      [{ id: "55555555-5555-4555-8555-555555555555" }],
    ]);
    const repository = new PostgresCrossDocAnalysisRepository(executor);

    await expect(
      repository.updateAnalysisStatus({
        analysisId: "55555555-5555-4555-8555-555555555555",
        organizationId: ORG_ID,
        status: "in_review",
        expectedStatus: "pending",
      }),
    ).resolves.toBe(true);

    expect(executor.statements[0]?.sql).toContain("and status = $4");
    expect(executor.statements[0]?.sql).toContain("returning id");
    expect(executor.statements[0]?.params).toEqual([
      "in_review",
      "55555555-5555-4555-8555-555555555555",
      ORG_ID,
      "pending",
    ]);
  });

  it("inserts analysis findings as structured JSON, not a stringified blob", async () => {
    const findings = {
      findings: [{ id: "44444444-4444-4444-8444-444444444444" }],
    };
    const executor = new QueueExecutor([
      [{ id: "55555555-5555-4555-8555-555555555555" }],
    ]);
    const repository = new PostgresCrossDocAnalysisRepository(executor);

    await repository.insertAnalysis({
      organizationId: ORG_ID,
      propertyId: "33333333-3333-4333-8333-333333333333",
      periodYear: 2026,
      result: {
        findings,
        token_usage: 123,
      },
    });

    expect(executor.statements[0]?.params[3]).toBe(findings);
    expect(typeof executor.statements[0]?.params[3]).toBe("object");
  });
});
