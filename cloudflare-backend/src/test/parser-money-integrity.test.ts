/**
 * Regression: money/numeric parsers must reject non-finite and non-decimal
 * literals instead of failing OPEN.
 *
 * `new Decimal()` silently accepts scientific ("1e3" -> 1000), hex ("0x10" ->
 * 16), binary/octal, and the non-finite tokens "NaN"/"Infinity". Before the
 * PLAIN_DECIMAL contract:
 *   - billing "NaN" survived the `amount.lte(0)` positivity gate (all NaN
 *     comparisons are false) and Postgres accepts `'NaN'::numeric`, so a poison
 *     value persisted as billed_amount and corrupted every downstream total.
 *   - rent-roll "1e3" silently became 1000 sqft, corrupting the pro-rata
 *     denominator with no error surfaced.
 * Both parsers must now skip such rows with a warning and never persist them.
 */

import { describe, expect, it } from "vitest";

import { parseBillingCsv } from "../domain/actual-billed/billing-parser";
import { parseRentRollCsv } from "../domain/rent-roll/parser";

const POISON_TOKENS = ["NaN", "Infinity", "-Infinity", "1e3", "0x10", "0b101", "0o17"];

describe("billing parseMoney money integrity", () => {
  it.each(POISON_TOKENS)(
    "skips a row whose amount is the poison token %s (never persists it)",
    (token) => {
      const result = parseBillingCsv({
        text: `Tenant,Amount Billed\nAcme Corp,${token}\n`,
        filename: "billing.csv",
      });

      // A file whose only data row is poison yields no valid billing data.
      expect(result.success).toBe(false);
    },
  );

  it("keeps valid decorated amounts while dropping the poison row in a mixed file", () => {
    const result = parseBillingCsv({
      text:
        "Tenant,Amount Billed\n" +
        'Good Tenant,"$1,234.56"\n' +
        "Poison Tenant,NaN\n" +
        "Another Good,750.00\n",
      filename: "billing.csv",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.rowCount).toBe(2);
    expect(result.totalBilled).toBe("1984.56");
    expect(result.data.map((row) => row.billedAmount)).toEqual([
      "1234.56",
      "750",
    ]);
  });
});

describe("rent-roll decimalValue money integrity", () => {
  it.each(POISON_TOKENS)(
    "skips a unit whose rentable_sqft is the poison token %s (never persists it)",
    (token) => {
      const result = parseRentRollCsv({
        text: `Unit Number,Rentable SF\n101,${token}\n`,
        filename: "rentroll.csv",
      });

      expect(result.success).toBe(true);
      if (!result.success) {
        return;
      }
      expect(result.units).toHaveLength(0);
      expect(result.warnings.some((w) => w.includes("rentable_sqft"))).toBe(
        true,
      );
    },
  );

  it("keeps a valid decorated sqft while dropping the poison row in a mixed file", () => {
    const result = parseRentRollCsv({
      text:
        "Unit Number,Rentable SF\n" +
        '101,"1,000.00"\n' +
        "102,1e3\n" +
        "103,2500\n",
      filename: "rentroll.csv",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.units.map((unit) => unit.unit_number)).toEqual(["101", "103"]);
    expect(result.units.map((unit) => unit.rentable_sqft)).toEqual([
      "1000.00",
      "2500.00",
    ]);
  });
});

// Pins Unicode-minus (U+2212, "−") canonicalization parity across all three
// money/numeric parsers. Some ERP/Excel locale exports emit a real minus
// glyph instead of ASCII "-"; without canonicalizing it first, the value
// falls out of the plain-decimal contract and the row silently drops instead
// of being recognized as a negative amount. GL cleanCurrency already handled
// this (csv-parser.ts); parseMoney and decimalValue must match it.
describe("Unicode minus (U+2212) canonicalization parity", () => {
  it("billing parseMoney treats a Unicode-minus amount the same as ASCII minus", () => {
    const unicodeMinus = parseBillingCsv({
      text: "Tenant,Amount Billed\nAcme Corp,−500.00\n",
      filename: "billing.csv",
    });
    const asciiMinus = parseBillingCsv({
      text: "Tenant,Amount Billed\nAcme Corp,-500.00\n",
      filename: "billing.csv",
    });

    // Both should fail the same way: parseMoney negates to a non-positive
    // amount, which the row-level positivity gate then skips.
    expect(unicodeMinus.success).toBe(asciiMinus.success);
    expect(unicodeMinus.success).toBe(false);
  });

  it("rent-roll decimalValue treats a Unicode-minus rentable_sqft the same as ASCII minus", () => {
    const unicodeMinus = parseRentRollCsv({
      text: "Unit Number,Rentable SF\n101,−1000\n",
      filename: "rentroll.csv",
    });
    const asciiMinus = parseRentRollCsv({
      text: "Unit Number,Rentable SF\n101,-1000\n",
      filename: "rentroll.csv",
    });

    expect(unicodeMinus.success).toBe(true);
    expect(asciiMinus.success).toBe(true);
    if (!unicodeMinus.success || !asciiMinus.success) {
      return;
    }
    // Both are rejected by the positive-rentable-sqft row gate identically.
    expect(unicodeMinus.units).toEqual(asciiMinus.units);
    expect(unicodeMinus.error_count).toBe(asciiMinus.error_count);
    expect(unicodeMinus.warnings.join("\n")).toContain(
      "Rentable sqft must be positive, got -1000.00",
    );
  });
});
