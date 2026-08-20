/**
 * Expense summary PDF builder for the tax protest data package.
 *
 * File 1 of 4: 01_Expense_Summary.pdf
 *
 * Mirrors FastAPI TenantPacketGenerator (backend/app/api/v1/exports.py):
 *   - Header: org name, "Tenant Reconciliation Statement", period
 *   - Property Information section
 *   - Tenant Information section
 *   - Expense Summary table (7 rows + total)
 *   - Calculation Summary (one line per trace step)
 *   - Footer disclaimer + timestamp
 *
 * Uses pdf-lib helpers from src/domain/pdf/layout.ts.
 * Money formatting matches Python's `f"-${amount:,.2f}"` / `f"${amount:,.2f}"`
 * via formatUsd (ROUND_HALF_EVEN — Python's ":,.2f" uses the same IEEE banker's
 * rounding for the display string). No floats; all amounts go through Decimal.
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import Decimal from "decimal.js";
import { formatUsd, formatTraceValue } from "../formatting/currency";
import {
  CONTENT_WIDTH,
  DARK_BLUE,
  GREY,
  LIGHT_GREY_BG,
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

// ── Input type ────────────────────────────────────────────────────────────────

export type ExpenseSummaryPdfInput = {
  snapshot: {
    period_start_date: string;
    period_end_date: string;
    total_operating_expenses: string;
    grossed_up_expenses: string;
    base_year_amount: string;
    tenant_share_before_cap: string;
    tenant_share_after_cap: string;
    admin_fee: string;
    total_recovery: string;
    calculation_trace: Array<{
      step_name: string;
      operation: string | null;
      output_value: unknown;
      output_unit: string | null;
      note: string | null;
    }>;
  };
  lease: { tenant_name: string };
  property: { name: string; address?: string | null };
  organization: { name: string };
};

// ── Builder ───────────────────────────────────────────────────────────────────

export async function buildExpenseSummaryPdf(
  input: ExpenseSummaryPdfInput,
): Promise<Uint8Array> {
  const { snapshot, lease, property, organization } = input;

  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: DrawCtx = { page, font, boldFont, y: PAGE_HEIGHT - MARGIN };

  // ── Header ────────────────────────────────────────────────────────────────
  drawCenteredText(ctx, organization.name, ctx.y, 18, boldFont, DARK_BLUE);
  ctx.y -= 26;
  drawCenteredText(
    ctx,
    "Tenant Reconciliation Statement",
    ctx.y,
    14,
    boldFont,
    MED_BLUE,
  );
  ctx.y -= 18;

  const periodLine = `Period: ${formatDate(snapshot.period_start_date)} - ${formatDate(snapshot.period_end_date)}`;
  drawCenteredText(ctx, periodLine, ctx.y, 10, font);
  ctx.y -= 20;

  drawHRule(ctx, ctx.y);
  ctx.y -= 16;

  // ── Property Information ─────────────────────────────────────────────────
  ctx.y = drawSubheader(ctx, "Property Information", ctx.y);
  drawText(ctx, `Property: ${property.name}`, MARGIN, ctx.y, 10, font);
  ctx.y -= 14;
  if (property.address) {
    drawText(ctx, `Address: ${property.address}`, MARGIN, ctx.y, 10, font);
    ctx.y -= 14;
  }
  ctx.y -= 6;

  // ── Tenant Information ────────────────────────────────────────────────────
  ctx.y = drawSubheader(ctx, "Tenant Information", ctx.y);
  drawText(ctx, `Tenant: ${lease.tenant_name}`, MARGIN, ctx.y, 10, font);
  ctx.y -= 20;

  // ── Expense Summary Table ─────────────────────────────────────────────────
  ctx.y = drawSubheader(ctx, "Expense Summary", ctx.y);

  const expenseRows: Array<{ label: string; amount: string }> = [
    {
      label: "Total Operating Expenses",
      amount: formatUsd(snapshot.total_operating_expenses),
    },
    {
      label: "Grossed-Up Expenses",
      amount: formatUsd(snapshot.grossed_up_expenses),
    },
    { label: "Base Year Amount", amount: formatUsd(snapshot.base_year_amount) },
    {
      label: "Tenant Share (Before Cap)",
      amount: formatUsd(snapshot.tenant_share_before_cap),
    },
    {
      label: "Tenant Share (After Cap)",
      amount: formatUsd(snapshot.tenant_share_after_cap),
    },
    { label: "Administrative Fee", amount: formatUsd(snapshot.admin_fee) },
  ];

  const rowH = 16;
  const col1X = MARGIN;
  const col2X = MARGIN + CONTENT_WIDTH - 100;
  const tableW = CONTENT_WIDTH;

  // Header row
  page.drawRectangle({
    x: col1X,
    y: ctx.y - rowH + 4,
    width: tableW,
    height: rowH,
    color: MED_BLUE,
  });
  drawText(ctx, "Description", col1X + 4, ctx.y - 2, 10, boldFont, WHITE);
  drawText(ctx, "Amount", col2X + 4, ctx.y - 2, 10, boldFont, WHITE);
  ctx.y -= rowH;

  // Data rows
  for (let i = 0; i < expenseRows.length; i++) {
    const row = expenseRows[i]!;
    const bg = i % 2 === 0 ? LIGHT_GREY_BG : WHITE;
    page.drawRectangle({
      x: col1X,
      y: ctx.y - rowH + 4,
      width: tableW,
      height: rowH,
      color: bg,
    });
    drawText(ctx, row.label, col1X + 4, ctx.y - 2, 10, font);
    drawText(ctx, row.amount, col2X + 4, ctx.y - 2, 10, font);
    ctx.y -= rowH;
  }

  // Total row — bold highlight
  page.drawRectangle({
    x: col1X,
    y: ctx.y - rowH + 4,
    width: tableW,
    height: rowH,
    color: LIGHT_GREY_BG,
  });
  page.drawLine({
    start: { x: col1X, y: ctx.y + rowH - 2 },
    end: { x: col1X + tableW, y: ctx.y + rowH - 2 },
    thickness: 1.5,
    color: MED_BLUE,
  });
  drawText(ctx, "Total Amount Due", col1X + 4, ctx.y - 2, 11, boldFont);
  drawText(
    ctx,
    formatUsd(snapshot.total_recovery),
    col2X + 4,
    ctx.y - 2,
    11,
    boldFont,
  );
  ctx.y -= rowH + 10;

  // ── Calculation Summary ───────────────────────────────────────────────────
  ctx.y = drawSubheader(ctx, "Calculation Summary", ctx.y);

  const calcTrace = snapshot.calculation_trace;
  if (!calcTrace || calcTrace.length === 0) {
    drawText(
      ctx,
      "No detailed calculation trace available for this snapshot.",
      MARGIN,
      ctx.y,
      10,
      font,
      GREY,
    );
    ctx.y -= 14;
  } else {
    for (const step of calcTrace) {
      if (ctx.y < MARGIN + 60) break; // guard against overflow off page
      const valueStr = formatTraceValue(
        step.output_value,
        step.output_unit ?? "currency",
      );
      const line = `${step.step_name}: ${valueStr}${step.operation ? ` (${step.operation})` : ""}`;
      drawText(ctx, line, MARGIN, ctx.y, 10, font);
      ctx.y -= 13;
      if (step.note) {
        drawText(ctx, `  Note: ${step.note}`, MARGIN, ctx.y, 9, font, GREY);
        ctx.y -= 12;
      }
    }
  }

  ctx.y -= 10;

  // ── Footer ────────────────────────────────────────────────────────────────
  const disclaimer =
    "This reconciliation statement is provided for informational purposes. " +
    "Please review all calculations and contact us with any questions or concerns. " +
    "Payment is due within 30 days of receipt unless otherwise specified in your lease agreement.";

  // Wrap disclaimer across available width (simple word-wrap at ~100 chars)
  const words = disclaimer.split(" ");
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > 100 && line) {
      if (ctx.y > MARGIN) {
        drawText(ctx, line, MARGIN, ctx.y, 8, font, GREY);
        ctx.y -= 11;
      }
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line && ctx.y > MARGIN) {
    drawText(ctx, line, MARGIN, ctx.y, 8, font, GREY);
    ctx.y -= 11;
  }

  // Timestamp
  const ts = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  if (ctx.y > MARGIN) {
    drawText(ctx, `Generated: ${ts}`, MARGIN, ctx.y, 8, font, GREY);
  }

  return doc.save();
}

/**
 * Hand-checked figure for unit test assertion:
 * total_recovery = "1234.56" → formatUsd → "$1,234.56"
 * Uses Decimal ROUND_HALF_EVEN (Python ":,.2f" mode).
 */
export function formatExpenseAmount(raw: string): string {
  return formatUsd(new Decimal(raw));
}
