import { PDFDocument, StandardFonts } from "pdf-lib";
import { formatTraceValue, formatUsd } from "../formatting/currency";
import type { StatementPdfContext } from "../tenant-disputes/repository";
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

export async function buildStatementPdf(
  context: StatementPdfContext,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: DrawCtx = { page, font, boldFont, y: PAGE_HEIGHT - MARGIN };

  const { snapshot, lease, property, organization } = context;

  // ── Header ──────────────────────────────────────────────────────────────
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

  // ── Tenant Information ───────────────────────────────────────────────────
  ctx.y = drawSubheader(ctx, "Tenant Information", ctx.y);
  drawText(ctx, `Tenant: ${lease.tenant_name}`, MARGIN, ctx.y, 10, font);
  ctx.y -= 20;

  // ── Expense Summary Table ────────────────────────────────────────────────
  ctx.y = drawSubheader(ctx, "Expense Summary", ctx.y);

  const expenseRows: Array<{ label: string; amount: string; bold?: boolean }> =
    [
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

  // Separator line before total
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

  // ── Calculation Summary ──────────────────────────────────────────────────
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
      if (ctx.y < MARGIN + 60) {
        // Would overflow; clip gracefully (real-world traces are bounded)
        break;
      }
      const stepName = String(step.step_name ?? "").trim();
      const hasOutput =
        step.output_value !== null && step.output_value !== undefined;

      if (stepName && hasOutput) {
        const unit = step.output_unit ?? "currency";
        const valueStr = formatTraceValue(step.output_value, unit);
        let line = `${stepName}: ${valueStr}`;
        if (step.operation) {
          line += ` (${step.operation})`;
        }
        drawText(ctx, line, MARGIN, ctx.y, 9, font);
        ctx.y -= 13;
      }

      const note = String(step.note ?? "").trim();
      if (note) {
        drawText(ctx, `  Note: ${note}`, MARGIN, ctx.y, 8, font, GREY);
        ctx.y -= 12;
      }
    }
  }

  ctx.y -= 6;

  // ── Footer ───────────────────────────────────────────────────────────────
  const disclaimer =
    "This reconciliation statement is provided for informational purposes. Please review all " +
    "calculations and contact us with any questions or concerns. Payment is due within 30 days " +
    "of receipt unless otherwise specified in your lease agreement.";

  const generatedStr = formatGeneratedOn(new Date());

  // Wrap disclaimer manually to the printable width.
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

  // Footer is bottom-anchored: the "Generated on" line sits on the bottom margin,
  // the disclaimer block stacks above it in natural reading order, and the
  // separator rule sits above the disclaimer. Drawn top-down with the rule
  // cleared above the first line's cap height so it never crosses the text.
  const footerLineH = 10;
  const generatedY = MARGIN;
  const disclaimerTopY = generatedY + 12 + lines.length * footerLineH;
  drawHRule(ctx, disclaimerTopY + 10);
  let footerTextY = disclaimerTopY;
  for (const line of lines) {
    drawText(ctx, line, MARGIN, footerTextY, 8, font, GREY);
    footerTextY -= footerLineH;
  }
  drawText(ctx, generatedStr, MARGIN, generatedY, 8, font, GREY);

  const pdfBytes = await doc.save();
  return pdfBytes;
}

/**
 * The "Generated on <date>" line shown at the bottom of the statement.
 * Uses the same friendly "Month D, YYYY" format as the rest of the document
 * (never a raw ISO timestamp). Exported for render-level regression coverage.
 */
export function formatGeneratedOn(now: Date): string {
  return `Generated on ${formatDate(now.toISOString().slice(0, 10))}`;
}
