import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationLeaseRecord,
  type JsonObject,
  type SnapshotDraft,
} from "../domain/reconciliation/calculator";

// Pins the admin-fee inclusion ratio to the POST-management-cap pool breakdown,
// matching the Python oracle. When a lease's management_fee_percentage cap binds
// (booked fee > rate * operating_base), the oracle reduces the management-fee
// pool to the cap in BOTH the working breakdown AND the original_pool_breakdown
// that feeds the admin-fee exclusion ratio (tenant_share.py:362-367, "so
// exclusion and admin-fee ratios use the recoverable amount"); the ratio
// denominator then sums that post-cap breakdown (tenant_share.py:456-458, 645).
//
// The pre-fix TypeScript engine passed the PRE-cap `grossedUpPools` as the ratio
// basis, so the non-recoverable management-fee excess inflated the denominator
// and understated the excluded share — overcharging the tenant on the admin fee
// whenever a management-fee cap and an admin-fee exclusion coincide. The fix
// passes the post-cap `leasePools`. When no cap binds the two sets are identical,
// so the common (uncapped) case is unchanged — only the cap-binding path moves.

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
const MGMT_POOL_ID = "66666666-6666-4666-8666-666666666666";
const INSURANCE_POOL_ID = "77777777-7777-4777-8777-777777777777";

const PERIOD_START = "2024-01-01";
const PERIOD_END = "2024-12-31";

type CapOpts = {
  // omit to leave the management fee uncapped (no `management_fee_percentage`)
  managementFeePercentage?: string;
  adminFeePercentage: string;
  adminFeeExcludedPools: string[];
};

function lease(opts: CapOpts): CalculationLeaseRecord {
  const profile: JsonObject = {
    pro_rata_share: "0.10",
    admin_fee_percentage: opts.adminFeePercentage,
    admin_fee_excluded_pools: opts.adminFeeExcludedPools,
    cap_type: "none",
    excluded_pools: [],
  };
  if (opts.managementFeePercentage !== undefined) {
    profile.management_fee_percentage = opts.managementFeePercentage;
  }
  return {
    id: LEASE_ID,
    tenantName: "Acme",
    startDate: PERIOD_START,
    endDate: null,
    // 8000 of 10000 rentable -> occupancy 0.8; target_occupancy 0.80 makes the
    // gross-up factor exactly 1.0, isolating the admin/management-cap arithmetic
    // from gross-up.
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

// CAM Operating $100,000 (operating, grossable), Management Fee booked $20,000
// (operating, name carries the "management fee" marker), Insurance $40,000
// (fixed). pro-rata 0.10. With management_fee_percentage 0.10 the cap is
// 0.10 * 100,000 = $10,000 < booked $20,000, so the fee pool is reduced to
// $10,000 and the $10,000 excess is removed from recovery.
function dataset(opts: CapOpts): CalculationDataset {
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
        accountCode: "6200",
        amount: "20000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
      {
        id: "cccc3333-3333-4333-8333-333333333333",
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
        id: MGMT_POOL_ID,
        name: "Management Fee",
        poolType: "operating",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
      {
        id: INSURANCE_POOL_ID,
        name: "Insurance",
        poolType: "insurance",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
    ],
    poolMappings: [
      {
        expensePoolId: OPERATING_POOL_ID,
        glAccountPattern: "6100",
        allocationPercentage: "1",
        priority: 30,
      },
      {
        expensePoolId: MGMT_POOL_ID,
        glAccountPattern: "6200",
        allocationPercentage: "1",
        priority: 20,
      },
      {
        expensePoolId: INSURANCE_POOL_ID,
        glAccountPattern: "9100",
        allocationPercentage: "1",
        priority: 10,
      },
    ],
    capHistories: [],
  };
}

async function run(opts: CapOpts): Promise<SnapshotDraft> {
  return onlySnapshot(await calculateReconciliationSnapshots(dataset(opts)));
}

describe("admin-fee inclusion ratio uses the post-management-cap breakdown (oracle parity)", () => {
  it("excludes the non-recoverable management-fee excess from the ratio denominator when the cap binds", async () => {
    // Post-cap pools: CAM Operating 100,000 + Management Fee 10,000 (reduced from
    // 20,000) + Insurance 40,000 = 150,000. tenant_share_after_cap =
    // 150,000 * 0.10 = $15,000.00 (the $10,000 fee excess is already removed).
    //
    // Admin fee excludes Insurance (40,000). Inclusion ratio over the POST-cap
    // breakdown = included(110,000) / total(150,000); admin_base =
    // round(15,000 * 110,000/150,000) = $11,000.00; fee = 11,000 * 0.05 = $550.00.
    //
    // The pre-fix engine used the PRE-cap breakdown (Management Fee 20,000, total
    // 160,000): ratio 120,000/160,000 = 0.75, admin_base 11,250.00, fee $562.50 —
    // a $12.50 overcharge that scales with the capped excess. This case proves the
    // post-cap basis is now in force.
    const snapshot = await run({
      managementFeePercentage: "0.10",
      adminFeePercentage: "0.05",
      adminFeeExcludedPools: ["Insurance"],
    });
    expect(snapshot.tenant_share_after_cap).toBe("15000.00");
    expect(snapshot.admin_fee).toBe("550.00");
    expect(snapshot.total_recovery).toBe("15550.00");
  });

  it("is unchanged when no management-fee cap binds (pre-cap == post-cap)", async () => {
    // No management_fee_percentage -> the fee pool is not reduced; pre-cap and
    // post-cap breakdowns are identical, so the ratio basis change is a no-op.
    // Pools: 100,000 + 20,000 + 40,000 = 160,000; tenant_share_after_cap =
    // 16,000.00. Exclude Insurance -> ratio 120,000/160,000 = 0.75; admin_base
    // round(16,000 * 0.75) = 12,000.00; fee = 12,000 * 0.05 = $600.00.
    const snapshot = await run({
      adminFeePercentage: "0.05",
      adminFeeExcludedPools: ["Insurance"],
    });
    expect(snapshot.tenant_share_after_cap).toBe("16000.00");
    expect(snapshot.admin_fee).toBe("600.00");
    expect(snapshot.total_recovery).toBe("16600.00");
  });
});
