import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationJobRecord,
  type CalculationLeaseRecord,
  type SnapshotDraft,
} from "../domain/reconciliation/calculator";

// Penny-exact parity regressions against the Python oracle for three
// financial-correctness fixes:
//   FIX 1 — cap actual occupancy at 1.0 (occupancy.py:185).
//   FIX 2 — apply the management-fee CAP (tenant_share.py:237-385).
//   FIX 3 — honor base_year_adjustments (base_year.py:114-153).

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
const LEASE_ID_2 = "66666666-6666-4666-8666-666666666666";
const OP_POOL_ID = "55555555-5555-4555-8555-555555555555";
const MGMT_POOL_ID = "77777777-7777-4777-8777-777777777777";
const MGMT_POOL_ID_2 = "88888888-8888-4888-8888-888888888888";

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
    versionCapType: null,
    versionCapRate: null,
    versionExcludedPools: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// FIX 1 — occupancy clamp (occupancy.py:185)
// ---------------------------------------------------------------------------

// Two overlapping full-period leases of 8,000 SF each in a 10,000 SF property
// drive raw occupancy to 16,000 / 10,000 = 1.6 (>100%). The single $100,000
// operating pool IS gross-up-applicable. With the clamp, occupancy = 1.0 >=
// target 0.95 so the gross-up factor is 1.0 and the safety valve does not bite:
// grossed_up == booked == $100,000. WITHOUT the clamp, the safety valve
// maxAtFullOccupancy = 100,000 * (1 / 1.6) = $62,500 would wrongly shrink the
// recoverable pool — systematic under-recovery.
function occupancyDataset(): CalculationDataset {
  return {
    job: job(),
    property: {
      id: PROPERTY_ID,
      totalRentableSqft: "10000",
      targetOccupancy: "0.95",
    },
    leases: [
      lease({ id: LEASE_ID, tenantSqft: "8000" }),
      lease({ id: LEASE_ID_2, tenantName: "Beta", tenantSqft: "8000" }),
    ],
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
        id: OP_POOL_ID,
        name: "CAM",
        poolType: "operating",
        isGrossUpApplicable: true,
        grossUpTarget: null,
      },
    ],
    poolMappings: [
      {
        expensePoolId: OP_POOL_ID,
        glAccountPattern: "6*",
        allocationPercentage: "1",
        priority: 10,
      },
    ],
    capHistories: [],
  };
}

describe("FIX 1: actual occupancy capped at 1.0 (oracle occupancy.py:185)", () => {
  it("does not shrink the gross-up safety valve when raw occupancy exceeds 100%", async () => {
    const snapshots =
      await calculateReconciliationSnapshots(occupancyDataset());
    // Both leases see the same clamped occupancy; assert on the first lease.
    const snapshot = snapshots[0];
    if (!snapshot) {
      throw new Error("expected at least one snapshot");
    }
    // ORACLE-CORRECT: occupancy clamped to 1.0 -> factor 1.0 -> grossed_up ==
    // booked $100,000.00 (NOT the un-clamped $62,500.00 the safety valve would
    // impose at occupancy 1.6).
    expect(snapshot.grossed_up_expenses).toBe("100000.00");
  });
});

// ---------------------------------------------------------------------------
// FIX 2 — management-fee cap (tenant_share.py:237-385)
// ---------------------------------------------------------------------------

