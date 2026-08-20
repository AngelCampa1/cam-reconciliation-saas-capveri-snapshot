/**
 * Cumulative and cumulative-compounding cap math.
 *
 * Faithful TypeScript port of the effective-max computation in
 * backend/app/services/calculation/caps.py:
 *   - calculate_cumulative_cap          (linear carry-forward bank)
 *   - calculate_cumulative_compounding_cap (exponential, once-floored bank)
 *
 * This is the SOLE live money engine path for cumulative caps
 * (engine_version cloudflare-reconciliation-v1). Penny-exact parity with the
 * Python oracle is the bar.
 *
 * CRITICAL: This intentionally does NOT reuse simulateCapBank from
 * cap-bank-ledger.ts. That module floors the running bank to zero every year
 * for BOTH cap types; the reconciliation oracle floors the compounding bank
 * exactly ONCE (caps.py line 521-522) and only floors the cumulative bank once
 * after the running-balance simulation (caps.py line 323). The semantics
 * diverge on bank-then-over sequences, so the math is ported here directly.
 *
 * Decimal config mirrors cap-bank-ledger.ts: precision 28, ROUND_HALF_UP,
 * quantize to 2dp exactly where caps.py calls .quantize(). The compounding
 * power base*(1+rate)^n is computed in full precision and quantized once — the
 * Rate type (8dp) must NOT be used here or multi-year runs diverge.
 */

import Decimal from "decimal.js";

import { Money } from "./money";

