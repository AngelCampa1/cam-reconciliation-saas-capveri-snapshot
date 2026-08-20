import { describe, expect, it } from "vitest";
import { parseGlCsv } from "../domain/ingestion/csv-parser";

// Regression coverage for the GL CSV parser's currency and date normalization.
// cleanCurrency / parseDate are module-private, so they are exercised through
// the real exported parseGlCsv via the generic column-mapping path.
function parseAmount(amountCell: string) {
  const text = `account,amount,date\n1000,${amountCell},2024-06-15\n`;
  return parseGlCsv({
    text,
    filename: "regression.csv",
    propertyId: "p1",
    sourceOverride: "generic",
    columnMapping: {
      account_code: "account",
      amount: "amount",
      transaction_date: "date",
    },
  });
}

function parseDateCell(dateCell: string) {
  // Amount is fixed and valid so only the date drives row validity.
  const text = `account,amount,date\n1000,100.00,${dateCell}\n`;
  return parseGlCsv({
    text,
    filename: "regression.csv",
    propertyId: "p1",
    sourceOverride: "generic",
    columnMapping: {
      account_code: "account",
      amount: "amount",
      transaction_date: "date",
    },
  });
}

describe("GL CSV currency normalization (exact decimal, never float)", () => {
  it("rounds an exact half-cent up (0.145 -> 0.15), not down via float", () => {
    // 0.145 is 0.144999... in IEEE-754, so Number(...).toFixed(2) yielded 0.14.
    expect(parseAmount("0.145").entries[0]?.amount).toBe("0.15");
  });

  it("rounds 1.005 to 1.01 (float stored it as 1.00499...)", () => {
    expect(parseAmount("1.005").entries[0]?.amount).toBe("1.01");
  });

  it("rounds a large half-cent up exactly (1234567890.005 -> .01)", () => {
    expect(parseAmount("1234567890.005").entries[0]?.amount).toBe(
      "1234567890.01",
    );
  });

  it("keeps cents exact beyond Number.MAX_SAFE_INTEGER", () => {
    // Number(...) loses the cents on this magnitude; decimal.js keeps them.
    expect(parseAmount("9007199254740993.55").entries[0]?.amount).toBe(
      "9007199254740993.55",
    );
  });

  it("treats accounting parentheses as negative", () => {
    expect(parseAmount("(1234.56)").entries[0]?.amount).toBe("-1234.56");
  });

  it("treats interior-space parentheses as negative", () => {
    expect(parseAmount("( 1234.56 )").entries[0]?.amount).toBe("-1234.56");
  });

  it("strips $ and thousands separators on a quoted cell", () => {
    const text = `account,amount,date\n1000,"$1,234.56",2024-06-15\n`;
    const res = parseGlCsv({
      text,
      filename: "regression.csv",
      propertyId: "p1",
      sourceOverride: "generic",
      columnMapping: {
        account_code: "account",
        amount: "amount",
        transaction_date: "date",
      },
    });
    expect(res.entries[0]?.amount).toBe("1234.56");
  });

  it("rejects a lone dash rather than coercing it to 0.00", () => {
    expect(parseAmount("-").entries.length).toBe(0);
  });

  // ERP sign conventions per the oracle
  // (backend/app/services/ingestion/cleaners.py clean_currency_column, 13-62).
  it("treats a CR suffix as negative (500 CR -> -500.00)", () => {
    const text = `account,amount,date\n1000,"500 CR",2024-06-15\n`;
    const res = parseGlCsv({
      text,
      filename: "regression.csv",
      propertyId: "p1",
      sourceOverride: "generic",
      columnMapping: {
        account_code: "account",
        amount: "amount",
        transaction_date: "date",
      },
    });
    expect(res.entries[0]?.amount).toBe("-500.00");
  });

  it("treats a trailing minus as negative (500.00- -> -500.00)", () => {
    expect(parseAmount("500.00-").entries[0]?.amount).toBe("-500.00");
  });

  it("treats a DR suffix as positive (500 DR -> 500.00)", () => {
    const text = `account,amount,date\n1000,"500 DR",2024-06-15\n`;
    const res = parseGlCsv({
      text,
      filename: "regression.csv",
      propertyId: "p1",
      sourceOverride: "generic",
      columnMapping: {
        account_code: "account",
        amount: "amount",
        transaction_date: "date",
      },
    });
    expect(res.entries[0]?.amount).toBe("500.00");
  });

  it("treats a leading minus after a currency symbol as negative ($-1,234.56 -> -1234.56)", () => {
    const text = `account,amount,date\n1000,"$-1,234.56",2024-06-15\n`;
    const res = parseGlCsv({
      text,
      filename: "regression.csv",
      propertyId: "p1",
      sourceOverride: "generic",
      columnMapping: {
        account_code: "account",
        amount: "amount",
        transaction_date: "date",
      },
    });
    expect(res.entries[0]?.amount).toBe("-1234.56");
  });

  it("treats parentheses combined with a CR suffix as negative ((1,234.56) CR -> -1234.56)", () => {
    // Both indicators are negative, so the value is unambiguously -1234.56. The
    // old fixed-order strip only matched parens that wrapped the WHOLE string, so
    // the trailing " CR" defeated paren detection and the leftover ")" failed the
    // numeric contract -> the row was silently dropped (a CAM cost vanishing).
    // Oracle clean_currency_column returns -1234.56 (is_cr_negative mask).
    const text = `account,amount,date\n1000,"(1,234.56) CR",2024-06-15\n`;
    const res = parseGlCsv({
      text,
      filename: "regression.csv",
      propertyId: "p1",
      sourceOverride: "generic",
      columnMapping: {
        account_code: "account",
        amount: "amount",
        transaction_date: "date",
      },
    });
    expect(res.entries[0]?.amount).toBe("-1234.56");
  });

  it("treats a CR suffix that sits INSIDE the parentheses as negative ((500 CR) -> -500.00)", () => {
    // Parentheses wrap the whole value (is_paren_negative), so the value is
    // negative; the interior " CR" must be stripped, not left to fail the gate.
    const text = `account,amount,date\n1000,"(500 CR)",2024-06-15\n`;
    const res = parseGlCsv({
      text,
      filename: "regression.csv",
      propertyId: "p1",
      sourceOverride: "generic",
      columnMapping: {
        account_code: "account",
        amount: "amount",
        transaction_date: "date",
      },
    });
    expect(res.entries[0]?.amount).toBe("-500.00");
  });

  it("treats a currency symbol inside parentheses as negative (($500.00) -> -500.00)", () => {
    expect(parseAmount("($500.00)").entries[0]?.amount).toBe("-500.00");
  });

  it("drops exotic numeric forms the old float path silently accepted", () => {
    // The new parser enforces the same /^-?\d+(\.\d+)?$/ contract as Money.parse,
    // so values the old Number() path coerced (1e3 -> 1000, +5, .5) now drop the
    // row instead of inventing a value. Dropping is safer than guessing.
    expect(parseAmount("1e3").entries.length).toBe(0);
    expect(parseAmount("+5").entries.length).toBe(0);
    expect(parseAmount(".5").entries.length).toBe(0);
  });
});

