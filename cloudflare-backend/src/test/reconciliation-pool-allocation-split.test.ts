import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationExpensePoolRecord,
  type CalculationGlEntryRecord,
  type CalculationLeaseRecord,
  type CalculationPoolMappingRecord,
  type SnapshotDraft,
} from "../domain/reconciliation/calculator";

// Cycle 10 — pool-allocation correctness (aggregatePools). Two defects, both
// shared with (and therefore invisible to parity against) the Python oracle
// `pool_aggregator.aggregate_by_pools`, fixed here as divergence-toward-correctness:
//
//   Bug 2 (penny conservation): the oracle multiplies `entry.amount *
//   actual_allocation` in exact Decimal and never rounds at the pool stage, so a
//   fractional split conserves to the penny. The Worker multiplies each slice to
//   integer cents independently (Money.multiplyRate -> roundDivide), so a single
//   GL entry split across 3+ pools can silently LOSE or CREATE a cent. The fix
//   pins the FINAL slice (the one that drives `remaining` to zero) to the exact
//   remainder of the entry, guaranteeing the per-pool slices sum to the entry.
//
//   Bug 1 (deterministic assignment): both engines sort mappings by `priority`
//   only, and both sorts are STABLE, so when two EQUAL-priority patterns both
//   match one account the winner is decided by the (DB-heap-order-dependent)
//   input order — non-deterministic run to run. The fix makes the Worker's
//   in-memory sort a TOTAL order: priority desc, then MORE-SPECIFIC (longer)
//   pattern first, then pattern text, then pool id. A naive lexicographic tie-
//   break would let the BROAD pattern win ("6*" < "61*"), which is backwards;
//   specificity-first matches lease intent (the "61*" mapping was added to peel
//   "61xx" out of the broad "6*" bucket).

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
  pools: CalculationExpensePoolRecord[];
  mappings: CalculationPoolMappingRecord[];
  entries: CalculationGlEntryRecord[];
  profile?: Record<string, unknown>;
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
    leases: [
      lease(
        opts.profile ?? {
          pro_rata_share: "1",
          admin_fee_percentage: "0",
          cap_type: "none",
          excluded_pools: [],
        },
      ),
    ],
    glEntries: opts.entries,
    expensePools: opts.pools,
    poolMappings: opts.mappings,
    capHistories: [],
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

function entry(
  id: string,
  accountCode: string,
  amount: string,
): CalculationGlEntryRecord {
  return {
    id,
    accountCode,
    amount,
    transactionDate: "2024-06-30",
    accrualDate: null,
  };
}

