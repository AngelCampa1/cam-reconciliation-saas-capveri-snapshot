/**
 * SB 1103 compliance-packet export — data assembly + PDF + XLSX builders.
 *
 * Mirrors backend/app/services/compliance/sb1103_service.py:
 *   build_sb1103_export_data, generate_pdf_export, generate_excel_export.
 *
 * Money rounding:
 *   Each per-entry tenant_share_amount = amount × pro_rata_share,
 *   quantized to 2 dp using ROUND_HALF_UP (Decimal.ROUND_HALF_UP),
 *   matching Python's ROUND_HALF_UP used in the service.
 *   formatUsd uses ROUND_HALF_EVEN for display only, consistent with
 *   the Worker's existing currency formatter.
 *
 * Hand-checked figure (used in tests):
 *   amount = $500.005, pro_rata = 0.25
 *   tenant_share = 500.005 × 0.25 = 125.00125 → ROUND_HALF_UP → $125.00
 *   (ROUND_HALF_EVEN would give same result here; use 125.0050 × 0.25 = 31.25125 → $31.25)
 *
 * PDF generation uses pdf-lib (Letter size, 0.75in margins, DARK_BLUE = #1a365d).
 * XLSX generation uses ExcelJS (4 sheets: Cover, Ledger, Category Subtotals, Methodology).
 * ZIP uses fflate.zipSync (deflate level 6).
 *
 * The FastAPI route streams bytes directly (StreamingResponse) — no R2 storage.
 * This module follows the same contract: returns raw Uint8Array / Buffer bytes.
 */

import Decimal from "decimal.js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import ExcelJS from "exceljs";
import { zipSync } from "fflate";
import { formatUsd } from "../formatting/currency";
import { neutralizeFormula } from "../exports/erp-formatters";
import {
  CONTENT_WIDTH,
  GREY,
  MARGIN,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  WHITE,
  BLACK,
  drawHRule,
} from "../pdf/layout";
import type { Sb1103RequestRow, Sb1103Repository } from "./repository";

// ── Public types ──────────────────────────────────────────────────────────────

export type Sb1103GlEntry = {
  id: string;
  transaction_date: string; // YYYY-MM-DD
  account_code: string;
  account_description: string;
  vendor_name: string | null;
  description: string | null;
  /** Full expense amount (Decimal, ROUND_HALF_UP to 2 dp) */
  amount: Decimal;
  import_batch_id: string;
  /** amount × pro_rata_share, ROUND_HALF_UP to 2 dp */
  tenant_share_amount: Decimal;
};

export type Sb1103ExportData = {
  request: Sb1103RequestRow;
  property_name: string;
  property_address: string;
  is_ca_property: boolean;
  tenant_name: string;
  pro_rata_share: Decimal;
  gl_entries: Sb1103GlEntry[];
  /** account_description → sum of tenant_share_amounts (Decimal) */
  category_subtotals: Map<string, Decimal>;
  total_cam_expenses: Decimal;
  total_tenant_share: Decimal;
};

// ── Error types ───────────────────────────────────────────────────────────────

