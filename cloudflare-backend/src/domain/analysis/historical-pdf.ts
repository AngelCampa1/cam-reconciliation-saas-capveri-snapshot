/**
 * Historical analysis PDF builder — EP-16 domain module.
 *
 * Generates a Letter-size PDF report matching the FastAPI HistoricalReportGenerator
 * output (backend/app/services/reports/historical_report.py).
 *
 * Sections (in order):
 *   1. Title "Historical Expense Analysis Report"
 *   2. Report Date: {Month DD, YYYY}
 *   3. Analysis Period: {min} - {max}
 *   4. Executive Summary (heading + bullet key_findings)
 *   5. Year-over-Year Comparison table (top 15 pools + totals row)
 *   6. Detected Anomalies section (top 10, with severity coloring)
 *   7. Fine-print footer (7pt, #6B7280)
 *
 * Money formatting: formatUsdWhole (whole-dollar, HALF_EVEN) from
 * src/domain/formatting/currency.ts.
 * Percentage formatting: HALF_EVEN via PyDecimal clone (28 sig-digits,
 * ROUND_HALF_EVEN) to match Python's Decimal.__format__ rounding.
 *
 * reportlab is NOT available; pdf-lib is used instead. Content and layout
 * are faithful to the Python source; byte-exact rendering is not required.
 */

import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import Decimal from "decimal.js";
import type { DetectedAnomaly, YearOverYearComparison } from "./repository";
import {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGIN,
  CONTENT_WIDTH,
  BLACK,
  GREY,
} from "../pdf/layout";

// ── PyDecimal clone (28 digits, ROUND_HALF_EVEN) ─────────────────────────────

const PyDecimal = Decimal.clone({
  precision: 28,
  rounding: Decimal.ROUND_HALF_EVEN,
});

// ── Colors matching Python source ─────────────────────────────────────────────

const DARK_BLUE = rgb(0.118, 0.227, 0.541); // #1e3a8a
const HEADING_BLUE = rgb(0.122, 0.251, 0.686); // #1e40af
const HEADER_BG = rgb(0.878, 0.906, 1.0); // #e0e7ff
const TOTALS_BG = rgb(0.953, 0.957, 0.965); // #f3f4f6
const GREY_TEXT = rgb(0.42, 0.447, 0.502); // #6B7280
// eslint-disable-next-line no-control-regex -- PDF-visible text should strip invalid control characters before drawing.
const PDF_CONTROL_CHARACTERS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/gu;

// Anomaly severity colors
const CRITICAL_BG = rgb(0.996, 0.886, 0.886); // #fee2e2
const CRITICAL_TEXT = rgb(0.6, 0.106, 0.106); // #991b1b
const WARNING_BG = rgb(0.996, 0.953, 0.78); // #fef3c7
const WARNING_TEXT = rgb(0.573, 0.251, 0.055); // #92400e

// ── Public API ────────────────────────────────────────────────────────────────

export type HistoricalPdfInput = {
  propertyName: string;
  sortedYears: number[];
  yoy: YearOverYearComparison;
  anomalies: DetectedAnomaly[];
};

/**
 * Build a historical analysis PDF and return the bytes.
 * Pure function — no I/O. Injectable from the route handler.
 */
