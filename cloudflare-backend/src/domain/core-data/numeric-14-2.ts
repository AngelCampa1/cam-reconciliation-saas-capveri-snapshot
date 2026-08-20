import Decimal from "decimal.js";

/**
 * `gl_entries.amount` and `actual_billed_amounts.billed_amount` are both
 * `NUMERIC(14,2)`: precision 14, scale 2 => at most 12 integer digits, so the
 * storable magnitude is `|value| < 10^12` (max `999,999,999,999.99`).
 *
 * The CSV parsers validate the decimal *format* of a cell but not its
 * magnitude, so a genuinely huge value (a concatenated / mis-keyed ERP cell)
 * used to reach the `$::numeric` bind and make Postgres raise SQLSTATE 22003
 * "numeric field overflow", which surfaced to the client as an opaque HTTP 500.
 * Callers use the helper below to reject such a value as a clean 4xx *before*
 * the insert — failing closed with no silent row drop.
 */
export const NUMERIC_14_2_ABS_LIMIT = new Decimal("1e12");

/** Human-facing ceiling for error messages. */
export const NUMERIC_14_2_MAX_LABEL = "999,999,999,999.99";

/**
 * Returns the index of the first amount whose magnitude cannot be stored in a
 * `NUMERIC(14,2)` column, or `-1` if every amount fits. Amounts are decimal
 * strings as produced by the parsers (e.g. `"-500.00"`). A non-finite or
 * unparseable string is treated as out of range (defensive — the parsers
 * should already have rejected it, so this never fires on a valid pipeline).
 */
export function findFirstAmountOutOfRange(amounts: readonly string[]): number {
  for (let i = 0; i < amounts.length; i += 1) {
    let value: Decimal;
    try {
      value = new Decimal(amounts[i] ?? "");
    } catch {
      return i;
    }
    if (!value.isFinite() || value.abs().gte(NUMERIC_14_2_ABS_LIMIT)) {
      return i;
    }
  }
  return -1;
}
