import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationJobRecord,
  type CalculationLeaseRecord,
  type SnapshotDraft,
} from "../domain/reconciliation/calculator";

// Regression guard for the gross-up TARGET-occupancy selection bug (Cycle 9).
//
// Target occupancy for gross-up is a PROPERTY/LEASE-level parameter (cam-expert-
// auditor Rule 5; "95% is most common", chosen once for the building). The schema
// models it as properties.target_occupancy (NOT NULL DEFAULT 0.9500). The Worker
// must honor that configured value. (The Python oracle has its own separate bug
// here — it reads a nonexistent properties.gross_up_target and always falls back to
// 0.95 — so this is a divergence toward correctness, not oracle parity. The pool-
// level gross_up_target column is vestigial.)
//
// The pre-fix engine instead took the gross_up_target of the alphabetically-first
// pool carrying one (loadCalculationExpensePools orders `by name`) and applied THAT
// single value to EVERY pool, OVERRIDING property.target_occupancy. So a landlord
// who set property.target_occupancy = 0.90 had it silently ignored whenever any pool
// carried a divergent target (e.g. an auto-stamped 0.95), inflating recoveries.
//
// Building: 10,000 SF, a single 5,000 SF full-period lease -> 50% occupancy.
//   property.target_occupancy = 0.90  -> correct factor 0.90 / 0.50 = 1.8000
//   pool.gross_up_target       = 0.95 -> WRONG  factor 0.95 / 0.50 = 1.9000
//   $100,000 operating pool:  correct -> $180,000.00 ; pre-fix -> $190,000.00.
// The property-level target must win.

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const LEASE_ID = "44444444-4444-4444-8444-444444444444";
const POOL_A_ID = "55555555-5555-4555-8555-555555555555";
const POOL_B_ID = "66666666-6666-4666-8666-666666666666";

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

// A single $100,000 grossable OPERATING pool that carries its OWN gross_up_target,
// against a property whose target_occupancy is `propertyTarget`. The pool target is
// a decoy: the engine must use the property target.
function divergentTargetDataset(
  propertyTarget: string,
  poolTarget: string | null,
): CalculationDataset {
  return {
    job: job(),
    property: {
      id: PROPERTY_ID,
      totalRentableSqft: "10000",
      targetOccupancy: propertyTarget,
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
        id: POOL_A_ID,
        name: "CAM",
        poolType: "operating",
        isGrossUpApplicable: true,
        grossUpTarget: poolTarget,
      },
    ],
    poolMappings: [
      {
        expensePoolId: POOL_A_ID,
        glAccountPattern: "6*",
        allocationPercentage: "1",
        priority: 10,
      },
    ],
    capHistories: [],
  };
}

// Two grossable operating pools whose per-pool gross_up_targets DISAGREE with each
// other and with the property target. Proves the result is (a) property-driven and
// (b) order-independent: it must not depend on which pool sorts first by name.
function twoDivergentPoolsDataset(): CalculationDataset {
  return {
    job: job(),
    property: {
      id: PROPERTY_ID,
      totalRentableSqft: "10000",
      targetOccupancy: "0.90",
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
        accountCode: "6200",
        amount: "100000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ],
    expensePools: [
      {
        // Sorts first by name ("Alpha"): pre-fix its 0.99 would govern everything.
        id: POOL_A_ID,
        name: "Alpha CAM",
        poolType: "operating",
        isGrossUpApplicable: true,
        grossUpTarget: "0.99",
      },
      {
        id: POOL_B_ID,
        name: "Bravo CAM",
        poolType: "operating",
        isGrossUpApplicable: true,
        grossUpTarget: "0.80",
      },
    ],
    poolMappings: [
      {
        expensePoolId: POOL_A_ID,
        glAccountPattern: "61*",
        allocationPercentage: "1",
        priority: 10,
      },
      {
        expensePoolId: POOL_B_ID,
        glAccountPattern: "62*",
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

describe("gross-up uses the property-level target, never a pool's gross_up_target", () => {
  it("honors property.target_occupancy (0.90) over a divergent pool target (0.95)", async () => {
    // Correct: factor 0.90 / 0.50 = 1.8000 -> $100,000 grosses to $180,000.00.
    // Pre-fix (pool 0.95): factor 1.9000 -> $190,000.00 (the over-recovery bug).
    expect(
      await grossedUpExpenses(divergentTargetDataset("0.90", "0.95")),
    ).toBe("180000.00");
  });

  it("matches the oracle when a pool target is set but property target is default 0.95", async () => {
    // No regression for the common case: property 0.95, factor 0.95 / 0.50 = 1.9000
    // -> $190,000.00, the same answer the oracle produces. The pool's 0.80 is ignored.
    expect(
      await grossedUpExpenses(divergentTargetDataset("0.95", "0.80")),
    ).toBe("190000.00");
  });

  it("is order-independent across pools carrying conflicting targets", async () => {
    // Property target 0.90 governs BOTH pools. factor 0.90 / 0.50 = 1.8000.
    // Each $100,000 pool grosses to $180,000 -> aggregate $360,000.00.
    // Pre-fix: the name-first pool's 0.99 (factor 1.98) would govern both
    // -> 2 x $198,000 = $396,000.00.
    expect(await grossedUpExpenses(twoDivergentPoolsDataset())).toBe(
      "360000.00",
    );
  });
});