// $100,000 operating "CAM" pool (acct 6100) + a $20,000 booked "Management Fee"
// operating pool (acct 6900). No gross-up, no exclusions, no cap, no admin fee.
function mgmtFeeDataset(
  leaseRecord: CalculationLeaseRecord,
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
        id: "aaaa1111-1111-4111-8111-111111111111",
        accountCode: "6100",
        amount: "100000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
      {
        id: "bbbb2222-2222-4222-8222-222222222222",
        accountCode: "6900",
        amount: "20000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ],
    expensePools: [
      {
        id: OP_POOL_ID,
        name: "CAM",
        poolType: "operating",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
      {
        id: MGMT_POOL_ID,
        name: "Management Fee",
        poolType: "operating",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
    ],
    poolMappings: [
      {
        expensePoolId: MGMT_POOL_ID,
        glAccountPattern: "6900",
        allocationPercentage: "1",
        priority: 20,
      },
      {
        expensePoolId: OP_POOL_ID,
        glAccountPattern: "6*",
        allocationPercentage: "1",
        priority: 10,
      },
    ],
    capHistories: [],
  };
}

describe("FIX 2: management-fee cap (oracle tenant_share.py:237-385)", () => {
  it("caps the recoverable management fee at rate * operating_base_excl_fee", async () => {
    // rate 0.04 * operating_base_excl_fee $100,000 = cap $4,000. Booked fee
    // $20,000 > cap -> reduced to $4,000. recoverable = 100,000 + 4,000 =
    // $104,000. tenant_share = 104,000 * 0.10 = $10,400.00.
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        mgmtFeeDataset(
          lease({
            recoveryProfile: {
              pro_rata_share: "0.10",
              admin_fee_percentage: "0",
              cap_type: "none",
              excluded_pools: [],
              management_fee_percentage: "0.04",
            },
          }),
        ),
      ),
    );
    expect(snapshot.grossed_up_expenses).toBe("104000.00");
    expect(snapshot.tenant_share_before_cap).toBe("10400.00");
    expect(snapshot.total_recovery).toBe("10400.00");
  });

  it("leaves the fee untouched when booked fee is within the cap", async () => {
    // rate 0.30 * $100,000 = cap $30,000 >= booked $20,000 -> no reduction.
    // recoverable = $120,000. tenant_share = 120,000 * 0.10 = $12,000.00.
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        mgmtFeeDataset(
          lease({
            recoveryProfile: {
              pro_rata_share: "0.10",
              admin_fee_percentage: "0",
              cap_type: "none",
              excluded_pools: [],
              management_fee_percentage: "0.30",
            },
          }),
        ),
      ),
    );
    expect(snapshot.grossed_up_expenses).toBe("120000.00");
    expect(snapshot.tenant_share_before_cap).toBe("12000.00");
  });

  it("splits the cap pro-rata across multiple fee pools (largest-remainder)", async () => {
    // Two management-fee pools booked $10,000 (acct 6900) and $5,000 (acct
    // 6901); operating base = $100,000 (CAM). rate 0.07 -> cap $7,000. Booked
    // fee total $15,000 > cap. Pro-rata by booked amount:
    //   6900: 7000 * 10000/15000 = 4666.666... -> floor 4666.66, rem .666
    //   6901: 7000 *  5000/15000 = 2333.333... -> floor 2333.33, rem .333
    //   leftover 1 cent -> larger remainder (6900) -> 4666.67.
    // recoverable = 100,000 + 4,666.67 + 2,333.33 = $107,000.00.
    // tenant_share = 107,000 * 0.10 = $10,700.00.
    const dataset: CalculationDataset = {
      job: job(),
      property: {
        id: PROPERTY_ID,
        totalRentableSqft: "10000",
        targetOccupancy: "0.95",
      },
      leases: [
        lease({
          recoveryProfile: {
            pro_rata_share: "0.10",
            admin_fee_percentage: "0",
            cap_type: "none",
            excluded_pools: [],
            management_fee_percentage: "0.07",
          },
        }),
      ],
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
          accountCode: "6900",
          amount: "10000.00",
          transactionDate: "2024-06-30",
          accrualDate: null,
        },
        {
          id: "cccc3333-3333-4333-8333-333333333333",
          accountCode: "6901",
          amount: "5000.00",
          transactionDate: "2024-06-30",
          accrualDate: null,
        },
      ],
      expensePools: [
        {
          id: OP_POOL_ID,
          name: "CAM",
          poolType: "operating",
          isGrossUpApplicable: false,
          grossUpTarget: null,
        },
        {
          id: MGMT_POOL_ID,
          name: "Management Fee A",
          poolType: "operating",
          isGrossUpApplicable: false,
          grossUpTarget: null,
        },
        {
          id: MGMT_POOL_ID_2,
          name: "Management Fee B",
          poolType: "operating",
          isGrossUpApplicable: false,
          grossUpTarget: null,
        },
      ],
      poolMappings: [
        {
          expensePoolId: MGMT_POOL_ID,
          glAccountPattern: "6900",
          allocationPercentage: "1",
          priority: 30,
        },
        {
          expensePoolId: MGMT_POOL_ID_2,
          glAccountPattern: "6901",
          allocationPercentage: "1",
          priority: 20,
        },
        {
          expensePoolId: OP_POOL_ID,
          glAccountPattern: "6*",
          allocationPercentage: "1",
          priority: 10,
        },
      ],
      capHistories: [],
    };
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(dataset),
    );
    expect(snapshot.grossed_up_expenses).toBe("107000.00");
    expect(snapshot.tenant_share_before_cap).toBe("10700.00");
  });

  it("removes the whole fee when there is no operating base (cap = 0)", async () => {
    // A lone $20,000 "Management Fee" pool typed NON-operating, no operating
    // pool at all. The oracle skips ONLY when the pool-type map is absent
    // (tenant_share.py:269); with types present but no operating pool the
    // operating_base sums to 0, so cap = max(0, 0.04 * 0) = 0 and the booked fee
    // is reduced entirely to $0. (The pre-fix TS `hasOperatingType` gate wrongly
    // skipped here, leaving the fee fully recoverable.)
    const dataset: CalculationDataset = {
      job: job(),
      property: {
        id: PROPERTY_ID,
        totalRentableSqft: "10000",
        targetOccupancy: "0.95",
      },
      leases: [
        lease({
          recoveryProfile: {
            pro_rata_share: "0.10",
            admin_fee_percentage: "0",
            cap_type: "none",
            excluded_pools: [],
            management_fee_percentage: "0.04",
          },
        }),
      ],
      glEntries: [
        {
          id: "bbbb2222-2222-4222-8222-222222222222",
          accountCode: "6900",
          amount: "20000.00",
          transactionDate: "2024-06-30",
          accrualDate: null,
        },
      ],
      expensePools: [
        {
          id: MGMT_POOL_ID,
          name: "Management Fee",
          poolType: "tax",
          isGrossUpApplicable: false,
          grossUpTarget: null,
        },
      ],
      poolMappings: [
        {
          expensePoolId: MGMT_POOL_ID,
          glAccountPattern: "6900",
          allocationPercentage: "1",
          priority: 20,
        },
      ],
      capHistories: [],
    };
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(dataset),
    );
    expect(snapshot.grossed_up_expenses).toBe("0.00");
    expect(snapshot.tenant_share_before_cap).toBe("0.00");
  });
});

