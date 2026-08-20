import { describe, expect, it } from "vitest";
import { parseGlCsv } from "../domain/ingestion/csv-parser";

// Regression coverage for the GL CSV parser's debit/credit netting, ported to
// match the Python oracle `cleaners.split_amount_columns`: when BOTH a debit and
// a credit column are present, the signed amount is ALWAYS
// `clean(debit) - clean(credit)`, each cell currency-cleaned and a blank /
// unparseable cell coerced to 0 (`.fillna(0)`).
//
// Guards two prior divergences (CYCLE4-GLPARSE-FINDINGS):
//   BUG-1 (CRITICAL): a non-empty debit (even "0.00") returned the gross debit
//                     and silently ignored the credit.
//   BUG-2 (HIGH):     a pre-signed credit ("(500)", "500 CR", "500.00-") was
//                     force-negated, flipping an already-credited value's sign.
//
// parseAmount is module-private, so it is exercised through the real exported
// parseGlCsv via the generic column-mapping path with both columns mapped.
function parseDebitCredit(debitCell: string, creditCell: string) {
  // Quote the debit/credit cells so values containing a comma (e.g. thousands
  // separators like "$1,500.00") are not split across CSV columns.
  const text =
    `account,debit,credit,date\n` +
    `1000,"${debitCell}","${creditCell}",2024-06-15\n`;
  return parseGlCsv({
    text,
    filename: "regression.csv",
    propertyId: "p1",
    sourceOverride: "generic",
    columnMapping: {
      account_code: "account",
      debit: "debit",
      credit: "credit",
      transaction_date: "date",
    },
  });
}

describe("GL CSV debit/credit netting (oracle split_amount_columns parity)", () => {
  it("nets debit - credit when both columns hold values (1000 - 250 = 750)", () => {
    expect(parseDebitCredit("1000.00", "250.00").entries[0]?.amount).toBe(
      "750.00",
    );
  });

  it("BUG-1: debit='0.00' + credit='500' nets to -500, not 0", () => {
    // The pure-expense credit entry must NOT vanish. Old chain returned the
    // gross debit ("0.00") and dropped the credit entirely.
    expect(parseDebitCredit("0.00", "500.00").entries[0]?.amount).toBe(
      "-500.00",
    );
  });

  it("BUG-2: parenthesized credit with blank debit nets to +500 (double-negative cancels)", () => {
    // clean('(500.00)') = -500; amount = 0 - (-500) = +500. Old chain
    // force-negated the already-signed credit to -500.
    expect(parseDebitCredit("", "(500.00)").entries[0]?.amount).toBe("500.00");
  });

  it("BUG-2: 'CR'-suffixed credit with blank debit nets to +500", () => {
    expect(parseDebitCredit("", "500 CR").entries[0]?.amount).toBe("500.00");
  });

  it("BUG-2: trailing-minus credit with blank debit nets to +500", () => {
    expect(parseDebitCredit("", "500.00-").entries[0]?.amount).toBe("500.00");
  });

  it("debit-only value with blank credit yields the gross debit (+1000)", () => {
    expect(parseDebitCredit("1000.00", "").entries[0]?.amount).toBe("1000.00");
  });

  it("both blank nets to 0.00 and keeps the row (oracle never drops it)", () => {
    const res = parseDebitCredit("", "");
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]?.amount).toBe("0.00");
  });

  it("both non-zero (double-entry) nets and warns nothing about dropping", () => {
    // Standard double-entry row: debit 1200.50, credit 200.50 -> 1000.00.
    expect(parseDebitCredit("1200.50", "200.50").entries[0]?.amount).toBe(
      "1000.00",
    );
  });

  it("unparseable debit cell coerces to 0, credit still nets (fillna parity)", () => {
    // 'abc' is not currency -> cleanCurrency null -> 0; 0 - 300 = -300.
    expect(parseDebitCredit("abc", "300.00").entries[0]?.amount).toBe(
      "-300.00",
    );
  });

  it("currency-symbol debit and credit both clean before netting", () => {
    expect(parseDebitCredit("$1,500.00", "$500.00").entries[0]?.amount).toBe(
      "1000.00",
    );
  });
});