describe("aggregatePools — penny conservation on fractional splits (Bug 2)", () => {
  it("a $1.00 entry split three ways (0.33333333/0.33333333/0.33333334) conserves to the penny", async () => {
    // Pre-fix per-slice rounding: 100c*0.33333333=33c, 33c, 100c*0.33333334=33c
    // -> sum 99c, one cent silently destroyed. The entry is fully allocated
    // (remaining hits 0), so total_operating_expenses must equal the booked
    // $1.00, not $0.99.
    const pools = [
      operatingPool("p-a", "Pool A"),
      operatingPool("p-b", "Pool B"),
      operatingPool("p-c", "Pool C"),
    ];
    const mappings: CalculationPoolMappingRecord[] = [
      {
        expensePoolId: "p-a",
        glAccountPattern: "x*",
        allocationPercentage: "0.33333333",
        priority: 10,
      },
      {
        expensePoolId: "p-b",
        glAccountPattern: "x*",
        allocationPercentage: "0.33333333",
        priority: 10,
      },
      {
        expensePoolId: "p-c",
        glAccountPattern: "x*",
        allocationPercentage: "0.33333334",
        priority: 10,
      },
    ];
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({ pools, mappings, entries: [entry("e1", "x", "1.00")] }),
      ),
    );
    expect(snap.total_operating_expenses).toBe("1.00");
  });

  it("a MISCONFIGURED >100% split on a sub-dollar entry never books a negative pool", async () => {
    // $0.05 over four equal-priority 0.30 mappings (sum 1.20). minRate clamps the
    // last allocation so the slices are [0.30,0.30,0.30,0.10]; per-slice rounding
    // gives 2c,2c,2c and the pinned final remainder would be 5c-6c = -1c. WITHOUT
    // the sign guard, Pool D books -1c; downstream allocatePoolBreakdowns clamps
    // that negative weight to 0, so Pool D is ERASED from the recovery split and
    // its share is silently re-attributed to the other pools (recovery "0.00").
    // WITH the sign guard, the pin is skipped (it would flip the entry's sign), D
    // gets the plain re-rounded +1c slice, and so D still earns a positive
    // recovery. The oracle rejects >100% splits at validation; here we just refuse
    // to manufacture a negative pool and refuse to erase a matched pool.
    const pools = [
      operatingPool("p-a", "Pool A"),
      operatingPool("p-b", "Pool B"),
      operatingPool("p-c", "Pool C"),
      operatingPool("p-d", "Pool D"),
    ];
    const mappings: CalculationPoolMappingRecord[] = ["p-a", "p-b", "p-c", "p-d"].map(
      (id) => ({
        expensePoolId: id,
        glAccountPattern: "x*",
        allocationPercentage: "0.3",
        priority: 10,
      }),
    );
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({ pools, mappings, entries: [entry("e1", "x", "0.05")] }),
      ),
    );
    const byPool = recoveryByPool(snap);
    // No per-pool recovery is negative...
    for (const recovery of byPool.values()) {
      expect(recovery.startsWith("-"), `pool recovery ${recovery} is negative`).toBe(
        false,
      );
    }
    // ...and the would-be-negative pool (D) is not erased: it still earns recovery.
    // Without the sign guard, D books -1c, is weight-clamped to 0, and recovers
    // "0.00" — the observable signature of the regression.
    expect(Number(byPool.get("Pool D") ?? "0")).toBeGreaterThan(0);
  });

  it("a CREDIT (negative) entry split three ways still conserves to the penny", async () => {
    // GL netting can leave an account net-negative (credits exceed debits). A -$1.00
    // credit split 0.33333333/0.33333333/0.33333334 must book -$1.00 across the
    // pools, not -$0.99 (per-slice rounding) and not -$0.66 (a naive `.max(zero)`
    // clamp that would zero the negative final slice). The sign-aware pin keeps the
    // entry's negative sign, so the final slice is the exact negative remainder.
    const pools = [
      operatingPool("p-a", "Pool A"),
      operatingPool("p-b", "Pool B"),
      operatingPool("p-c", "Pool C"),
    ];
    const mappings: CalculationPoolMappingRecord[] = [
      {
        expensePoolId: "p-a",
        glAccountPattern: "x*",
        allocationPercentage: "0.33333333",
        priority: 10,
      },
      {
        expensePoolId: "p-b",
        glAccountPattern: "x*",
        allocationPercentage: "0.33333333",
        priority: 10,
      },
      {
        expensePoolId: "p-c",
        glAccountPattern: "x*",
        allocationPercentage: "0.33333334",
        priority: 10,
      },
    ];
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({ pools, mappings, entries: [entry("e1", "x", "-1.00")] }),
      ),
    );
    expect(snap.total_operating_expenses).toBe("-1.00");
  });

  it("a partially-allocated entry (single 60% mapping) is NOT force-completed", async () => {
    // Only one matching mapping at 60%; remaining never reaches 0, so the entry
    // is intentionally 60% allocated. Conservation must not over-allocate it to
    // 100%. $10.00 * 0.60 = $6.00.
    const pools = [operatingPool("p-a", "Pool A")];
    const mappings: CalculationPoolMappingRecord[] = [
      {
        expensePoolId: "p-a",
        glAccountPattern: "x*",
        allocationPercentage: "0.6",
        priority: 10,
      },
    ];
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({ pools, mappings, entries: [entry("e1", "x", "10.00")] }),
      ),
    );
    expect(snap.total_operating_expenses).toBe("6.00");
  });

  it("a partial split across TWO sub-100% mappings conserves to round(entry * sum-alloc), not the sum of independently-rounded slices", async () => {
    // Cycle 15 regression (Finder C). Two equal-priority mappings match the same
    // account at 0.50 and 0.30 (sum 0.80 -> intentionally 80% recoverable, 20%
    // unrecoverable). `remaining` never reaches 0, so the pre-fix code pinned
    // NOTHING and rounded each slice on its own: round(5c*0.50)=3c +
    // round(5c*0.30)=2c = 5c booked -- the FULL nickel. It manufactured a cent of
    // operating expense the lease never owed: the correct 80% of $0.05 is $0.04.
    // The oracle keeps exact Decimal per pool and rounds once (0.025 + 0.015 =
    // 0.040 -> $0.04). The fix pins the FINAL matched slice to
    // round(entry * sum-alloc), so a partial multi-mapping split conserves to
    // $0.04 exactly (and the per-pool slices sum to that total: 3c + 1c).
    const pools = [operatingPool("p-a", "Pool A"), operatingPool("p-b", "Pool B")];
    const mappings: CalculationPoolMappingRecord[] = [
      {
        expensePoolId: "p-a",
        glAccountPattern: "x*",
        allocationPercentage: "0.5",
        priority: 10,
      },
      {
        expensePoolId: "p-b",
        glAccountPattern: "x*",
        allocationPercentage: "0.3",
        priority: 10,
      },
    ];
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({ pools, mappings, entries: [entry("e1", "x", "0.05")] }),
      ),
    );
    expect(snap.total_operating_expenses).toBe("0.04");
    const byPool = recoveryByPool(snap);
    // Per-pool slices sum to the conserved total (no internal inconsistency).
    expect(byPool.get("Pool A")).toBe("0.03");
    expect(byPool.get("Pool B")).toBe("0.01");
  });

  it("the partial-split drift does NOT accumulate across many small entries", async () => {
    // The per-entry cent the pre-fix code manufactured is same-signed, so it scales
    // linearly: 4 nickels split 0.50/0.30 over-state operating expense by 4c
    // (pre-fix $0.20 vs correct 4 * $0.04 = $0.16). Locks the accumulation Finder C
    // flagged (500 such entries -> $5.00 of phantom expense).
    const pools = [operatingPool("p-a", "Pool A"), operatingPool("p-b", "Pool B")];
    const mappings: CalculationPoolMappingRecord[] = [
      {
        expensePoolId: "p-a",
        glAccountPattern: "x*",
        allocationPercentage: "0.5",
        priority: 10,
      },
      {
        expensePoolId: "p-b",
        glAccountPattern: "x*",
        allocationPercentage: "0.3",
        priority: 10,
      },
    ];
    const entries = [
      entry("e1", "x", "0.05"),
      entry("e2", "x", "0.05"),
      entry("e3", "x", "0.05"),
      entry("e4", "x", "0.05"),
    ];
    const snap = only(
      await calculateReconciliationSnapshots(dataset({ pools, mappings, entries })),
    );
    expect(snap.total_operating_expenses).toBe("0.16");
  });
});

