import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationExpensePoolRecord,
  type CalculationGlEntryRecord,
  type CalculationLeaseRecord,
  type CalculationPoolMappingRecord,
  type SnapshotDraft,
  type TenantCapHistoryRecord,
} from "../domain/reconciliation/calculator";

// Regression coverage for `allocatePoolBreakdowns`, the layer-faithful (Option B)
// port of `pool_allocation.allocate_pool_recoveries`. Guards CYCLE4-ALLOC
// Finding #1 (a per-pool recovery could go NEGATIVE under the old "last pool
// absorbs the remainder" split) and pins the three oracle layers:
//   Layer 1 — pre-cap share split proportional to recoverable amount.
//   Layer 2 — cap reduction attributed to CONTROLLABLE pools only (tax/insurance/
//             capital keep their full pre-cap share).
//   Layer 3 — admin fee split proportional to post-cap share.

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
    capHistories: opts.capHistories ?? [],
  };
}

function cents(s: string): bigint {
  const [w, c] = s.split(".");
  const neg = w!.startsWith("-");
  return (
    BigInt(w!) * 100n +
    (neg ? -1n : 1n) * BigInt((c ?? "0").padEnd(2, "0").slice(0, 2))
  );
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

// Build N equal-amount operating pools, each booked `amountEach`, account codes
// a, b, c, ... so each pool maps to exactly one GL entry.
function equalOperatingPools(
  n: number,
  amountEach: string,
): {
  pools: CalculationExpensePoolRecord[];
  mappings: CalculationPoolMappingRecord[];
  entries: CalculationGlEntryRecord[];
} {
  const pools: CalculationExpensePoolRecord[] = [];
  const mappings: CalculationPoolMappingRecord[] = [];
  const entries: CalculationGlEntryRecord[] = [];
  for (let i = 0; i < n; i++) {
    const code = String.fromCharCode(97 + i);
    pools.push({
      id: `p${i}`,
      name: `Pool ${i}`,
      poolType: "operating",
      isGrossUpApplicable: false,
      grossUpTarget: null,
    });
    mappings.push({
      expensePoolId: `p${i}`,
      glAccountPattern: `${code}*`,
      allocationPercentage: "1",
      priority: 10,
    });
    entries.push({
      id: `e${i}`,
      accountCode: code,
      amount: amountEach,
      transactionDate: "2024-06-30",
      accrualDate: null,
    });
  }
  return { pools, mappings, entries };
}

describe("allocatePoolBreakdowns — non-negativity (CYCLE4-ALLOC Finding #1)", () => {
  it("8 equal pools sharing 5 cents never produce a negative per-pool recovery", async () => {
    // total pool = $40,000; pro_rata 0.00000125 -> $0.05 total recovery over 8
    // equal pools. Oracle largest-remainder: floor(0.625c)=0 each, 5 leftover
    // cents to the 5 lowest indices -> [1,1,1,1,1,0,0,0]. The old last-pool
    // split produced [1,1,1,1,1,1,1,-2].
    const { pools, mappings, entries } = equalOperatingPools(8, "5000.00");
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({
          lease: lease({
            pro_rata_share: "0.00000125",
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
    expect(snap.total_recovery).toBe("0.05");
    const parts = (snap.pool_breakdowns ?? []).map(
      (e) => (e as { recovery: string }).recovery,
    );
    expect(parts).toEqual([
      "0.01",
      "0.01",
      "0.01",
      "0.01",
      "0.01",
      "0.00",
      "0.00",
      "0.00",
    ]);
    expect(parts.every((p) => !p.startsWith("-"))).toBe(true);
  });

  it("sweep of small totals over many equal pools stays non-negative and penny-exact", async () => {
    for (let n = 3; n <= 24; n++) {
      const { pools, mappings, entries } = equalOperatingPools(n, "5000.00");
      const snap = only(
        await calculateReconciliationSnapshots(
          dataset({
            lease: lease({
              pro_rata_share: "0.00000125",
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
      const total = cents(snap.total_recovery);
      const parts = (snap.pool_breakdowns ?? []).map((e) =>
        cents((e as { recovery: string }).recovery),
      );
      const sum = parts.reduce((a, b) => a + b, 0n);
      expect(sum, `sum invariant n=${n}`).toBe(total);
      expect(
        parts.every((p) => p >= 0n),
        `non-negative n=${n} parts=[${parts}]`,
      ).toBe(true);
    }
  });
});

describe("allocatePoolBreakdowns — layer faithfulness", () => {
  it("Layer 2: a cap reduction is attributed to controllable pools only (tax pool keeps full share)", async () => {
    // Operating $1000 (cap-eligible) + Taxes $1000 (cap-exempt). pro_rata 1 ->
    // share_before $2000 split [1000, 1000]. non_cumulative cap on prior $1000 at
    // 5% => cap $1050; reduction $950 must come entirely from the Operating pool:
    //   Operating: 1000 - 950 = $50 ; Taxes: full $1000. Sum = $1050 = after-cap.
    const pools: CalculationExpensePoolRecord[] = [
      {
        id: "op",
        name: "Operating",
        poolType: "operating",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
      {
        id: "tax",
        name: "Taxes",
        poolType: "tax",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
    ];
    const mappings: CalculationPoolMappingRecord[] = [
      {
        expensePoolId: "op",
        glAccountPattern: "a*",
        allocationPercentage: "1",
        priority: 10,
      },
      {
        expensePoolId: "tax",
        glAccountPattern: "b*",
        allocationPercentage: "1",
        priority: 10,
      },
    ];
    const entries: CalculationGlEntryRecord[] = [
      {
        id: "e1",
        accountCode: "a",
        amount: "1000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
      {
        id: "e2",
        accountCode: "b",
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
            cap_type: "non_cumulative",
            cap_rate: "0.05",
            excluded_pools: [],
          }),
          pools,
          mappings,
          entries,
          capHistories: [
            {
              leaseId: LEASE_ID,
              priorYearAmount: "1000.00",
              capBaseYearAmount: null,
              priorAmounts: [],
            },
          ],
        }),
      ),
    );
    expect(snap.total_recovery).toBe("1050.00");
    const byPool = recoveryByPool(snap);
    expect(byPool.get("Operating")).toBe("50.00");
    expect(byPool.get("Taxes")).toBe("1000.00");
  });

  it("Layer 2 spill: when controllable pools cannot absorb the cap cut, the remainder spills onto cap-exempt pools", async () => {
    // Operating $100 (controllable) + Taxes $1000 (cap-exempt). pro_rata 1 ->
    // share_before $1100 split [100, 1000]. non_cumulative cap on prior $200 at
    // 5% => cap $210; reduction $890 exceeds the $100 controllable capacity, so
    // Operating is zeroed and the $790 spill lands on the cap-exempt Taxes pool:
    //   Operating: 100 - 100 = $0 ; Taxes: 1000 - 790 = $210. Sum = $210.
    // Guards the spill branch (the no-part-driven-negative invariant must still
    // hold: Taxes stays positive at $210, not negative).
    const pools: CalculationExpensePoolRecord[] = [
      {
        id: "op",
        name: "Operating",
        poolType: "operating",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
      {
        id: "tax",
        name: "Taxes",
        poolType: "tax",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
    ];
    const mappings: CalculationPoolMappingRecord[] = [
      {
        expensePoolId: "op",
        glAccountPattern: "a*",
        allocationPercentage: "1",
        priority: 10,
      },
      {
        expensePoolId: "tax",
        glAccountPattern: "b*",
        allocationPercentage: "1",
        priority: 10,
      },
    ];
    const entries: CalculationGlEntryRecord[] = [
      {
        id: "e1",
        accountCode: "a",
        amount: "100.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
      {
        id: "e2",
        accountCode: "b",
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
            cap_type: "non_cumulative",
            cap_rate: "0.05",
            excluded_pools: [],
          }),
          pools,
          mappings,
          entries,
          capHistories: [
            {
              leaseId: LEASE_ID,
              priorYearAmount: "200.00",
              capBaseYearAmount: null,
              priorAmounts: [],
            },
          ],
        }),
      ),
    );
    expect(snap.total_recovery).toBe("210.00");
    const byPool = recoveryByPool(snap);
    expect(byPool.get("Operating")).toBe("0.00");
    expect(byPool.get("Taxes")).toBe("210.00");
  });

  it("Layer 3: the admin fee is split proportional to post-cap share", async () => {
    // Two operating pools $3000 / $1000, pro_rata 1, admin 10%, no cap.
    // share_after = [3000, 1000]; admin = 10% * 4000 = 400 split [300, 100].
    // recovery = [3300, 1100].
    const pools: CalculationExpensePoolRecord[] = [
      {
        id: "big",
        name: "Big",
        poolType: "operating",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
      {
        id: "small",
        name: "Small",
        poolType: "operating",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
    ];
    const mappings: CalculationPoolMappingRecord[] = [
      {
        expensePoolId: "big",
        glAccountPattern: "a*",
        allocationPercentage: "1",
        priority: 10,
      },
      {
        expensePoolId: "small",
        glAccountPattern: "b*",
        allocationPercentage: "1",
        priority: 10,
      },
    ];
    const entries: CalculationGlEntryRecord[] = [
      {
        id: "e1",
        accountCode: "a",
        amount: "3000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
      {
        id: "e2",
        accountCode: "b",
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
            admin_fee_percentage: "0.10",
            cap_type: "none",
            excluded_pools: [],
          }),
          pools,
          mappings,
          entries,
        }),
      ),
    );
    expect(snap.total_recovery).toBe("4400.00");
    const byPool = recoveryByPool(snap);
    expect(byPool.get("Big")).toBe("3300.00");
    expect(byPool.get("Small")).toBe("1100.00");
  });
});
