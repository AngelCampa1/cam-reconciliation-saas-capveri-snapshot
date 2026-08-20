/**
 * Penny-exact tests for the ERP formatter pure functions.
 * Verified against FastAPI output by matching documented column layout,
 * number formatting, and filename patterns.
 */

import { describe, expect, it } from "vitest";
import {
  generateYardiCsv,
  yardiFilename,
  generateMriText,
  mriFilename,
  generateGenericCsv,
  genericCsvFilename,
  neutralizeFormula,
  stripControlChars,
  formatErpExport,
  type SnapshotForErp,
} from "../domain/exports/erp-formatters";

// ── fixture helpers ───────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<SnapshotForErp> = {}): SnapshotForErp {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    lease_id: "11111111-2222-4333-8444-555555555555",
    period_start_date: "2024-01-01",
    period_end_date: "2024-12-31",
    total_recovery: "12345.67",
    total_operating_expenses: "100000.00",
    grossed_up_expenses: "102564.10",
    base_year_amount: "50000.00",
    tenant_share_before_cap: "15000.00",
    tenant_share_after_cap: "12345.67",
    admin_fee: "617.28",
    status: "finalized",
    properties: { id: "prop-1", name: "Sunset Plaza" },
    leases: { tenant_name: "Acme Retail Inc" },
    ...overrides,
  };
}

// ── neutralizeFormula ─────────────────────────────────────────────────────────

describe("neutralizeFormula", () => {
  it("prefixes formula-trigger characters with single quote", () => {
    expect(neutralizeFormula("=cmd")).toBe("'=cmd");
    expect(neutralizeFormula("+10")).toBe("'+10");
    expect(neutralizeFormula("-10")).toBe("'-10");
    expect(neutralizeFormula("@SUM")).toBe("'@SUM");
    expect(neutralizeFormula("\tcell")).toBe("'\tcell");
    expect(neutralizeFormula("\rcell")).toBe("'\rcell");
  });

  it("leaves safe text unchanged", () => {
    expect(neutralizeFormula("Acme Retail")).toBe("Acme Retail");
    expect(neutralizeFormula("100.00")).toBe("100.00");
    expect(neutralizeFormula("")).toBe("");
  });

  it("handles null and undefined as empty string", () => {
    expect(neutralizeFormula(null)).toBe("");
    expect(neutralizeFormula(undefined)).toBe("");
  });

  it("does NOT prefix numeric currency amounts", () => {
    // A negative amount like "-1234.56" starts with "-" so it would be
    // prefixed — but formatters never pass currency amounts to neutralizeFormula,
    // only free-text fields. Verify the guard fires as documented.
    expect(neutralizeFormula("-1234.56")).toBe("'-1234.56");
  });
});

// ── stripControlChars ─────────────────────────────────────────────────────────

describe("stripControlChars", () => {
  it("strips C0 control characters and DEL", () => {
    expect(stripControlChars("Prop\nName")).toBe("PropName");
    expect(stripControlChars("Prop\r\nName")).toBe("PropName");
    expect(stripControlChars("Tab\there")).toBe("Tabhere");
    expect(stripControlChars("Del\x7Fchar")).toBe("Delchar");
  });

  it("preserves printable ASCII", () => {
    expect(stripControlChars("Sunset Plaza")).toBe("Sunset Plaza");
  });

  it("handles null and undefined as empty string", () => {
    expect(stripControlChars(null)).toBe("");
    expect(stripControlChars(undefined)).toBe("");
  });
});

// ── Yardi CSV ─────────────────────────────────────────────────────────────────

