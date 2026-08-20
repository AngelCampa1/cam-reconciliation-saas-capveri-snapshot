/**
 * Board presentation PDF builder.
 *
 * Content mirrors FastAPI _generate_board_presentation_pdf (export.py ~888-1037):
 *   - Title: "CAM Recovery Impact Report"
 *   - Property line: "Property: {prop_name}"
 *   - Subtitle: "{org_name} | {year} Reconciliation Year"
 *   - "Executive Summary" section with table ["Metric","Amount"]:
 *       CAM Recovery Amount  | formatUsd(total_recovery)
 *       Additional Annual NOI | formatUsd(noi_lift)
 *       Asset Value Increase  | formatUsd(asset_value_lift)
 *   - "Calculation Methodology" section with explanatory text + formula line
 *   - "Cap Rate Assumption" section
 *   - Footer: "Prepared by CapVeri | Confidential | Generated: {timestamp}"
 *   - Disclaimer paragraph
 *
 * NOI formula (from backend/app/services/calculation/noi_impact.py):
 *   noi_lift = total_recovery (rounded half-up to cents)
 *   asset_value_lift = noi_lift / cap_rate (rounded half-up to cents)
 *
 * Styling is approximate (pdf-lib vs ReportLab); content/labels/numbers match exactly.
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

export type BoardPdfInput = {
  snapshots: SnapshotSummary[];
  propertyName: string;
  orgName: string;
  /** year string derived from first snapshot's period_start_date */
  year: string;
  capRate: Decimal;
};

// ── Builder ───────────────────────────────────────────────────────────────────

export async function buildBoardPdf(input: BoardPdfInput): Promise<Uint8Array> {
  const { snapshots, propertyName, orgName, year, capRate } = input;

  const totalRecovery = sumRecovery(snapshots);
  const { noiLift, assetValueLift } = calculateNoi(totalRecovery, capRate);

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const safeProp = sanitizeText(propertyName || "Property");
  const safeOrg = sanitizeText(orgName);

  // ── Title ──────────────────────────────────────────────────────────────────
  page.drawText("CAM Recovery Impact Report", {
    x: MARGIN,
    y,
    size: 16,
    font: boldFont,
    color: DARK_BLUE,
  });
  y -= 22;
  y = drawWrapped(
    page,
    `Property: ${safeProp}`,
    boldFont,
    12,
    MARGIN,
    y,
    CONTENT_WIDTH,
    DARK_BLUE,
  );
  y -= 6;

  // ── Subtitle ───────────────────────────────────────────────────────────────
  const subtitle = `${safeOrg} | ${year} Reconciliation Year`;
  page.drawText(subtitle, { x: MARGIN, y, size: 11, font, color: GREY });
  y -= 28;

  // ── Executive Summary section ──────────────────────────────────────────────
  page.drawText("Executive Summary", {
    x: MARGIN,
    y,
    size: 13,
    font: boldFont,
    color: MED_BLUE,
  });
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: GREY,
  });
  y -= 16;

  const tableRows: [string, string][] = [
    ["CAM Recovery Amount", formatUsd(totalRecovery)],
    ["Additional Annual NOI", formatUsd(noiLift)],
    ["Asset Value Increase", formatUsd(assetValueLift)],
  ];
  const metricColW = 280;
  const rowH = 22;

  // Header row
  page.drawRectangle({
    x: MARGIN,
    y: y - rowH,
    width: CONTENT_WIDTH,
    height: rowH,
    color: MED_BLUE,
  });
  page.drawText("Metric", {
    x: MARGIN + 6,
    y: y - rowH + 7,
    size: 11,
    font: boldFont,
    color: WHITE,
  });
  page.drawText("Amount", {
    x: MARGIN + metricColW + 6,
    y: y - rowH + 7,
    size: 11,
    font: boldFont,
    color: WHITE,
  });
  y -= rowH;

  const rowBg = [
    rgb(0.969, 0.98, 0.988),
    rgb(1, 1, 1),
    rgb(0.969, 0.98, 0.988),
  ];
  for (let i = 0; i < tableRows.length; i++) {
    const row = tableRows[i];
    if (!row) continue;
    const [metric, amount] = row;
    const rowY = y - rowH;
    const rowColor = rowBg[i] ?? rgb(1, 1, 1);
    page.drawRectangle({
      x: MARGIN,
      y: rowY,
      width: CONTENT_WIDTH,
      height: rowH,
      color: rowColor,
    });
    const isBold = i === 2; // Asset Value row is bold in FastAPI
    const rowFont = isBold ? boldFont : font;
    page.drawText(metric, {
      x: MARGIN + 6,
      y: rowY + 7,
      size: 11,
      font: rowFont,
    });
    const amtW = (isBold ? boldFont : font).widthOfTextAtSize(amount, 12);
    page.drawText(amount, {
      x: MARGIN + CONTENT_WIDTH - amtW - 6,
      y: rowY + 7,
      size: 12,
      font: rowFont,
    });
    page.drawLine({
      start: { x: MARGIN, y: rowY },
      end: { x: PAGE_WIDTH - MARGIN, y: rowY },
      thickness: 0.25,
      color: GREY,
    });
    y = rowY;
  }
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: GREY,
  });
  y -= 28;

  // ── Calculation Methodology ────────────────────────────────────────────────
  page.drawText("Calculation Methodology", {
    x: MARGIN,
    y,
    size: 13,
    font: boldFont,
    color: MED_BLUE,
  });
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: GREY,
  });
  y -= 16;

  const methodText =
    "Commercial real estate is valued by dividing Net Operating Income (NOI) by the " +
    "capitalization rate. CAM reconciliation recoveries represent permanent additional " +
    "income — once recovered, this amount recurs annually, making it a direct NOI " +
    "increase. Applying the cap rate formula converts this income stream into an " +
    "equivalent increase in building market value.";
  y = drawWrapped(page, methodText, font, 10, MARGIN, y, CONTENT_WIDTH);
  y -= 10;

  const capRatePct = capRate.times(100).toFixed(1);
  const formulaText =
    `Asset Value Lift = CAM Recovery ÷ Cap Rate = ` +
    `${formatUsd(totalRecovery)} ÷ ${capRatePct}% = ` +
    `${formatUsd(assetValueLift)}`;
  y = drawWrapped(page, formulaText, font, 10, MARGIN, y, CONTENT_WIDTH);
  y -= 24;

  // ── Cap Rate Assumption ────────────────────────────────────────────────────
  page.drawText("Cap Rate Assumption", {
    x: MARGIN,
    y,
    size: 13,
    font: boldFont,
    color: MED_BLUE,
  });
  y -= 6;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: GREY,
  });
  y -= 16;

  const capRatePct2 = capRate.times(100).toFixed(2);
  const capRateText =
    `This analysis uses a capitalization rate of ${capRatePct2}%. ` +
    "Cap rates vary by market, asset class, and property quality. Adjust this " +
    "assumption to reflect the prevailing cap rate for this asset.";
  y = drawWrapped(page, capRateText, font, 10, MARGIN, y, CONTENT_WIDTH);
  y -= 32;

  // ── Footer ─────────────────────────────────────────────────────────────────
  const timestamp =
    new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  page.drawText(
    `Prepared by CapVeri | Confidential | Generated: ${timestamp}`,
    { x: MARGIN, y, size: 10, font, color: GREY },
  );
  y -= 16;

  const disclaimer =
    "These figures are generated automatically from data you provided and " +
    "the cap rate you selected. They may contain errors. Review and verify " +
    "all amounts before presenting them to a board, lender, or investor. " +
    "CapVeri is not responsible for errors in outputs you did not " +
    "independently verify.";
  drawWrapped(
    page,
    disclaimer,
    font,
    7,
    MARGIN,
    y,
    CONTENT_WIDTH,
    rgb(0.42, 0.447, 0.502),
  );

  return pdfDoc.save();
}

