/**
 * Tax protest county cover sheet PDF builder.
 *
 * File 4 of 4: 04_County_Cover_Sheet.pdf
 *
 * Mirrors FastAPI TaxProtestCoverSheetGenerator
 * (backend/app/services/tax_protest/cover_sheet_generator.py):
 *
 *   Header:
 *     "TAX PROTEST DATA PACKAGE" (centered, DARK_BLUE, 20pt)
 *     "Tax Year {year} — {county} County, {state}" (centered, MED_BLUE, 12pt)
 *
 *   Property section (table-like 2-col layout):
 *     Property | {property_name}
 *     Address  | {property_address}
 *     County / State | {county} County, {state}
 *     Tax Year | {tax_year}
 *
 *   Deadline banner (coloured rectangle):
 *     Green  >30 days (#276749)
 *     Amber  1–30 days (#B7791F)
 *     Red    0 or past (#C53030)
 *     Text: "FILING DEADLINE: {date}   {N} days remaining" / "Deadline is TODAY"
 *           / "Deadline passed {N} days ago"
 *     When no deadline: "FILING DEADLINE: Not configured — see county assessor for deadline"
 *     Below banner: notes line if notes non-empty
 *
 *   Preparer Instructions section (verbatim file list)
 *
 *   Accuracy Disclaimer (verbatim Python text)
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  CONTENT_WIDTH,
  DARK_BLUE,
  GREY,
  MARGIN,
  MED_BLUE,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  WHITE,
  type DrawCtx,
  drawCenteredText,
  drawHRule,
  drawSubheader,
  drawText,
  formatDate,
} from "../pdf/layout";

// ── Urgency colours (mirrors Python cover_sheet_generator.py) ─────────────────

const GREEN = rgb(0.153, 0.404, 0.286); // #276749
const AMBER = rgb(0.718, 0.475, 0.122); // #B7791F
const RED = rgb(0.773, 0.188, 0.188); // #C53030

function urgencyColor(daysRemaining: number | null) {
  if (daysRemaining === null || daysRemaining > 30) return GREEN;
  if (daysRemaining >= 1) return AMBER;
  return RED;
}

// ── Input type ────────────────────────────────────────────────────────────────

export type CoverSheetPdfInput = {
  property_name: string;
  property_address: string;
  county: string;
  state: string;
  /** YYYY-MM-DD or null */
  effective_deadline: string | null;
  days_remaining: number | null;
  notes: string;
  tax_year: number;
};

// ── Builder ───────────────────────────────────────────────────────────────────

export async function buildCoverSheetPdf(
  input: CoverSheetPdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: DrawCtx = { page, font, boldFont, y: PAGE_HEIGHT - MARGIN };

  // ── Header ────────────────────────────────────────────────────────────────
  drawCenteredText(
    ctx,
    "TAX PROTEST DATA PACKAGE",
    ctx.y,
    20,
    boldFont,
    DARK_BLUE,
  );
  ctx.y -= 28;

  const subtitle = `Tax Year ${input.tax_year} — ${input.county} County, ${input.state}`;
  drawCenteredText(ctx, subtitle, ctx.y, 12, font, MED_BLUE);
  ctx.y -= 20;

  drawHRule(ctx, ctx.y);
  ctx.y -= 16;

  // ── Property section ──────────────────────────────────────────────────────
  ctx.y = drawSubheader(ctx, "Property Information", ctx.y);

  const propRows: Array<[string, string]> = [
    ["Property", input.property_name],
    ["Address", input.property_address],
    ["County / State", `${input.county} County, ${input.state}`],
    ["Tax Year", String(input.tax_year)],
  ];

  const labelX = MARGIN;
  const valueX = MARGIN + 110;

  for (const [label, value] of propRows) {
    drawText(ctx, label, labelX, ctx.y, 10, boldFont);
    drawText(ctx, value, valueX, ctx.y, 10, font);
    ctx.y -= 14;
  }
  ctx.y -= 10;

  // ── Deadline banner ───────────────────────────────────────────────────────
  const bannerText = buildBannerText(
    input.effective_deadline,
    input.days_remaining,
  );
  const bannerColor = urgencyColor(input.days_remaining);
  const bannerH = 30;

  page.drawRectangle({
    x: MARGIN,
    y: ctx.y - bannerH,
    width: CONTENT_WIDTH,
    height: bannerH,
    color: bannerColor,
  });
  // Center text vertically in banner
  drawCenteredText(
    ctx,
    bannerText,
    ctx.y - bannerH / 2 - 4,
    12,
    boldFont,
    WHITE,
  );
  ctx.y -= bannerH + 6;

  if (input.notes) {
    drawText(ctx, `Note: ${input.notes}`, MARGIN, ctx.y, 9, font, GREY);
    ctx.y -= 14;
  }
  ctx.y -= 10;

  // ── Preparer Instructions ─────────────────────────────────────────────────
  ctx.y = drawSubheader(ctx, "Preparer Instructions", ctx.y);
  drawText(
    ctx,
    "This package contains four documents for your tax protest filing:",
    MARGIN,
    ctx.y,
    10,
    font,
  );
  ctx.y -= 14;

  const instructions: string[] = [
    "1. 01_Expense_Summary.pdf — CAM expense summary with tenant reconciliation details for the tax year.",
    "2. 02_GL_by_Category.csv — General ledger expenses categorised by CAM pool. Import into your",
    "   appraisal district's portal or provide to tax counsel.",
    "3. 03_Year_Over_Year_Comparison.pdf — Year-over-year variance report comparing the current tax year to the prior year.",
    "4. 04_County_Cover_Sheet.pdf — This document. Attach as a cover page to your protest submission.",
  ];

  for (const line of instructions) {
    if (ctx.y < MARGIN + 40) break;
    drawText(ctx, line, MARGIN, ctx.y, 10, font);
    ctx.y -= 13;
  }
  ctx.y -= 10;

  // ── Accuracy Disclaimer ───────────────────────────────────────────────────
  ctx.y = drawSubheader(ctx, "Accuracy Disclaimer", ctx.y);

  const disclaimerText =
    "This package was generated by CapVeri from reconciliation data entered by your " +
    "organisation. All calculations are deterministic and based solely on the data you " +
    "have provided. CapVeri does not warrant the accuracy of the underlying data and " +
    "this document does not constitute legal, tax, or appraisal advice. Consult " +
    "qualified tax counsel before filing a formal protest.";

  // Simple word-wrap at ~95 chars
  const words = disclaimerText.split(" ");
  let currentLine = "";
  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (candidate.length > 95 && currentLine) {
      if (ctx.y > MARGIN) {
        drawText(ctx, currentLine, MARGIN, ctx.y, 8, font, GREY);
        ctx.y -= 11;
      }
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine && ctx.y > MARGIN) {
    drawText(ctx, currentLine, MARGIN, ctx.y, 8, font, GREY);
  }

  return doc.save();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildBannerText(
  effectiveDeadline: string | null,
  daysRemaining: number | null,
): string {
  if (effectiveDeadline === null) {
    return "FILING DEADLINE: Not configured — see county assessor for deadline";
  }
  const dateStr = formatDate(effectiveDeadline);
  let status = "";
  if (daysRemaining !== null) {
    if (daysRemaining > 0) {
      status = `${daysRemaining} days remaining`;
    } else if (daysRemaining === 0) {
      status = "Deadline is TODAY";
    } else {
      status = `Deadline passed ${Math.abs(daysRemaining)} days ago`;
    }
  }
  return status
    ? `FILING DEADLINE: ${dateStr}   ${status}`
    : `FILING DEADLINE: ${dateStr}`;
}