// Configure Decimal: precision 28, ROUND_HALF_UP (matches cap-bank-ledger.ts).
const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/** Quantize to 2 decimal places, ROUND_HALF_UP. Mirrors Decimal.quantize("0.01"). */
function q(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

// Mirror caps.py CapType for the two cumulative variants handled here.
export const CAP_TYPE_CUMULATIVE = "cumulative";
export const CAP_TYPE_CUMULATIVE_COMPOUNDING = "cumulative_compounding";

const MAX_CAP_RATE = new D("1.0"); // caps.py CAP-5: 100%
// caps.py FIX FC-2: bound the exponent for compounding to avoid overflow.
const MAX_YEARS = 50;

export type CumulativeCapInput = {
  /** Base year amount (year 0). Numeric string. */
  base: string;
  /** Annual cap rate (e.g. "0.05"). Numeric string or null. */
  capRate: string | null;
  /** Fixed dollar annual increase. Numeric string or null. */
  capFixedAmount: string | null;
  /** Years since base year. Oracle: len(all_prior_amounts) + 1. */
  yearsSinceBase: number;
  /** Prior years' actual recovered amounts, ordered base→current (ascending). */
  orderedPriorActuals: string[];
  /** "cumulative" or "cumulative_compounding". */
  capType: string;
};

function validateRate(rate: Decimal): void {
  // caps.py FIX FC-6
  if (rate.lt(0)) {
    throw new Error("cap_rate must be non-negative");
  }
  // caps.py FIX CAP-5
  if (rate.gt(MAX_CAP_RATE)) {
    throw new Error(
      `cap_rate ${rate.toString()} exceeds maximum 1.0 (100%). ` +
        "Cap rates should be decimals (0.05 = 5%).",
    );
  }
}

function validateFixed(fixed: Decimal): void {
  // caps.py FIX FC-6
  if (fixed.lt(0)) {
    throw new Error("cap_fixed_amount must be non-negative");
  }
}

/**
 * Cumulative (linear) effective max.
 *
 * Port of caps.py calculate_cumulative_cap effective-max derivation:
 *   annual_increase_limit = quantize(base * cap_rate)  OR  cap_fixed_amount
 *   bank simulation (running balance) over prior actuals, floored once
 *   reference = last prior actual (or base if none)
 *   max_allowed = quantize(reference + annual_increase_limit + bank)
 */
function cumulativeEffectiveMax(input: CumulativeCapInput): Decimal {
  const base = new D(input.base);
  const priors = input.orderedPriorActuals.map((a) => new D(a));

  let annualIncreaseLimit: Decimal;
  if (input.capFixedAmount !== null) {
    const fixed = new D(input.capFixedAmount);
    validateFixed(fixed);
    annualIncreaseLimit = fixed;
  } else if (input.capRate !== null) {
    const rate = new D(input.capRate);
    validateRate(rate);
    annualIncreaseLimit = base.mul(rate);
  } else {
    throw new Error("Either cap_rate or cap_fixed_amount must be provided");
  }
  annualIncreaseLimit = q(annualIncreaseLimit);

  // Bank: caps.py only simulates when years_since_base > 1 AND priors exist.
  let bank = new D("0");
  if (input.yearsSinceBase > 1 && priors.length > 0) {
    let runningReference = base;
    let runningBank = new D("0");
    for (const actual of priors) {
      const yearMax = runningReference
        .add(annualIncreaseLimit)
        .add(runningBank);
      runningBank = yearMax.sub(actual);
      runningReference = actual;
    }
    bank = q(Decimal.max(runningBank, new D("0")));
  }

  const reference = priors.length > 0 ? priors[priors.length - 1]! : base;
  return q(reference.add(annualIncreaseLimit).add(bank));
}

/**
 * Cumulative compounding effective max.
 *
 * Port of caps.py calculate_cumulative_compounding_cap:
 *   max_allowed = quantize(base * (1+rate)^N)  OR  quantize(base + fixed*N)
 *   cumulative_max_prior = Σ_{y=1}^{N-1} base*(1+rate)^y  (or base + fixed*y)
 *   cumulative_actual_prior = Σ prior actuals
 *   bank = quantize(max(0, cumulative_max_prior - cumulative_actual_prior))  [floored ONCE]
 *   effective_max = quantize(max_allowed + bank)
 */
function compoundingEffectiveMax(input: CumulativeCapInput): Decimal {
  const base = new D(input.base);
  const priors = input.orderedPriorActuals.map((a) => new D(a));

  // caps.py FIX FC-2: cap the exponent.
  const years = Math.min(input.yearsSinceBase, MAX_YEARS);

  let maxAllowed: Decimal;
  let cumulativeMaxPrior = new D("0");

  if (input.capFixedAmount !== null) {
    const fixed = new D(input.capFixedAmount);
    // caps.py compounding-fixed branch does NOT validate negativity; mirror it.
    maxAllowed = base.add(fixed.mul(years));
    for (let y = 1; y < years; y++) {
      cumulativeMaxPrior = cumulativeMaxPrior.add(base.add(fixed.mul(y)));
    }
  } else if (input.capRate !== null) {
    const rate = new D(input.capRate);
    validateRate(rate);
    const onePlus = new D("1").add(rate);
    maxAllowed = base.mul(onePlus.pow(years));
    for (let y = 1; y < years; y++) {
      cumulativeMaxPrior = cumulativeMaxPrior.add(base.mul(onePlus.pow(y)));
    }
  } else {
    throw new Error("Either cap_rate or cap_fixed_amount must be provided");
  }

  maxAllowed = q(maxAllowed);

  const cumulativeActualPrior = priors.reduce(
    (sum, a) => sum.add(a),
    new D("0"),
  );
  // caps.py floors the bank ONCE here (NOT per-year — that is the cap-bank-ledger
  // divergence this module deliberately avoids).
  const bank = q(
    Decimal.max(cumulativeMaxPrior.sub(cumulativeActualPrior), new D("0")),
  );

  return q(maxAllowed.add(bank));
}

/**
 * Effective max recovery for cumulative / cumulative-compounding caps, as a
 * Money. Apply with `current.min(effectiveMax)` to obtain the capped amount.
 *
 * Throws (matching the oracle) on cap_rate < 0, cap_rate > 1.0, and
 * cap_fixed_amount < 0.
 */
export function cumulativeEffectiveMaxMoney(input: CumulativeCapInput): Money {
  let result: Decimal;
  if (input.capType === CAP_TYPE_CUMULATIVE_COMPOUNDING) {
    result = compoundingEffectiveMax(input);
  } else if (input.capType === CAP_TYPE_CUMULATIVE) {
    result = cumulativeEffectiveMax(input);
  } else {
    throw new Error(`Unsupported cumulative cap type: ${input.capType}`);
  }
  return Money.parse(result.toFixed(2));
}