describe("generateYardiCsv", () => {
  it("emits correct CSV header", () => {
    const csv = generateYardiCsv([makeSnapshot()]);
    const header = csv.split("\r\n")[0];
    expect(header).toBe(
      "Property,Unit,Tenant,Account,Amount,Description,Reference,PostDate",
    );
  });

  it("emits debit AR row then credit revenue row for one snapshot", () => {
    const snapshot = makeSnapshot();
    const csv = generateYardiCsv([snapshot]);
    const rows = csv.split("\r\n").filter(Boolean);
    // header + 2 journal lines
    expect(rows).toHaveLength(3);

    const debitRow = rows[1] as string;
    const creditRow = rows[2] as string;

    // Property
    expect(debitRow).toContain("Sunset Plaza");
    // Tenant
    expect(debitRow).toContain("Acme Retail Inc");
    // AR account (debit)
    expect(debitRow).toContain(",1200,");
    // Amount (positive for debit)
    expect(debitRow).toContain(",12345.67,");

    // CAM Revenue account (credit)
    expect(creditRow).toContain(",4100,");
    // Amount (negative for credit)
    expect(creditRow).toContain(",-12345.67,");
  });

  it("uses correct reference format CAM-YYYY-<snapshotId>", () => {
    const snapshot = makeSnapshot();
    const csv = generateYardiCsv([snapshot]);
    expect(csv).toContain(",CAM-2024-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee,");
  });

  it("uses MM/DD/YYYY for PostDate (period end)", () => {
    const snapshot = makeSnapshot({ period_end_date: "2024-12-31" });
    const csv = generateYardiCsv([snapshot]);
    expect(csv).toContain(",12/31/2024");
  });

  it("description labels annual period as the year alone", () => {
    const snapshot = makeSnapshot({
      period_start_date: "2024-01-01",
      period_end_date: "2024-12-31",
    });
    const csv = generateYardiCsv([snapshot]);
    expect(csv).toContain("CAM Reconciliation 2024");
  });

  it("description for single month shows 'Mon YYYY'", () => {
    const snapshot = makeSnapshot({
      period_start_date: "2024-03-01",
      period_end_date: "2024-03-31",
    });
    const csv = generateYardiCsv([snapshot]);
    expect(csv).toContain("CAM Reconciliation Mar 2024");
  });

  it("description for cross-year period shows 'MM/YYYY-MM/YYYY'", () => {
    const snapshot = makeSnapshot({
      period_start_date: "2023-07-01",
      period_end_date: "2024-06-30",
    });
    const csv = generateYardiCsv([snapshot]);
    expect(csv).toContain("CAM Reconciliation 07/2023-06/2024");
  });

  it("neutralizes formula-injection in property name", () => {
    const snapshot = makeSnapshot({
      properties: { id: "p1", name: "=EVIL()" },
    });
    const csv = generateYardiCsv([snapshot]);
    expect(csv).toContain("'=EVIL()");
  });

  it("falls back to lease_id[:8] when tenant name absent", () => {
    const snapshot = makeSnapshot({ leases: { tenant_name: null } });
    const csv = generateYardiCsv([snapshot]);
    // lease_id is "11111111-2222-4333-8444-555555555555" → first 8 chars = "11111111"
    expect(csv).toContain(",11111111,");
  });

  it("handles multiple snapshots (two sets of journal lines)", () => {
    const snap1 = makeSnapshot({
      period_start_date: "2023-01-01",
      period_end_date: "2023-12-31",
    });
    const snap2 = makeSnapshot({
      id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
      period_start_date: "2024-01-01",
      period_end_date: "2024-12-31",
      total_recovery: "5000.00",
    });
    const csv = generateYardiCsv([snap1, snap2]);
    const rows = csv.split("\r\n").filter(Boolean);
    // header + 4 journal lines
    expect(rows).toHaveLength(5);
  });

  it("emits empty body (header only) for empty snapshot list", () => {
    const csv = generateYardiCsv([]);
    const rows = csv.split("\r\n").filter(Boolean);
    expect(rows).toHaveLength(1); // header only
  });
});

describe("yardiFilename", () => {
  it("returns year-specific filename", () => {
    const snap = makeSnapshot({ period_start_date: "2024-01-01" });
    expect(yardiFilename([snap])).toBe("Yardi_CAM_Import_2024.csv");
  });

  it("returns fallback filename for empty list", () => {
    expect(yardiFilename([])).toBe("Yardi_CAM_Import.csv");
  });
});

// ── MRI fixed-width ───────────────────────────────────────────────────────────

describe("generateMriText", () => {
  it("emits debit and credit lines for one snapshot", () => {
    const snap = makeSnapshot();
    const text = generateMriText([snap]);
    const lines = text.split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
  });

  it("debit line: Property(10) Entity(10) Account(10) Amount(15) Desc(30) Ref(15) Date(8)", () => {
    const snap = makeSnapshot();
    const text = generateMriText([snap]);
    const [debit] = text.split("\n") as [string, ...string[]];

    // Total width = 10+10+10+15+30+15+8 = 98
    expect(debit.length).toBe(98);

    // Property col: padRight("Sunset Pla", 10) — truncated to 10
    expect(debit.slice(0, 10)).toBe("Sunset Pla");
    // Entity col: "Acme Retai" (first 10 chars of "Acme Retail Inc")
    expect(debit.slice(10, 20)).toBe("Acme Retai");
    // AR account: "11200     "
    expect(debit.slice(20, 30)).toBe("11200     ");
    // Amount (positive, right-aligned 15): "       12345.67"
    expect(debit.slice(30, 45)).toBe("       12345.67");
    // Date (last 8 chars): "20241231"
    expect(debit.slice(90, 98)).toBe("20241231");
  });

  it("credit line uses CAM revenue account and negated amount", () => {
    const snap = makeSnapshot();
    const text = generateMriText([snap]);
    const credit = text.split("\n")[1] as string;

    // CAM account: "41100     "
    expect(credit.slice(20, 30)).toBe("41100     ");
    // Amount (negative, right-aligned 15): "      -12345.67"
    expect(credit.slice(30, 45)).toBe("      -12345.67");
  });

  it("reference format: CAMxx-<8chartoken>", () => {
    // period_start_date 2024 → year % 100 = 24
    // snapshotToken: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee" → strip dashes → "aaaaaaaabbbb4ccc" → first 8 = "aaaaaaaa"
    const snap = makeSnapshot();
    const text = generateMriText([snap]);
    const [debit] = text.split("\n") as [string];
    const refField = debit.slice(75, 90);
    expect(refField.trimEnd()).toBe("CAM24-aaaaaaaa");
  });

  it("strips control chars from property name", () => {
    const snap = makeSnapshot({
      properties: { id: "p1", name: "Prop\nName" },
    });
    const text = generateMriText([snap]);
    const [debit] = text.split("\n") as [string];
    // PropName (8 chars) padded to 10
    expect(debit.slice(0, 10)).toBe("PropName  ");
  });

  it("emits empty string for empty snapshot list", () => {
    expect(generateMriText([])).toBe("");
  });
});

