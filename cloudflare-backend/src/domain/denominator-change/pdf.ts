/**
 * Denominator change audit report PDF renderer — EP-18.
 *
 * Faithfully ports backend/app/services/reports/denominator_change_report.py
 * (DenominatorChangeReportGenerator) using pdf-lib.
 *
 * Content matches Python reportlab output; pixel-perfect layout is NOT the
 * goal (pdf-lib ≠ ReportLab) — section headings, table headers, cell values,
 * and footer text are byte-for-byte identical where they are strings.
 *
 * Sections:
 *   1. Title: "Denominator Change Audit Report"
 *   2. Property/Prior Period/Current Period/Generated
 *   3. Executive Summary heading + summary text
 *   4. RSF summary table (Metric | Prior Period | Current Period | Change)
 *   5. Denominator Changes table or "No denominator changes detected…" line
 *   6. Per-Tenant Impact table (if any impacts)
 *   7. Footer disclaimer (byte-for-byte from Python)
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import Decimal from "decimal.js";
import { formatUsd } from "../formatting/currency";
import {
  CONTENT_WIDTH,
  DARK_BLUE,
  formatDate,
  GREY,
  LIGHT_GREY_BG,
  MARGIN,
  MED_BLUE,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  WHITE,
} from "../pdf/layout";
import type { DenominatorChangeReport } from "./service";

// ── USD delta formatter — matches Python format_usd_delta ────────────────────
function formatUsdDelta(amount: Decimal | string | number): string {
  const d = new Decimal(amount);
  if (d.isNegative() && !d.isZero()) {
    return `-$${d
      .abs()
      .toFixed(2, Decimal.ROUND_HALF_EVEN)
      .replace(/\B(?=(\d{3})+(?!\d))/gu, ",")}`;
  }
  return `+$${d.toFixed(2, Decimal.ROUND_HALF_EVEN).replace(/\B(?=(\d{3})+(?!\d))/gu, ",")}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Remove control characters that can break PDF text streams. */
function safe(text: string): string {
  // eslint-disable-next-line no-control-regex -- intentional: strip control chars
  return text.replace(/[\x00-\x1F\x7F]/g, "");
}

/** Add commas to integer string without a Decimal allocation. */
function addCommas(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
}

/** Format Decimal as "±X,XXX.00 RSF" style integer: f"{x:+,.0f} ({pct:+.2f}%)" */
function fmtRsfChange(delta: Decimal, pct: Decimal): string {
  const sign = delta.isNegative() ? "-" : "+";
  const absInt = addCommas(
    delta.abs().toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toFixed(0),
  );
  const pctSign = pct.isNegative() ? "-" : "+";
  return `${sign}${absInt} (${pctSign}${pct.abs().toFixed(2, Decimal.ROUND_HALF_EVEN)}%)`;
}

/** Format Decimal as "+X,XXX" or "-X,XXX" (integer, signed) */
function fmtRsfInt(x: Decimal): string {
  return addCommas(x.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toFixed(0));
}

// ── Drawing primitives ────────────────────────────────────────────────────────

type Ctx = {
  doc: PDFDocument;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
};

type PageState = {
  page: ReturnType<PDFDocument["addPage"]>;
  y: number;
};

function ensureSpace(ctx: Ctx, ps: PageState, needed: number): PageState {
  if (ps.y - needed < MARGIN + 20) {
    const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    return { page, y: PAGE_HEIGHT - MARGIN };
  }
  return ps;
}

function drawText(
  ps: PageState,
  text: string,
  x: number,
  y: number,
  size: number,
  font: Ctx["font"],
  color = GREY,
): void {
  ps.page.drawText(safe(text), { x, y, size, font, color });
}

function drawHRule(ps: PageState, y: number): void {
  ps.page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: GREY,
  });
}

/**
 * Draw a section subheader (MED_BLUE bold, underline rule) and return the
 * next y position.
 */
function drawSubheader(ctx: Ctx, ps: PageState, text: string): PageState {
  drawText(ps, text, MARGIN, ps.y, 12, ctx.bold, MED_BLUE);
  drawHRule(ps, ps.y - 4);
  return { ...ps, y: ps.y - 22 };
}

/**
 * Draw a labelled field row ("Label: value") and return updated PageState.
 */
function drawField(
  ctx: Ctx,
  ps: PageState,
  label: string,
  value: string,
): PageState {
  ps = ensureSpace(ctx, ps, 14);
  drawText(ps, `${label}: `, MARGIN, ps.y, 10, ctx.bold, GREY);
  const labelWidth = ctx.bold.widthOfTextAtSize(`${label}: `, 10);
  drawText(ps, value, MARGIN + labelWidth, ps.y, 10, ctx.font, GREY);
  return { ...ps, y: ps.y - 14 };
}

// ── Table drawing ─────────────────────────────────────────────────────────────

type ColDef = {
  header: string;
  width: number;
  align?: "left" | "right";
};

/**
 * Draw a table with a blue header row and alternating light-grey body rows.
 * Supports word-wrapping by splitting cell text into chunks of at most
 * `maxCharsPerLine` characters when the text would overflow the column.
 */
