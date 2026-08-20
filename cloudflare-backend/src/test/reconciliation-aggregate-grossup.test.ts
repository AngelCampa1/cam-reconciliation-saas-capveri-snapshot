import { describe, expect, it } from "vitest";
import {
  calculateReconciliationSnapshots,
  type CalculationDataset,
  type CalculationJobRecord,
  type CalculationLeaseRecord,
  type SnapshotDraft,
} from "../domain/reconciliation/calculator";

// Penny-exact parity for the AGGREGATE gross-up safety valve, ported from the
// Python oracle (backend/app/services/calculation/gross_up_orchestrator.py +
// orchestrator.py:430-454). The oracle grosses up the AGGREGATE variable pool
// once and applies ONE safety valve to that aggregate
// (gross_up.apply_safety_valve over filtered.gross_up_expenses), then adds the
// fixed pools. The per-pool dict it builds for exclusions/breakdown uses the
// BARE factor, never the valve.
//
// The pre-fix Worker valved EACH grossable pool individually. That diverges from
// the oracle two ways:
//   1. A net-credit grossable pool (GL reversals exceed charges in that pool) is
//      driven MORE negative by a per-pool valve, under-stating the recoverable
//      base — a real-dollar error (here $500 on a single lease).
//   2. Rounding drift: Sum(round(pool * factor)) != round(Sum(pool) * factor)
//      across multiple grossable pools (here 1 cent).

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
const POOL_A_ID = "55555555-5555-4555-8555-555555555555";
const POOL_B_ID = "66666666-6666-4666-8666-666666666666";

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
    tenantSqft: "5000",
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

// Two GROSS-UP-APPLICABLE operating pools: A (acct 6100) and B (acct 6200).
// The property target occupancy is set to an exact round value so the factor is a
// clean number, isolating the aggregate-vs-per-pool behavior from factor
// quantization. (Target occupancy is property-level; pools carry no gross_up_target.)
function twoGrossablePoolDataset(opts: {
  poolAAmount: string;
  poolBAmount: string;
  targetOccupancy: string;
  tenantSqft: string;
}): CalculationDataset {
  return {
    job: job(),
    property: {
      id: PROPERTY_ID,
      totalRentableSqft: "10000",
      targetOccupancy: opts.targetOccupancy,
    },
    leases: [lease({ tenantSqft: opts.tenantSqft })],
    glEntries: [
      {
        id: "aaaa1111-1111-4111-8111-111111111111",
        accountCode: "6100",
        amount: opts.poolAAmount,
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
      {
        id: "bbbb2222-2222-4222-8222-222222222222",
        accountCode: "6200",
        amount: opts.poolBAmount,
        transactionDate: "2024-06-30",
        accrualDate: null,
      },
    ],
    expensePools: [
      {
        id: POOL_A_ID,
        name: "CAM A",
        poolType: "operating",
        isGrossUpApplicable: true,
        grossUpTarget: null,
      },
      {
        id: POOL_B_ID,
        name: "CAM B",
        poolType: "operating",
        isGrossUpApplicable: true,
        grossUpTarget: null,
      },
    ],
    poolMappings: [
      {
        expensePoolId: POOL_A_ID,
        glAccountPattern: "6100",
        allocationPercentage: "1",
        priority: 20,
      },
      {
        expensePoolId: POOL_B_ID,
        glAccountPattern: "6200",
        allocationPercentage: "1",
        priority: 10,
      },
    ],
    capHistories: [],
  };
}

describe("aggregate gross-up safety valve (oracle gross_up_orchestrator.py)", () => {
  it("nets a credit pool into the aggregate before grossing (no per-pool valve)", async () => {
    // occupancy 5000/10000 = 0.5; target 0.75 -> factor 0.75/0.5 = 1.5.
    // Pool A = +$100,000, Pool B = -$5,000 (net GL credit).
    // AGGREGATE (oracle): variable = 100,000 - 5,000 = $95,000; grossed
    //   95,000 * 1.5 = $142,500; safety valve cap 95,000 / 0.5 = $190,000 does
    //   not bind -> grossed_up = $142,500. tenant_share = 142,500 * 0.10 =
    //   $14,250.00.
    // PER-POOL (the bug): A -> min(150,000, 200,000) = 150,000; B ->
    //   min(-7,500, -10,000) = -10,000 (the valve drives the credit MORE
    //   negative) -> sum 140,000... i.e. $142,500 - the $2,500 wrongly shaved off
    //   the credit pool. The aggregate path is the financially correct one.
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        twoGrossablePoolDataset({
          poolAAmount: "100000.00",
          poolBAmount: "-5000.00",
          targetOccupancy: "0.75",
          tenantSqft: "5000",
        }),
      ),
    );
    expect(snapshot.grossed_up_expenses).toBe("142500.00");
    expect(snapshot.tenant_share_before_cap).toBe("14250.00");
    expect(snapshot.total_recovery).toBe("14250.00");
  });

  it("grosses the aggregate then rounds once (no per-pool rounding drift)", async () => {
    // occupancy 0.5; target 0.75 -> factor 1.5. Two pools of $33,333.33.
    // AGGREGATE (oracle): 66,666.66 * 1.5 = 99,999.99 (round once).
    // PER-POOL (the bug): round(33,333.33 * 1.5) * 2 = round(49,999.995) * 2 =
    //   50,000.00 * 2 = $100,000.00 -> a 1-cent over-recovery.
    const snapshot = onlySnapshot(
      await calculateReconciliationSnapshots(
        twoGrossablePoolDataset({
          poolAAmount: "33333.33",
          poolBAmount: "33333.33",
          targetOccupancy: "0.75",
          tenantSqft: "5000",
        }),
      ),
    );
    expect(snapshot.grossed_up_expenses).toBe("99999.99");
  });
});
