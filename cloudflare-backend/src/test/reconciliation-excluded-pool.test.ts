import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationLeaseRecord,
  type SnapshotDraft,
} from "../domain/reconciliation/calculator";

// Pins the lease `excluded_pools` semantics: the list holds pool TYPE strings
// (the PoolType enum: operating | tax | insurance | capital | other) that the
// extraction and the frontend recovery-profile schema both emit/validate. An
// exclusion must therefore be matched against each pool's `poolType`, NOT its
// display `name`.
//
// The pre-fix engine matched `excluded.has(pool.name.toLowerCase())`, so an
// exclusion whose type word differs from the pool's display name was silently
// dropped — excluding "tax" never matched a "Real Estate Taxes" pool, "capital"
// never matched "Capital Improvements" — and the tenant was over-billed the
// full excluded pool x pro-rata. Only "insurance" worked, by coincidence of the
// default name equaling its type. These cases drive that exact gap.

function onlySnapshot(snapshots: SnapshotDraft[]): SnapshotDraft {
  const snapshot = snapshots[0];
  if (!snapshot || snapshots.length !== 1) {
    throw new Error(`expected exactly one snapshot, got ${snapshots.length}`);
  }
  return snapshot;
}

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const LEASE_ID = "44444444-4444-4444-8444-444444444444";
const OPERATING_POOL_ID = "55555555-5555-4555-8555-555555555555";
const FIXED_POOL_ID = "66666666-6666-4666-8666-666666666666";

const PERIOD_START = "2024-01-01";
const PERIOD_END = "2024-12-31";

function lease(
  overrides: Partial<CalculationLeaseRecord>,
): CalculationLeaseRecord {
  return {
    id: LEASE_ID,
    tenantName: "Acme",
    startDate: PERIOD_START,
    endDate: null,
    // 8000 of 10000 rentable -> occupancy 0.8; the property target_occupancy is
    // set to 0.80 (see excludedPoolDataset) so the gross-up factor is exactly 1.0
    // and the grossable pool grosses to itself, isolating the exclusion behavior
    // from gross-up arithmetic.
    tenantSqft: "8000",
    recoveryProfile: {
      pro_rata_share: "0.10",
      admin_fee_percentage: "0",
      cap_type: "none",
      excluded_pools: [],
    },
    termVersionId: null,
    versionProRataShare: null,
    versionAdminFeePercentage: null,
    versionManagementFeePercentage: null,
    versionBaseYear: null,
    versionBaseYearAmount: null,
    versionCapType: null,
    versionCapRate: null,
    versionExcludedPools: null,
    ...overrides,
  };
}

// One grossable OPERATING pool ($100,000, acct 6100) and one FIXED pool
// ($40,000, acct 9100) whose TYPE/NAME the test parametrizes. The fixed pool is
// not gross-up-applicable, so it always contributes its booked $40,000.
function excludedPoolDataset(opts: {
  excludedPools: string[];
  fixedPoolName: string;
  fixedPoolType: string;
}): CalculationDataset {
  return {
    job: {
      id: JOB_ID,
      organizationId: ORG_ID,
      propertyId: PROPERTY_ID,
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      status: "pending",
      forceRecalculate: false,
    },
    property: {
      id: PROPERTY_ID,
      totalRentableSqft: "10000",
      // Target == actual occupancy (0.80) -> gross-up factor 1.0, so the
      // grossable operating pool grosses to itself and the exclusion behavior
      // is isolated from gross-up arithmetic.
      targetOccupancy: "0.80",
    },
    leases: [
      lease({
        recoveryProfile: {
          pro_rata_share: "0.10",
          admin_fee_percentage: "0",
          cap_type: "none",
          excluded_pools: opts.excludedPools,
        },
      }),
    ],
    glEntries: [
      {
        id: "aaaa1111-1111-4111-8111-111111111111",
        accountCode: "6100",
        amount: "100000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
      {
        id: "bbbb2222-2222-4222-8222-222222222222",
        accountCode: "9100",
        amount: "40000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ],
    expensePools: [
      {
        id: OPERATING_POOL_ID,
        name: "CAM Operating",
        poolType: "operating",
        isGrossUpApplicable: true,
        grossUpTarget: null,
      },
      {
        id: FIXED_POOL_ID,
        name: opts.fixedPoolName,
        poolType: opts.fixedPoolType,
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
    ],
    poolMappings: [
      {
        expensePoolId: OPERATING_POOL_ID,
        glAccountPattern: "6100",
        allocationPercentage: "1",
        priority: 20,
      },
      {
        expensePoolId: FIXED_POOL_ID,
        glAccountPattern: "9100",
        allocationPercentage: "1",
        priority: 10,
      },
    ],
    capHistories: [],
  };
}

async function run(opts: {
  excludedPools: string[];
  fixedPoolName: string;
  fixedPoolType: string;
}): Promise<SnapshotDraft> {
  return onlySnapshot(
    await calculateReconciliationSnapshots(excludedPoolDataset(opts)),
  );
}

describe("excluded_pools matches on pool TYPE, not display name", () => {
  it("excludes a 'tax'-type pool named 'Real Estate Taxes' (was silently dropped)", async () => {
    // Aggregate grossed-up = operating 100,000 (factor 1.0) + fixed tax 40,000 =
    // 140,000. Excluding the tax pool removes 40,000 -> net 100,000;
    // tenant share = 100,000 * 0.10 = $10,000.00. The pre-fix name match
    // ("real estate taxes" != "tax") left it in and billed $14,000.00.
    const snapshot = await run({
      excludedPools: ["tax"],
      fixedPoolName: "Real Estate Taxes",
      fixedPoolType: "tax",
    });
    expect(snapshot.tenant_share_before_cap).toBe("10000.00");
    expect(snapshot.total_recovery).toBe("10000.00");
    // The excluded pool must not appear in the per-pool breakdown.
    const names = (snapshot.pool_breakdowns ?? []).map(
      (b) => (b as { pool_name: string }).pool_name,
    );
    expect(names).not.toContain("Real Estate Taxes");
    expect(names).toContain("CAM Operating");
  });

  it("excludes a 'capital'-type pool named 'Capital Improvements'", async () => {
    const snapshot = await run({
      excludedPools: ["capital"],
      fixedPoolName: "Capital Improvements",
      fixedPoolType: "capital",
    });
    expect(snapshot.tenant_share_before_cap).toBe("10000.00");
  });

  it("still excludes an 'insurance'-type pool named 'Insurance' (backward-compat)", async () => {
    // This case already worked under name-matching (name == type); the fix must
    // not regress it.
    const snapshot = await run({
      excludedPools: ["insurance"],
      fixedPoolName: "Insurance",
      fixedPoolType: "insurance",
    });
    expect(snapshot.tenant_share_before_cap).toBe("10000.00");
  });

  it("includes the fixed pool when nothing is excluded (positive control)", async () => {
    // No exclusion -> full 140,000 base; tenant share = 140,000 * 0.10 =
    // $14,000.00, and both pools appear in the breakdown.
    const snapshot = await run({
      excludedPools: [],
      fixedPoolName: "Real Estate Taxes",
      fixedPoolType: "tax",
    });
    expect(snapshot.tenant_share_before_cap).toBe("14000.00");
    const names = (snapshot.pool_breakdowns ?? []).map(
      (b) => (b as { pool_name: string }).pool_name,
    );
    expect(names).toContain("Real Estate Taxes");
    expect(names).toContain("CAM Operating");
  });
});