// ---------------------------------------------------------------------------
// FIX 3 — base_year_adjustments (base_year.py:114-153)
// ---------------------------------------------------------------------------

function baseYearDataset(
  leaseRecord: CalculationLeaseRecord,
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
        id: "cccc3333-3333-4333-8333-333333333333",
        accountCode: "6100",
        amount: "120000.00",
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ],
    expensePools: [
      {
        id: OP_POOL_ID,
        name: "CAM",
        poolType: "operating",
        isGrossUpApplicable: false,
        grossUpTarget: null,
      },
    ],
    poolMappings: [
      {
        expensePoolId: OP_POOL_ID,
        glAccountPattern: "6*",
        allocationPercentage: "1",
        priority: 10,
      },
    ],
    capHistories: [],
  };
}

describe("FIX 3: base_year_adjustments (oracle base_year.py:114-153)", () => {
  it("adds imputed new-service cost to the base before computing increase", async () => {
    // current $120,000, base $100,000, plus a $15,000 imputed adjustment.
    // adjusted_base = 100,000 + 15,000 = 115,000.
    // increase = 120,000 - 115,000 = 5,000.
    // tenant_share = 5,000 * 0.10 = $500.00.
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        baseYearDataset(
          lease({
            recoveryProfile: {
              pro_rata_share: "0.10",
              admin_fee_percentage: "0",
              cap_type: "none",
              excluded_pools: [],
              base_year: 2023,
              base_year_amount: "100000.00",
              base_year_adjustments: [
                {
                  service_name: "Security guard",
                  imputed_amount: "15000.00",
                  justification: "Added after base year",
                },
              ],
            },
          }),
        ),
      ),
    );
    expect(snapshot.tenant_share_before_cap).toBe("500.00");
  });

  it("preserves the unadjusted base when there are no adjustments", async () => {
    // current $120,000, base $100,000, no adjustments.
    // increase = 120,000 - 100,000 = 20,000. tenant_share = 20,000 * 0.10 =
    // $2,000.00.
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        baseYearDataset(
          lease({
            recoveryProfile: {
              pro_rata_share: "0.10",
              admin_fee_percentage: "0",
              cap_type: "none",
              excluded_pools: [],
              base_year: 2023,
              base_year_amount: "100000.00",
            },
          }),
        ),
      ),
    );
    expect(snapshot.tenant_share_before_cap).toBe("2000.00");
  });

  it("ignores adjustments entirely when the base amount is absent (oracle else-branch)", async () => {
    // base_year set but base_year_amount is null. The oracle gates the base-year
    // branch on BOTH (tenant_share.py:490 `if terms.base_year and
    // terms.base_year_amount`), so it takes the else-branch: the FULL
    // net-recoverable flows to pro-rata and the $15,000 adjustment is NOT applied.
    // current $120,000 * 0.10 = $12,000.00 (NOT (120,000 - 15,000) * 0.10).
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        baseYearDataset(
          lease({
            recoveryProfile: {
              pro_rata_share: "0.10",
              admin_fee_percentage: "0",
              cap_type: "none",
              excluded_pools: [],
              base_year: 2023,
              base_year_adjustments: [
                {
                  service_name: "Security guard",
                  imputed_amount: "15000.00",
                  justification: "Added after base year",
                },
              ],
            },
          }),
        ),
      ),
    );
    expect(snapshot.tenant_share_before_cap).toBe("12000.00");
  });
});
