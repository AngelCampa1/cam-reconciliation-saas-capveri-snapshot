import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationJobRecord,
  type CalculationLeaseRecord,
  type SnapshotDraft,
} from "../domain/reconciliation/calculator";

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

// Full leap-year reconciliation period (366 inclusive days). A leap year is
// chosen deliberately so the day-count parity with the Python engine
// (_period_proration_factor uses `(end - start).days + 1`) is exercised.
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
  glTransactionDate: string | Date = "2024-06-30",
): CalculationDataset {
  return {
    job: job(),
    property: {
      id: PROPERTY_ID,
      totalRentableSqft: "10000",
      targetOccupancy: "0.95",
    },
    leases: [leaseRecord],
    glEntries: [
      {
        id: ENTRY_ID,
        accountCode: "6100",
        amount: "100000.00",
        transactionDate: glTransactionDate,
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
    capHistories: [],
  };
}

describe("calculateReconciliationSnapshots — day-based proration parity", () => {
  it("prorates a partial-period lease by inclusive active days (184/366)", async () => {
    // Lease active 2024-07-01..2024-12-31 → 184 inclusive active days over a
    // 366-day period → factor 184/366 = 0.50273224 (8dp, ROUND_HALF_UP), exactly
    // matching the Python engine's _period_proration_factor.
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        dataset(lease({ startDate: "2024-07-01", endDate: "2024-12-31" })),
      ),
    );

    // 100000 * 0.10 = 10000 full-period share; * 0.50273224 = 5027.32.
    expect(snapshot.tenant_share_before_cap).toBe("5027.32");
    expect(snapshot.tenant_share_after_cap).toBe("5027.32");
    // admin fee 0.05 * 5027.32 = 251.37 (ROUND_HALF_UP).
    expect(snapshot.admin_fee).toBe("251.37");
    expect(snapshot.total_recovery).toBe("5278.69");
    expect(snapshot.lease_terms_snapshot.proration_factor).toBe("0.50273224");
  });

  it("does not prorate a full-period lease (open-ended end date, factor 1)", async () => {
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        dataset(lease({ startDate: PERIOD_START, endDate: null })),
      ),
    );

    expect(snapshot.tenant_share_before_cap).toBe("10000.00");
    expect(snapshot.tenant_share_after_cap).toBe("10000.00");
    expect(snapshot.admin_fee).toBe("500.00");
    expect(snapshot.total_recovery).toBe("10500.00");
    expect(snapshot.lease_terms_snapshot.proration_factor).toBe("1");
  });

  it("marks a tenant-sqft pro-rata fallback as an estimated starter term", async () => {
    const ds = dataset(
      lease({
        recoveryProfile: {
          admin_fee_percentage: "0.05",
          cap_type: "none",
          excluded_pools: [],
        },
      }),
    );

    const snapshot = onlySnapshot(await calculateReconciliationSnapshots(ds));

    expect(snapshot.tenant_share_before_cap).toBe("10000.00");
    expect(snapshot.total_recovery).toBe("10500.00");
    expect(snapshot.lease_terms_snapshot.pro_rata_share).toBe("0.1");
    expect(snapshot.lease_terms_snapshot.pro_rata_share_source).toBe(
      "tenant_sqft_estimate",
    );
    expect(snapshot.lease_terms_snapshot.estimated_terms_note).toContain(
      "Add lease terms to firm this up",
    );
    expect(snapshot.calculation_trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Estimated starter terms",
          output: "0.1",
        }),
      ]),
    );
  });

  it("uses explicit lease pro-rata terms before the tenant-sqft fallback", async () => {
    const ds = dataset(
      lease({
        tenantSqft: "1000",
        recoveryProfile: {
          pro_rata_share: "0.20",
          admin_fee_percentage: "0.05",
          cap_type: "none",
          excluded_pools: [],
        },
      }),
    );

    const snapshot = onlySnapshot(await calculateReconciliationSnapshots(ds));

    expect(snapshot.tenant_share_before_cap).toBe("20000.00");
    expect(snapshot.total_recovery).toBe("21000.00");
    expect(snapshot.lease_terms_snapshot.pro_rata_share).toBe("0.2");
    expect(snapshot.lease_terms_snapshot.pro_rata_share_source).toBe(
      "lease_terms",
    );
    expect(snapshot.lease_terms_snapshot.estimated_terms_note).toBeNull();
    expect(snapshot.calculation_trace).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Estimated starter terms" }),
      ]),
    );
  });

  it("does not prorate a lease that spans the whole period (factor 1)", async () => {
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        dataset(lease({ startDate: "2023-01-01", endDate: "2025-12-31" })),
      ),
    );

    expect(snapshot.tenant_share_before_cap).toBe("10000.00");
    expect(snapshot.lease_terms_snapshot.proration_factor).toBe("1");
  });

  it("handles Date-object lease dates (un-cast postgres date decode)", async () => {
    // The postgres driver decodes bare `date` columns to JS Date objects. Even
    // though the query now `::text`-casts them, the engine must not crash on a
    // Date — it normalizes via dayString. Same golden values as the string case.
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        dataset(
          lease({
            startDate: new Date("2024-07-01T00:00:00Z"),
            endDate: new Date("2024-12-31T00:00:00Z"),
          }),
        ),
      ),
    );

    expect(snapshot.tenant_share_before_cap).toBe("5027.32");
    expect(snapshot.lease_terms_snapshot.proration_factor).toBe("0.50273224");
  });

  it("counts GL entries whose date decoded as a Date object (period filter)", async () => {
    // A bare postgres `date` decodes to a JS Date. The period filter must
    // normalize it — otherwise a Date silently fails the upper-bound compare
    // and EVERY in-period GL entry is dropped (operating expenses → 0).
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        dataset(
          lease({ startDate: PERIOD_START, endDate: null }),
          new Date("2024-06-30T00:00:00Z"),
        ),
      ),
    );

    // The $100,000 entry is in-period and must be counted, not dropped.
    expect(snapshot.total_operating_expenses).toBe("100000.00");
    expect(snapshot.tenant_share_before_cap).toBe("10000.00");
  });

  it("day-weights actual occupancy for a half-period lease (gross-up factor reflects weighted occupancy, not full sqft)", async () => {
    // Lease occupies ALL rentable sqft (10000/10000) but only for 2024-07-01..
    // 2024-12-31 → 184 inclusive active days over 366. Day-weighted occupancy
    // (occupancy.py) = 10000 * (184/366) / 10000 = 0.5027 (4dp ROUND_HALF_UP).
    // target 0.95 > 0.5027 → gross-up factor = 0.95 / 0.5027 applies.
    //
    // The BUGGED un-weighted path computes occupancy = 10000/10000 = 1.0 >=
    // target, so it yields gross-up factor 1 and grossed_up_expenses == 100000.
    const ds = dataset(
      lease({ startDate: "2024-07-01", endDate: "2024-12-31" }),
    );
    ds.property.totalRentableSqft = "10000";
    ds.leases[0]!.tenantSqft = "10000";
    ds.expensePools[0]!.isGrossUpApplicable = true;

    const snapshot = onlySnapshot(await calculateReconciliationSnapshots(ds));

    // gross-up factor = (0.95 / 0.5027) = 1.8897953, quantized to 4 dp half-up
    // like the oracle (gross_up.calculate_gross_up_factor) → 1.8898. Then
    // grossed_up_expenses = (100000 * 1.8898) = 188980.00 (penny-exact).
    expect(snapshot.grossed_up_expenses).toBe("188980.00");
  });

  it("caps a cumulative-cap lease whose base/priors are zero to the oracle's $0 max", async () => {
    // Parity fix (C1): FIX CAP-4 (uncap on zero base) is a *non_cumulative*-only
    // guard. For cumulative caps the Python oracle (caps.py
    // calculate_cumulative_cap) applies the cap even with a zero base: with no
    // priors, reference=base=0, annual_increase=0, bank=0 → max_allowed=0.00, so
    // the share is capped to $0.00. Confirmed against apply_cap(cumulative,
    // current=10000, base=0, priors=[]) => 0.00.
    const ds = dataset(lease({ startDate: PERIOD_START, endDate: null }));
    ds.leases[0]!.versionCapType = "cumulative";
    ds.leases[0]!.versionCapRate = "0.05";
    ds.capHistories = [
      {
        leaseId: LEASE_ID,
        priorYearAmount: "0.00",
        capBaseYearAmount: "0.00",
        priorAmounts: [],
      },
    ];

    const snapshot = onlySnapshot(await calculateReconciliationSnapshots(ds));

    // Oracle caps to max_allowed = 0.00 (NOT the uncapped 10000.00).
    expect(snapshot.tenant_share_after_cap).toBe("0.00");
  });

  it("yields a zero share for a lease with no overlap in the period", async () => {
    // Lease ended before the period began — the GL still maps, but the tenant
    // owes nothing for a period they were not active in.
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        dataset(lease({ startDate: "2022-01-01", endDate: "2023-06-30" })),
      ),
    );

    expect(snapshot.tenant_share_before_cap).toBe("0.00");
    expect(snapshot.tenant_share_after_cap).toBe("0.00");
    expect(snapshot.admin_fee).toBe("0.00");
    expect(snapshot.total_recovery).toBe("0.00");
    expect(snapshot.lease_terms_snapshot.proration_factor).toBe("0");
  });
});
