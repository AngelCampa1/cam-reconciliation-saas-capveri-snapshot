import { describe, expect, it } from "vitest";
import { PostgresCapExRepository } from "../adapters/db/capex";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";
import type { CapExFlagRow } from "../domain/capex/repository";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const FLAG_ID_1 = "44444444-4444-4444-8444-444444444441";
const FLAG_ID_2 = "44444444-4444-4444-8444-444444444442";
const GL_ID_1 = "55555555-5555-4555-8555-555555555551";

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

class QueueExecutor implements PostgresExecutor {
  readonly statements: RecordedStatement[] = [];
  transactionCount = 0;

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
    this.transactionCount += 1;
    return operation(this);
  }
}

describe("PostgresCapExRepository", () => {
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
    const repository = new PostgresCapExRepository(executor);

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
    const repository = new PostgresCapExRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(true);
    expect(executor.statements[1]?.sql).toContain("from audit_credits");
    expect(executor.statements[1]?.params).toEqual([ORG_ID]);
  });

  it("falls back to purchased credits when no subscription row exists", async () => {
    const executor = new QueueExecutor([[], [{ exists: true }]]);
    const repository = new PostgresCapExRepository(executor);

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
    const repository = new PostgresCapExRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(false);
  });

  it("bulk-reviews flags in one transaction and preserves request order", async () => {
    const executor = new QueueExecutor([
      [{ id: FLAG_ID_1 }, { id: FLAG_ID_2 }],
      [
        makeFlag(FLAG_ID_2, "dismissed"),
        makeFlag(FLAG_ID_1, "dismissed"),
      ],
    ]);
    const repository = new PostgresCapExRepository(executor);

    await expect(
      repository.reviewFlags({
        flagIds: [FLAG_ID_1, FLAG_ID_2, FLAG_ID_1],
        organizationId: ORG_ID,
        disposition: "dismissed",
        reviewedAt: "2026-06-29T00:00:00.000Z",
        reviewedByUserId: USER_ID,
        reviewNote: "Batch dismissed",
      }),
    ).resolves.toMatchObject({
      status: "reviewed",
      flags: [{ id: FLAG_ID_1 }, { id: FLAG_ID_2 }, { id: FLAG_ID_1 }],
    });
    expect(executor.transactionCount).toBe(1);
    expect(executor.statements[0]?.sql).toContain("for update");
    expect(executor.statements[0]?.params).toEqual([
      ORG_ID,
      [FLAG_ID_1, FLAG_ID_2],
    ]);
    expect(executor.statements[1]?.sql).toContain("update capex_flags");
    expect(executor.statements[1]?.params).toEqual([
      "dismissed",
      "2026-06-29T00:00:00.000Z",
      USER_ID,
      "Batch dismissed",
      ORG_ID,
      [FLAG_ID_1, FLAG_ID_2],
    ]);
  });

  it("does not update any flags when a bulk review ID is missing", async () => {
    const executor = new QueueExecutor([[{ id: FLAG_ID_1 }]]);
    const repository = new PostgresCapExRepository(executor);

    await expect(
      repository.reviewFlags({
        flagIds: [FLAG_ID_1, FLAG_ID_2],
        organizationId: ORG_ID,
        disposition: "dismissed",
        reviewedAt: "2026-06-29T00:00:00.000Z",
        reviewedByUserId: USER_ID,
        reviewNote: null,
      }),
    ).resolves.toEqual({
      status: "not_found",
      missingFlagIds: [FLAG_ID_2],
    });
    expect(executor.transactionCount).toBe(1);
    expect(executor.statements).toHaveLength(1);
    expect(executor.statements[0]?.sql).toContain("for update");
  });
});

function makeFlag(
  id: string,
  disposition: "confirmed_capex" | "dismissed",
): CapExFlagRow {
  return {
    id,
    organization_id: ORG_ID,
    gl_entry_id: GL_ID_1,
    property_id: PROPERTY_ID,
    period_year: 2024,
    flag_reason: "Amount exceeds threshold",
    rule_name: "amount_threshold",
    confidence_score: "0.85",
    matched_pattern: null,
    disposition,
    reviewed_at: "2026-06-29T00:00:00.000Z",
    reviewed_by_user_id: USER_ID,
    review_note: "Batch dismissed",
    classifier_version: "1.0",
    created_at: "2026-01-01T00:00:00Z",
  };
}
