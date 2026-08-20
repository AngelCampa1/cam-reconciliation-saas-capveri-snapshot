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

/**
 * Cycle 12 — surface GL entries that matched NO pool mapping.
 *
 * A fully-unmatched GL entry lands in no expense pool, so its dollars silently
 * vanish from `total_operating_expenses` — under-stating the recoverable base
 * with no warning (a real-dollar error in the landlord's disfavor). The Python
 * oracle (pool_aggregator.aggregate_by_pools) already records these in its trace;
 * the Worker did not. This adds an advisory "Unmatched GL entries" step to the
 * snapshot's calculation_trace (which is persisted JSONB and returned over HTTP).
 * Money math is unchanged — observability only.
 *
 * A PARTIAL allocation (mappings summing < 100%, e.g. a 60% CAM / 40%
 * unrecoverable split) is a legitimate configuration, so it is NOT flagged —
 * only entries that match ZERO pools are, matching the oracle exactly.
 */

const PERIOD_START = "2024-01-01";
const PERIOD_END = "2024-12-31";
const LEASE_ID = "44444444-4444-4444-8444-444444444444";
const POOL_ID = "55555555-5555-4555-8555-555555555555";

function lease(): CalculationLeaseRecord {
  return {
    id: LEASE_ID,
    tenantName: "Acme",
    startDate: PERIOD_START,
    endDate: null,
    tenantSqft: "1000",
    recoveryProfile: {
      pro_rata_share: "1",
      admin_fee_percentage: "0",
      cap_type: "none",
      excluded_pools: [],
    } as never,
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

function operatingPool(): CalculationExpensePoolRecord {
  return {
    id: POOL_ID,
    name: "CAM",
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

function dataset(opts: {
  mappings: CalculationPoolMappingRecord[];
  entries: CalculationGlEntryRecord[];
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
    leases: [lease()],
    glEntries: opts.entries,
    expensePools: [operatingPool()],
    poolMappings: opts.mappings,
    capHistories: [],
  };
}

const broadMapping: CalculationPoolMappingRecord = {
  expensePoolId: POOL_ID,
  glAccountPattern: "6*",
  allocationPercentage: "1",
  priority: 10,
};

function only(snaps: SnapshotDraft[]): SnapshotDraft {
  if (snaps.length !== 1) throw new Error(`expected 1, got ${snaps.length}`);
  return snaps[0]!;
}

type TraceStep = {
  name?: string;
  output?: string;
  note?: string;
  inputs?: { count?: number };
};

function unmatchedStep(snap: SnapshotDraft): TraceStep | undefined {
  return (snap.calculation_trace as TraceStep[]).find(
    (step) => step?.name === "Unmatched GL entries",
  );
}

describe("calculation_trace — unmatched GL entries (Cycle 12)", () => {
  it("flags a single fully-unmatched entry with its full amount, and excludes it from operating expenses", async () => {
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({
          mappings: [broadMapping],
          entries: [
            entry("e1", "6100", "10000.00"), // matches "6*"
            entry("e2", "9999", "2500.00"), // matches nothing
          ],
        }),
      ),
    );

    // Money math unchanged: only the matched 10000 reaches operating expenses;
    // the unmatched 2500 is excluded (the silent leak this trace makes visible).
    expect(snap.total_operating_expenses).toBe("10000.00");

    const step = unmatchedStep(snap);
    expect(step).toBeDefined();
    expect(step?.inputs?.count).toBe(1);
    expect(step?.output).toBe("2500.00");
    expect(step?.note).toMatch(/pool mappings/);
  });

  it("sums multiple fully-unmatched entries and counts them", async () => {
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({
          mappings: [broadMapping],
          entries: [
            entry("e1", "6100", "10000.00"), // matched
            entry("e2", "9001", "1500.00"), // unmatched
            entry("e3", "8000", "3000.50"), // unmatched
          ],
        }),
      ),
    );
    const step = unmatchedStep(snap);
    expect(step?.inputs?.count).toBe(2);
    expect(step?.output).toBe("4500.50");
  });

  it("emits NO unmatched step when every entry matches a pool", async () => {
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({
          mappings: [broadMapping],
          entries: [
            entry("e1", "6100", "10000.00"),
            entry("e2", "6200", "5000.00"),
          ],
        }),
      ),
    );
    expect(snap.total_operating_expenses).toBe("15000.00");
    expect(unmatchedStep(snap)).toBeUndefined();
  });

  it("does NOT flag a legitimate partial allocation (60% mapped, 40% intentionally unrecoverable)", async () => {
    const partial: CalculationPoolMappingRecord = {
      expensePoolId: POOL_ID,
      glAccountPattern: "6*",
      allocationPercentage: "0.6",
      priority: 10,
    };
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({
          mappings: [partial],
          entries: [entry("e1", "6100", "10000.00")],
        }),
      ),
    );
    // 60% of 10000 lands in the pool; the 40% remainder is intentional, not a
    // missing mapping — so it must NOT raise the unmatched advisory.
    expect(snap.total_operating_expenses).toBe("6000.00");
    expect(unmatchedStep(snap)).toBeUndefined();
  });

  it("flags a NEGATIVE unmatched entry (a credit/reversal matching no pool) as a signed exclusion", async () => {
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({
          mappings: [broadMapping],
          entries: [
            entry("e1", "6100", "10000.00"), // matched
            entry("e2", "9999", "-500.00"), // unmatched credit
          ],
        }),
      ),
    );
    const step = unmatchedStep(snap);
    expect(step?.inputs?.count).toBe(1);
    expect(step?.output).toBe("-500.00");
  });

  it("ignores a $0.00 unmatched line (not a money leak)", async () => {
    const snap = only(
      await calculateReconciliationSnapshots(
        dataset({
          mappings: [broadMapping],
          entries: [
            entry("e1", "6100", "10000.00"), // matched
            entry("e2", "9999", "0.00"), // unmatched but zero
          ],
        }),
      ),
    );
    expect(unmatchedStep(snap)).toBeUndefined();
  });
});