export async function buildHistoricalPdf(
  input: HistoricalPdfInput,
): Promise<Uint8Array> {
  const { sortedYears, yoy, anomalies } = input;

  const pdfDoc = await PDFDocument.create();
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const state: PageState = {
    pdfDoc,
    regularFont,
    boldFont,
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
  };

  // 1 — Title
  drawText(
    state,
    "Historical Expense Analysis Report",
    MARGIN,
    state.y,
    20,
    boldFont,
    DARK_BLUE,
  );
  state.y -= 30;

  drawText(
    state,
    `Property: ${sanitizePdfText(input.propertyName || "Property")}`,
    MARGIN,
    state.y,
    11,
    boldFont,
  );
  state.y -= 16;

  // 2 — Report date (Python: datetime.now().strftime("%B %d, %Y"))
  const reportDate = formatReportDate(new Date());
  drawText(
    state,
    `Report Date: ${reportDate}`,
    MARGIN,
    state.y,
    10,
    regularFont,
  );
  state.y -= 14;

  // 3 — Analysis period
  const minYear = sortedYears[0] as number;
  const maxYear = sortedYears[sortedYears.length - 1] as number;
  drawText(
    state,
    `Analysis Period: ${minYear} - ${maxYear}`,
    MARGIN,
    state.y,
    10,
    regularFont,
  );
  state.y -= 22;

  // 4 — Executive Summary
  drawHeading(state, "Executive Summary", boldFont, HEADING_BLUE);
  const keyFindings = buildKeyFindings(yoy, anomalies, sortedYears);
  for (const finding of keyFindings) {
    ensureRoom(state, 14);
    drawText(state, `• ${finding}`, MARGIN, state.y, 10, regularFont);
    state.y -= 14;
  }
  state.y -= 10;

  // 5 — Year-over-Year Comparison table
  ensureRoom(state, 60);
  drawHeading(state, "Year-over-Year Comparison", boldFont, HEADING_BLUE);
  drawYoyTable(state, sortedYears, yoy, regularFont, boldFont);
  state.y -= 14;

  // 6 — Detected Anomalies section (only when years >= 2, which is always true here)
  ensureRoom(state, 60);
  drawHeading(state, "Detected Anomalies", boldFont, HEADING_BLUE);
  if (anomalies.length > 0) {
    drawAnomaliesTable(state, anomalies.slice(0, 10), regularFont, boldFont);
  } else {
    ensureRoom(state, 14);
    drawText(
      state,
      "No significant anomalies detected. All expense patterns appear normal.",
      MARGIN,
      state.y,
      10,
      regularFont,
    );
    state.y -= 14;
  }
  state.y -= 14;

  // 7 — Fine-print footer (7pt, #6B7280)
  ensureRoom(state, 20);
  const footer =
    "Figures are system-calculated and may contain errors. " +
    "Verify all numbers against your lease and source GL before relying on this report.";
  drawWrappedText(
    state,
    footer,
    MARGIN,
    7,
    regularFont,
    GREY_TEXT,
    CONTENT_WIDTH,
  );

  return pdfDoc.save();
}

// ── Internal state ────────────────────────────────────────────────────────────

type PageState = {
  pdfDoc: PDFDocument;
  page: PDFPage;
  regularFont: PDFFont;
  boldFont: PDFFont;
  y: number;
};

// ── Key findings (mirrors Python _build_executive_summary lines 153-214) ──────

function buildKeyFindings(
  yoy: YearOverYearComparison,
  anomalies: DetectedAnomaly[],
  sortedYears: number[],
): string[] {
  const findings: string[] = [];
  const minYear = sortedYears[0] as number;
  const maxYear = sortedYears[sortedYears.length - 1] as number;

  if (yoy.total_variance_percent !== null) {
    const vp = new PyDecimal(yoy.total_variance_percent);
    // Python: if yoy.total_variance_percent (truthy — non-zero, non-null)
    if (!vp.isZero()) {
      const direction = vp.gt(0) ? "increased" : "decreased";
      const absStr = vp
        .abs()
        .toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN)
        .toFixed(1);
      findings.push(
        `Total expenses ${direction} by ${absStr}% from ${minYear} to ${maxYear}`,
      );
    }
  }

  const criticalCount = anomalies.filter(
    (a) => a.severity === "critical",
  ).length;
  if (criticalCount > 0) {
    findings.push(
      `${criticalCount} critical anomalies detected requiring attention`,
    );
  } else if (anomalies.length > 0) {
    findings.push(`${anomalies.length} minor expense anomalies identified`);
  } else {
    findings.push("Expense patterns are consistent with historical trends");
  }

  return findings;
}

// ── Year-over-Year comparison table ──────────────────────────────────────────

