import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationLeaseRecord,
  type JsonObject,
  type SnapshotDraft,
} from "../domain/reconciliation/calculator";

// Pins the admin (administrative) fee constraints that the production engine
// previously discarded. The Python oracle (tenant_share.py:621-689) constrains
// the admin fee three ways, all sourced from the lease recovery profile:
//
//   - admin_fee_cap: a hard dollar ceiling on the computed fee.
//   - admin_fee_excludes_tax_insurance: when set (and no explicit excluded list
//     is given) the default T&I pool NAMES drop out of the fee base.
//   - admin_fee_excluded_pools: explicit pool NAMES dropped from the fee base.
//
// The pre-fix TypeScript engine computed only the bare `share_after_cap * rate`
// and ignored all three — a pure overcharge against the tenant. The base
// reduction is an inclusion RATIO (included_pool / total_pool over the grossed-
// up pool breakdown) applied to the post-cap share, NOT a dollar subtraction;
// the cap is a min() on the resulting fee. Matching is by pool NAME (exact,
// lowercased), mirroring the oracle's dict-key membership test.

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

type AdminOpts = {
  adminFeePercentage: string;
  fixedPoolName: string;
  fixedPoolType: string;
  adminFeeCap?: string;
  adminFeeExcludesTaxInsurance?: boolean;
  adminFeeExcludedPools?: string[];
};

function lease(opts: AdminOpts): CalculationLeaseRecord {
  const profile: JsonObject = {
    pro_rata_share: "0.10",
    admin_fee_percentage: opts.adminFeePercentage,
    cap_type: "none",
    excluded_pools: [],
  };
  if (opts.adminFeeCap !== undefined) {
    profile.admin_fee_cap = opts.adminFeeCap;
  }
  if (opts.adminFeeExcludesTaxInsurance !== undefined) {
    profile.admin_fee_excludes_tax_insurance =
      opts.adminFeeExcludesTaxInsurance;
  }
  if (opts.adminFeeExcludedPools !== undefined) {
    profile.admin_fee_excluded_pools = opts.adminFeeExcludedPools;
  }
  return {
    id: LEASE_ID,
    tenantName: "Acme",
    startDate: PERIOD_START,
    endDate: null,
    // 8000 of 10000 rentable -> occupancy 0.8; target_occupancy 0.80 makes the
    // gross-up factor exactly 1.0 so the grossable pool grosses to itself and the
    // admin-fee behavior is isolated from gross-up arithmetic.
    tenantSqft: "8000",
    recoveryProfile: profile,
    termVersionId: null,
    versionProRataShare: null,
    versionAdminFeePercentage: null,
    versionManagementFeePercentage: null,
    versionBaseYear: null,
    versionBaseYearAmount: null,
    versionCapType: null,
    versionCapRate: null,
    versionExcludedPools: null,
  };
}

// One grossable OPERATING pool ($100,000, acct 6100, "CAM Operating") and one
// FIXED pool ($40,000, acct 9100) whose TYPE/NAME the test parametrizes. With
// pro-rata 0.10 and no cap, tenant_share_after_cap = (100,000 + 40,000) * 0.10 =
// $14,000.00 in every case below; only the admin fee varies.
function adminFeeDataset(opts: AdminOpts): CalculationDataset {
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
      targetOccupancy: "0.80",
    },
    leases: [lease(opts)],
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

async function run(opts: AdminOpts): Promise<SnapshotDraft> {
  return onlySnapshot(
    await calculateReconciliationSnapshots(adminFeeDataset(opts)),
  );
}

function poolRecovery(
  snapshot: SnapshotDraft,
  name: string,
): string | undefined {
  const match = (snapshot.pool_breakdowns ?? []).find(
    (b) => (b as { pool_name: string }).pool_name === name,
  );
  return match ? (match as { recovery: string }).recovery : undefined;
}

