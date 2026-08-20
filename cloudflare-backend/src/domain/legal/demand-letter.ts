/**
 * Demand letter PDF generator — Cloudflare Worker port.
 *
 * Mirrors backend/app/services/legal/demand_letter_generator.py using pdf-lib
 * instead of ReportLab. The layout (letter-size, 1-inch margins, line-wrapped
 * body paragraphs, divider, grey disclaimer) is equivalent in spirit; exact
 * pixel layout differs because pdf-lib is lower-level than ReportLab flowables.
 *
 * Legal text is imported VERBATIM from demand-letter-templates.ts.
 */

import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import Decimal from "decimal.js";
import {
  CA_DEMAND_BODY,
  DISPUTE_PARAGRAPH,
  LEGAL_DISCLAIMER,
  TX_DEMAND_BODY,
} from "./demand-letter-templates";
import { formatDate } from "../pdf/format-date";

// Letter page: 612 x 792 pt, 1-inch = 72 pt margins (matches ReportLab defaults)
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 72;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT_GREY = rgb(0.7, 0.7, 0.7);

// ── Types ─────────────────────────────────────────────────────────────────────

export type DemandLetterData = {
  tenant_name: string;
  property_address: string;
  amount_owed: Decimal;
  period_start: string; // ISO date "YYYY-MM-DD"
  period_end: string;
  lease_reference: string;
  landlord_name: string;
  landlord_title: string;
  landlord_company: string;
  landlord_phone: string;
  landlord_email: string;
  landlord_address: string;
  payment_deadline_date: string; // ISO date
  letter_date: string; // ISO date
  state: "TX" | "CA";
  dispute_id?: string | null;
  dispute_filed_date?: string | null;
};

// ── Public API ────────────────────────────────────────────────────────────────

