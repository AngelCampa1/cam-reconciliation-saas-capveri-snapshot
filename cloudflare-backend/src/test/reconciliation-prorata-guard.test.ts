import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationLeaseRecord,
  type JsonObject,
  type SnapshotDraft,
} from "../domain/reconciliation/calculator";

// Pins the pro-rata-share range guard. A single tenant's pro-rata share is a
// fraction of one building, so it must lie within [0, 1]. The Python oracle
// enforces this with a Pydantic Field(ge=0, le=1) on LeaseTerms.pro_rata_share
// (tenant_share.py:61-66, "FIX NEW-FC-5") and aborts the run on a bad value.
//
// The pre-fix Worker had no equivalent guard: an out-of-range explicit share
// (e.g. "1.5"), or a sqft-derived share where tenantSqft > totalRentableSqft
// (a stale/mismeasured building denominator), billed the tenant straight
// through at >100% of recoverable expenses. These cases drive that exact gap.

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const PROPERTY_ID = "33333333-3333-4333-8333-333333333333";
const LEASE_ID = "44444444-4444-4444-8444-444444444444";
const POOL_ID = "55555555-5555-4555-8555-555555555555";

const PERIOD_START = "2024-01-01";
const PERIOD_END = "2024-12-31";

function onlySnapshot(snapshots: SnapshotDraft[]): SnapshotDraft {
  const snapshot = snapshots[0];
  if (!snapshot || snapshots.length !== 1) {
    throw new Error(`expected exactly one snapshot, got ${snapshots.length}`);
  }
  return snapshot;
}

// Single operating pool ($100,000) with gross-up disabled, so the recoverable
// base is exactly $100,000 and the tenant share is base x pro_rata_share. The
// test varies only the pro-rata inputs (explicit value and tenant/building SF).
function dataset(opts: {
  proRataShare?: string | null;
  tenantSqft?: string | null;
  totalRentableSqft?: string;
}): CalculationDataset {
  const profile: JsonObject = {
    admin_fee_percentage: "0",
    cap_type: "none",
    excluded_pools: [],
  };
  if (opts.proRataShare !== undefined && opts.proRataShare !== null) {
    profile.pro_rata_share = opts.proRataShare;
  }

  const lease: CalculationLeaseRecord = {
    id: LEASE_ID,
    tenantName: "Acme",
    startDate: PERIOD_START,
    endDate: null,
    tenantSqft: opts.tenantSqft ?? null,
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
      totalRentableSqft: opts.totalRentableSqft ?? "10000",
      targetOccupancy: "0.95",
    },
    leases: [lease],
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
        name: "CAM Operating",
        poolType: "operating",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
    ],
    poolMappings: [
      {
        expensePoolId: POOL_ID,
        glAccountPattern: "6100",
        allocationPercentage: "1",
        priority: 20,
      },
    ],
    capHistories: [],
  };
}

describe("pro-rata share must stay within [0, 1]", () => {
  it("rejects an explicit pro_rata_share above 1.0", async () => {
    // Pre-fix: 1.5 billed the tenant 150% of the $100,000 pool = $150,000.
    await expect(
      calculateReconciliationSnapshots(dataset({ proRataShare: "1.5" })),
    ).rejects.toThrow(/pro-rata share/i);
  });

  it("rejects a negative explicit pro_rata_share", async () => {
    await expect(
      calculateReconciliationSnapshots(dataset({ proRataShare: "-0.1" })),
    ).rejects.toThrow(/pro-rata share/i);
  });

  it("rejects a sqft-derived share where tenantSqft exceeds building sqft", async () => {
    // 12,000 / 10,000 = 1.20 -> pre-fix billed 120% of the pool = $120,000.
    await expect(
      calculateReconciliationSnapshots(
        dataset({
          proRataShare: null,
          tenantSqft: "12000",
          totalRentableSqft: "10000",
        }),
      ),
    ).rejects.toThrow(/pro-rata share/i);
  });

  it("accepts a share of exactly 1.0 (single-tenant building, boundary)", async () => {
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        dataset({ proRataShare: "1.0" }),
      ),
    );
    expect(snapshot.tenant_share_before_cap).toBe("100000.00");
  });

  it("accepts an explicit share of exactly 0 (lower boundary)", async () => {
    // 0 is in range (the building's vacant/landlord-retained allocation); the
    // tenant simply owes nothing. Must not be rejected by the lower bound.
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(dataset({ proRataShare: "0" })),
    );
    expect(snapshot.tenant_share_before_cap).toBe("0.00");
  });

  it("accepts a normal in-range share (positive control)", async () => {
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        dataset({ proRataShare: "0.10" }),
      ),
    );
    expect(snapshot.tenant_share_before_cap).toBe("10000.00");
  });

  it("accepts a sqft-derived share at exactly 1.0 (tenantSqft == building)", async () => {
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        dataset({
          proRataShare: null,
          tenantSqft: "10000",
          totalRentableSqft: "10000",
        }),
      ),
    );
    expect(snapshot.tenant_share_before_cap).toBe("100000.00");
  });
});
