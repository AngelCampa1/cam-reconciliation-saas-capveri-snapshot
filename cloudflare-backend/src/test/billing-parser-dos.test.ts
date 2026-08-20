/**
 * Regression: XLSX import DoS guards (CWE-400) in parseBillingXlsx.
 *
 * The upload route caps the *compressed* file at 25MB, but a malicious workbook
 * can still declare an enormous sparse grid. A lone far-right cell pushes the
 * spanned column count toward 16,384, and the dense per-row read loop is then
 * O(rows × columnCount) — enough to exhaust the Worker CPU budget. These tests
 * pin the two bounds: a tall sheet is rejected, and a stray far-right cell does
 * not blow up the read width or corrupt the parse of the real leading columns.
 */

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseBillingXlsx } from "../domain/actual-billed/billing-parser";

async function workbookBytes(
  build: (sheet: ExcelJS.Worksheet) => void,
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Billing");
  build(sheet);
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

describe("parseBillingXlsx DoS guards", () => {
  it("parses normally when a lone far-right cell inflates the spanned column count", async () => {
    const bytes = await workbookBytes((sheet) => {
      sheet.addRow(["Tenant", "Billed Amount"]);
      sheet.addRow(["Acme Corp", "1000.00"]);
      sheet.addRow(["Beta LLC", "2500.00"]);
      // Stray cell at column 16384 (XLSX max) — without the clamp this forces
      // every row to be read across all 16,384 columns.
      sheet.getCell(2, 16384).value = "x";
    });

    const result = await parseBillingXlsx({
      bytes,
      filename: "billing.xlsx",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.rowCount).toBe(2);
      expect(result.data.map((r) => r.tenantName)).toEqual([
        "Acme Corp",
        "Beta LLC",
      ]);
      expect(result.totalBilled).toBe("3500");
    }
  });

  it("rejects a workbook with more populated rows than the row cap", async () => {
    // The read loop iterates one step per *populated* row (actualRowCount), so
    // the guard only fires on genuinely tall sheets. Header + 100_001 data rows
    // = 100_002 populated rows, one over the 100_000 cap.
    const dataRows: string[][] = [["Tenant", "Billed Amount"]];
    for (let i = 0; i < 100_001; i += 1) {
      dataRows.push([`Tenant ${i}`, "100.00"]);
    }
    const bytes = await workbookBytes((sheet) => {
      sheet.addRows(dataRows);
    });

    const result = await parseBillingXlsx({
      bytes,
      filename: "billing.xlsx",
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes("too many rows"))).toBe(true);
  });

  it("still parses a sheet right at a benign size", async () => {
    const bytes = await workbookBytes((sheet) => {
      sheet.addRow(["Tenant", "Suite", "Billed Amount"]);
      sheet.addRow(["Acme Corp", "100", "1000.00"]);
    });

    const result = await parseBillingXlsx({
      bytes,
      filename: "billing.xlsx",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.rowCount).toBe(1);
      expect(result.data[0]).toMatchObject({
        tenantName: "Acme Corp",
        billedAmount: "1000",
        suite: "100",
      });
    }
  });
});