describe("admin fee honors exclusion ratio and dollar cap", () => {
  it("no admin constraints: fee is the full share x rate (positive control)", async () => {
    // share_after_cap 14,000 * 0.05 = $700.00; total = 14,700.00.
    const snapshot = await run({
      adminFeePercentage: "0.05",
      fixedPoolName: "Insurance",
      fixedPoolType: "insurance",
    });
    expect(snapshot.tenant_share_after_cap).toBe("14000.00");
    expect(snapshot.admin_fee).toBe("700.00");
    expect(snapshot.total_recovery).toBe("14700.00");
  });

  it("admin_fee_cap binds the fee to its dollar ceiling", async () => {
    // Uncapped fee would be 700.00; the lease caps admin fees at $500.00.
    const snapshot = await run({
      adminFeePercentage: "0.05",
      fixedPoolName: "Insurance",
      fixedPoolType: "insurance",
      adminFeeCap: "500.00",
    });
    expect(snapshot.admin_fee).toBe("500.00");
    expect(snapshot.total_recovery).toBe("14500.00");
  });

  it("admin_fee_cap above the computed fee is a no-op", async () => {
    const snapshot = await run({
      adminFeePercentage: "0.05",
      fixedPoolName: "Insurance",
      fixedPoolType: "insurance",
      adminFeeCap: "1000.00",
    });
    expect(snapshot.admin_fee).toBe("700.00");
  });

  it("admin_fee_excludes_tax_insurance removes a default-named T&I pool from the base", async () => {
    // Inclusion ratio = included(100,000) / total(140,000); admin_base =
    // round(14,000 * 100,000/140,000) = 10,000.00; fee = 10,000 * 0.05 = $500.00.
    const snapshot = await run({
      adminFeePercentage: "0.05",
      fixedPoolName: "Insurance",
      fixedPoolType: "insurance",
      adminFeeExcludesTaxInsurance: true,
    });
    expect(snapshot.admin_fee).toBe("500.00");
    expect(snapshot.total_recovery).toBe("14500.00");
    // Layer 3: the excluded Insurance pool receives NO admin-fee slice; the
    // entire $500 lands on the fee-eligible CAM Operating pool.
    // share_after split 14,000 over [100k, 40k] = 10,000 / 4,000.
    expect(poolRecovery(snapshot, "Insurance")).toBe("4000.00");
    expect(poolRecovery(snapshot, "CAM Operating")).toBe("10500.00");
  });

  it("admin_fee_excludes_tax_insurance is exact-name: a non-default name is NOT excluded", async () => {
    // "Property Taxes" lowercases to "property taxes", which is not in the
    // default T&I set, so the flag is a no-op and the full fee is charged. The
    // explicit admin_fee_excluded_pools list is the reliable path for such a
    // pool (next case). This mirrors the oracle's dict-key membership test.
    const snapshot = await run({
      adminFeePercentage: "0.05",
      fixedPoolName: "Property Taxes",
      fixedPoolType: "tax",
      adminFeeExcludesTaxInsurance: true,
    });
    expect(snapshot.admin_fee).toBe("700.00");
  });

  it("explicit admin_fee_excluded_pools removes a pool from the base by name", async () => {
    // Excluding "Property Taxes" (40,000) by name -> ratio 100,000/140,000;
    // admin_base 10,000.00; fee = $500.00.
    const snapshot = await run({
      adminFeePercentage: "0.05",
      fixedPoolName: "Property Taxes",
      fixedPoolType: "tax",
      adminFeeExcludedPools: ["Property Taxes"],
    });
    expect(snapshot.admin_fee).toBe("500.00");
    expect(poolRecovery(snapshot, "Property Taxes")).toBe("4000.00");
    expect(poolRecovery(snapshot, "CAM Operating")).toBe("10500.00");
  });

  it("explicit excluded list wins over the default T&I flag", async () => {
    // Both set: the explicit ["CAM Operating"] list takes precedence, so the
    // OPERATING pool is excluded from the base instead of the default T&I set.
    // Ratio = included(40,000) / total(140,000); admin_base =
    // round(14,000 * 40,000/140,000) = 4,000.00; fee = 4,000 * 0.05 = $200.00.
    const snapshot = await run({
      adminFeePercentage: "0.05",
      fixedPoolName: "Insurance",
      fixedPoolType: "insurance",
      adminFeeExcludesTaxInsurance: true,
      adminFeeExcludedPools: ["CAM Operating"],
    });
    expect(snapshot.admin_fee).toBe("200.00");
    // The $200 lands entirely on the fee-eligible Insurance pool.
    expect(poolRecovery(snapshot, "CAM Operating")).toBe("10000.00");
    expect(poolRecovery(snapshot, "Insurance")).toBe("4200.00");
  });

  it("exclusion ratio and cap compose (ratio first, then cap)", async () => {
    // Excludes Insurance -> admin_base 10,000.00; fee 10,000 * 0.05 = 500.00,
    // then capped at $400.00.
    const snapshot = await run({
      adminFeePercentage: "0.05",
      fixedPoolName: "Insurance",
      fixedPoolType: "insurance",
      adminFeeExcludesTaxInsurance: true,
      adminFeeCap: "400.00",
    });
    expect(snapshot.admin_fee).toBe("400.00");
    expect(snapshot.total_recovery).toBe("14400.00");
  });
});