function drawTable(
  ctx: Ctx,
  ps: PageState,
  cols: ColDef[],
  rows: string[][],
  rowHeight = 18,
  fontSize = 9,
): PageState {
  const totalW = cols.reduce((s, c) => s + c.width, 0);
  const headerH = rowHeight + 2;

  // Header
  ps = ensureSpace(ctx, ps, headerH + 4);
  ps.page.drawRectangle({
    x: MARGIN,
    y: ps.y - headerH,
    width: totalW,
    height: headerH,
    color: MED_BLUE,
  });
  let colX = MARGIN;
  for (const col of cols) {
    drawText(
      ps,
      col.header,
      colX + 4,
      ps.y - headerH + 5,
      fontSize,
      ctx.bold,
      WHITE,
    );
    colX += col.width;
  }
  ps = { ...ps, y: ps.y - headerH };

  // Body rows
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri] ?? [];
    // Compute actual row height (may need extra lines for wrapped text)
    const lineH = fontSize + 3;
    const maxLines = computeMaxLines(ctx, cols, row, fontSize);
    const actualH = Math.max(rowHeight, maxLines * lineH + 4);

    ps = ensureSpace(ctx, ps, actualH + 2);

    // Alternating background
    if (ri % 2 === 1) {
      ps.page.drawRectangle({
        x: MARGIN,
        y: ps.y - actualH,
        width: totalW,
        height: actualH,
        color: LIGHT_GREY_BG,
      });
    }

    // Cell text
    colX = MARGIN;
    for (let ci = 0; ci < cols.length; ci++) {
      const col = cols[ci]!;
      const cellText = row[ci] ?? "";
      const lines = wrapText(ctx, cellText, col.width - 8, fontSize);
      for (let li = 0; li < lines.length; li++) {
        const lineText = lines[li] ?? "";
        const lineY = ps.y - (li + 1) * lineH - 1;
        if (col.align === "right") {
          const tw = ctx.font.widthOfTextAtSize(lineText, fontSize);
          drawText(
            ps,
            lineText,
            colX + col.width - tw - 4,
            lineY,
            fontSize,
            ctx.font,
            GREY,
          );
        } else {
          drawText(ps, lineText, colX + 4, lineY, fontSize, ctx.font, GREY);
        }
      }
      colX += col.width;
    }

    // Bottom border
    ps.page.drawLine({
      start: { x: MARGIN, y: ps.y - actualH },
      end: { x: PAGE_WIDTH - MARGIN, y: ps.y - actualH },
      thickness: 0.25,
      color: GREY,
    });
    ps = { ...ps, y: ps.y - actualH };
  }

  return ps;
}

function computeMaxLines(
  ctx: Ctx,
  cols: ColDef[],
  row: string[],
  fontSize: number,
): number {
  let max = 1;
  for (let ci = 0; ci < cols.length; ci++) {
    const col = cols[ci]!;
    const lines = wrapText(ctx, row[ci] ?? "", col.width - 8, fontSize);
    if (lines.length > max) max = lines.length;
  }
  return max;
}