export class Sb1103NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`);
    this.name = "Sb1103NotFoundError";
  }
}

export class Sb1103ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Sb1103ValidationError";
  }
}

// ── Data assembly ─────────────────────────────────────────────────────────────

/**
 * Assemble all data needed for a complete SB 1103 export.
 * Mirrors Python build_sb1103_export_data exactly.
 *
 * Raises Sb1103NotFoundError if the request, property, or lease is not found.
 * Raises Sb1103ValidationError for business-rule violations.
 */
export async function buildSb1103ExportData(
  repository: Sb1103Repository,
  orgId: string,
  requestId: string,
): Promise<Sb1103ExportData> {
  const request = await repository.getRequestById(orgId, requestId);
  if (!request) {
    throw new Sb1103NotFoundError("SB1103Request", requestId);
  }

  const property = await repository.getPropertyForExport(
    orgId,
    request.property_id,
  );
  if (!property) {
    throw new Sb1103NotFoundError("Property", request.property_id);
  }

  const lease = await repository.getLeaseForExport(orgId, request.lease_id);
  if (!lease) {
    throw new Sb1103NotFoundError("Lease", request.lease_id);
  }

  if (lease.property_id !== request.property_id) {
    throw new Sb1103ValidationError(
      "Lease does not belong to the SB 1103 request property",
    );
  }

  // Extract pro_rata_share from recovery_profile (mirrors Python)
  const recovery = lease.recovery_profile ?? {};
  const proRataRaw = recovery["pro_rata_share"];
  const proRataShare = new Decimal(
    proRataRaw != null ? String(proRataRaw) : "0",
  );
  if (!proRataShare.isFinite() || proRataShare.lte(0) || proRataShare.gt(1)) {
    throw new Sb1103ValidationError(
      `Lease ${request.lease_id} has no valid pro_rata_share in its recovery_profile. ` +
        "Cannot generate SB 1103 export with a zero, missing, or above-100% pro-rata share.",
    );
  }

  // Build property address string (mirrors Python)
  const streetParts = [
    property.address_line1 ?? "",
    property.address_line2 ?? "",
  ].filter(Boolean);
  const streetLine = streetParts.join(", ");
  const city = property.city ?? "";
  const state = property.state ?? "";
  const postalCode = property.postal_code ?? "";
  const cityLine =
    city || state || postalCode
      ? `${city}, ${state} ${postalCode}`.trim().replace(/^,\s*/, "")
      : "";
  const propertyAddress = [streetLine, cityLine].filter(Boolean).join(", ");
  const isCaProperty = state.toUpperCase() === "CA";

  // Fetch GL entries
  const rawEntries = await repository.getGlEntriesForWindow(
    orgId,
    request.property_id,
    request.window_start_date,
    request.window_end_date,
  );

  // Build entries with per-entry tenant share (ROUND_HALF_UP, mirrors Python)
  const glEntries: Sb1103GlEntry[] = [];
  const categorySubtotals = new Map<string, Decimal>();
  let totalCamExpenses = new Decimal(0);
  let totalTenantShare = new Decimal(0);

  for (const row of rawEntries) {
    const amount = new Decimal(row.amount).toDecimalPlaces(
      2,
      Decimal.ROUND_HALF_UP,
    );
    const tenantShare = amount
      .times(proRataShare)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    glEntries.push({
      id: row.id,
      transaction_date: row.transaction_date,
      account_code: row.account_code,
      account_description: row.account_description,
      vendor_name: row.vendor_name,
      description: row.description,
      amount,
      import_batch_id: row.import_batch_id,
      tenant_share_amount: tenantShare,
    });

    const cat = row.account_description;
    categorySubtotals.set(
      cat,
      (categorySubtotals.get(cat) ?? new Decimal(0)).plus(tenantShare),
    );
    totalCamExpenses = totalCamExpenses.plus(amount);
    totalTenantShare = totalTenantShare.plus(tenantShare);
  }

  return {
    request,
    property_name: property.name,
    property_address: propertyAddress,
    is_ca_property: isCaProperty,
    tenant_name: lease.tenant_name ?? "",
    pro_rata_share: proRataShare,
    gl_entries: glEntries,
    category_subtotals: categorySubtotals,
    total_cam_expenses: totalCamExpenses,
    total_tenant_share: totalTenantShare,
  };
}

// ── Slug helper (mirrors Python _tenant_slug) ────────────────────────────────

/**
 * Convert tenant name to a URL-safe slug for filenames.
 * Mirrors Python: strip → replace spaces with _ → keep alphanumeric + _ → slice 30.
 */
export function tenantSlug(tenantName: string): string {
  const slug = tenantName.trim().replace(/\s+/gu, "_");
  const safe = slug.replace(/[^a-zA-Z0-9_]/gu, "");
  return safe.slice(0, 30) || "Tenant";
}

// ── Date formatter for documents ──────────────────────────────────────────────

/** Format YYYY-MM-DD as "Month D, YYYY" (no leading zero on day, mirrors Python). */
function fmtDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-");
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Format date string as MM/DD/YYYY for ledger table rows. */
function fmtDateMDY(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return `${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}/${String(year)}`;
}

// ── Illegal character stripping (mirrors Python openpyxl ILLEGAL_CHARACTERS_RE) ──

// eslint-disable-next-line no-control-regex -- intentionally mirrors openpyxl ILLEGAL_CHARACTERS_RE
const ILLEGAL_CHARACTERS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/gu;

// Strip XML-illegal control chars, then neutralize spreadsheet formula triggers
// (CWE-1236). ExcelJS writes string cell values verbatim and does NOT escape a
// leading `=`/`+`/`-`/`@`, so user-derived GL text (vendor_name, descriptions,
// property/tenant names from imported files) could otherwise execute as a
// formula when the recipient opens the packet. Mirrors the CSV exporters, which
// already neutralize the same fields.
function safeText(value: unknown): string {
  const stripped = String(value ?? "").replace(ILLEGAL_CHARACTERS_RE, "");
  return neutralizeFormula(stripped);
}

// ── PDF builder ───────────────────────────────────────────────────────────────

// SB 1103-specific accent colors (match Python HexColor values)
const SB_DARK_BLUE = rgb(0.118, 0.227, 0.541); // #1E3A8A
const SB_LIGHT_BG = rgb(0.941, 0.957, 1.0); // #F0F4FF
const SB_TOTAL_BG = rgb(0.878, 0.906, 1.0); // #E0E7FF

/**
 * Generate a SB 1103 compliance PDF packet.
 *
 * Content / section order mirrors Python SB1103PacketGenerator:
 *   1. Cover (title, info table, certification language, CA warning if applicable)
 *   2. Itemized CAM Expense Ledger table
 *   3. Category Subtotals table
 *   4. Pro-Rata Methodology + Gross-Up Disclosure
 */
export async function generateSb1103Pdf(
  data: Sb1103ExportData,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const req = data.request;

  // Helper: add a fresh page, reset y
  function newPage(): { page: ReturnType<typeof pdfDoc.addPage>; y: number } {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    return { page, y: PAGE_HEIGHT - MARGIN };
  }

  // ── Page 1: Cover ──────────────────────────────────────────────────────────
  let { page, y } = newPage();

  // Title
  page.drawText("California SB 1103 — CAM Expense Disclosure", {
    x: MARGIN,
    y,
    size: 16,
    font: boldFont,
    color: SB_DARK_BLUE,
  });
  y -= 22;

  page.drawText("Itemized Common Area Maintenance Ledger", {
    x: MARGIN,
    y,
    size: 12,
    font: boldFont,
    color: SB_DARK_BLUE,
  });
  y -= 24;

  drawHRule({ page, font, boldFont, y }, y);
  y -= 16;

  // Info table rows
  const ledgerPeriod = `${fmtDate(req.window_start_date)} — ${fmtDate(req.window_end_date)}`;
  const infoRows: [string, string][] = [
    ["Property:", data.property_name],
    ["Address:", data.property_address],
    ["Tenant:", data.tenant_name],
    ["Requestor Name:", req.requested_by_name],
    ["Requestor Email:", req.requested_by_email],
    ["Request Date:", fmtDate(req.request_date)],
    ["Response Deadline:", fmtDate(req.response_deadline)],
    ["Ledger Period:", ledgerPeriod],
  ];

  const labelX = MARGIN;
  const valueX = MARGIN + 130;
  const rowH = 16;
  for (let i = 0; i < infoRows.length; i++) {
    const [label, value] = infoRows[i] as [string, string];
    if (i % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 3,
        width: CONTENT_WIDTH,
        height: rowH,
        color: SB_LIGHT_BG,
      });
    }
    page.drawText(label, {
      x: labelX,
      y,
      size: 9,
      font: boldFont,
      color: BLACK,
    });
    page.drawText(value.slice(0, 80), {
      x: valueX,
      y,
      size: 9,
      font,
      color: BLACK,
    });
    y -= rowH;
  }
  y -= 12;

  // Landlord Certification heading
  page.drawText("Landlord Certification", {
    x: MARGIN,
    y,
    size: 12,
    font: boldFont,
    color: SB_DARK_BLUE,
  });
  drawHRule({ page, font, boldFont, y }, y - 4);
  y -= 20;

  // Certification body text (word-wrapped at ~80 chars per line)
  const certLines = [
    "This document is provided pursuant to California Civil Code Section 1938.1",
    "(SB 1103) in response to a written request from a Qualified Commercial Tenant",
    "(QCT). The landlord certifies that the Common Area Maintenance (CAM) expense",
    "records contained herein are true and accurate to the best of the landlord's",
    `knowledge, drawn from the property's general ledger for the period`,
    `${fmtDate(req.window_start_date)} through ${fmtDate(req.window_end_date)}.`,
    "This disclosure has been prepared in accordance with the landlord's obligation",
    "under California law to provide itemized CAM expense documentation within",
    "30 days of a qualifying written request.",
  ];
  for (const line of certLines) {
    page.drawText(line, { x: MARGIN, y, size: 9, font, color: BLACK });
    y -= 13;
  }
  y -= 8;

  if (!data.is_ca_property) {
    page.drawText(
      "Note: This property is not recorded as being located in California.",
      { x: MARGIN, y, size: 9, font, color: GREY },
    );
    y -= 13;
    page.drawText(
      "SB 1103 obligations may not apply. Please verify applicability with legal counsel.",
      { x: MARGIN, y, size: 9, font, color: GREY },
    );
    y -= 13;
  }

  // ── Ledger table (may span pages) ─────────────────────────────────────────
  y -= 12;
  if (y < 200) {
    ({ page, y } = newPage());
  }

  page.drawText("Itemized CAM Expense Ledger", {
    x: MARGIN,
    y,
    size: 12,
    font: boldFont,
    color: SB_DARK_BLUE,
  });
  drawHRule({ page, font, boldFont, y }, y - 4);
  y -= 20;

  // Table columns: Date | Account | Description/Vendor | Full Amount | Your Share
  const colWidths = [65, 94, 158, 72, 72]; // total = 461 (≈ CONTENT_WIDTH)
  const colX = [MARGIN];
  for (let i = 0; i < colWidths.length - 1; i++) {
    colX.push((colX[i] as number) + (colWidths[i] as number));
  }
  const tableHeaders = [
    "Date",
    "Account",
    "Description / Vendor",
    "Full Amount",
    "Your Share",
  ];
  const headerH = 16;

  function drawTableHeader(
    pg: ReturnType<typeof pdfDoc.addPage>,
    ty: number,
  ): void {
    pg.drawRectangle({
      x: MARGIN,
      y: ty - 2,
      width: CONTENT_WIDTH,
      height: headerH,
      color: SB_DARK_BLUE,
    });
    for (let c = 0; c < tableHeaders.length; c++) {
      pg.drawText(tableHeaders[c] as string, {
        x: (colX[c] as number) + 3,
        y: ty + 2,
        size: 8,
        font: boldFont,
        color: WHITE,
      });
    }
  }

  drawTableHeader(page, y);
  y -= headerH + 2;

  const rowHLedger = 14;
  for (let i = 0; i < data.gl_entries.length; i++) {
    if (y < 60) {
      ({ page, y } = newPage());
      drawTableHeader(page, y);
      y -= headerH + 2;
    }
    const entry = data.gl_entries[i] as Sb1103GlEntry;
    if (i % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 2,
        width: CONTENT_WIDTH,
        height: rowHLedger,
        color: SB_LIGHT_BG,
      });
    }
    const descVendor = entry.description
      ? entry.vendor_name
        ? `${entry.description} / ${entry.vendor_name}`
        : entry.description
      : (entry.vendor_name ?? entry.account_description);
    const cells = [
      fmtDateMDY(entry.transaction_date),
      `${entry.account_code}`,
      descVendor.slice(0, 40),
      formatUsd(entry.amount),
      formatUsd(entry.tenant_share_amount),
    ];
    for (let c = 0; c < cells.length; c++) {
      const isRight = c >= 3;
      const cellText = cells[c] as string;
      const x = isRight
        ? (colX[c] as number) +
          (colWidths[c] as number) -
          font.widthOfTextAtSize(cellText, 8) -
          3
        : (colX[c] as number) + 3;
      page.drawText(cellText, { x, y, size: 8, font, color: BLACK });
    }
    y -= rowHLedger;
  }

  // Totals row
  if (y < 60) {
    ({ page, y } = newPage());
  }
  page.drawRectangle({
    x: MARGIN,
    y: y - 2,
    width: CONTENT_WIDTH,
    height: rowHLedger,
    color: SB_TOTAL_BG,
  });
  page.drawText("TOTAL", {
    x: (colX[2] as number) + 3,
    y,
    size: 8,
    font: boldFont,
    color: BLACK,
  });
  const totalCamStr = formatUsd(data.total_cam_expenses);
  const totalShareStr = formatUsd(data.total_tenant_share);
  page.drawText(totalCamStr, {
    x:
      (colX[3] as number) +
      (colWidths[3] as number) -
      boldFont.widthOfTextAtSize(totalCamStr, 8) -
      3,
    y,
    size: 8,
    font: boldFont,
    color: BLACK,
  });
  page.drawText(totalShareStr, {
    x:
      (colX[4] as number) +
      (colWidths[4] as number) -
      boldFont.widthOfTextAtSize(totalShareStr, 8) -
      3,
    y,
    size: 8,
    font: boldFont,
    color: BLACK,
  });
  y -= rowHLedger + 12;

  // ── Category Subtotals ─────────────────────────────────────────────────────
  if (y < 150) {
    ({ page, y } = newPage());
  }
  page.drawText("Category Subtotals", {
    x: MARGIN,
    y,
    size: 12,
    font: boldFont,
    color: SB_DARK_BLUE,
  });
  drawHRule({ page, font, boldFont, y }, y - 4);
  y -= 20;

  const catColW0 = 290;
  const catColW1 = 110;
  const catColX0 = MARGIN;
  const catColX1 = MARGIN + catColW0;
  const catTableWidth = catColW0 + catColW1;
  const catHeaders = ["Expense Category", "Tenant Share"];

  page.drawRectangle({
    x: MARGIN,
    y: y - 2,
    width: catTableWidth,
    height: headerH,
    color: SB_DARK_BLUE,
  });
  page.drawText(catHeaders[0] as string, {
    x: catColX0 + 3,
    y: y + 2,
    size: 9,
    font: boldFont,
    color: WHITE,
  });
  page.drawText(catHeaders[1] as string, {
    x: catColX1 + 3,
    y: y + 2,
    size: 9,
    font: boldFont,
    color: WHITE,
  });
  y -= headerH + 2;

  const sortedCats = [...data.category_subtotals.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (let i = 0; i < sortedCats.length; i++) {
    if (y < 60) {
      ({ page, y } = newPage());
    }
    const [cat, subtotal] = sortedCats[i] as [string, Decimal];
    if (i % 2 === 1) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 2,
        width: catTableWidth,
        height: rowHLedger,
        color: SB_LIGHT_BG,
      });
    }
    page.drawText(cat.slice(0, 55), {
      x: catColX0 + 3,
      y,
      size: 9,
      font,
      color: BLACK,
    });
    const subStr = formatUsd(subtotal);
    page.drawText(subStr, {
      x: catColX1 + catColW1 - font.widthOfTextAtSize(subStr, 9) - 3,
      y,
      size: 9,
      font,
      color: BLACK,
    });
    y -= rowHLedger;
  }

  if (y < 60) {
    ({ page, y } = newPage());
  }
  page.drawRectangle({
    x: MARGIN,
    y: y - 2,
    width: catTableWidth,
    height: rowHLedger,
    color: SB_TOTAL_BG,
  });
  page.drawText("TOTAL", {
    x: catColX0 + 3,
    y,
    size: 9,
    font: boldFont,
    color: BLACK,
  });
  const catTotalStr = formatUsd(data.total_tenant_share);
  page.drawText(catTotalStr, {
    x: catColX1 + catColW1 - boldFont.widthOfTextAtSize(catTotalStr, 9) - 3,
    y,
    size: 9,
    font: boldFont,
    color: BLACK,
  });
  y -= rowHLedger + 16;

  // ── Methodology + Gross-Up Disclosure ─────────────────────────────────────
  if (y < 150) {
    ({ page, y } = newPage());
  }
  page.drawText("Pro-Rata Methodology", {
    x: MARGIN,
    y,
    size: 12,
    font: boldFont,
    color: SB_DARK_BLUE,
  });
  drawHRule({ page, font, boldFont, y }, y - 4);
  y -= 20;

  const pctDisplay = data.pro_rata_share.times(100).toFixed(4);
  const methodLines = [
    `The tenant's pro-rata share of Common Area Maintenance expenses is ${pctDisplay}% of`,
    "total CAM charges, as specified in the lease agreement. Each line item amount shown",
    "under 'Your Share' is calculated as: Full Amount × Pro-Rata Share,",
    "rounded to the nearest cent (ROUND_HALF_UP).",
  ];
  for (const line of methodLines) {
    page.drawText(line, { x: MARGIN, y, size: 9, font, color: BLACK });
    y -= 13;
  }
  y -= 8;

  page.drawText("Gross-Up Disclosure", {
    x: MARGIN,
    y,
    size: 12,
    font: boldFont,
    color: SB_DARK_BLUE,
  });
  drawHRule({ page, font, boldFont, y }, y - 4);
  y -= 20;

  const grossUpLines = [
    "Where applicable, certain variable expenses may have been grossed up to reflect",
    "100% occupancy, as permitted by the lease. The ledger above reflects actual expenses",
    "as recorded in the general ledger. Any gross-up adjustments are disclosed separately",
    "in the annual CAM reconciliation statement.",
  ];
  for (const line of grossUpLines) {
    page.drawText(line, { x: MARGIN, y, size: 9, font, color: BLACK });
    y -= 13;
  }

  return pdfDoc.save();
}

