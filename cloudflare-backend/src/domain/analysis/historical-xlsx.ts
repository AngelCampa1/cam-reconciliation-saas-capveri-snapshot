/**
 * Historical analysis XLSX builder — EP-17 domain module.
 *
 * Generates a two-sheet workbook matching the openpyxl layout from
 * FastAPI export_to_excel (excel_export.py):
 *
 *   Sheet 1: "Year-over-Year Comparison"
 *     Row 1 — property name
 *     Row 2 — header: Expense Pool | <year1> | ... | Variance %
 *     Rows 3..N — pool rows with dollar amounts + variance %
 *     Row N+1 — totals row (bold)
 *     Row N+3 — disclaimer
 *
 *   Sheet 2: "Detected Anomalies"
 *     Row 1 — header: Severity | Expense Pool | Type | Current | Expected | Variance % | Explanation
 *     Rows 2..M — one anomaly per row (or "no anomalies" merged message)
 *
 * Color fills match Python openpyxl exactly:
 *   header fill: E0E7FF (blue-ish)  header font: 1E3A8A (dark blue)
 *   high variance (>15%): FFCCCC    medium (5-15%): FFFFCC
 *   anomaly: CRITICAL=FEE2E2/991B1B  WARNING=FEF3C7/92400E  INFO=DBEAFE/1E3A8A
 *
 * Number formats: "$#,##0" for dollar amounts, "0.0%" for variance %.
 * Column widths: 15 for all YoY cols; specific widths for Anomalies.
 *
 * Money boundary: Decimal.js values are converted to JS numbers only at the
 * ExcelJS cell-write boundary via Number(dec.toFixed(2)). Variance % stored
 * as fraction (e.g. 12.5% → 0.125), matching openpyxl's / 100 pattern.
 */

import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import { neutralizeFormula } from "../exports/erp-formatters";
import type {
  AnomalySeverity,
  AnomalyType,
  DetectedAnomaly,
  YearOverYearComparison,
} from "./repository";

// ── Constants ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex -- intentionally mirrors openpyxl ILLEGAL_CHARACTERS_RE
const ILLEGAL_CHARACTERS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/gu;

const HEADER_FILL = "FFE0E7FF"; // ARGB
const HEADER_FONT_COLOR = "FF1E3A8A"; // ARGB

// ── Public API ────────────────────────────────────────────────────────────────

export type HistoricalXlsxInput = {
  propertyId: string;
  yoy: YearOverYearComparison;
  anomalies: DetectedAnomaly[];
};

/**
 * Build a historical analysis XLSX workbook and return raw bytes.
 * Pure function — no I/O, fully testable without HTTP context.
 */
export async function buildHistoricalXlsx(
  input: HistoricalXlsxInput,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();

  createYoySheet(wb, input.yoy);
  createAnomaliesSheet(wb, input.anomalies);

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer); // ExcelJS types writeBuffer() as its own Buffer; at runtime it is an ArrayBuffer.
}

// ── YoY sheet ─────────────────────────────────────────────────────────────────