// ── NOI calculation (mirrors noi_impact.py exactly) ──────────────────────────

export function calculateNoi(
  totalRecovery: Decimal,
  capRate: Decimal,
): { noiLift: Decimal; assetValueLift: Decimal } {
  // Validate cap_rate range: [0.01, 0.25] — caller should have already validated.
  const min = new Decimal("0.01");
  const max = new Decimal("0.25");
  if (capRate.lt(min) || capRate.gt(max)) {
    throw new Error("cap_rate must be between 1% and 25%");
  }
  // noi_lift = recovery_amount rounded to cents (ROUND_HALF_UP)
  const noiLift = totalRecovery.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  // asset_value_lift = noi_lift / cap_rate rounded to cents (ROUND_HALF_UP)
  const assetValueLift = noiLift
    .div(capRate)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return { noiLift, assetValueLift };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sumRecovery(snapshots: SnapshotSummary[]): Decimal {
  return snapshots.reduce(
    (acc, s) => acc.plus(new Decimal(s.total_recovery)),
    new Decimal(0),
  );
}

function sanitizeText(text: string): string {
  // eslint-disable-next-line no-control-regex -- intentionally removing control chars from PDF text
  return text.replace(/[\x00-\x1F\x7F]/g, "");
}

/**
 * Draw text wrapped to maxWidth, returning updated y position.
 * Naïve word-wrap: splits on spaces, does not hyphenate.
 */
function drawWrapped(
  page: ReturnType<typeof PDFDocument.prototype.addPage>,
  text: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pdf-lib PDFFont type not exported at module level
  font: any,
  size: number,
  x: number,
  y: number,
  maxWidth: number,
  color = rgb(0, 0, 0),
): number {
  const lineHeight = size + 4;
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) {
        page.drawText(line, { x, y, size, font, color });
        y -= lineHeight;
      }
      line = word;
    }
  }
  if (line) {
    page.drawText(line, { x, y, size, font, color });
    y -= lineHeight;
  }
  return y;
}