// ── XLSX builder ──────────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A8A" },
};
const ALT_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF0F4FF" },
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE0E7FF" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
};
const BOLD_FONT: Partial<ExcelJS.Font> = { bold: true };

/**
 * Generate a SB 1103 compliance Excel workbook with 4 sheets.
 * Mirrors Python generate_excel_export exactly:
 *   Sheet 1: Cover
 *   Sheet 2: Ledger
 *   Sheet 3: Category Subtotals
 *   Sheet 4: Methodology
 */
export async function generateSb1103Xlsx(
  data: Sb1103ExportData,
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();

  _buildCoverSheet(wb, data);
  _buildLedgerSheet(wb, data);
  _buildSubtotalsSheet(wb, data);
  _buildMethodologySheet(wb, data);

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(
    buffer instanceof ArrayBuffer ? buffer : (buffer as ArrayBuffer),
  );
}

function _buildCoverSheet(wb: ExcelJS.Workbook, data: Sb1103ExportData): void {
  const ws = wb.addWorksheet("Cover");
  const req = data.request;

  ws.getCell("A1").value = "California SB 1103 — CAM Expense Disclosure";
  ws.getCell("A1").font = { bold: true, size: 14, color: { argb: "FF1E3A8A" } };

  const info: [string, string][] = [
    ["Property", safeText(data.property_name)],
    ["Address", safeText(data.property_address)],
    ["Tenant", safeText(data.tenant_name)],
    ["Requestor Name", safeText(req.requested_by_name)],
    ["Requestor Email", safeText(req.requested_by_email)],
    ["Request Date", fmtDate(req.request_date)],
    ["Response Deadline", fmtDate(req.response_deadline)],
    [
      "Ledger Period",
      `${fmtDate(req.window_start_date)} — ${fmtDate(req.window_end_date)}`,
    ],
    ["Pro-Rata Share", `${data.pro_rata_share.times(100).toFixed(4)}%`],
    ["Total CAM Expenses", formatUsd(data.total_cam_expenses)],
    ["Tenant Total Share", formatUsd(data.total_tenant_share)],
  ];

  for (let i = 0; i < info.length; i++) {
    const rowNum = i + 3;
    const [label, value] = info[i] as [string, string];
    ws.getCell(rowNum, 1).value = label;
    ws.getCell(rowNum, 1).font = BOLD_FONT;
    ws.getCell(rowNum, 2).value = value;
  }

  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 45;

  const certRow = info.length + 5;
  ws.getCell(certRow, 1).value = "Landlord Certification";
  ws.getCell(certRow, 1).font = {
    bold: true,
    size: 11,
    color: { argb: "FF1E3A8A" },
  };

  const certText =
    "This document is provided pursuant to California Civil Code Section 1938.1 " +
    "(SB 1103) in response to a written request from a Qualified Commercial Tenant. " +
    "The landlord certifies the CAM expense records are true and accurate.";
  ws.getCell(certRow + 1, 1).value = certText;
  ws.getCell(certRow + 1, 1).alignment = { wrapText: true };
  ws.mergeCells(certRow + 1, 1, certRow + 3, 2);
  ws.getRow(certRow + 1).height = 60;
}

