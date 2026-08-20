import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationLeaseRecord,
  type JsonObject,
  type SnapshotDraft,
} from "../domain/reconciliation/calculator";

// Pins the END-TO-END ordering when gross-up, an ACTIVE (binding) cap, and an
// admin fee all compose on a single tenant's recovery. The component behaviors
// each have isolated tests (reconciliation-grossup*.test.ts, cumulative-cap.test.ts,
// reconciliation-admin-fee-*.test.ts), but none combine a gross-up factor != 1.0
// with a cap that actually binds AND an admin fee. That three-way interaction is
// exactly where an ordering regression would hide, and the admin-fee-on-post-cap
// leg guards a previously-real bug (Cycle 21: admin fee was computed on the
// pre-cap share — a pure overcharge).
//
// The oracle order (tenant_share.py calculate_tenant_share + orchestrator.py):
//   gross-up (building-level) -> pro-rata -> cap -> admin fee on the POST-cap
//   share, added OUTSIDE the cap. total_recovery = share_after_cap + admin_fee.
//
// Every expected value below is derived from the formula, independently of the
// engine output:
//   gross-up factor   = target 0.90 / occupancy 0.80               = 1.125
//   grossed operating = 100,000.00 * 1.125                          = 112,500.00
//   before-cap        = 112,500.00 * pro-rata 0.10                  = 11,250.00
//   non_cumulative cap= prior_year 10,000.00 * (1 + 0.05)           = 10,500.00 (binds)
//   after-cap         = min(11,250.00, 10,500.00)                   = 10,500.00
//   admin fee         = after-cap 10,500.00 * 0.05                  = 525.00
//   total_recovery    = 10,500.00 + 525.00                          = 11,025.00

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
const POOL_ID = "55555555-5555-4555-8555-555555555555";
const ENTRY_ID = "66666666-6666-4666-8666-666666666666";

const PERIOD_START = "2024-01-01";
const PERIOD_END = "2024-12-31";

// One grossable OPERATING pool ($100,000, acct 6100). Gross-up is driven by the
// property target (0.90) against the lone lease's day-weighted occupancy
// (8000/10000 = 0.80). The cap and admin fee come from the lease recovery
// profile.
function dataset(opts: { applyGrossUp: boolean }): CalculationDataset {
  const profile: JsonObject = {
    pro_rata_share: "0.10",
    admin_fee_percentage: "0.05",
    cap_type: "non_cumulative",
    cap_rate: "0.05",
    excluded_pools: [],
  };
  const lease: CalculationLeaseRecord = {
    id: LEASE_ID,
    tenantName: "Acme",
    startDate: PERIOD_START,
    endDate: null,
    // 8000 of 10000 rentable -> day-weighted occupancy 0.80.
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
      // target > occupancy (0.90 > 0.80) -> factor 1.125. When the counterfactual
      // sets target == occupancy (0.80) the factor collapses to 1.0 (no gross-up).
      targetOccupancy: opts.applyGrossUp ? "0.90" : "0.80",
    },
    leases: [lease],
    glEntries: [
      {
        id: ENTRY_ID,
        accountCode: "6100",
        amount: "100000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ],
    expensePools: [
      {
        id: POOL_ID,
        name: "CAM Operating",
        poolType: "operating",
        isGrossUpApplicable: true,
        grossUpTarget: null,
      },
    ],
    poolMappings: [
      {
        expensePoolId: POOL_ID,
        glAccountPattern: "6100",
        allocationPercentage: "1",
        priority: 10,
      },
    ],
    capHistories: [
      {
        leaseId: LEASE_ID,
        priorYearAmount: "10000",
        capBaseYearAmount: null,
        priorAmounts: [],
      },
    ],
  };
}

describe("gross-up + active cap + admin fee compose in oracle order", () => {
  it("gross-up before cap, cap binds, admin fee on the post-cap share (outside cap)", async () => {
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(dataset({ applyGrossUp: true })),
    );
    // Gross-up ran building-level before pro-rata: 100,000 * 1.125 * 0.10.
    expect(snapshot.tenant_share_before_cap).toBe("11250.00");
    // non_cumulative cap 10,000 * 1.05 = 10,500 binds against 11,250.
    expect(snapshot.tenant_share_after_cap).toBe("10500.00");
    // Admin fee uses the POST-cap share (10,500), NOT the pre-cap 11,250
    // (which would be 562.50). This is the Cycle 21 regression guard.
    expect(snapshot.admin_fee).toBe("525.00");
    // Admin fee is added OUTSIDE the cap.
    expect(snapshot.total_recovery).toBe("11025.00");
  });

  it("counterfactual: without gross-up the cap no longer binds (proves gross-up feeds the cap)", async () => {
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(dataset({ applyGrossUp: false })),
    );
    // No gross-up: 100,000 * 0.10 = 10,000 before-cap, which is BELOW the
    // 10,500 ceiling, so the cap is a no-op and the share passes through.
    expect(snapshot.tenant_share_before_cap).toBe("10000.00");
    expect(snapshot.tenant_share_after_cap).toBe("10000.00");
    expect(snapshot.admin_fee).toBe("500.00");
    expect(snapshot.total_recovery).toBe("10500.00");
  });
});
