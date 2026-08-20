/**
 * Cap bank ledger domain logic.
 *
 * Faithful TypeScript port of backend/app/services/calculation/cap_bank_ledger.py.
 * All monetary arithmetic uses full-precision integer cent math (Money class) or
 * Decimal.js with precision=28, rounding ROUND_HALF_UP at each quantize step.
 *
 * CRITICAL: The compounding power base*(1+rate)^n is computed in full Decimal
 * precision and quantized ONCE to cents — matching Python's single-quantize.
 * Do NOT use the Rate type (8 dp) for this; it would diverge on multi-year runs.
 */

import Decimal from "decimal.js";

// ---------------------------------------------------------------------------
// Configure Decimal for this module: precision 28, ROUND_HALF_UP (3)
// ---------------------------------------------------------------------------
const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/** Quantize a Decimal to 2 decimal places with ROUND_HALF_UP */
function q(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CapBankLedgerEntry = {
  period_start: string; // YYYY-MM-DD
  period_end: string; // YYYY-MM-DD
  snapshot_id: string | null;
  cap_type: string;
  cap_rate: string; // serialized as string (Pydantic Decimal → JSON number, but frontend types.gen.ts says string)
  base_year_amount: string;
  cap_threshold: string;
  actual_expense: string;
  amount_applied: string;
  excess_absorbed_by_landlord: string;
  bank_opening: string;
  bank_change: string;
  bank_closing: string;
  finalized_at: string | null; // ISO datetime or null
};

export type CapBankLedger = {
  lease_id: string;
  tenant_name: string;
  pool_name: string | null;
  cap_type: string;
  cap_rate: string;
  entries: CapBankLedgerEntry[];
  current_bank_balance: string;
  total_landlord_absorbed: string;
};

export type SimulationInput = {
  baseAmount: string; // numeric string
  capRate: string | null; // numeric string or null
  capFixedAmount: string | null; // numeric string or null
  actualAmounts: string[]; // ordered list, one per finalized period
  capType: string;
};

export type SimulationEntry = Omit<
  CapBankLedgerEntry,
  "period_start" | "period_end" | "snapshot_id" | "finalized_at"
> & {
  /** placeholder; caller replaces with real snapshot data */
  period_start: string;
  period_end: string;
  snapshot_id: null;
  finalized_at: null;
};

// ---------------------------------------------------------------------------
// Cap type constants (mirror Python caps.py CapType)
// ---------------------------------------------------------------------------
const CAP_TYPE_CUMULATIVE = "cumulative";
const CAP_TYPE_COMPOUNDING = "cumulative_compounding";

// ---------------------------------------------------------------------------
// Core simulation — mirrors simulate_cap_bank exactly
// ---------------------------------------------------------------------------

export function simulateCapBank(input: SimulationInput): SimulationEntry[] {
  const { baseAmount, capRate, capFixedAmount, actualAmounts, capType } = input;

  if (actualAmounts.length === 0) {
    return [];
  }

  if (capType !== CAP_TYPE_CUMULATIVE && capType !== CAP_TYPE_COMPOUNDING) {
    return [];
  }

  if (capRate === null && capFixedAmount === null) {
    return [];
  }

  const base = new D(baseAmount);
  const rate = capRate !== null ? new D(capRate) : null;
  const fixedAmount = capFixedAmount !== null ? new D(capFixedAmount) : null;

  // For cumulative (linear), pre-compute annual_increase_limit
  let annualIncreaseLimit: Decimal | null = null;
  if (capType === CAP_TYPE_CUMULATIVE) {
    if (fixedAmount !== null) {
      annualIncreaseLimit = fixedAmount;
    } else {
      // cap_rate is not null here (guarded above)
      annualIncreaseLimit = q(base.mul(rate!));
    }
  }

  const entries: SimulationEntry[] = [];
  let runningReference = base;
  let runningBank = new D("0");

  for (let yearIdx = 0; yearIdx < actualAmounts.length; yearIdx++) {
    const actual = new D(actualAmounts[yearIdx]!);
    const bankOpening = q(runningBank);

    let capThreshold: Decimal;
    let effectiveMax: Decimal;

    if (capType === CAP_TYPE_COMPOUNDING) {
      const yearsSinceBase = yearIdx + 1;
      if (fixedAmount !== null) {
        // base + fixed * years
        capThreshold = q(base.add(fixedAmount.mul(yearsSinceBase)));
      } else {
        // base * (1 + rate)^years — full precision, quantize once
        const multiplier = new D("1").add(rate!).pow(yearsSinceBase);
        capThreshold = q(base.mul(multiplier));
      }
      effectiveMax = q(capThreshold.add(runningBank));
    } else {
      // Cumulative linear
      capThreshold = q(runningReference.add(annualIncreaseLimit!));
      effectiveMax = q(capThreshold.add(runningBank));
    }

    let amountApplied: Decimal;
    let excess: Decimal;
    let newBank: Decimal;

    if (actual.lte(effectiveMax)) {
      amountApplied = actual;
      excess = new D("0");
      newBank = q(effectiveMax.sub(actual));
    } else {
      amountApplied = effectiveMax;
      excess = q(actual.sub(effectiveMax));
      newBank = new D("0");
    }

    const bankChange = q(newBank.sub(bankOpening));

    entries.push({
      period_start: `${2000 + yearIdx}-01-01`,
      period_end: `${2000 + yearIdx}-12-31`,
      snapshot_id: null,
      cap_type: capType,
      cap_rate: (rate ?? new D("0")).toFixed(8).replace(/\.?0+$/, "") || "0",
      base_year_amount: base.toFixed(2),
      cap_threshold: capThreshold.toFixed(2),
      actual_expense: actual.toFixed(2),
      amount_applied: amountApplied.toFixed(2),
      excess_absorbed_by_landlord: excess.toFixed(2),
      bank_opening: bankOpening.toFixed(2),
      bank_change: bankChange.toFixed(2),
      bank_closing: newBank.toFixed(2),
      finalized_at: null,
    });

    // Carry forward: cumulative uses actual as next reference; compounding keeps base
    if (capType === CAP_TYPE_CUMULATIVE) {
      runningReference = actual;
    }
    runningBank = newBank;
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Ledger builder — mirrors get_cap_bank_ledger
// ---------------------------------------------------------------------------

export type LeaseCapProfile = {
  leaseId: string;
  tenantName: string;
  capType: string;
  capRate: string | null;
  capFixedAmount: string | null;
  baseYearAmount: string | null;
};

export type FinalizedSnapshotRow = {
  id: string;
  tenant_share_before_cap: string | number | null;
  // Date/timestamp columns may arrive as `Date` if not `::text`-cast; parseDate
  // normalizes them. listFinalizedSnapshotsForLease casts them to text.
  period_start_date: string | Date;
  period_end_date: string | Date;
  finalized_at: string | Date | null;
};

export function buildCapBankLedger(
  profile: LeaseCapProfile,
  snapshots: FinalizedSnapshotRow[],
): CapBankLedger {
  const {
    leaseId,
    tenantName,
    capType,
    capRate,
    capFixedAmount,
    baseYearAmount,
  } = profile;

  const emptyLedger = (rate: string): CapBankLedger => ({
    lease_id: leaseId,
    tenant_name: tenantName,
    pool_name: null,
    cap_type: capType,
    cap_rate: rate,
    entries: [],
    current_bank_balance: "0.00",
    total_landlord_absorbed: "0.00",
  });

  if (capType !== CAP_TYPE_CUMULATIVE && capType !== CAP_TYPE_COMPOUNDING) {
    return emptyLedger("0");
  }

  const resolvedRate = capRate ?? null;
  const rateDisplay =
    resolvedRate !== null
      ? new D(resolvedRate).toFixed(8).replace(/\.?0+$/, "") || "0"
      : "0";

  if (snapshots.length === 0) {
    return emptyLedger(rateDisplay);
  }

  const actualAmounts = snapshots.map((s) =>
    String(s.tenant_share_before_cap ?? "0"),
  );

  const rawEntries = simulateCapBank({
    baseAmount: baseYearAmount ?? "0",
    capRate: resolvedRate,
    capFixedAmount: capFixedAmount ?? null,
    actualAmounts,
    capType,
  });

  // Overlay real snapshot metadata
  const entries: CapBankLedgerEntry[] = rawEntries.map((entry, i) => {
    const snapshot = snapshots[i]!;
    return {
      ...entry,
      period_start: parseDate(snapshot.period_start_date),
      period_end: parseDate(snapshot.period_end_date),
      snapshot_id: snapshot.id,
      finalized_at:
        snapshot.finalized_at instanceof Date
          ? snapshot.finalized_at.toISOString()
          : (snapshot.finalized_at ?? null),
    };
  });

  const currentBank =
    entries.length > 0 ? entries[entries.length - 1]!.bank_closing : "0.00";
  const totalAbsorbed = entries
    .reduce(
      (sum, e) => sum.add(new D(e.excess_absorbed_by_landlord)),
      new D("0"),
    )
    .toFixed(2);

  return {
    lease_id: leaseId,
    tenant_name: tenantName,
    pool_name: null,
    cap_type: capType,
    cap_rate: rateDisplay,
    entries,
    current_bank_balance: currentBank,
    total_landlord_absorbed: totalAbsorbed,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "2000-01-01";
  // Date/timestamp columns decode to JS Date unless `::text`-cast; normalize so
  // a Date here does not throw `value.slice is not a function`.
  if (dateStr instanceof Date) {
    return dateStr.toISOString().slice(0, 10);
  }
  return dateStr.slice(0, 10);
}