function _buildLedgerSheet(wb: ExcelJS.Workbook, data: Sb1103ExportData): void {
  const ws = wb.addWorksheet("Ledger");

  const headers = [
    "Date",
    "Account Code",
    "Account Description",
    "Vendor",
    "Description",
    "Full Amount",
    "Your Share",
    "Import Batch ID",
  ];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center" };
  });

  for (let i = 0; i < data.gl_entries.length; i++) {
    const entry = data.gl_entries[i] as Sb1103GlEntry;
    const rowData = [
      entry.transaction_date, // YYYY-MM-DD string
      safeText(entry.account_code),
      safeText(entry.account_description),
      safeText(entry.vendor_name ?? ""),
      safeText(entry.description ?? ""),
      formatUsd(entry.amount),
      formatUsd(entry.tenant_share_amount),
      entry.import_batch_id,
    ];
    const dataRow = ws.addRow(rowData);
    if (i % 2 === 1) {
      dataRow.eachCell((cell) => {
        cell.fill = ALT_FILL;
      });
    }
  }

  // Totals row
  const totalRow = ws.addRow([
    "",
    "",
    "",
    "",
    "TOTAL",
    formatUsd(data.total_cam_expenses),
    formatUsd(data.total_tenant_share),
    "",
  ]);
  totalRow.eachCell((cell) => {
    cell.fill = TOTAL_FILL;
    cell.font = BOLD_FONT;
  });

  // Auto-width
  ws.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 50);
  });
}