describe("GL CSV date normalization", () => {
  it("parses an unambiguous DD/MM date instead of dropping the row", () => {
    // Day 13 cannot be a month, so 13/01/2024 is unambiguously 13 Jan 2024.
    const res = parseDateCell("13/01/2024");
    expect(res.entries.length).toBe(1);
    expect(res.entries[0]?.transaction_date).toBe("2024-01-13");
  });

  it("keeps the US MM/DD default for a genuinely ambiguous date", () => {
    // Both fields <= 12: no signal to override the US assumption.
    expect(parseDateCell("06/12/2024").entries[0]?.transaction_date).toBe(
      "2024-06-12",
    );
  });

  it("still parses ISO dates", () => {
    expect(parseDateCell("2024-03-09").entries[0]?.transaction_date).toBe(
      "2024-03-09",
    );
  });
});

describe("GL CSV Unicode minus sign normalization", () => {
  it("parses a leading Unicode minus (U+2212) as negative, not a dropped row", () => {
    // "−500.00" — a real ERP/Excel locale export can emit the minus glyph
    // instead of ASCII "-". Before canonicalization this missed every sign
    // branch and failed the numeric contract, dropping the expense reversal.
    expect(parseAmount("−500.00").entries[0]?.amount).toBe("-500.00");
  });

  it("treats a Unicode-minus credit the same as an ASCII-minus credit", () => {
    const text = `account,amount,date\n1000,"−1,234.56",2024-06-15\n`;
    const res = parseGlCsv({
      text,
      filename: "regression.csv",
      propertyId: "p1",
      sourceOverride: "generic",
      columnMapping: {
        account_code: "account",
        amount: "amount",
        transaction_date: "date",
      },
    });
    expect(res.entries[0]?.amount).toBe("-1234.56");
  });

  it("keeps a plain positive amount positive (no spurious negation)", () => {
    expect(parseAmount("500.00").entries[0]?.amount).toBe("500.00");
  });
});

