import { describe, expect, it } from "vitest";
import { PostgresAdminDisputesRepository } from "../adapters/db/tenant-disputes";
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

describe("PostgresAdminDisputesRepository", () => {
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
    const repository = new PostgresAdminDisputesRepository(executor);

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
    const repository = new PostgresAdminDisputesRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(true);
    expect(executor.statements[1]?.sql).toContain("from audit_credits");
    expect(executor.statements[1]?.params).toEqual([ORG_ID]);
  });

  it("rejects organizations with no subscription and no purchased credits", async () => {
    const executor = new QueueExecutor([[], [{ exists: false }]]);
    const repository = new PostgresAdminDisputesRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(false);
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
    const repository = new PostgresAdminDisputesRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(false);
  });
});
