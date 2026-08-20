import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationExpensePoolRecord,
  type CalculationJobRecord,
  type CalculationLeaseRecord,
  type SnapshotDraft,
} from "../domain/reconciliation/calculator";

// Regression guard for the LIVE fixed-cost gross-up over-bill.
//
// Gross-up scales a VARIABLE (occupancy-driven) expense to its full-occupancy
// equivalent. It is financially invalid on FIXED costs — property taxes,
// building insurance, and capital — whose dollar amount does not move with
// occupancy (cam-expert-auditor Rule 5). Three real Worker create/template/
// migration paths default `is_gross_up_applicable` to true with NO pool_type
// coupling, so a tax/insurance/capital pool can reach the engine flagged
// grossable. The engine guard (GROSS_UP_EXEMPT_POOL_TYPES) must treat such a
// pool as fixed regardless of the stored flag.
//
// Building: 10,000 SF, a single 5,000 SF full-period lease -> 50% occupancy.
// Target occupancy 0.95 -> bare factor 0.95 / 0.50 = 1.9000.
//   - A grossable OPERATING pool of $100,000 -> grossed to $190,000 (valve at
//     100% occ = 100,000 / 0.50 = $200,000 does not bite).
//   - A tax/insurance pool of $100,000 flagged grossable must stay $100,000.
// WITHOUT the guard a flagged tax/insurance pool would also gross to $190,000.

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const LEASE_ID = "44444444-4444-4444-8444-444444444444";
const POOL_ID = "55555555-5555-4555-8555-555555555555";
const TAX_POOL_ID = "66666666-6666-4666-8666-666666666666";

const PERIOD_START = "2024-01-01";
const PERIOD_END = "2024-12-31";

function job(): CalculationJobRecord {
  return {
    id: JOB_ID,
    organizationId: ORG_ID,
    propertyId: PROPERTY_ID,
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    status: "pending",
    forceRecalculate: false,
  };
}

function lease(): CalculationLeaseRecord {
  return {
    id: LEASE_ID,
    tenantName: "Acme",
    startDate: PERIOD_START,
    endDate: null,
    tenantSqft: "5000",
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
  };
}

// One $100,000 pool of the given type, flagged grossable, mapped to all GL.
function singlePoolDataset(
  poolType: CalculationExpensePoolRecord["poolType"],
): CalculationDataset {
  return {
    job: job(),
    property: {
      id: PROPERTY_ID,
      totalRentableSqft: "10000",
      targetOccupancy: "0.95",
    },
    leases: [lease()],
    glEntries: [
      {
        id: "aaaa1111-1111-4111-8111-111111111111",
        accountCode: "6100",
        amount: "100000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ],
    expensePools: [
      {
        id: POOL_ID,
        name: poolType === "operating" ? "CAM" : "Property Taxes",
        poolType,
        // Deliberately mis-flagged grossable for the fixed-cost types — this is
        // exactly the live mis-flag the engine guard must neutralize.
        isGrossUpApplicable: true,
        grossUpTarget: null,
      },
    ],
    poolMappings: [
      {
        expensePoolId: POOL_ID,
        glAccountPattern: "6*",
        allocationPercentage: "1",
        priority: 10,
      },
    ],
    capHistories: [],
  };
}

// Two $100,000 pools in ONE building, BOTH flagged grossable: a variable
// operating pool (acct 6100) and a fixed tax pool (acct 7100). Exercises both
// branches of aggregateGrossUp's variable/fixed split at once.
function mixedGrossableDataset(): CalculationDataset {
  return {
    job: job(),
    property: {
      id: PROPERTY_ID,
      totalRentableSqft: "10000",
      targetOccupancy: "0.95",
    },
    leases: [lease()],
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
        accountCode: "7100",
        amount: "100000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ],
    expensePools: [
      {
        id: POOL_ID,
        name: "CAM",
        poolType: "operating",
        isGrossUpApplicable: true,
        grossUpTarget: null,
      },
      {
        id: TAX_POOL_ID,
        name: "Property Taxes",
        poolType: "tax",
        // Mis-flagged grossable — the guard must keep this fixed.
        isGrossUpApplicable: true,
        grossUpTarget: null,
      },
    ],
    poolMappings: [
      {
        expensePoolId: POOL_ID,
        glAccountPattern: "61*",
        allocationPercentage: "1",
        priority: 10,
      },
      {
        expensePoolId: TAX_POOL_ID,
        glAccountPattern: "71*",
        allocationPercentage: "1",
        priority: 10,
      },
    ],
    capHistories: [],
  };
}

async function grossedUpExpenses(
  dataset: CalculationDataset,
): Promise<string> {
  const snapshots: SnapshotDraft[] =
    await calculateReconciliationSnapshots(dataset);
  const snapshot = snapshots[0];
  if (!snapshot || snapshots.length !== 1) {
    throw new Error(`expected exactly one snapshot, got ${snapshots.length}`);
  }
  return snapshot.grossed_up_expenses;
}

describe("fixed-cost pools are never grossed up regardless of the flag", () => {
  it("does NOT gross up a tax pool even when is_gross_up_applicable is true", async () => {
    // Tax is a fixed cost: stays at booked $100,000.00, never $190,000.00.
    expect(await grossedUpExpenses(singlePoolDataset("tax"))).toBe(
      "100000.00",
    );
  });

  it("does NOT gross up an insurance pool even when flagged grossable", async () => {
    expect(await grossedUpExpenses(singlePoolDataset("insurance"))).toBe(
      "100000.00",
    );
  });

  it("does NOT gross up a capital pool even when flagged grossable", async () => {
    expect(await grossedUpExpenses(singlePoolDataset("capital"))).toBe(
      "100000.00",
    );
  });

  it("STILL grosses up a variable operating pool in the same under-occupied building", async () => {
    // Control: proves the guard is type-scoped, not a blanket gross-up-off.
    // 0.50 occupancy, factor 1.9 -> $100,000 grosses to $190,000.00.
    expect(await grossedUpExpenses(singlePoolDataset("operating"))).toBe(
      "190000.00",
    );
  });

  it("grosses ONLY the operating pool when an operating and a flagged-tax pool share a building", async () => {
    // Both branches of the variable/fixed split exercised at once:
    //   operating $100,000 -> grossed $190,000 (variable),
    //   tax       $100,000 -> stays  $100,000 (fixed, guard wins over flag).
    // Aggregate grossed_up_expenses = 190,000 + 100,000 = $290,000.00.
    // WITHOUT the guard both gross -> $380,000.00.
    expect(await grossedUpExpenses(mixedGrossableDataset())).toBe(
      "290000.00",
    );
  });
});