function drawYoyTable(
  state: PageState,
  sortedYears: number[],
  yoy: YearOverYearComparison,
  regularFont: PDFFont,
  boldFont: PDFFont,
): void {
  // Column layout: pool-name col + one col per year + variance col
  const numYears = sortedYears.length;
  const poolColW = 130;
  const yearColW = Math.min(70, (CONTENT_WIDTH - poolColW - 60) / numYears);
  const varColW = 60;
  const rowH = 14;
  const headerH = 16;

  // Headers
  const headers = ["Expense Pool", ...sortedYears.map(String), "Variance %"];
  const colWidths = [poolColW, ...sortedYears.map(() => yearColW), varColW];

  ensureRoom(state, headerH + 2);
  drawTableRow(
    state,
    headers,
    colWidths,
    state.y,
    headerH,
    boldFont,
    10,
    HEADER_BG,
    DARK_BLUE,
    "center",
    true,
  );
  state.y -= headerH;

  // Pool rows (top 15)
  const pools = yoy.pool_comparisons.slice(0, 15);
  for (const pool of pools) {
    ensureRoom(state, rowH);
    const cells: string[] = [pool.pool_name];
    for (const year of sortedYears) {
      const amount = pool.amounts[String(year)];
      cells.push(
        amount !== null && amount !== undefined ? formatUsdWhole(amount) : "—",
      );
    }
    const vp = pool.variance_percent;
    cells.push(vp !== null && vp !== undefined ? formatPct1f(vp) : "—");

    drawTableRow(
      state,
      cells,
      colWidths,
      state.y,
      rowH,
      regularFont,
      9,
      null,
      BLACK,
      "right",
      false,
    );
    state.y -= rowH;
  }

  // Totals row
  ensureRoom(state, rowH + 2);
  const totalCells: string[] = ["Total"];
  for (const year of sortedYears) {
    const totalStr = yoy.total_amounts[String(year)];
    totalCells.push(
      totalStr !== undefined ? formatUsdWhole(totalStr) : formatUsdWhole("0"),
    );
  }
  const tvp = yoy.total_variance_percent;
  totalCells.push(tvp !== null && tvp !== undefined ? formatPct1f(tvp) : "—");

  // Draw separator line above totals
  state.page.drawLine({
    start: { x: MARGIN, y: state.y + rowH },
    end: {
      x: MARGIN + colWidths.reduce((a, b) => a + b, 0),
      y: state.y + rowH,
    },
    thickness: 0.5,
    color: BLACK,
  });

  drawTableRow(
    state,
    totalCells,
    colWidths,
    state.y,
    rowH,
    boldFont,
    9,
    TOTALS_BG,
    BLACK,
    "right",
    false,
  );
  state.y -= rowH;
}

// ── Anomalies table ───────────────────────────────────────────────────────────

function drawAnomaliesTable(
  state: PageState,
  anomalies: DetectedAnomaly[],
  regularFont: PDFFont,
  boldFont: PDFFont,
): void {
  // Columns: Severity | Expense Pool | Type | Details
  const colWidths = [60, 120, 90, 110];
  const headers = ["Severity", "Expense Pool", "Type", "Details"];
  const rowH = 13;
  const headerH = 15;

  ensureRoom(state, headerH + 2);
  drawTableRow(
    state,
    headers,
    colWidths,
    state.y,
    headerH,
    boldFont,
    10,
    HEADER_BG,
    DARK_BLUE,
    "center",
    true,
  );
  state.y -= headerH;

  for (let i = 0; i < anomalies.length; i++) {
    const anomaly = anomalies[i]!;
    ensureRoom(state, rowH);

    const severityLabel = anomaly.severity.toUpperCase();
    const anomalyTypeLabel = anomaly.anomaly_type
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    let details: string;
    if (anomaly.anomaly_type === "spike" || anomaly.anomaly_type === "drop") {
      const vp = new PyDecimal(anomaly.variance_percent);
      const sign = vp.gte(0) ? "+" : "";
      const absStr = vp.toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN).toFixed(1);
      // Python: f"{anomaly.variance_percent:+.1f}% variance"
      // The :+ format always adds a leading sign; HALF_EVEN rounding
      details = `${sign}${absStr}% variance`;
    } else {
      details = "See explanation";
    }

    const cells = [severityLabel, anomaly.pool_name, anomalyTypeLabel, details];

    // Severity cell gets colored background
    let severityBg = null;
    let severityFg = BLACK;
    if (anomaly.severity === "critical") {
      severityBg = CRITICAL_BG;
      severityFg = CRITICAL_TEXT;
    } else if (anomaly.severity === "warning") {
      severityBg = WARNING_BG;
      severityFg = WARNING_TEXT;
    }

    // Draw row background for all cells
    drawTableRow(
      state,
      cells,
      colWidths,
      state.y,
      rowH,
      regularFont,
      9,
      null,
      BLACK,
      "left",
      false,
    );

    // Overlay severity cell with its own bg/fg
    if (severityBg !== null) {
      const cellX = MARGIN;
      state.page.drawRectangle({
        x: cellX,
        y: state.y,
        width: colWidths[0]!,
        height: rowH,
        color: severityBg,
      });
      drawText(
        state,
        severityLabel,
        cellX + 3,
        state.y + 3,
        9,
        regularFont,
        severityFg,
      );
    }

    state.y -= rowH;
  }
}

// ── Table drawing helper ──────────────────────────────────────────────────────