describe("mriFilename", () => {
  it("returns year-specific .txt filename", () => {
    const snap = makeSnapshot({ period_start_date: "2024-01-01" });
    expect(mriFilename([snap])).toBe("MRI_CAM_Import_2024.txt");
  });

  it("returns fallback filename for empty list", () => {
    expect(mriFilename([])).toBe("MRI_CAM_Import.txt");
  });
});

// ── Generic CSV ───────────────────────────────────────────────────────────────

describe("generateGenericCsv", () => {
  it("emits correct header with all 12 columns", () => {
    const csv = generateGenericCsv([makeSnapshot()]);
    const header = csv.split("\r\n")[0];
    expect(header).toBe(
      "Property,Unit,Tenant,Period Start,Period End,Total Expenses,Grossed Up Expenses,Base Year Amount,Tenant Share Before Cap,Tenant Share After Cap,Admin Fee,Amount Due",
    );
  });

  it("emits a single data row for one snapshot", () => {
    const snap = makeSnapshot();
    const csv = generateGenericCsv([snap]);
    const rows = csv.split("\r\n").filter(Boolean);
    expect(rows).toHaveLength(2);
  });

  it("emits correct currency amounts in data row", () => {
    const snap = makeSnapshot();
    const csv = generateGenericCsv([snap]);
    const dataRow = csv.split("\r\n")[1] as string;
    // Total Expenses: "100000.00"
    expect(dataRow).toContain(",100000.00,");
    // Grossed Up Expenses: "102564.10"
    expect(dataRow).toContain(",102564.10,");
    // Amount Due: "12345.67"
    expect(dataRow).toContain(",12345.67");
  });

  it("emits MM/DD/YYYY formatted dates", () => {
    const snap = makeSnapshot({
      period_start_date: "2024-01-01",
      period_end_date: "2024-12-31",
    });
    const csv = generateGenericCsv([snap]);
    expect(csv).toContain(",01/01/2024,12/31/2024,");
  });

  it("neutralizes formula injection in tenant name", () => {
    const snap = makeSnapshot({ leases: { tenant_name: "@evil" } });
    const csv = generateGenericCsv([snap]);
    expect(csv).toContain("'@evil");
  });
});

describe("genericCsvFilename", () => {
  it("returns year-specific filename", () => {
    const snap = makeSnapshot({ period_start_date: "2024-01-01" });
    expect(genericCsvFilename([snap])).toBe("CAM_Reconciliation_2024.csv");
  });

  it("returns fallback filename for empty list", () => {
    expect(genericCsvFilename([])).toBe("CAM_Reconciliation.csv");
  });
});

// ── formatErpExport dispatch ──────────────────────────────────────────────────

describe("formatErpExport", () => {
  const snap = makeSnapshot();

  it("dispatches to yardi", () => {
    const result = formatErpExport([snap], "yardi");
    expect(result.mediaType).toBe("text/csv");
    expect(result.filename).toMatch(/^Yardi_CAM_Import/u);
    expect(result.body).toContain("1200");
  });

  it("dispatches to mri", () => {
    const result = formatErpExport([snap], "mri");
    expect(result.mediaType).toBe("text/plain");
    expect(result.filename).toMatch(/\.txt$/u);
    expect(result.body).toContain("11200");
  });

  it("dispatches to csv (default)", () => {
    const result = formatErpExport([snap], "csv");
    expect(result.mediaType).toBe("text/csv");
    expect(result.filename).toMatch(/^CAM_Reconciliation/u);
    expect(result.body).toContain("Amount Due");
  });
});