function createYoySheet(
  wb: ExcelJS.Workbook,
  yoy: YearOverYearComparison,
): void {
  const ws = wb.addWorksheet("Year-over-Year Comparison");
  const years = yoy.years;

  const propertyCell = ws.getCell(1, 1);
  propertyCell.value = safeText(`Property: ${yoy.property_name || "Property"}`);
  propertyCell.font = { bold: true };
  ws.mergeCells(1, 1, 1, years.length + 2);

  // ── Header row ─────────────────────────────────────────────────────────────
  const headers = ["Expense Pool", ...years.map(String), "Variance %"];
  headers.forEach((header, i) => {
    const cell = ws.getCell(2, i + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  // ── Data rows ───────────────────────────────────────────────────────────────
  yoy.pool_comparisons.forEach((pool, rowOffset) => {
    const row = rowOffset + 3;

    // Pool name
    ws.getCell(row, 1).value = safeText(pool.pool_name);

    // Amounts per year
    years.forEach((year, colOffset) => {
      const amountStr = pool.amounts[String(year)];
      const amount =
        amountStr !== null && amountStr !== undefined
          ? Number(new Decimal(amountStr).toFixed(2))
          : 0;
      const cell = ws.getCell(row, colOffset + 2);
      cell.value = amount;
      cell.numFmt = "$#,##0";
      cell.alignment = { horizontal: "right" };
    });

    // Variance %
    const variancePct =
      pool.variance_percent !== null
        ? new Decimal(pool.variance_percent)
        : new Decimal(0);
    const varianceColIndex = years.length + 2;
    const varianceCell = ws.getCell(row, varianceColIndex);
    // Store as fraction: Python does variance / 100 before writing
    varianceCell.value = Number(variancePct.div(100).toFixed(10));
    varianceCell.numFmt = "0.0%";
    varianceCell.alignment = { horizontal: "right" };

    // Color based on variance magnitude
    const absVariance = variancePct.abs().toNumber();
    if (absVariance > 15) {
      varianceCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFCCCC" },
      };
    } else if (absVariance > 5) {
      varianceCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFFFCC" },
      };
    }
  });

  // ── Totals row ──────────────────────────────────────────────────────────────
  const totalsRow = yoy.pool_comparisons.length + 3;
  const totalCell = ws.getCell(totalsRow, 1);
  totalCell.value = "Total";
  totalCell.font = { bold: true };

  years.forEach((year, colOffset) => {
    const totalStr = yoy.total_amounts[String(year)];
    const total =
      totalStr !== undefined ? Number(new Decimal(totalStr).toFixed(2)) : 0;
    const cell = ws.getCell(totalsRow, colOffset + 2);
    cell.value = total;
    cell.numFmt = "$#,##0";
    cell.font = { bold: true };
    cell.alignment = { horizontal: "right" };
  });

  // Total variance %
  if (years.length >= 2) {
    const firstTotal = new Decimal(yoy.total_amounts[String(years[0])] ?? "0");
    const lastTotal = new Decimal(
      yoy.total_amounts[String(years[years.length - 1])] ?? "0",
    );
    if (firstTotal.gt(0)) {
      const totalVariancePct = lastTotal
        .minus(firstTotal)
        .div(firstTotal)
        .mul(100);
      const tvCell = ws.getCell(totalsRow, years.length + 2);
      tvCell.value = Number(totalVariancePct.div(100).toFixed(10));
      tvCell.numFmt = "0.0%";
      tvCell.font = { bold: true };
      tvCell.alignment = { horizontal: "right" };
    }
  }

  // ── Column widths ────────────────────────────────────────────────────────────
  for (let col = 1; col <= headers.length; col++) {
    ws.getColumn(col).width = 15;
  }

  // ── Disclaimer ───────────────────────────────────────────────────────────────
  const disclaimerRow = totalsRow + 2;
  const disclaimerCell = ws.getCell(disclaimerRow, 1);
  disclaimerCell.value =
    "This report is generated automatically from data you provided and " +
    "may contain errors. Review and verify all figures before relying on " +
    "them or billing any tenant. CapVeri is not responsible for errors " +
    "in outputs you did not independently verify.";
  disclaimerCell.font = { size: 8, italic: true, color: { argb: "FF6B7280" } };
  disclaimerCell.alignment = { horizontal: "left", vertical: "top" };
  ws.mergeCells(disclaimerRow, 1, disclaimerRow, headers.length);
}

// ── Anomalies sheet ───────────────────────────────────────────────────────────

function createAnomaliesSheet(
  wb: ExcelJS.Workbook,
  anomalies: DetectedAnomaly[],
): void {
  const ws = wb.addWorksheet("Detected Anomalies");

  const headers = [
    "Severity",
    "Expense Pool",
    "Type",
    "Current",
    "Expected",
    "Variance %",
    "Explanation",
  ];

  // ── Header row ─────────────────────────────────────────────────────────────
  headers.forEach((header, i) => {
    const cell = ws.getCell(1, i + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: HEADER_FONT_COLOR } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL },
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });

  if (anomalies.length === 0) {
    const msgCell = ws.getCell(2, 1);
    msgCell.value =
      "No anomalies detected. All expense patterns appear normal.";
    msgCell.alignment = { horizontal: "center" };
    ws.mergeCells(2, 1, 2, headers.length);
    return;
  }

  // ── Data rows ───────────────────────────────────────────────────────────────
  anomalies.forEach((anomaly, rowOffset) => {
    const row = rowOffset + 2;
    const severity = anomaly.severity.toUpperCase();

    // Severity cell with color
    const severityCell = ws.getCell(row, 1);
    severityCell.value = severity;
    severityCell.font = {
      bold: true,
      color: { argb: severityFontColor(anomaly.severity) },
    };
    severityCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: severityFillColor(anomaly.severity) },
    };

    // Pool name
    ws.getCell(row, 2).value = safeText(anomaly.pool_name);

    // Type
    const anomalyTypeLabel = formatAnomalyType(anomaly.anomaly_type);
    ws.getCell(row, 3).value = safeText(anomalyTypeLabel);

    // Current value
    const currentCell = ws.getCell(row, 4);
    currentCell.value = Number(new Decimal(anomaly.current_value).toFixed(2));
    currentCell.numFmt = "$#,##0";

    // Expected value
    const expectedCell = ws.getCell(row, 5);
    expectedCell.value = Number(new Decimal(anomaly.expected_value).toFixed(2));
    expectedCell.numFmt = "$#,##0";

    // Variance %: stored as fraction, format "0.0%"
    const varianceCell = ws.getCell(row, 6);
    varianceCell.value = Number(
      new Decimal(anomaly.variance_percent).div(100).toFixed(10),
    );
    varianceCell.numFmt = "0.0%";

    // Explanation
    ws.getCell(row, 7).value = safeText(anomaly.explanation);
  });

  // ── Column widths ────────────────────────────────────────────────────────────
  ws.getColumn(1).width = 12; // A = Severity
  ws.getColumn(2).width = 20; // B = Pool
  ws.getColumn(3).width = 18; // C = Type
  ws.getColumn(4).width = 12; // D = Current
  ws.getColumn(5).width = 12; // E = Expected
  ws.getColumn(6).width = 12; // F = Variance %
  ws.getColumn(7).width = 50; // G = Explanation
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Normalize newlines, strip XML-illegal control chars, then neutralize
// spreadsheet formula triggers (CWE-1236). pool_name and anomaly.explanation
// are written as whole-cell values (rows in both sheets), so a leading
// `=`/`+`/`-`/`@` from imported GL/pool data would otherwise execute as a
// formula when the recipient opens the workbook. Applied to the final cell
// string, so values only interpolated mid-string (e.g. "Property: …") are
// correctly left untouched.
function safeText(value: string): string {
  const stripped = value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(ILLEGAL_CHARACTERS_RE, "");
  return neutralizeFormula(stripped);
}

function severityFillColor(severity: AnomalySeverity): string {
  switch (severity) {
    case "critical":
      return "FFFEE2E2";
    case "warning":
      return "FFFEF3C7";
    case "info":
      return "FFDBEAFE";
  }
}

function severityFontColor(severity: AnomalySeverity): string {
  switch (severity) {
    case "critical":
      return "FF991B1B";
    case "warning":
      return "FF92400E";
    case "info":
      return "FF1E3A8A";
  }
}

function formatAnomalyType(type: AnomalyType): string {
  // Python: anomaly_type.replace("_", " ").title()
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
