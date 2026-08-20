import Decimal from "decimal.js";
import type { ReconciliationRecoveryRecord } from "./repository";

export type BillingExposureSummary = {
  total_underbill_exposure: string;
  total_overbill_exposure: string;
  total_billing_exposure: string;
};

export function calculateBillingExposure(input: {
  snapshots: ReconciliationRecoveryRecord[];
  billedRows: Array<{ billed_amount: string }>;
}): BillingExposureSummary | null {
  if (input.snapshots.length === 0 || input.billedRows.length === 0) {
    return null;
  }

  const calculated = input.snapshots.reduce(
    (total, snapshot) => total.plus(moneyOrZero(snapshot.total_recovery)),
    new Decimal(0),
  );
  const billed = input.billedRows.reduce(
    (total, row) => total.plus(moneyOrZero(row.billed_amount)),
    new Decimal(0),
  );
  const variance = calculated.minus(billed);
  const underbillExposure = variance.gt(0) ? variance : new Decimal(0);
  const overbillExposure = variance.lt(0) ? variance.abs() : new Decimal(0);

  return {
    total_underbill_exposure: underbillExposure.toFixed(),
    total_overbill_exposure: overbillExposure.toFixed(),
    total_billing_exposure: underbillExposure.plus(overbillExposure).toFixed(),
  };
}

function moneyOrZero(value: string): Decimal {
  const decimal = new Decimal(value);
  return decimal.isFinite() ? decimal : new Decimal(0);
}
