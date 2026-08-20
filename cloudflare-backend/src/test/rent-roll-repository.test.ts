import { describe, expect, it } from "vitest";
import { PostgresRentRollRepository } from "../adapters/db/rent-roll";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const UNIT_ID = "44444444-4444-4444-8444-444444444444";
const LEASE_ID = "55555555-5555-4555-8555-555555555555";

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

describe("postgres rent roll repository", () => {
  it("grants credit-pack access from audit credits", async () => {
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
    const repository = new PostgresRentRollRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(true);
    expect(executor.statements[1]?.sql).toContain("from audit_credits");
    expect(executor.statements[1]?.sql).toContain("credits_purchased > 0");
    expect(executor.statements[1]?.params).toEqual([ORG_ID]);
  });

  it("does not grant access for expired cardless trials", async () => {
    const executor = new QueueExecutor([
      [
        {
          status: "trialing",
          billingModel: "subscription",
          stripeSubscriptionId: null,
          currentPeriodEnd: "2026-01-01T00:00:00Z",
        },
      ],
    ]);
    const repository = new PostgresRentRollRepository(executor);

    await expect(repository.hasFullAccess(ORG_ID)).resolves.toBe(false);
    expect(executor.statements).toHaveLength(1);
  });

  it("creates property, units, and eligible leases in one transaction", async () => {
    const executor = new QueueExecutor([
      [{ id: PROPERTY_ID, name: "Downtown Tower" }],
      [{ id: UNIT_ID }],
      [{ id: LEASE_ID }],
      [{ id: "66666666-6666-4666-8666-666666666666" }],
    ]);
    const repository = new PostgresRentRollRepository(executor);

    const result = await repository.importRentRoll({
      organizationId: ORG_ID,
      propertyName: "Downtown Tower",
      addressLine1: "123 Main Street",
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      units: [
        {
          unit_number: "100",
          rentable_sqft: "1000.00",
          usable_sqft: "900.00",
          floor: 1,
          tenant_name: "Acme Retail",
          lease_start: "2026-01-01",
          lease_end: "2026-12-31",
          base_rent: "1200.00",
          cam_share: "0.0525",
        },
        {
          unit_number: "101",
          rentable_sqft: "800.00",
          usable_sqft: null,
          floor: 1,
          tenant_name: null,
          lease_start: null,
          lease_end: null,
          base_rent: null,
          cam_share: null,
        },
      ],
    });

    expect(result).toEqual({
      state: "created",
      propertyId: PROPERTY_ID,
      propertyName: "Downtown Tower",
      unitsCreated: 2,
      leasesCreated: 1,
    });
    expect(executor.statements[0]?.sql).toContain("insert into properties");
    expect(executor.statements[0]?.params).toEqual([
      ORG_ID,
      "Downtown Tower",
      "123 Main Street",
      "Austin",
      "TX",
      "78701",
      "1800.00",
      "1620.00",
      "180.00",
      "0.95",
    ]);
    expect(executor.statements[1]?.sql).toContain("insert into units");
    expect(executor.statements[2]?.sql).toContain("insert into leases");
    expect(executor.statements[2]?.params).toEqual([
      PROPERTY_ID,
      UNIT_ID,
      "Acme Retail",
      "2026-01-01",
      "2026-12-31",
      "active",
      expect.objectContaining({ pro_rata_share: "0.0525" }),
    ]);
    expect(executor.statements[3]?.sql).toContain("insert into units");
  });
});
