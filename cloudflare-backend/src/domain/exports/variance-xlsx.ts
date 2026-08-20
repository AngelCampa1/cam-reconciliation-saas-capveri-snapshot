/**
 * Variance report XLSX builder — EP-13 domain module.
 *
 * Generates a single-sheet workbook matching the openpyxl layout from
 * FastAPI _generate_variance_excel (export.py ~351-436):
 *
 *   A1  — "Statement Check Report - {prop_name}"  (bold, size 14)
 *   A2  — "{current_year} vs {prior_year} | Threshold: {threshold_percent}%"
 *   Row 4 — header row: Period | Total Recovery | Variance
 *             fill #2C5282, bold white font
 *   Row 5 — current_year | current_total | (empty)
 *   Row 6 — prior_year   | prior_total   | variance_pct/100
 *   Row 8 — "Generated: YYYY-MM-DD HH:MM:SS UTC"  (header_row + 4 = 4+4 = 8)
 *
 * Column widths: A=16, B=20, C=14.
 * Number formats: B → "$#,##0.00", C → "0.00%" (stored as fraction).
 *
 * Money value boundary note: Decimal.js is used throughout; the value is
 * converted to a JS number only at the cell-write boundary via
 * Number(dec.toFixed(2)) so the cell holds a true numeric value (matching
 * FastAPI's float(total) call), not a string.  The same convention applies to
 * variance_pct: stored as float(variance_pct)/100.
 *
 * ILLEGAL_CHARACTERS_RE mirrors openpyxl's control-char strip (FastAPI
 * export.py ~388): strips \x00-\x08, \x0B, \x0C, \x0E-\x1F.
 */

import ExcelJS from "exceljs";
import Decimal from "decimal.js";
import { buildStatementCheckNotes, computeVariancePct } from "./variance-pdf";
import type { SnapshotSummary } from "./repository";

// ── Types ─────────────────────────────────────────────────────────────────────

export type VarianceXlsxInput = {
  snapshotsCurrent: SnapshotSummary[];
  snapshotsPrior: SnapshotSummary[];
  currentYear: number;
  priorYear: number;
  thresholdPercent: number;
  propertyName: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex -- intentionally mirrors openpyxl ILLEGAL_CHARACTERS_RE
const ILLEGAL_CHARACTERS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/gu;

const HEADER_FILL_HEX = "FF2C5282"; // ARGB — ExcelJS requires ARGB
const HEADER_ROW = 4;
const GENERATED_ROW = HEADER_ROW + 4; // = 8, matching FastAPI header_row+4

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Build a variance XLSX workbook and return raw bytes.
 *
 * Pure function — no I/O, fully testable without HTTP context.
 * EP-17 (historical XLSX) can import the same ExcelJS utilities here.
 */
export async function buildVarianceXlsx(
  input: VarianceXlsxInput,
): Promise<Uint8Array> {
  const {
    snapshotsCurrent,
    snapshotsPrior,
    currentYear,
    priorYear,
    thresholdPercent,
    propertyName,
  } = input;

  const currentTotal = sumRecovery(snapshotsCurrent);
  const priorTotal = sumRecovery(snapshotsPrior);
  const variancePct = computeVariancePct(currentTotal, priorTotal);
  const { scopeNote, findingNote } = buildStatementCheckNotes({
    currentYear,
    priorYear,
    priorTotal,
    hasCurrentSnapshots: snapshotsCurrent.length > 0,
    hasPriorSnapshots: snapshotsPrior.length > 0,
    variancePct,
  });

  // Strip XML-illegal control chars (mirrors openpyxl ILLEGAL_CHARACTERS_RE).
  // No formula-trigger neutralization needed: propName is only ever interpolated
  // mid-string into A1 (`Statement Check Report - ${propName}`), so the cell
  // never starts with a user-controlled character — not a formula-injection sink.
  const propName = (propertyName || "Property").replace(
    ILLEGAL_CHARACTERS_RE,
    "",
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Variance");

  // ── A1: title ───────────────────────────────────────────────────────────────
  ws.getCell("A1").value = `Statement Check Report - ${propName}`;
  ws.getCell("A1").font = { bold: true, size: 14 };

  // ── A2: subtitle ────────────────────────────────────────────────────────────
  ws.getCell("A2").value =
    `${currentYear} vs ${priorYear} | Threshold: ${thresholdPercent}%`;

  ws.getCell("A3").value = `${scopeNote} ${findingNote}`;

  // ── Row 4: header ────────────────────────────────────────────────────────────
  const headerLabels = ["Period", "Total Recovery", "Variance"];
  headerLabels.forEach((label, i) => {
    const col = i + 1; // 1-based
    const cell = ws.getCell(HEADER_ROW, col);
    cell.value = label;
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: HEADER_FILL_HEX },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });

  // ── Row 5: current year (no variance cell) ───────────────────────────────────
  ws.getCell(HEADER_ROW + 1, 1).value = String(currentYear);

  // Money: convert Decimal → JS number only at write boundary
  const currentCell = ws.getCell(HEADER_ROW + 1, 2);
  currentCell.value = Number(currentTotal.toFixed(2));
  currentCell.numFmt = "$#,##0.00";
  currentCell.alignment = { horizontal: "right" };

  // ── Row 6: prior year + variance ─────────────────────────────────────────────
  ws.getCell(HEADER_ROW + 2, 1).value = String(priorYear);

  const priorCell = ws.getCell(HEADER_ROW + 2, 2);
  priorCell.value = Number(priorTotal.toFixed(2));
  priorCell.numFmt = "$#,##0.00";
  priorCell.alignment = { horizontal: "right" };

  // Variance stored as fraction (e.g. 5.00% → 0.05), format "0.00%"
  // Mirrors FastAPI: float(variance_pct)/100
  const varianceCell = ws.getCell(HEADER_ROW + 2, 3);
  varianceCell.value = Number(variancePct.toFixed(10)) / 100;
  varianceCell.numFmt = "0.00%";
  varianceCell.alignment = { horizontal: "right" };

  // ── Column widths ────────────────────────────────────────────────────────────
  ws.getColumn(1).width = 16;
  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 14;

  // ── Row 8: timestamp ─────────────────────────────────────────────────────────
  // FastAPI: datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")
  const now = new Date();
  const timestamp = formatUtcTimestamp(now);
  ws.getCell(GENERATED_ROW, 1).value = `Generated: ${timestamp}`;

  // ── Serialize ────────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  // ExcelJS returns Buffer (Node) or ArrayBuffer (Worker) — normalize to Uint8Array
  return new Uint8Array(buffer as ArrayBuffer);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sumRecovery(snapshots: SnapshotSummary[]): Decimal {
  return snapshots.reduce(
    (acc, s) => acc.plus(new Decimal(s.total_recovery)),
    new Decimal(0),
  );
}

/**
 * Format a Date as "YYYY-MM-DD HH:MM:SS UTC" — matching FastAPI's
 * datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC").
 */
export function formatUtcTimestamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
}
