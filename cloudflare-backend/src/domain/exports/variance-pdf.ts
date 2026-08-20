/**
 * Variance report PDF builder.
 *
 * Generates a PDF comparing total CAM recovery between two years.
 * Content matches FastAPI _generate_variance_pdf (export.py ~279-348):
 *   - Title: "Statement Check Report - {property_name}"
 *   - Subtitle: "{current_year} vs {prior_year} | Threshold: {threshold_percent}%"
 *   - 3-column table: Period | Total Recovery | Variance
 *     Row 1 (current): year, formatUsd(current_total), ""
 *     Row 2 (prior):   year, formatUsd(prior_total),   "{pct.toFixed(2)}%"
 *   - variance_pct = ((current - prior) / prior) * 100; 0 when prior_total == 0
 *   - Timestamp line
 *
 * Styling is approximate (pdf-lib vs ReportLab); table content/labels/formats match exactly.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import Decimal from "decimal.js";
import { formatUsd } from "../formatting/currency";
import {
  CONTENT_WIDTH,
  DARK_BLUE,
  GREY,
  MARGIN,
  MED_BLUE,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  WHITE,
} from "../pdf/layout";
import type { SnapshotSummary } from "./repository";

// ── Public types ──────────────────────────────────────────────────────────────

export type VariancePdfInput = {
  snapshotsCurrent: SnapshotSummary[];
  snapshotsPrior: SnapshotSummary[];
  currentYear: number;
  priorYear: number;
  thresholdPercent: number;
  propertyName: string;
};

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * variance_pct = ((current - prior) / prior) * 100, with prior == 0 → 0.
 * Mirrors FastAPI _generate_variance_pdf exactly (export.py ~309-312).
 * Exported for direct unit testing (PDF content streams are compressed and
 * cannot be reliably string-scanned).
 */
export function computeVariancePct(
  currentTotal: Decimal,
  priorTotal: Decimal,
): Decimal {
  if (priorTotal.equals(0)) {
    return new Decimal(0);
  }
  return currentTotal.minus(priorTotal).div(priorTotal).times(100);
}

export function buildStatementCheckNotes({
  currentYear,
  priorYear,
  priorTotal,
  hasCurrentSnapshots,
  hasPriorSnapshots,
  variancePct,
}: {
  currentYear: number;
  priorYear: number;
  priorTotal: Decimal;
  hasCurrentSnapshots: boolean;
  hasPriorSnapshots: boolean;
  variancePct: Decimal;
}): { scopeNote: string; findingNote: string } {
  let scopeNote: string;
  if (hasCurrentSnapshots && hasPriorSnapshots) {
    scopeNote = `We checked final billing totals for ${priorYear} and ${currentYear}.`;
  } else if (hasCurrentSnapshots) {
    scopeNote = `We checked the final billing total for ${currentYear}.`;
  } else {
    scopeNote = `We checked the final billing total for ${priorYear}.`;
  }

  let findingNote: string;
  if (!hasPriorSnapshots || priorTotal.equals(0)) {
    findingNote = "We did not find a prior-year billing total to compare.";
  } else if (!hasCurrentSnapshots) {
    findingNote = "We did not find a current-year billing total to compare.";
  } else {
    findingNote = `We found the billing total changed by ${variancePct.toFixed(2)}%.`;
  }

  return { scopeNote, findingNote };
}