/** Wrap text to fit within maxWidth at given fontSize. */
function wrapText(
  ctx: Ctx,
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  if (!text) return [""];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

// ── Public builder ────────────────────────────────────────────────────────────

export async function buildDenominatorChangePdf(
  report: DenominatorChangeReport,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc: pdfDoc, font, bold };

  let ps: PageState = {
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
  };

  // ── 1. Title ───────────────────────────────────────────────────────────────
  drawText(
    ps,
    "Denominator Change Audit Report",
    MARGIN,
    ps.y,
    18,
    bold,
    DARK_BLUE,
  );
  ps = { ...ps, y: ps.y - 28 };

  // ── 2. Property / period / generated fields ────────────────────────────────
  ps = drawField(ctx, ps, "Property", report.property_name);
  ps = drawField(
    ctx,
    ps,
    "Prior Period",
    formatPeriodLabel(report.prior_period),
  );
  ps = drawField(
    ctx,
    ps,
    "Current Period",
    formatPeriodLabel(report.current_period),
  );
  // Python: report.generated_at.strftime('%Y-%m-%d %H:%M')
  const genStr = formatGeneratedAt(report.generated_at);
  ps = drawField(ctx, ps, "Generated", genStr);
  ps = { ...ps, y: ps.y - 10 };

  // ── 3. Executive Summary ───────────────────────────────────────────────────
  ps = ensureSpace(ctx, ps, 50);
  ps = drawSubheader(ctx, ps, "Executive Summary");
  ps = ensureSpace(ctx, ps, 14);
  const summaryLines = wrapText(ctx, report.summary, CONTENT_WIDTH, 10);
  for (const line of summaryLines) {
    drawText(ps, line, MARGIN, ps.y, 10, font, GREY);
    ps = { ...ps, y: ps.y - 14 };
  }
  ps = { ...ps, y: ps.y - 8 };

  // ── 4. RSF Summary table ───────────────────────────────────────────────────
  ps = ensureSpace(ctx, ps, 60);
  const rsfCols: ColDef[] = [
    { header: "Metric", width: 144 },
    { header: "Prior Period", width: 108, align: "right" },
    { header: "Current Period", width: 108, align: "right" },
    { header: "Change", width: 144, align: "right" },
  ];
  const rsfRows: string[][] = [
    [
      "Total RSF",
      fmtRsfInt(report.prior_total_rsf),
      fmtRsfInt(report.current_total_rsf),
      fmtRsfChange(report.rsf_delta, report.rsf_delta_percent),
    ],
  ];
  ps = drawTable(ctx, ps, rsfCols, rsfRows);
  ps = { ...ps, y: ps.y - 16 };

  // ── 5. Denominator Changes ─────────────────────────────────────────────────
  ps = ensureSpace(ctx, ps, 50);
  ps = drawSubheader(ctx, ps, "Denominator Changes");

  if (report.changes.length === 0) {
    ps = ensureSpace(ctx, ps, 14);
    drawText(
      ps,
      "No denominator changes detected between periods.",
      MARGIN,
      ps.y,
      10,
      font,
      GREY,
    );
    ps = { ...ps, y: ps.y - 20 };
  } else {
    const changeCols: ColDef[] = [
      { header: "Type", width: 108 },
      { header: "Description", width: 216 },
      { header: "Prior", width: 90 },
      { header: "Current", width: 90 },
    ];
    const changeRows: string[][] = report.changes.map((ch) => [
      ch.change_type
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
      ch.description,
      ch.prior_value,
      ch.current_value,
    ]);
    ps = drawTable(ctx, ps, changeCols, changeRows, 20, 8);
    ps = { ...ps, y: ps.y - 16 };
  }

  // ── 6. Per-Tenant Impact ───────────────────────────────────────────────────
  if (report.tenant_impacts.length > 0) {
    ps = ensureSpace(ctx, ps, 50);
    ps = drawSubheader(ctx, ps, "Per-Tenant Impact");

    const impactCols: ColDef[] = [
      { header: "Tenant", width: 86 },
      { header: "Prior Share", width: 58, align: "right" },
      { header: "Current Share", width: 65, align: "right" },
      { header: "Delta (ppt)", width: 55, align: "right" },
      { header: "Prior Recovery", width: 79, align: "right" },
      { header: "Current Recovery", width: 79, align: "right" },
      { header: "Delta ($)", width: 82, align: "right" },
    ];

    const impactRows: string[][] = report.tenant_impacts.map((imp) => [
      imp.tenant_name,
      `${imp.prior_pro_rata_share.times(100).toFixed(2, Decimal.ROUND_HALF_EVEN)}%`,
      `${imp.current_pro_rata_share.times(100).toFixed(2, Decimal.ROUND_HALF_EVEN)}%`,
      `${imp.share_delta_pct_points.isNegative() ? "" : "+"}${imp.share_delta_pct_points.toFixed(2, Decimal.ROUND_HALF_EVEN)}`,
      formatUsd(imp.prior_estimated_recovery),
      formatUsd(imp.current_estimated_recovery),
      formatUsdDelta(imp.recovery_delta),
    ]);

    ps = drawTable(ctx, ps, impactCols, impactRows, 18, 7);
    ps = { ...ps, y: ps.y - 16 };
  }

  // ── 7. Footer (byte-for-byte from Python) ─────────────────────────────────
  const footerText =
    "Generated by CapVeri | " +
    "This report is for informational purposes only." +
    " Figures are system-calculated and may contain errors." +
    " Verify all numbers against your lease and source GL" +
    " before issuing any billing change.";

  ps = { ...ps, y: ps.y - 20 };
  ps = ensureSpace(ctx, ps, 20);
  const footerLines = wrapText(ctx, footerText, CONTENT_WIDTH, 7);
  for (const line of footerLines) {
    drawText(ps, line, MARGIN, ps.y, 7, font, GREY);
    ps = { ...ps, y: ps.y - 10 };
  }

  return pdfDoc.save();
}

// ── Period label formatter ────────────────────────────────────────────────────
// report.prior_period / current_period arrive pre-assembled as
// "YYYY-MM-DD to YYYY-MM-DD" and are ALSO the JSON API contract field (see
// serialiseReport in denominator-change-routes.ts), so the friendly reformat is
// applied here for the PDF only — never at the source periodFmt. formatDate
// returns empty/non-ISO parts unchanged, so an empty prior period ("") and the
// " to " separator both pass through safely.
export function formatPeriodLabel(period: string): string {
  return period
    .split(" to ")
    .map((part) => formatDate(part.trim()))
    .join(" to ");
}

// ── Date formatter — matches Python strftime('%Y-%m-%d %H:%M') ────────────────

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatGeneratedAt(dt: Date): string {
  const y = dt.getUTCFullYear();
  const mo = pad2(dt.getUTCMonth() + 1);
  const d = pad2(dt.getUTCDate());
  const h = pad2(dt.getUTCHours());
  const mi = pad2(dt.getUTCMinutes());
  return `${y}-${mo}-${d} ${h}:${mi}`;
}