export async function buildDemandLetterPdf(
  data: DemandLetterData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const substitutionMap = buildSubstitutionMap(data);
  const rawBody = data.state === "TX" ? TX_DEMAND_BODY : CA_DEMAND_BODY;
  const bodyText = applyTemplate(rawBody, substitutionMap);

  // Split into paragraphs
  const paragraphs = bodyText
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  // Optional dispute paragraph
  if (data.dispute_id) {
    const disputeText = DISPUTE_PARAGRAPH.replace(
      "{dispute_id}",
      data.dispute_id,
    ).replace(
      "{dispute_filed_date}",
      formatDate(data.dispute_filed_date ?? ""),
    );
    paragraphs.push(disputeText);
  }

  // Add disclaimer as last "paragraph" (smaller font, grey)
  const allSections: Array<{ text: string; isDisclaimer?: boolean }> = [
    ...paragraphs.map((p) => ({ text: p })),
    { text: LEGAL_DISCLAIMER, isDisclaimer: true },
  ];

  // Render sections across pages
  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;

  const BODY_SIZE = 11;
  const BODY_LEADING = 16;
  const DISCLAIMER_SIZE = 8;
  const DISCLAIMER_LEADING = 11;
  const PARA_SPACING = 10;
  const DIVIDER_SPACING = 12;
  const MIN_Y = MARGIN + 20;

  for (let si = 0; si < allSections.length; si++) {
    const section = allSections[si];
    if (!section) continue;
    const isDisclaimer = section.isDisclaimer === true;

    if (isDisclaimer && si > 0) {
      // Draw divider before disclaimer
      if (y - DIVIDER_SPACING < MIN_Y) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      y -= DIVIDER_SPACING / 2;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: PAGE_WIDTH - MARGIN, y },
        thickness: 0.5,
        color: LIGHT_GREY,
      });
      y -= DIVIDER_SPACING / 2;
    }

    const fontSize = isDisclaimer ? DISCLAIMER_SIZE : BODY_SIZE;
    const leading = isDisclaimer ? DISCLAIMER_LEADING : BODY_LEADING;
    const textFont = isDisclaimer ? font : font;
    const textColor = isDisclaimer ? GREY : BLACK;

    // Each section text may contain single newlines within paragraphs — render
    // them as hard line breaks (mirrors Python's Paragraph + <br/>)
    const subLines = section.text.split("\n");
    for (const subLine of subLines) {
      const wrapped = wrapText(subLine, textFont, fontSize, CONTENT_WIDTH);
      for (const wline of wrapped) {
        if (y - fontSize < MIN_Y) {
          page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
          y = PAGE_HEIGHT - MARGIN;
        }
        page.drawText(wline, {
          x: MARGIN,
          y: y - fontSize,
          size: fontSize,
          font: textFont,
          color: textColor,
        });
        y -= leading;
      }
    }

    // Spacing between sections (not after last)
    if (si < allSections.length - 1) {
      y -= PARA_SPACING;
    }
  }

  // Suppress unused boldFont lint error — available for callers who extend this
  void boldFont;

  return doc.save();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function buildStatementCorrectionNotePdf(
  data: DemandLetterData,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const totalDifference = data.amount_owed;
  const absoluteDifference = totalDifference.abs();
  const hasOverbill = totalDifference.isNegative();

  const outcomeText = hasOverbill
    ? `The reviewed statement indicates a tenant credit or billing reduction of ${formatCurrency(absoluteDifference)} for the period reviewed.`
    : "The reviewed statement reconciles for this tenant. No tenant balance change was identified for the period reviewed.";

  const actionText = hasOverbill
    ? "Use this note to document the correction before the CAM statement is sent or reissued. It is not a collection demand."
    : "Use this note to keep a record that the statement was checked before billing. It is not a collection demand.";

  const sections = [
    formatDate(data.letter_date),
    [data.landlord_name, data.landlord_title, data.landlord_company]
      .filter((part) => part.trim().length > 0)
      .join("\n"),
    `Re: CAM statement correction note for ${data.tenant_name}`,
    `Property: ${data.property_address}`,
    `Review period: ${formatDate(data.period_start)} through ${formatDate(data.period_end)}`,
    `Lease reference: ${data.lease_reference}`,
    `CapVeri reviewed the CAM billing comparison for ${data.tenant_name}. ${outcomeText}`,
    `Recommended review-by date: ${formatDate(data.payment_deadline_date)}`,
    actionText,
    "This note states what was checked and found from the available reconciliation data. It does not promise that every possible lease, tax, or operating-expense issue has been reviewed.",
    LEGAL_DISCLAIMER,
  ].filter((section) => section.trim().length > 0);

  let page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - MARGIN;
  const BODY_SIZE = 11;
  const BODY_LEADING = 16;
  const PARA_SPACING = 10;
  const MIN_Y = MARGIN + 20;

  for (const section of sections) {
    const wrappedLines = section
      .split("\n")
      .flatMap((line) => wrapText(line, font, BODY_SIZE, CONTENT_WIDTH));
    for (const line of wrappedLines) {
      if (y - BODY_SIZE < MIN_Y) {
        page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - MARGIN;
      }
      page.drawText(line, {
        x: MARGIN,
        y: y - BODY_SIZE,
        size: BODY_SIZE,
        font,
        color: BLACK,
      });
      y -= BODY_LEADING;
    }
    y -= PARA_SPACING;
  }

  return doc.save();
}

function formatCurrency(amount: Decimal): string {
  if (amount.isNegative()) {
    return `-$${amount
      .negated()
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/gu, ",")}`;
  }
  return `$${amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/gu, ",")}`;
}

function buildSubstitutionMap(d: DemandLetterData): Record<string, string> {
  return {
    tenant_name: d.tenant_name,
    property_address: d.property_address,
    amount_owed: formatCurrency(d.amount_owed),
    period_start: formatDate(d.period_start),
    period_end: formatDate(d.period_end),
    deadline_date: formatDate(d.payment_deadline_date),
    landlord_name: d.landlord_name,
    landlord_title: d.landlord_title,
    landlord_company: d.landlord_company,
    landlord_phone: d.landlord_phone,
    landlord_email: d.landlord_email,
    landlord_address: d.landlord_address,
    lease_reference: d.lease_reference,
    letter_date: formatDate(d.letter_date),
  };
}

/**
 * Replace {key} placeholders in a template string.
 * Mirrors Python str.format_map behaviour for the keys present in the map.
 */
function applyTemplate(template: string, map: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) => {
    const val = map[key];
    return val !== undefined ? val : match;
  });
}

/**
 * Word-wrap a single line of text to fit within maxWidth at the given font
 * size. Returns an array of lines. A hard-empty string produces [""].
 */
function wrapText(
  text: string,
  textFont: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  if (text === "") return [""];

  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (textFont.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // If a single word exceeds width, push it anyway to avoid infinite loop
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

// Re-export PDFPage type for use in tests (avoids phantom import)
export type { PDFPage };
