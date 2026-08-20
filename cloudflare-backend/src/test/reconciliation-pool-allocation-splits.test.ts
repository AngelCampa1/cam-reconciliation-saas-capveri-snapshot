import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationExpensePoolRecord,
  type CalculationGlEntryRecord,
  type CalculationLeaseRecord,
  type CalculationPoolAllocationRecord,
  type CalculationPoolMappingRecord,
  type SnapshotDraft,
  type TenantCapHistoryRecord,
} from "../domain/reconciliation/calculator";

// Cycle 22 — persisted source->target pool splits (pool_allocations).
//
// The production Worker reconciliation engine previously loaded pool_mappings
// but NEVER loaded or applied pool_allocations, so a GL entry's dollars stayed
// entirely in the SOURCE pool. The Python oracle (the source of truth) routes
// `allocation_value`% of the source pool's matched dollars to each TARGET pool,
// keeping the remainder in the source, via aggregate_with_splits. The Worker's
// own write path validates these rows as "supported for reconciliation" and the
// oracle honors them, so ignoring them mis-buckets recoverable cost across the
// exclusion / management-cap / admin-fee boundaries the splits exist to redraw.
//
// These tests pin the ported behavior. They are RED on the pre-fix engine
// (which leaves every dollar in the source pool) and GREEN after.

const PERIOD_START = "2024-01-01";
const PERIOD_END = "2024-12-31";
const LEASE_ID = "44444444-4444-4444-8444-444444444444";

function lease(profile: Record<string, unknown>): CalculationLeaseRecord {
  return {
    id: LEASE_ID,
    tenantName: "Acme",
    startDate: PERIOD_START,
    endDate: null,
    tenantSqft: "1000",
    recoveryProfile: profile as never,
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

function dataset(opts: {
  lease: CalculationLeaseRecord;
  pools: CalculationExpensePoolRecord[];
  mappings: CalculationPoolMappingRecord[];
  entries: CalculationGlEntryRecord[];
  allocations?: CalculationPoolAllocationRecord[];
  capHistories?: TenantCapHistoryRecord[];
}): CalculationDataset {
  return {
    job: {
      id: "22222222-2222-4222-8222-222222222222",
      organizationId: "11111111-1111-4111-8111-111111111111",
      propertyId: "33333333-3333-4333-8333-333333333333",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      status: "pending",
      forceRecalculate: false,
    },
    property: {
      id: "33333333-3333-4333-8333-333333333333",
      totalRentableSqft: "1000",
      targetOccupancy: "0.95",
    },
    leases: [opts.lease],
    glEntries: opts.entries,
    expensePools: opts.pools,
    poolMappings: opts.mappings,
    ...(opts.allocations ? { poolAllocations: opts.allocations } : {}),
    capHistories: opts.capHistories ?? [],
  };
}

function only(snaps: SnapshotDraft[]): SnapshotDraft {
  if (snaps.length !== 1) throw new Error(`expected 1, got ${snaps.length}`);
  return snaps[0]!;
}

function recoveryByPool(snap: SnapshotDraft): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of snap.pool_breakdowns ?? []) {
    const e = raw as { pool_name: string; recovery: string };
    out.set(e.pool_name, e.recovery);
  }
  return out;
}

function operatingPool(id: string, name: string): CalculationExpensePoolRecord {
  return {
    id,
    name,
    poolType: "operating",
    isGrossUpApplicable: false,
    grossUpTarget: null,
  };
}