function _buildSubtotalsSheet(
  wb: ExcelJS.Workbook,
  data: Sb1103ExportData,
): void {
  const ws = wb.addWorksheet("Category Subtotals");

  const headerRow = ws.addRow(["Expense Category", "Tenant Share"]);
  headerRow.eachCell((cell) => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: "center" };
  });

  const sorted = [...data.category_subtotals.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (let i = 0; i < sorted.length; i++) {
    const [cat, subtotal] = sorted[i] as [string, Decimal];
    const dataRow = ws.addRow([safeText(cat), formatUsd(subtotal)]);
    if (i % 2 === 1) {
      dataRow.eachCell((cell) => {
        cell.fill = ALT_FILL;
      });
    }
  }

  const totalRow = ws.addRow(["TOTAL", formatUsd(data.total_tenant_share)]);
  totalRow.eachCell((cell) => {
    cell.fill = TOTAL_FILL;
    cell.font = BOLD_FONT;
  });

  ws.columns.forEach((col) => {
    let max = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length;
      if (len > max) max = len;
    });
    col.width = Math.min(max + 2, 50);
  });
}

function _buildMethodologySheet(
  wb: ExcelJS.Workbook,
  data: Sb1103ExportData,
): void {
  const ws = wb.addWorksheet("Methodology");

  ws.getCell("A1").value = "Pro-Rata Methodology";
  ws.getCell("A1").font = { bold: true, size: 12, color: { argb: "FF1E3A8A" } };

  ws.getCell("A3").value = "Pro-Rata Share";
  ws.getCell("A3").font = BOLD_FONT;
  ws.getCell("B3").value = `${data.pro_rata_share.times(100).toFixed(4)}%`;

  ws.getCell("A4").value = "Calculation Method";
  ws.getCell("A4").font = BOLD_FONT;
  ws.getCell("B4").value =
    "Full Amount × Pro-Rata Share, rounded to nearest cent (ROUND_HALF_UP)";

  ws.getCell("A6").value = "Gross-Up Disclosure";
  ws.getCell("A6").font = { bold: true, size: 11, color: { argb: "FF1E3A8A" } };
  ws.getCell("A7").value =
    "Where applicable, certain variable expenses may have been grossed up to reflect " +
    "100% occupancy, as permitted by the lease. The ledger reflects actual expenses " +
    "as recorded in the general ledger.";
  ws.getCell("A7").alignment = { wrapText: true };
  ws.mergeCells("A7:B9");
  ws.getRow(7).height = 60;

  ws.getCell("A11").value = "Legal Reference";
  ws.getCell("A11").font = BOLD_FONT;
  ws.getCell("B11").value = "California Civil Code Section 1938.1 (SB 1103)";

  ws.getColumn(1).width = 25;
  ws.getColumn(2).width = 65;
}

// ── ZIP helper ────────────────────────────────────────────────────────────────

/**
 * Zip PDF and XLSX bytes together using fflate.zipSync (deflate level 6,
 * matching the ZIP_DEFLATED pattern used by exports-routes.ts).
 */
export function zipSb1103Packet(
  baseName: string,
  pdfBytes: Uint8Array,
  xlsxBytes: Uint8Array,
): Uint8Array {
  return zipSync(
    {
      [`${baseName}.pdf`]: pdfBytes,
      [`${baseName}.xlsx`]: xlsxBytes,
    },
    { level: 6 },
  );
}