export async function buildVariancePdf(
  input: VariancePdfInput,
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

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  // ── Title ──────────────────────────────────────────────────────────────────
  const safePropName = sanitizeText(propertyName || "Property");
  const title = `Statement Check Report - ${safePropName}`;
  const titleSize = 16;
  for (const line of wrapTextForPdf(
    boldFont,
    title,
    CONTENT_WIDTH,
    titleSize,
  )) {
    page.drawText(line, {
      x: MARGIN,
      y,
      size: titleSize,
      font: boldFont,
      color: DARK_BLUE,
    });
    y -= titleSize + 4;
  }
  y -= 2;

  // ── Subtitle ───────────────────────────────────────────────────────────────
  const subtitle = `${currentYear} vs ${priorYear} | Threshold: ${thresholdPercent}%`;
  page.drawText(subtitle, { x: MARGIN, y, size: 11, font, color: GREY });
  y -= 16;

  page.drawText(scopeNote, { x: MARGIN, y, size: 9, font, color: GREY });
  y -= 12;

  page.drawText(findingNote, { x: MARGIN, y, size: 9, font, color: GREY });
  y -= 12;

  // ── Horizontal rule ────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: GREY,
  });
  y -= 14;

  // ── Table ──────────────────────────────────────────────────────────────────
  // 3 columns: col widths ~144pt, ~180pt, ~144pt (totals ~468 = CONTENT_WIDTH)
  const col1W = 144;
  const col2W = 180;
  const col3W = CONTENT_WIDTH - col1W - col2W;
  const rowH = 20;
  const tableTop = y;
  const col1X = MARGIN;
  const col2X = MARGIN + col1W;
  const col3X = MARGIN + col1W + col2W;

  const headers = ["Period", "Total Recovery", "Variance"];
  const rows: [string, string, string][] = [
    [String(currentYear), formatUsd(currentTotal), ""],
    [String(priorYear), formatUsd(priorTotal), `${variancePct.toFixed(2)}%`],
  ];

  // Header row background
  page.drawRectangle({
    x: col1X,
    y: tableTop - rowH,
    width: CONTENT_WIDTH,
    height: rowH,
    color: MED_BLUE,
  });
  // Header text
  page.drawText(headers[0] ?? "", {
    x: col1X + 4,
    y: tableTop - rowH + 6,
    size: 10,
    font: boldFont,
    color: WHITE,
  });
  page.drawText(headers[1] ?? "", {
    x: col2X + 4,
    y: tableTop - rowH + 6,
    size: 10,
    font: boldFont,
    color: WHITE,
  });
  page.drawText(headers[2] ?? "", {
    x: col3X + 4,
    y: tableTop - rowH + 6,
    size: 10,
    font: boldFont,
    color: WHITE,
  });

  y = tableTop - rowH;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const c1 = row[0];
    const c2 = row[1];
    const c3 = row[2];
    const rowY = y - rowH;
    // Alternating light background for even rows
    if (i % 2 === 1) {
      page.drawRectangle({
        x: col1X,
        y: rowY,
        width: CONTENT_WIDTH,
        height: rowH,
        color: rgb(0.965, 0.98, 0.988),
      });
    }
    page.drawText(c1, { x: col1X + 4, y: rowY + 6, size: 10, font });
    // Right-align numeric columns
    const c2Width = font.widthOfTextAtSize(c2, 10);
    page.drawText(c2, { x: col3X - c2Width - 4, y: rowY + 6, size: 10, font });
    if (c3) {
      const c3Width = font.widthOfTextAtSize(c3, 10);
      page.drawText(c3, {
        x: col3X + col3W - c3Width - 4,
        y: rowY + 6,
        size: 10,
        font,
      });
    }
    // Border line
    page.drawLine({
      start: { x: col1X, y: rowY },
      end: { x: PAGE_WIDTH - MARGIN, y: rowY },
      thickness: 0.25,
      color: GREY,
    });
    y = rowY;
  }
  // Table bottom border
  page.drawLine({
    start: { x: col1X, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: GREY,
  });
  y -= 20;

  // ── Timestamp ──────────────────────────────────────────────────────────────
  const timestamp =
    new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  page.drawText(`Generated: ${timestamp}`, {
    x: MARGIN,
    y,
    size: 9,
    font,
    color: GREY,
  });

  return pdfDoc.save();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sumRecovery(snapshots: SnapshotSummary[]): Decimal {
  return snapshots.reduce(
    (acc, s) => acc.plus(new Decimal(s.total_recovery)),
    new Decimal(0),
  );
}

function sanitizeText(text: string): string {
  // Remove control characters that can break PDF text streams
  // eslint-disable-next-line no-control-regex -- intentionally removing control chars
  return text.replace(/[\x00-\x1F\x7F]/g, "");
}

type EmbeddedFont = Awaited<ReturnType<PDFDocument["embedFont"]>>;

export function wrapTextForPdf(
  font: EmbeddedFont,
  text: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const wordParts =
      font.widthOfTextAtSize(word, fontSize) > maxWidth
        ? splitLongWord(font, word, maxWidth, fontSize)
        : [word];
    for (const wordPart of wordParts) {
      const candidate = current ? `${current} ${wordPart}` : wordPart;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) lines.push(current);
      current = wordPart;
    }
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

function splitLongWord(
  font: EmbeddedFont,
  word: string,
  maxWidth: number,
  fontSize: number,
): string[] {
  const parts: string[] = [];
  let current = "";

  for (const char of word) {
    const candidate = `${current}${char}`;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) parts.push(current);
    current = char;
  }

  if (current) parts.push(current);
  return parts;
}
