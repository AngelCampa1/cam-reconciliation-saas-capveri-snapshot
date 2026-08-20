/**
 * Shared PDF layout constants and drawing helpers for pdf-lib documents.
 *
 * Used by:
 *   - src/domain/exports/property-pdf.ts   (landlord property PDF)
 *   - src/domain/tenant-portal/statement-pdf.ts  (tenant statement PDF)
 *
 * Both produce Letter-size pages (612 x 792 pt) with 0.75in (54pt) margins.
 * Colors match FastAPI TenantPacketGenerator: DARK_BLUE = #1a365d, MED_BLUE = #2c5282.
 */

import { rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Re-exported so existing `import { formatDate } from "../pdf/layout"` callers
// keep working; the canonical implementation lives in ./format-date (no layout
// coupling) so non-layout generators can share it too.
export { formatDate } from "./format-date";

// ── Page geometry ─────────────────────────────────────────────────────────────

export const PAGE_WIDTH = 612;
export const PAGE_HEIGHT = 792;
export const MARGIN = 54;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// ── Colors ────────────────────────────────────────────────────────────────────

export const DARK_BLUE = rgb(0.102, 0.212, 0.365); // #1a365d
export const MED_BLUE = rgb(0.173, 0.322, 0.51); // #2c5282
export const WHITE = rgb(1, 1, 1);
export const BLACK = rgb(0, 0, 0);
export const GREY = rgb(0.4, 0.4, 0.4);
export const LIGHT_GREY_BG = rgb(0.95, 0.95, 0.95);

// ── Draw context ──────────────────────────────────────────────────────────────

export type DrawCtx = {
  page: PDFPage;
  font: PDFFont;
  boldFont: PDFFont;
  y: number;
};

// ── Drawing helpers ───────────────────────────────────────────────────────────

export function drawText(
  ctx: DrawCtx,
  text: string,
  x: number,
  y: number,
  size: number,
  font: PDFFont,
  color = BLACK,
): void {
  ctx.page.drawText(text, { x, y, size, font, color });
}

export function drawCenteredText(
  ctx: DrawCtx,
  text: string,
  y: number,
  size: number,
  font: PDFFont,
  color = BLACK,
): void {
  const textWidth = font.widthOfTextAtSize(text, size);
  const x = (PAGE_WIDTH - textWidth) / 2;
  ctx.page.drawText(text, { x, y, size, font, color });
}

export function drawHRule(ctx: DrawCtx, y: number): void {
  ctx.page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: GREY,
  });
}

export function drawSubheader(ctx: DrawCtx, text: string, y: number): number {
  drawText(ctx, text, MARGIN, y, 11, ctx.boldFont, MED_BLUE);
  drawHRule(ctx, y - 4);
  return y - 20;
}

// Date formatter: see the re-export of `formatDate` near the top of this file.
// The implementation lives in ./format-date.