function drawTableRow(
  state: PageState,
  cells: string[],
  colWidths: number[],
  y: number,
  height: number,
  font: PDFFont,
  fontSize: number,
  bgColor: ReturnType<typeof rgb> | null,
  textColor: ReturnType<typeof rgb>,
  alignment: "left" | "right" | "center" | string,
  isHeader: boolean,
): void {
  let x = MARGIN;
  const totalW = colWidths.reduce((a, b) => a + b, 0);

  // Row background
  if (bgColor) {
    state.page.drawRectangle({
      x: MARGIN,
      y,
      width: totalW,
      height,
      color: bgColor,
    });
  }

  // Grid border
  state.page.drawRectangle({
    x: MARGIN,
    y,
    width: totalW,
    height,
    borderColor: GREY,
    borderWidth: 0.5,
  });

  for (let col = 0; col < cells.length; col++) {
    const cell = cells[col] ?? "";
    const colW = colWidths[col] ?? 60;
    const textW = font.widthOfTextAtSize(cell, fontSize);

    let textX: number;
    if (isHeader || alignment === "center") {
      textX = x + (colW - textW) / 2;
    } else if (col === 0 && alignment !== "center") {
      // First col left-aligned in data rows
      textX = x + 3;
    } else if (alignment === "right") {
      textX = x + colW - textW - 3;
    } else {
      textX = x + 3;
    }

    const textY = y + (height - fontSize) / 2;
    state.page.drawText(cell, {
      x: textX,
      y: textY,
      size: fontSize,
      font,
      color: textColor,
    });

    // Column separator
    if (col < cells.length - 1) {
      state.page.drawLine({
        start: { x: x + colW, y },
        end: { x: x + colW, y: y + height },
        thickness: 0.5,
        color: GREY,
      });
    }

    x += colW;
  }
}

// ── Pagination helper ─────────────────────────────────────────────────────────

function ensureRoom(state: PageState, needed: number): void {
  if (state.y - needed < MARGIN) {
    state.page = state.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    state.y = PAGE_HEIGHT - MARGIN;
  }
}

// ── Text helpers ──────────────────────────────────────────────────────────────

function drawText(
  state: PageState,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb> = BLACK,
): void {
  state.page.drawText(text, { x, y, size, font, color });
}

function drawHeading(
  state: PageState,
  text: string,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
): void {
  ensureRoom(state, 24);
  drawText(state, text, MARGIN, state.y, 14, font, color);
  state.y -= 4;
  state.page.drawLine({
    start: { x: MARGIN, y: state.y },
    end: { x: PAGE_WIDTH - MARGIN, y: state.y },
    thickness: 0.5,
    color: GREY,
  });
  state.y -= 14;
}

/**
 * Draw text wrapping at maxWidth. Naive word-wrap: splits on spaces.
 */
function drawWrappedText(
  state: PageState,
  text: string,
  x: number,
  size: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
  maxWidth: number,
): void {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      ensureRoom(state, size + 4);
      drawText(state, line, x, state.y, size, font, color);
      state.y -= size + 2;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) {
    ensureRoom(state, size + 4);
    drawText(state, line, x, state.y, size, font, color);
    state.y -= size + 2;
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────

/**
 * Format an amount as whole-dollar USD, matching Python format_usd_whole:
 *   f"${amount:,.0f}" (positive)   f"-${-amount:,.0f}" (negative)
 * Display-rounds with HALF_EVEN (Python's ":,.0f" uses HALF_EVEN).
 */
export function formatUsdWhole(amount: Decimal | string | number): string {
  const d = new PyDecimal(String(amount));
  const isNeg = d.isNegative() && !d.isZero();
  const abs = d.abs();
  // toDecimalPlaces(0, ROUND_HALF_EVEN) then format with commas
  const rounded = abs.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
  const intStr = rounded.toFixed(0);
  const withCommas = intStr.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  return `${isNeg ? "-" : ""}$${withCommas}`;
}

/**
 * Format a Decimal (or string) as "+12.3%" / "-12.3%" with HALF_EVEN rounding.
 * Matches Python f"{value:+.1f}%".
 */
function formatPct1f(value: Decimal | string): string {
  const d = new PyDecimal(String(value));
  const rounded = d.toDecimalPlaces(1, Decimal.ROUND_HALF_EVEN);
  const sign = rounded.gte(0) ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

/**
 * Format a Date as "%B %d, %Y" matching Python datetime.now().strftime("%B %d, %Y").
 * e.g. "June 13, 2026"
 */
function formatReportDate(now: Date): string {
  const MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = MONTHS[now.getMonth()]!;
  const day = String(now.getDate()).padStart(2, "0");
  const year = now.getFullYear();
  return `${month} ${day}, ${year}`;
}

function sanitizePdfText(value: string): string {
  return value.replace(PDF_CONTROL_CHARACTERS_RE, "");
}
