import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationJobRecord,
  type CalculationLeaseRecord,
  type SnapshotDraft,
} from "../domain/reconciliation/calculator";

// Regression coverage for the occupancy gross-up safety valve, ported from the
// Python oracle (backend/app/services/calculation/gross_up.py
// apply_safety_valve, invoked with apply_safety=True). A grossed-up pool must
// never exceed its 100%-occupancy equivalent (original / actualOccupancy), and a
// near-vacant building must not gross up at all. Also pins the by-design parity
// the engine shares with the oracle for inverted leases, missing base years, and
// zero rentable sqft.

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

function lease(
  overrides: Partial<CalculationLeaseRecord>,
): CalculationLeaseRecord {
  return {
    id: LEASE_ID,
    tenantName: "Acme",
    startDate: PERIOD_START,
    endDate: null,
    tenantSqft: "1000",
    recoveryProfile: {
      pro_rata_share: "0.10",
      admin_fee_percentage: "0.05",
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

function dataset(
  leaseRecord: CalculationLeaseRecord,
  opts: {
    targetOccupancy?: string | null;
    grossUpTarget?: string | null;
    isGrossUpApplicable?: boolean;
    totalRentableSqft?: string;
  } = {},
): CalculationDataset {
  return {
    job: job(),
    property: {
      id: PROPERTY_ID,
      totalRentableSqft: opts.totalRentableSqft ?? "10000",
      targetOccupancy: opts.targetOccupancy ?? "0.95",
    },
    leases: [leaseRecord],
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
        name: "CAM",
        poolType: "operating",
        isGrossUpApplicable: opts.isGrossUpApplicable ?? true,
        grossUpTarget: opts.grossUpTarget ?? null,
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

describe("gross-up safety valve", () => {
  it("grosses up normally below target occupancy (no clamp when within bounds)", async () => {
    // tenant 5000 / 10000 -> actual occupancy 0.5, target 0.95.
    // factor = 0.95 / 0.5 = 1.9 -> $100k pool grosses to $190k, which is below
    // the 100%-occupancy cap ($100k / 0.5 = $200k), so it is not clamped.
    const ds = dataset(lease({ tenantSqft: "5000" }), {
      targetOccupancy: "0.95",
    });
    const snapshot = onlySnapshot(await calculateReconciliationSnapshots(ds));
    expect(snapshot.grossed_up_expenses).toBe("190000.00");
  });

  it("clamps a target-occupancy data-entry slip (95 instead of 0.95)", async () => {
    // factor would be 95 / 0.5 = 190 -> $19,000,000 without protection.
    // Target is clamped to 1.0 and the safety valve caps at the 100%-occupancy
    // equivalent $100k / 0.5 = $200,000.
    const ds = dataset(lease({ tenantSqft: "5000" }), {
      targetOccupancy: "95",
    });
    const snapshot = onlySnapshot(await calculateReconciliationSnapshots(ds));
    expect(snapshot.grossed_up_expenses).toBe("200000.00");
  });

  it("quantizes the gross-up factor to 4 dp like the oracle (not 8 dp)", async () => {
    // tenant 3333 / 10000 -> occupancy 0.3333, target 0.95.
    // raw factor 0.95 / 0.3333 = 2.850285028...; the oracle quantizes to 4 dp
    // half-up -> 2.8503, so $100,000 grosses to exactly $285,030.00. An
    // un-quantized 8-dp factor (2.85028503) would yield $285,028.50 -> a $1.50
    // divergence from the Python source of truth. The full-occupancy cap is
    // $100,000 / 0.3333 = ~$300,030, so the valve does not bind here.
    const ds = dataset(lease({ tenantSqft: "3333" }), {
      targetOccupancy: "0.95",
    });
    const snapshot = onlySnapshot(await calculateReconciliationSnapshots(ds));
    expect(snapshot.grossed_up_expenses).toBe("285030.00");
  });

  it("does not gross up a near-vacant building", async () => {
    // tenant 10 / 100000 -> occupancy 0.0001 (== min safe). factor would be
    // 0.95 / 0.0001 = 9500 -> ~$950,000,000 without protection. The valve keeps
    // the original $100,000.
    const ds = dataset(lease({ tenantSqft: "10" }), {
      totalRentableSqft: "100000",
    });
    const snapshot = onlySnapshot(await calculateReconciliationSnapshots(ds));
    expect(snapshot.grossed_up_expenses).toBe("100000.00");
  });
});

describe("gross-up / recovery parity guards (match the Python oracle)", () => {
  it("inverted lease dates yield $0 recovery (oracle skips malformed leases)", async () => {
    const ds = dataset(
      lease({ startDate: "2024-12-31", endDate: "2024-01-01" }),
      {
        isGrossUpApplicable: false,
      },
    );
    const snapshot = onlySnapshot(await calculateReconciliationSnapshots(ds));
    expect(snapshot.lease_terms_snapshot.proration_factor).toBe("0");
    expect(snapshot.total_recovery).toBe("0.00");
  });

  it("missing base-year amount recovers the full share (oracle else-branch)", async () => {
    const ds = dataset(
      lease({
        versionBaseYear: 2023,
        versionBaseYearAmount: null,
        recoveryProfile: {
          pro_rata_share: "0.10",
          admin_fee_percentage: "0",
          cap_type: "none",
          excluded_pools: [],
        },
      }),
      { isGrossUpApplicable: false },
    );
    const snapshot = onlySnapshot(await calculateReconciliationSnapshots(ds));
    expect(snapshot.tenant_share_before_cap).toBe("10000.00");
  });

  it("zero rentable sqft never produces NaN/Infinity money", async () => {
    const ds = dataset(lease({}), {
      totalRentableSqft: "0",
      isGrossUpApplicable: true,
    });
    const snapshot = onlySnapshot(await calculateReconciliationSnapshots(ds));
    expect(snapshot.grossed_up_expenses).not.toMatch(/nan|infinity/i);
    expect(snapshot.total_recovery).toMatch(/^-?\d+\.\d{2}$/);
  });
});
