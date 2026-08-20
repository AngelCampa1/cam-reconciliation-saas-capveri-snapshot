import { describe, expect, it } from "vitest";

import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationJobRecord,
  type CalculationLeaseRecord,
  type SnapshotDraft,
} from "../domain/reconciliation/calculator";

/**
 * Regression coverage for the non_cumulative cap-rate validation (Cycle 11).
 *
 * The cumulative / cumulative_compounding cap branch already rejects an
 * out-of-range cap_rate (via cumulative-cap.ts:validateRate), and the Python
 * oracle (backend/app/services/calculation/caps.py.calculate_non_cumulative_cap)
 * RAISES on a negative rate or a rate > 1.0. The Worker's non_cumulative branch
 * was the lone cap path that silently skipped this check, so a "5" (meaning 500%,
 * a decimal/percent typo) would never bind and would over-bill, while a negative
 * rate would cap BELOW the baseline and under-bill.
 *
 * Parity ordering matters: the oracle validates cap_rate ONLY AFTER its Year-1
 * (missing prior) and FIX CAP-4 (zero prior) guards. So a missing/zero base must
 * still return the amount UNCAPPED without throwing, even with a bad rate.
 */

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const LEASE_ID = "44444444-4444-4444-8444-444444444444";
const POOL_ID = "55555555-5555-4555-8555-555555555555";
const ENTRY_ID = "66666666-6666-4666-8666-666666666666";
const PERIOD_START = "2024-01-01";
const PERIOD_END = "2024-12-31";

function onlySnapshot(snapshots: SnapshotDraft[]): SnapshotDraft {
  const snapshot = snapshots[0];
  if (!snapshot || snapshots.length !== 1) {
    throw new Error(`expected exactly one snapshot, got ${snapshots.length}`);
  }
  return snapshot;
}

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

/**
 * before-cap == grossed-up GL == 120000 (pro_rata 1.0, no admin fee, no base
 * year). `capRate` and `priorYearAmount` are the knobs each test varies.
 */
function nonCumulativeDataset(overrides: {
  capRate: string;
  priorYearAmount: string;
}): CalculationDataset {
  const leaseRecord: CalculationLeaseRecord = {
    id: LEASE_ID,
    tenantName: "Acme",
    startDate: PERIOD_START,
    endDate: null,
    tenantSqft: "1000",
    recoveryProfile: {
      pro_rata_share: "1.0",
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
    versionCapType: "non_cumulative",
    versionCapRate: overrides.capRate,
    versionExcludedPools: null,
  };

  return {
    job: job(),
    property: {
      id: PROPERTY_ID,
      totalRentableSqft: "10000",
      targetOccupancy: null,
    },
    leases: [leaseRecord],
    glEntries: [
      {
        id: ENTRY_ID,
        accountCode: "6100",
        amount: "120000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ],
    expensePools: [
      {
        id: POOL_ID,
        name: "CAM",
        poolType: "operating",
        isGrossUpApplicable: false,
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
    capHistories: [
      {
        leaseId: LEASE_ID,
        priorYearAmount: overrides.priorYearAmount,
        capBaseYearAmount: null,
        priorAmounts: [],
      },
    ],
  };
}

describe("non_cumulative cap-rate validation (Cycle 11)", () => {
  it("a valid in-range rate (0.05) caps to prior * (1 + rate) = 105000.00", async () => {
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        nonCumulativeDataset({ capRate: "0.05", priorYearAmount: "100000" }),
      ),
    );
    expect(snapshot.tenant_share_before_cap).toBe("120000.00");
    expect(snapshot.tenant_share_after_cap).toBe("105000.00");
  });

  it("a rate > 1.0 (a '5' = 500% decimal/percent typo) RAISES, never over-bills", async () => {
    await expect(
      calculateReconciliationSnapshots(
        nonCumulativeDataset({ capRate: "5", priorYearAmount: "100000" }),
      ),
    ).rejects.toThrow(/exceeds maximum/);
  });

  it("a negative rate RAISES, never under-bills below the baseline", async () => {
    await expect(
      calculateReconciliationSnapshots(
        nonCumulativeDataset({ capRate: "-0.05", priorYearAmount: "100000" }),
      ),
    ).rejects.toThrow(/non-negative/);
  });

  it("the exact boundary rate 1.0 (100%) is ALLOWED and caps to prior * 2 = 200000.00", async () => {
    // The oracle rejects only cap_rate > 1.0, so exactly 1.0 must NOT throw.
    // before-cap 120000 < prior 100000 * (1 + 1.0) = 200000, so the cap is
    // satisfied (does not bind) and the full 120000 flows through.
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        nonCumulativeDataset({ capRate: "1.0", priorYearAmount: "100000" }),
      ),
    );
    expect(snapshot.tenant_share_after_cap).toBe("120000.00");
  });

  it("a missing/zero base returns UNCAPPED even with a bad rate (guard precedes validation)", async () => {
    // Mirrors caps.py: the FIX CAP-4 zero-prior guard returns the amount
    // uncapped BEFORE cap_rate is ever inspected, so a bad rate must NOT throw
    // here — the cap simply does not bind.
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        nonCumulativeDataset({ capRate: "5", priorYearAmount: "0" }),
      ),
    );
    expect(snapshot.tenant_share_after_cap).toBe("120000.00");
  });
});
