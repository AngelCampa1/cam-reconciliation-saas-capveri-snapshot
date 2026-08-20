/**
 * Landlord-facing property/snapshot PDF builder.
 *
 * This is the landlord twin of src/domain/tenant-portal/statement-pdf.ts.
 * Both files import shared layout constants and helpers from
 * src/domain/pdf/layout.ts; document content mirrors FastAPI's
 * TenantPacketGenerator layout (same sections, same labels, same number
 * formatting) because both the tenant-portal statement and the landlord
 * export render the same reconciliation data.
 *
 * FastAPI source: backend/app/api/v1/exports.py TenantPacketGenerator
 *                 backend/app/api/v1/export.py  _generate_property_pdf
 */

import { PDFDocument, StandardFonts } from "pdf-lib";
import { formatTraceValue, formatUsd } from "../formatting/currency";
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

// ── Input types ───────────────────────────────────────────────────────────────

export type SnapshotForPdf = {
  id: string;
  /** lease_id (UUID string) — used for in-app tenant_id filtering in the preview route. */
  lease_id: string;
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
  status: string;
};

export type PropertyPdfContext = {
  snapshot: SnapshotForPdf;
  lease: { tenant_name: string };
  property: { name: string; address?: string | null };
  organization: { name: string };
};

// ── Public API ────────────────────────────────────────────────────────────────

export async function buildPropertyPdf(
  context: PropertyPdfContext,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: DrawCtx = { page, font, boldFont, y: PAGE_HEIGHT - MARGIN };

  const { snapshot, lease, property, organization } = context;

  // ── Header ───────────────────────────────────────────────────────────────
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

  // ── Property Information ──────────────────────────────────────────────────
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
    {
      label: "Base Year Amount",
      amount: formatUsd(snapshot.base_year_amount),
    },
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

  const tableTop = ctx.y;
  const rowH = 16;
  const col1X = MARGIN;
  const col2X = MARGIN + CONTENT_WIDTH - 100;
  const tableW = CONTENT_WIDTH;

  // Header row
  page.drawRectangle({
    x: col1X,
    y: tableTop - rowH,
    width: tableW,
    height: rowH,
    color: DARK_BLUE,
  });
  drawText(
    ctx,
    "Description",
    col1X + 4,
    tableTop - rowH + 4,
    9,
    boldFont,
    WHITE,
  );
  drawText(ctx, "Amount", col2X, tableTop - rowH + 4, 9, boldFont, WHITE);
  ctx.y = tableTop - rowH;

  // Data rows
  for (let i = 0; i < expenseRows.length; i++) {
    const row = expenseRows[i];
    if (!row) continue;
    const rowY = ctx.y - rowH;
    const bgColor = i % 2 === 0 ? LIGHT_GREY_BG : WHITE;
    page.drawRectangle({
      x: col1X,
      y: rowY,
      width: tableW,
      height: rowH,
      color: bgColor,
    });
    drawText(ctx, row.label, col1X + 4, rowY + 4, 9, font);
    const amtWidth = font.widthOfTextAtSize(row.amount, 9);
    drawText(
      ctx,
      row.amount,
      PAGE_WIDTH - MARGIN - amtWidth - 4,
      rowY + 4,
      9,
      font,
    );
    ctx.y = rowY;
  }

  ctx.y -= 2;
  drawHRule(ctx, ctx.y);
  ctx.y -= 2;

  // Total row
  const totalRowY = ctx.y - rowH;
  page.drawRectangle({
    x: col1X,
    y: totalRowY,
    width: tableW,
    height: rowH,
    color: DARK_BLUE,
  });
  drawText(
    ctx,
    "Total Amount Due",
    col1X + 4,
    totalRowY + 4,
    9,
    boldFont,
    WHITE,
  );
  const totalAmt = formatUsd(snapshot.total_recovery);
  const totalAmtWidth = boldFont.widthOfTextAtSize(totalAmt, 9);
  drawText(
    ctx,
    totalAmt,
    PAGE_WIDTH - MARGIN - totalAmtWidth - 4,
    totalRowY + 4,
    9,
    boldFont,
    WHITE,
  );
  ctx.y = totalRowY - 16;

  // ── Calculation Summary ───────────────────────────────────────────────────
  ctx.y = drawSubheader(ctx, "Calculation Summary", ctx.y);

  const trace = snapshot.calculation_trace;
  if (trace.length === 0) {
    drawText(
      ctx,
      "No detailed calculation trace available for this snapshot.",
      MARGIN,
      ctx.y,
      9,
      font,
      GREY,
    );
    ctx.y -= 14;
  } else {
    for (const step of trace) {
      if (ctx.y < MARGIN + 60) break;
      const unit = step.output_unit ?? "currency";
      const valueStr = formatTraceValue(step.output_value, unit);
      let line = `${step.step_name}: ${valueStr}`;
      if (step.operation) {
        line += ` (${step.operation})`;
      }
      drawText(ctx, line, MARGIN, ctx.y, 9, font);
      ctx.y -= 13;
      if (step.note) {
        // 2 spaces matches FastAPI TenantPacketGenerator "  Note:" prefix
        drawText(ctx, `  Note: ${step.note}`, MARGIN, ctx.y, 8, font, GREY);
        ctx.y -= 12;
      }
    }
  }

  ctx.y -= 6;

  // ── Footer ────────────────────────────────────────────────────────────────
  const disclaimer =
    "This reconciliation statement is provided for informational purposes. Please review all " +
    "calculations and contact us with any questions or concerns. Payment is due within 30 days " +
    "of receipt unless otherwise specified in your lease agreement.";

  const now = new Date();
  // Note: FastAPI uses date.today() (server local time); the Worker uses UTC.
  // Difference is at most one calendar day near midnight. UTC is intentional
  // here — Workers run in a stateless global environment with no guaranteed TZ.
  const generatedStr = `Generated: ${now.toISOString().replace("T", " ").slice(0, 19)} UTC`;

  const footerY = MARGIN + 20;
  drawHRule(ctx, footerY + 16);

  const words = disclaimer.split(" ");
  const lines: string[] = [];
  let currentLine = "";
  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, 8) > CONTENT_WIDTH) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine) lines.push(currentLine);

  let footerTextY = footerY + 10;
  for (const line of [...lines].reverse()) {
    drawText(ctx, line, MARGIN, footerTextY, 8, font, GREY);
    footerTextY += 10;
  }

  drawText(ctx, generatedStr, MARGIN, MARGIN, 8, font, GREY);

  return doc.save();
}