// Pins the Yardi/MRI built-in header maps for a BARE "Description"/"Desc" column
// to the Python oracle (yardi.py:333-334, mri.py:361-362), which both rename it
// to account_description. A bare description column in a GL export holds the GL
// ACCOUNT name (e.g. "Landscaping"), not a per-line memo. The TS maps previously
// routed it to the `description` memo field, so account_description came through
// blank and the account name was hidden from audit / GL-narrative reports while
// landing in the wrong column. These cases run the built-in source maps (no
// explicit columnMapping) so the header lookup itself is exercised.
describe("GL CSV bare Description header maps to account_description (oracle parity)", () => {
  it("routes a Yardi bare Description column to account_description, not the memo", () => {
    const text = `Account,Description,Amount,Date\n6100,Landscaping,500.00,2024-06-15\n`;
    const res = parseGlCsv({
      text,
      filename: "yardi-gl.csv",
      propertyId: "p1",
      sourceOverride: "yardi",
    });
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]?.account_description).toBe("Landscaping");
    expect(res.entries[0]?.description).toBeNull();
  });

  it("routes a Yardi bare Desc column to account_description", () => {
    const text = `Account,Desc,Amount,Date\n6100,Janitorial,500.00,2024-06-15\n`;
    const res = parseGlCsv({
      text,
      filename: "yardi-gl.csv",
      propertyId: "p1",
      sourceOverride: "yardi",
    });
    expect(res.entries[0]?.account_description).toBe("Janitorial");
    expect(res.entries[0]?.description).toBeNull();
  });

  it("routes an MRI bare Description column to account_description", () => {
    const text = `Account,Description,Amount,Date\n6100,Security,500.00,2024-06-15\n`;
    const res = parseGlCsv({
      text,
      filename: "mri-gl.csv",
      propertyId: "p1",
      sourceOverride: "mri",
    });
    expect(res.entries[0]?.account_description).toBe("Security");
    expect(res.entries[0]?.description).toBeNull();
  });

  it("keeps the bare Description as a memo when an explicit Account Description column is present", () => {
    // Negative branch of the promotion guard: with BOTH columns, the explicit
    // "Account Description" populates account_description, so the bare
    // "Description" is a genuine per-line memo and must NOT be promoted/clobbered.
    const text = `Account,Account Description,Description,Amount,Date\n6100,Landscaping,Spring cleanup,500.00,2024-06-15\n`;
    const res = parseGlCsv({
      text,
      filename: "yardi-gl.csv",
      propertyId: "p1",
      sourceOverride: "yardi",
    });
    expect(res.entries[0]?.account_description).toBe("Landscaping");
    expect(res.entries[0]?.description).toBe("Spring cleanup");
  });
});