describe("aggregatePools — persisted source->target splits (Cycle 22)", () => {
  it("routes a partial split to the target and keeps the remainder in the source", async () => {
    // GL 6100 $1000 -> mapping "6100" 100% -> CAM-Shared (source). A persisted
    // 40% split routes $400 to Parking; the $600 remainder stays in CAM-Shared.
    // pro_rata 1, no admin/cap, so each pool's recovery == its booked amount.
    // Pre-fix engine ignored the split: CAM-Shared $1000, Parking $0.
    const pools = [
      operatingPool("cam", "CAM-Shared"),
      operatingPool("park", "Parking"),
    ];
    const mappings: CalculationPoolMappingRecord[] = [
      {
        expensePoolId: "cam",
        glAccountPattern: "6100",
        allocationPercentage: "1",
        priority: 10,
      },
    ];
    const entries: CalculationGlEntryRecord[] = [
      {
        id: "e1",
        accountCode: "6100",
        amount: "1000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ];
    const allocations: CalculationPoolAllocationRecord[] = [
      { sourcePoolId: "cam", targetPoolId: "park", allocationValue: "40" },
    ];
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({
          lease: lease({
            pro_rata_share: "1",
            admin_fee_percentage: "0",
            cap_type: "none",
            excluded_pools: [],
          }),
          pools,
          mappings,
          entries,
          allocations,
        }),
      ),
    );
    expect(snap.total_recovery).toBe("1000.00");
    const byPool = recoveryByPool(snap);
    expect(byPool.get("CAM-Shared")).toBe("600.00");
    expect(byPool.get("Parking")).toBe("400.00");
  });

  it("splits across two targets summing to 100% with no source remainder, penny-exact", async () => {
    // $1000.01 split 50/50 to two targets, source keeps nothing. The last target
    // booking is pinned so the two parts re-sum to the slice exactly:
    //   target A = round(1000.01 * 0.5) = 500.01 (0.005 rounds up)
    //   target B = slice - A = 1000.01 - 500.01 = 500.00
    // Source CAM-Shared = $0.00. Sum = $1000.01.
    const pools = [
      operatingPool("cam", "CAM-Shared"),
      operatingPool("a", "Target A"),
      operatingPool("b", "Target B"),
    ];
    const mappings: CalculationPoolMappingRecord[] = [
      {
        expensePoolId: "cam",
        glAccountPattern: "6100",
        allocationPercentage: "1",
        priority: 10,
      },
    ];
    const entries: CalculationGlEntryRecord[] = [
      {
        id: "e1",
        accountCode: "6100",
        amount: "1000.01",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ];
    const allocations: CalculationPoolAllocationRecord[] = [
      { sourcePoolId: "cam", targetPoolId: "a", allocationValue: "50" },
      { sourcePoolId: "cam", targetPoolId: "b", allocationValue: "50" },
    ];
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({
          lease: lease({
            pro_rata_share: "1",
            admin_fee_percentage: "0",
            cap_type: "none",
            excluded_pools: [],
          }),
          pools,
          mappings,
          entries,
          allocations,
        }),
      ),
    );
    expect(snap.total_recovery).toBe("1000.01");
    const byPool = recoveryByPool(snap);
    // A pool that nets to $0.00 is dropped from the breakdown; the source is one.
    expect(byPool.get("Target A")).toBe("500.01");
    expect(byPool.get("Target B")).toBe("500.00");
    expect(byPool.get("CAM-Shared") ?? "0.00").toBe("0.00");
  });

  it("routing a split into an EXCLUDED pool removes those dollars from recovery (real money, not relabeling)", async () => {
    // The reason the bug matters: Operating $1000 fully recoverable. A 40% split
    // to a CAPITAL pool that the lease excludes turns $400 non-recoverable.
    //   Pre-fix: all $1000 stays in Operating -> recovery $1000.00.
    //   Post-fix: $400 lands in the excluded Capital pool -> recovery $600.00.
    const pools: CalculationExpensePoolRecord[] = [
      operatingPool("op", "Operating"),
      {
        id: "cap",
        name: "Capital",
        poolType: "capital",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
    ];
    const mappings: CalculationPoolMappingRecord[] = [
      {
        expensePoolId: "op",
        glAccountPattern: "6100",
        allocationPercentage: "1",
        priority: 10,
      },
    ];
    const entries: CalculationGlEntryRecord[] = [
      {
        id: "e1",
        accountCode: "6100",
        amount: "1000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ];
    const allocations: CalculationPoolAllocationRecord[] = [
      { sourcePoolId: "op", targetPoolId: "cap", allocationValue: "40" },
    ];
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({
          lease: lease({
            pro_rata_share: "1",
            admin_fee_percentage: "0",
            cap_type: "none",
            // Pool TYPE list (excluded_pools are pool types, not ids/names).
            excluded_pools: ["capital"],
          }),
          pools,
          mappings,
          entries,
          allocations,
        }),
      ),
    );
    expect(snap.total_recovery).toBe("600.00");
  });

  it("handles a source pool that is also one of its own targets", async () => {
    // Edge case: a split routes part of CAM-Shared back into CAM-Shared plus part
    // to Parking. cam->cam 40% + cam->park 40% (Σpct = 80% < 100%). The source
    // keeps the 20% remainder AND receives its own 40% target booking:
    //   Parking      = round(1000 * 0.40) = 400.00
    //   CAM (target) = round(1000 * 0.40) = 400.00
    //   CAM (remainder) = 1000 - 800       = 200.00  -> CAM total 600.00
    // Sum = 1000.00, penny-conserved. Mirrors the oracle, where default_pool_id
    // equals the source and a target may be the source pool itself.
    const pools = [
      operatingPool("cam", "CAM-Shared"),
      operatingPool("park", "Parking"),
    ];
    const mappings: CalculationPoolMappingRecord[] = [
      {
        expensePoolId: "cam",
        glAccountPattern: "6100",
        allocationPercentage: "1",
        priority: 10,
      },
    ];
    const entries: CalculationGlEntryRecord[] = [
      {
        id: "e1",
        accountCode: "6100",
        amount: "1000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ];
    const allocations: CalculationPoolAllocationRecord[] = [
      { sourcePoolId: "cam", targetPoolId: "cam", allocationValue: "40" },
      { sourcePoolId: "cam", targetPoolId: "park", allocationValue: "40" },
    ];
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({
          lease: lease({
            pro_rata_share: "1",
            admin_fee_percentage: "0",
            cap_type: "none",
            excluded_pools: [],
          }),
          pools,
          mappings,
          entries,
          allocations,
        }),
      ),
    );
    expect(snap.total_recovery).toBe("1000.00");
    const byPool = recoveryByPool(snap);
    expect(byPool.get("CAM-Shared")).toBe("600.00");
    expect(byPool.get("Parking")).toBe("400.00");
  });

  it("leaves a property with NO pool_allocations byte-identical (source keeps everything)", async () => {
    // Control: same shape as the first test but with no allocations -> the split
    // path never activates and the source pool keeps the full $1000.
    const pools = [
      operatingPool("cam", "CAM-Shared"),
      operatingPool("park", "Parking"),
    ];
    const mappings: CalculationPoolMappingRecord[] = [
      {
        expensePoolId: "cam",
        glAccountPattern: "6100",
        allocationPercentage: "1",
        priority: 10,
      },
    ];
    const entries: CalculationGlEntryRecord[] = [
      {
        id: "e1",
        accountCode: "6100",
        amount: "1000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ];
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({
          lease: lease({
            pro_rata_share: "1",
            admin_fee_percentage: "0",
            cap_type: "none",
            excluded_pools: [],
          }),
          pools,
          mappings,
          entries,
        }),
      ),
    );
    expect(snap.total_recovery).toBe("1000.00");
    const byPool = recoveryByPool(snap);
    expect(byPool.get("CAM-Shared")).toBe("1000.00");
    expect(byPool.get("Parking") ?? "0.00").toBe("0.00");
  });
});