describe("aggregatePools — deterministic, specificity-first matching (Bug 1)", () => {
  async function specificPoolRecovery(
    mappings: CalculationPoolMappingRecord[],
  ): Promise<{ broad: string | undefined; specific: string | undefined }> {
    const pools = [
      operatingPool("p-broad", "Broad"),
      operatingPool("p-specific", "Specific"),
    ];
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({ pools, mappings, entries: [entry("e1", "6100", "1000.00")] }),
      ),
    );
    const byPool = recoveryByPool(snap);
    return { broad: byPool.get("Broad"), specific: byPool.get("Specific") };
  }

  const broadMapping: CalculationPoolMappingRecord = {
    expensePoolId: "p-broad",
    glAccountPattern: "6*",
    allocationPercentage: "1",
    priority: 10,
  };
  const specificMapping: CalculationPoolMappingRecord = {
    expensePoolId: "p-specific",
    glAccountPattern: "61*",
    allocationPercentage: "1",
    priority: 10,
  };

  it("the more specific pattern wins when listed AFTER the broad one", async () => {
    const res = await specificPoolRecovery([broadMapping, specificMapping]);
    expect(res.specific).toBe("1000.00");
    expect(res.broad).toBe("0.00");
  });

  it("the more specific pattern wins when listed BEFORE the broad one (order-independent)", async () => {
    const res = await specificPoolRecovery([specificMapping, broadMapping]);
    expect(res.specific).toBe("1000.00");
    expect(res.broad).toBe("0.00");
  });
});
