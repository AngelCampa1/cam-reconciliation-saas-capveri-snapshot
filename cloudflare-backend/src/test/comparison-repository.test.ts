import { describe, expect, it } from "vitest";
import { PostgresComparisonRepository } from "../adapters/db/comparison";
import type { PostgresExecutor } from "../adapters/db/postgres";
import type { QueryResult } from "../adapters/db/transaction";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const RUN_ID = "44444444-4444-4444-8444-444444444444";
const LEASE_A = "55555555-5555-4555-8555-555555555555";
const LEASE_B = "66666666-6666-4666-8666-666666666666";
const LEASE_C = "77777777-7777-4777-8777-777777777777";

type RecordedStatement = {
  sql: string;
  params: readonly unknown[];
};

class ScriptedExecutor implements PostgresExecutor {
  readonly statements: RecordedStatement[] = [];

  constructor(
    private readonly handler: (
      sql: string,
      params: readonly unknown[],
    ) => unknown[],
  ) {}

  async query<Row>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    this.statements.push({ sql, params });

    return { rows: this.handler(sql, params) as Row[] };
  }

  async transaction<Result>(
    operation: (executor: PostgresExecutor) => Promise<Result>,
  ): Promise<Result> {
    return operation(this);
  }
}

describe("postgres comparison repository", () => {
  it("compares actual billed rows with duplicate-name and blank-name parity", async () => {
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from properties")) {
        return [{ id: PROPERTY_ID }];
      }
      if (sql.includes("from reconciliation_snapshots")) {
        return [
          {
            leaseId: LEASE_A,
            totalRecovery: "100.00",
            poolBreakdowns: null,
          },
          {
            leaseId: LEASE_B,
            totalRecovery: "50.00",
            poolBreakdowns: null,
          },
          {
            leaseId: LEASE_C,
            totalRecovery: "90.00",
            poolBreakdowns: null,
          },
        ];
      }
      if (sql.includes("from leases")) {
        return [
          { id: LEASE_A, tenantName: "Same Tenant" },
          { id: LEASE_B, tenantName: "Same Tenant" },
          { id: LEASE_C, tenantName: "Solo Tenant" },
        ];
      }
      if (sql.includes("from actual_billed_amounts")) {
        return [
          {
            id: "billed-1",
            leaseId: null,
            tenantName: "Same Tenant",
            billedAmount: "150.00",
            poolId: null,
          },
          {
            id: "billed-2",
            leaseId: null,
            tenantName: "Solo Tenant",
            billedAmount: "100.00",
            poolId: null,
          },
          {
            id: "billed-blank",
            leaseId: null,
            tenantName: "",
            billedAmount: "25.00",
            poolId: null,
          },
        ];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    const result = await repository.compareActualBilled({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: "0.01",
      includeDrafts: false,
    });

    expect(result.total_capveri_correct).toBe("240");
    expect(result.total_actual_charged).toBe("275");
    expect(result.total_net_variance).toBe("35");
    expect(result.overcharge_count).toBe(2);
    expect(result.match_count).toBe(1);
    expect(result.tenants).toEqual([
      expect.objectContaining({
        lease_id: "id::billed-blank",
        tenant_name: "Unidentified charge",
        match_status: "needs_review",
        match_note: "This charge is missing a tenant name.",
        capveri_correct: "0",
        actual_charged: "25",
        direction: "overcharge",
      }),
      expect.objectContaining({
        lease_id: LEASE_C,
        tenant_name: "Solo Tenant",
        match_status: "matched",
        match_note: null,
        capveri_correct: "90",
        actual_charged: "100",
        direction: "overcharge",
      }),
      expect.objectContaining({
        lease_id: "ambiguous-name::Same Tenant",
        tenant_name: "Same Tenant",
        match_status: "needs_review",
        match_note: "More than one lease matched this tenant name.",
        capveri_correct: "150",
        actual_charged: "150",
        direction: "match",
      }),
    ]);
    expect(
      executor.statements.find((statement) =>
        statement.sql.includes("period_start_date <= $3"),
      ),
    ).toBeTruthy();
    expect(
      executor.statements.find((statement) =>
        statement.sql.includes("period_end_date >= $4"),
      ),
    ).toBeTruthy();
  });

  it("uses actual billed lease_id before falling back to tenant names", async () => {
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from properties")) {
        return [{ id: PROPERTY_ID }];
      }
      if (sql.includes("from reconciliation_snapshots")) {
        return [
          {
            leaseId: LEASE_A,
            totalRecovery: "100.00",
            poolBreakdowns: null,
          },
          {
            leaseId: LEASE_B,
            totalRecovery: "50.00",
            poolBreakdowns: null,
          },
        ];
      }
      if (sql.includes("from leases")) {
        return [
          { id: LEASE_A, tenantName: "Same Tenant" },
          { id: LEASE_B, tenantName: "Same Tenant" },
        ];
      }
      if (sql.includes("from actual_billed_amounts")) {
        return [
          {
            id: "billed-linked",
            leaseId: LEASE_A,
            tenantName: "Same Tenant",
            billedAmount: "110.00",
            poolId: null,
          },
          {
            id: "billed-fallback",
            leaseId: null,
            tenantName: "Same Tenant",
            billedAmount: "45.00",
            poolId: null,
          },
          {
            id: "billed-unmatched",
            leaseId: null,
            tenantName: "Unknown Tenant",
            billedAmount: "20.00",
            poolId: null,
          },
        ];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    const result = await repository.compareActualBilled({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: "0.01",
      includeDrafts: false,
    });

    expect(result.tenants).toEqual([
      expect.objectContaining({
        lease_id: "unmatched-name::Unknown Tenant",
        tenant_name: "Unknown Tenant",
        match_status: "needs_review",
        match_note: "No lease matched this billed row.",
        capveri_correct: "0",
        actual_charged: "20",
      }),
      expect.objectContaining({
        lease_id: LEASE_A,
        tenant_name: "Same Tenant",
        match_status: "matched",
        match_note: null,
        capveri_correct: "100",
        actual_charged: "110",
      }),
      expect.objectContaining({
        lease_id: LEASE_B,
        tenant_name: "Same Tenant",
        capveri_correct: "50",
        actual_charged: "45",
      }),
    ]);
    expect(result.total_capveri_correct).toBe("150");
    expect(result.total_actual_charged).toBe("175");
  });

  it("matches actual billed rows with common legal suffix differences", async () => {
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from properties")) {
        return [{ id: PROPERTY_ID }];
      }
      if (sql.includes("from reconciliation_snapshots")) {
        return [
          {
            leaseId: LEASE_A,
            totalRecovery: "100.00",
            poolBreakdowns: null,
          },
        ];
      }
      if (sql.includes("from leases")) {
        return [{ id: LEASE_A, tenantName: "Acme Retail" }];
      }
      if (sql.includes("from actual_billed_amounts")) {
        return [
          {
            id: "billed-suffix",
            leaseId: null,
            tenantName: "Acme Retail LLC",
            billedAmount: "110.00",
            poolId: null,
          },
        ];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    const result = await repository.compareActualBilled({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: "0.01",
      includeDrafts: false,
    });

    expect(result.tenants).toEqual([
      expect.objectContaining({
        lease_id: LEASE_A,
        tenant_name: "Acme Retail",
        match_status: "matched",
        match_note: null,
        capveri_correct: "100",
        actual_charged: "110",
      }),
    ]);
  });

  it("carries pool detail through suffix-normalized actual billed matches", async () => {
    const poolId = "88888888-8888-4888-8888-888888888888";
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from properties")) {
        return [{ id: PROPERTY_ID }];
      }
      if (sql.includes("from reconciliation_snapshots")) {
        return [
          {
            leaseId: LEASE_A,
            totalRecovery: "100.00",
            poolBreakdowns: [{ pool_name: "CAM", total_recovery: "100.00" }],
          },
        ];
      }
      if (sql.includes("from leases")) {
        return [{ id: LEASE_A, tenantName: "Acme Retail" }];
      }
      if (sql.includes("from actual_billed_amounts")) {
        return [
          {
            id: "billed-suffix-pool",
            leaseId: null,
            tenantName: "Acme Retail LLC",
            billedAmount: "110.00",
            poolId,
          },
        ];
      }
      if (sql.includes("from expense_pools")) {
        return [{ id: poolId, name: "CAM" }];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    const result = await repository.compareActualBilled({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: "0.01",
      includeDrafts: false,
    });

    expect(result.tenants[0]).toMatchObject({
      lease_id: LEASE_A,
      match_status: "matched",
      pool_breakdowns: [
        expect.objectContaining({
          pool_id: poolId,
          pool_name: "CAM",
          capveri_correct: "100",
          actual_charged: "110",
        }),
      ],
    });
  });

  it("reads live reconciliation pool recovery fields for pool comparison", async () => {
    const poolId = "88888888-8888-4888-8888-888888888888";
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from properties")) {
        return [{ id: PROPERTY_ID }];
      }
      if (sql.includes("from reconciliation_snapshots")) {
        return [
          {
            leaseId: LEASE_A,
            totalRecovery: "100.00",
            poolBreakdowns: JSON.stringify([
              { pool_name: "CAM", recovery: "100.00" },
            ]),
          },
        ];
      }
      if (sql.includes("from leases")) {
        return [{ id: LEASE_A, tenantName: "Acme Retail" }];
      }
      if (sql.includes("from expense_pools")) {
        return [{ id: poolId, name: "CAM" }];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    const result = await repository.compareExplicit({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: "0.01",
      includeDrafts: false,
      charges: [
        {
          lease_id: LEASE_A,
          pool_id: poolId,
          amount: "110.00",
        },
      ],
    });

    expect(result.tenants[0]).toMatchObject({
      lease_id: LEASE_A,
      pool_breakdowns: [
        expect.objectContaining({
          pool_id: poolId,
          pool_name: "CAM",
          capveri_correct: "100",
          actual_charged: "110",
          variance: "10",
        }),
      ],
    });
  });

  it("keeps suffix-collapsed duplicate tenant names in match review", async () => {
    const poolId = "88888888-8888-4888-8888-888888888888";
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from properties")) {
        return [{ id: PROPERTY_ID }];
      }
      if (sql.includes("from reconciliation_snapshots")) {
        return [
          {
            leaseId: LEASE_A,
            totalRecovery: "100.00",
            poolBreakdowns: [{ pool_name: "CAM", total_recovery: "100.00" }],
          },
          {
            leaseId: LEASE_B,
            totalRecovery: "75.00",
            poolBreakdowns: [{ pool_name: "CAM", total_recovery: "75.00" }],
          },
        ];
      }
      if (sql.includes("from leases")) {
        return [
          { id: LEASE_A, tenantName: "Acme Retail LLC" },
          { id: LEASE_B, tenantName: "Acme Retail Inc" },
        ];
      }
      if (sql.includes("from actual_billed_amounts")) {
        return [
          {
            id: "billed-ambiguous-suffix",
            leaseId: null,
            tenantName: "Acme Retail",
            billedAmount: "175.00",
            poolId,
          },
        ];
      }
      if (sql.includes("from expense_pools")) {
        return [{ id: poolId, name: "CAM" }];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    const result = await repository.compareActualBilled({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: "0.01",
      includeDrafts: false,
    });

    expect(result.tenants).toEqual([
      expect.objectContaining({
        lease_id: "ambiguous-name::Acme Retail",
        tenant_name: "Acme Retail",
        match_status: "needs_review",
        match_note: "More than one lease matched this tenant name.",
        capveri_correct: "175",
        actual_charged: "175",
        pool_breakdowns: null,
      }),
    ]);
  });

  it("keeps normalization-null and collapsed unmatched billed labels in review totals", async () => {
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from properties")) {
        return [{ id: PROPERTY_ID }];
      }
      if (sql.includes("from reconciliation_snapshots")) {
        return [
          {
            leaseId: LEASE_A,
            totalRecovery: "100.00",
            poolBreakdowns: null,
          },
        ];
      }
      if (sql.includes("from leases")) {
        return [{ id: LEASE_A, tenantName: "Acme Retail" }];
      }
      if (sql.includes("from actual_billed_amounts")) {
        return [
          {
            id: "billed-punctuation",
            leaseId: null,
            tenantName: "---",
            billedAmount: "40.00",
            poolId: null,
          },
          {
            id: "billed-acme-llc",
            leaseId: null,
            tenantName: "Acme LLC",
            billedAmount: "25.00",
            poolId: null,
          },
          {
            id: "billed-acme-inc",
            leaseId: null,
            tenantName: "Acme Inc",
            billedAmount: "30.00",
            poolId: null,
          },
        ];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    const result = await repository.compareActualBilled({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: "0.01",
      includeDrafts: false,
    });

    const byLease = new Map(
      result.tenants.map((tenant) => [tenant.lease_id, tenant]),
    );
    expect(result.total_actual_charged).toBe("95");
    expect(byLease.get("unmatched-name::---")).toMatchObject({
      tenant_name: "---",
      match_status: "needs_review",
      actual_charged: "40",
    });
    expect(byLease.get("unmatched-name::Acme LLC")).toMatchObject({
      tenant_name: "Acme LLC",
      match_status: "needs_review",
      actual_charged: "25",
    });
    expect(byLease.get("unmatched-name::Acme Inc")).toMatchObject({
      tenant_name: "Acme Inc",
      match_status: "needs_review",
      actual_charged: "30",
    });
  });

  it("uses explicit charge lease_id before falling back to tenant names", async () => {
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from properties")) {
        return [{ id: PROPERTY_ID }];
      }
      if (sql.includes("from reconciliation_snapshots")) {
        return [
          {
            leaseId: LEASE_A,
            totalRecovery: "100.00",
            poolBreakdowns: null,
          },
          {
            leaseId: LEASE_B,
            totalRecovery: "50.00",
            poolBreakdowns: null,
          },
        ];
      }
      if (sql.includes("from leases")) {
        return [
          { id: LEASE_A, tenantName: "Same Tenant" },
          { id: LEASE_B, tenantName: "Same Tenant" },
        ];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    const result = await repository.compareExplicit({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: "0.01",
      includeDrafts: false,
      charges: [
        { lease_id: LEASE_A, amount: "110.00" },
        {
          lease_id: LEASE_B,
          tenant_name: "Same Tenant",
          amount: "45.00",
        },
      ],
    });

    expect(result.tenants).toEqual([
      expect.objectContaining({
        lease_id: LEASE_A,
        tenant_name: "Same Tenant",
        match_status: "matched",
        match_note: null,
        capveri_correct: "100",
        actual_charged: "110",
      }),
      expect.objectContaining({
        lease_id: LEASE_B,
        tenant_name: "Same Tenant",
        match_status: "matched",
        match_note: null,
        capveri_correct: "50",
        actual_charged: "45",
      }),
    ]);
    expect(result.total_capveri_correct).toBe("150");
    expect(result.total_actual_charged).toBe("155");
  });

  it("marks explicit lease_id outside the property for review", async () => {
    const foreignLeaseId = "88888888-8888-4888-8888-888888888888";
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from properties")) {
        return [{ id: PROPERTY_ID }];
      }
      if (sql.includes("from reconciliation_snapshots")) {
        return [
          {
            leaseId: LEASE_A,
            totalRecovery: "100.00",
            poolBreakdowns: null,
          },
        ];
      }
      if (sql.includes("from leases")) {
        return [{ id: LEASE_A, tenantName: "Acme Retail" }];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    const result = await repository.compareExplicit({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: "0.01",
      includeDrafts: false,
      charges: [
        {
          lease_id: foreignLeaseId,
          tenant_name: "Foreign Tenant",
          amount: "25.00",
        },
      ],
    });

    expect(
      result.tenants.find((tenant) =>
        tenant.lease_id.startsWith("unmatched-lease::"),
      ),
    ).toEqual(
      expect.objectContaining({
        tenant_name: "Foreign Tenant",
        match_status: "needs_review",
        match_note: "No lease matched this billed row.",
        capveri_correct: "0",
        actual_charged: "25",
      }),
    );
  });

  it("keeps match-review reasons independent of amount sign", async () => {
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from properties")) {
        return [{ id: PROPERTY_ID }];
      }
      if (sql.includes("from reconciliation_snapshots")) {
        return [
          {
            leaseId: LEASE_A,
            totalRecovery: "0.00",
            poolBreakdowns: null,
          },
          {
            leaseId: LEASE_B,
            totalRecovery: "0.00",
            poolBreakdowns: null,
          },
        ];
      }
      if (sql.includes("from leases")) {
        return [
          { id: LEASE_A, tenantName: "Zero Tenant" },
          { id: LEASE_B, tenantName: "Zero Tenant" },
        ];
      }
      if (sql.includes("from actual_billed_amounts")) {
        return [
          {
            id: "billed-zero-ambiguous",
            leaseId: null,
            tenantName: "Zero Tenant",
            billedAmount: "0.00",
            poolId: null,
          },
          {
            id: "billed-credit-unmatched",
            leaseId: null,
            tenantName: "Credit Tenant",
            billedAmount: "-25.00",
            poolId: null,
          },
        ];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    const result = await repository.compareActualBilled({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: "0.01",
      includeDrafts: false,
    });

    expect(result.tenants).toEqual([
      expect.objectContaining({
        lease_id: "unmatched-name::Credit Tenant",
        tenant_name: "Credit Tenant",
        match_status: "needs_review",
        match_note: "No lease matched this billed row.",
        actual_charged: "-25",
      }),
      expect.objectContaining({
        lease_id: "ambiguous-name::Zero Tenant",
        tenant_name: "Zero Tenant",
        match_status: "needs_review",
        match_note: "More than one lease matched this tenant name.",
        capveri_correct: "0",
        actual_charged: "0",
      }),
    ]);
  });

  it("combines linked and legacy unlinked rows for a single tenant lease", async () => {
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from properties")) {
        return [{ id: PROPERTY_ID }];
      }
      if (sql.includes("from reconciliation_snapshots")) {
        return [
          {
            leaseId: LEASE_A,
            totalRecovery: "100.00",
            poolBreakdowns: null,
          },
        ];
      }
      if (sql.includes("from leases")) {
        return [{ id: LEASE_A, tenantName: "Solo Tenant" }];
      }
      if (sql.includes("from actual_billed_amounts")) {
        return [
          {
            id: "billed-linked",
            leaseId: LEASE_A,
            tenantName: "Solo Tenant",
            billedAmount: "60.00",
            poolId: null,
          },
          {
            id: "billed-legacy",
            leaseId: null,
            tenantName: "Solo Tenant",
            billedAmount: "40.00",
            poolId: null,
          },
        ];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    const result = await repository.compareActualBilled({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: "0.01",
      includeDrafts: false,
    });

    expect(result.tenants).toEqual([
      expect.objectContaining({
        lease_id: LEASE_A,
        tenant_name: "Solo Tenant",
        capveri_correct: "100",
        actual_charged: "100",
        direction: "match",
      }),
    ]);
    expect(result.total_net_variance).toBe("0");
    expect(result.match_count).toBe(1);
  });

  it("returns an empty comparison for properties outside the organization", async () => {
    const executor = new ScriptedExecutor(() => []);
    const repository = new PostgresComparisonRepository(executor);

    const result = await repository.compareExplicit({
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: "0.01",
      includeDrafts: false,
      charges: [{ tenant_name: "Acme Retail", amount: "100.00" }],
    });

    expect(result.tenants).toEqual([]);
    expect(result.total_capveri_correct).toBe("0");
    expect(result.total_actual_charged).toBe("0");
  });

  it("persists a comparison run and findings transactionally", async () => {
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from properties")) {
        return [{ id: PROPERTY_ID }];
      }
      if (sql.includes("from reconciliation_snapshots")) {
        return [
          {
            leaseId: LEASE_A,
            totalRecovery: "100.00",
            poolBreakdowns: [{ pool_name: "CAM", total_recovery: "100.00" }],
          },
        ];
      }
      if (sql.includes("from leases")) {
        return [{ id: LEASE_A, tenantName: "Acme Retail" }];
      }
      if (sql.includes("from expense_pools")) {
        return [{ id: "88888888-8888-4888-8888-888888888888", name: "CAM" }];
      }
      if (sql.includes("insert into comparison_runs")) {
        return [{ id: RUN_ID }];
      }
      if (sql.includes("from comparison_runs")) {
        return [runRow()];
      }
      if (sql.includes("from comparison_findings")) {
        return [
          {
            leaseId: LEASE_A,
            tenantName: "Acme Retail",
            capveriCorrect: "100.00",
            actualCharged: "125.00",
            variance: "25.00",
            absVariance: "25.00",
            direction: "overcharge",
            variancePct: "25.00",
            poolBreakdowns: JSON.stringify([
              {
                pool_id: "88888888-8888-4888-8888-888888888888",
                pool_name: "CAM",
                capveri_correct: "100",
                actual_charged: "125",
                variance: "25",
                direction: "overcharge",
                abs_variance: "25",
                variance_pct: "25.00",
              },
            ]),
          },
        ];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    const run = await repository.createRun({
      organizationId: ORG_ID,
      userId: USER_ID,
      propertyId: PROPERTY_ID,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      tolerance: "0.01",
      includeDrafts: false,
      charges: [
        {
          tenant_name: "Acme Retail",
          pool_id: "88888888-8888-4888-8888-888888888888",
          amount: "125.00",
        },
      ],
    });

    expect(run).toMatchObject({
      id: RUN_ID,
      source: "explicit",
      total_capveri_correct: "100",
      total_actual_charged: "125",
      findings: [
        expect.objectContaining({
          lease_id: LEASE_A,
          pool_breakdowns: [
            expect.objectContaining({
              pool_id: "88888888-8888-4888-8888-888888888888",
              pool_name: "CAM",
              variance: "25",
            }),
          ],
        }),
      ],
    });
    expect(
      executor.statements.some((statement) =>
        statement.sql.includes("insert into comparison_runs"),
      ),
    ).toBe(true);
    expect(
      executor.statements.some((statement) =>
        statement.sql.includes("insert into comparison_findings"),
      ),
    ).toBe(true);
    const findingInsert = executor.statements.find((statement) =>
      statement.sql.includes("insert into comparison_findings"),
    );
    expect(findingInsert?.sql).toContain("$11::jsonb");
    expect(typeof findingInsert?.params[10]).toBe("string");
    expect(String(findingInsert?.params[10])).toContain(
      "88888888-8888-4888-8888-888888888888",
    );
  });

  it("lists and fetches stored runs with organization scope", async () => {
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from comparison_runs")) {
        return [runRow()];
      }
      if (sql.includes("from comparison_findings")) {
        return [];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    await expect(
      repository.listRuns({
        organizationId: ORG_ID,
        propertyId: PROPERTY_ID,
        limit: 25,
        offset: 5,
      }),
    ).resolves.toHaveLength(1);
    await expect(
      repository.getRun({ organizationId: ORG_ID, runId: RUN_ID }),
    ).resolves.toMatchObject({ id: RUN_ID, findings: [] });
    expect(executor.statements[0]?.params).toEqual([
      ORG_ID,
      PROPERTY_ID,
      25,
      5,
    ]);
    expect(executor.statements[0]?.sql).toContain(
      'period_start_date::text as "periodStart"',
    );
    expect(executor.statements[0]?.sql).toContain(
      'period_end_date::text as "periodEnd"',
    );
    expect(executor.statements[1]?.params).toEqual([ORG_ID, RUN_ID]);
  });

  it("recomputes stored variance percent with the current sign contract", async () => {
    const executor = new ScriptedExecutor((sql) => {
      if (sql.includes("from comparison_runs")) {
        return [runRow()];
      }
      if (sql.includes("from comparison_findings")) {
        return [
          {
            leaseId: LEASE_A,
            tenantName: "Credit Tenant",
            capveriCorrect: "-100.00",
            actualCharged: "0.00",
            variance: "100.00",
            absVariance: "100.00",
            direction: "overcharge",
            variancePct: "-100.00",
            poolBreakdowns: null,
          },
          {
            leaseId: LEASE_B,
            tenantName: "Zero Baseline",
            capveriCorrect: "0.00",
            actualCharged: "25.00",
            variance: "25.00",
            absVariance: "25.00",
            direction: "overcharge",
            variancePct: "999.00",
            poolBreakdowns: null,
          },
        ];
      }

      return [];
    });
    const repository = new PostgresComparisonRepository(executor);

    const run = await repository.getRun({
      organizationId: ORG_ID,
      runId: RUN_ID,
    });

    expect(run?.findings).toEqual([
      expect.objectContaining({
        tenant_name: "Credit Tenant",
        match_status: "matched",
        match_note: null,
        variance_pct: "100.00",
      }),
      expect.objectContaining({
        tenant_name: "Zero Baseline",
        variance_pct: null,
      }),
    ]);
  });
});

function runRow() {
  return {
    id: RUN_ID,
    propertyId: PROPERTY_ID,
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    tolerance: "0.01",
    source: "explicit",
    totalCapveriCorrect: "100.00",
    totalActualCharged: "125.00",
    totalNetVariance: "25.00",
    totalOvercharge: "25.00",
    totalUndercharge: "0.00",
    overchargeCount: 1,
    underchargeCount: 0,
    matchCount: 0,
    createdBy: USER_ID,
    createdAt: "2026-06-13T00:00:00.000Z",
  };
}
