/**
 * GL-by-category CSV builder for the tax protest data package.
 *
 * File 2 of 4: 02_GL_by_Category.csv
 *
 * Mirrors FastAPI GLCategoryCSVExporter
 * (backend/app/services/export/gl_category_csv.py):
 *   Columns: Tax Year, Pool Name, Pool Type, Account Code,
 *            Account Description, Amount, Pool Total
 *
 * Amount and Pool Total are plain decimal strings (no thousands separator)
 * so spreadsheet SUM() functions parse them correctly. Matches the
 * Python `f"{Decimal(...):.2f}"` format (ROUND_HALF_EVEN, 2 decimal places).
 *
 * CSV injection mitigation: neutralizeFormula() applied to all text cells.
 * Amount/Pool Total cells are numeric — neutralizeFormula is NOT applied there
 * (same policy as the Python backend which calls neutralize_formula only on
 * text/name columns, leaving the Amount cell as a bare decimal string).
 */

import Decimal from "decimal.js";
import { neutralizeFormula } from "../exports/erp-formatters";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GlPoolItem = {
  account_code: string;
  account_description: string;
  /** Amount as a decimal string after allocation_percentage applied. */
  amount: string;
};

export type GlPool = {
  pool_name: string;
  pool_type: string;
  pool_total: string;
  items: GlPoolItem[];
};

// ── CSV fieldnames (mirrors Python _FIELDNAMES) ───────────────────────────────

const FIELDNAMES = [
  "Tax Year",
  "Pool Name",
  "Pool Type",
  "Account Code",
  "Account Description",
  "Amount",
  "Pool Total",
] as const;

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Build the GL-by-category CSV as a UTF-8 string.
 * Mirrors GLCategoryCSVExporter.generate() exactly.
 */
export function buildGlCategoryCsv(pools: GlPool[], taxYear: number): string {
  const rows: string[] = [FIELDNAMES.join(",")];

  for (const pool of pools) {
    const poolTotal = new Decimal(pool.pool_total).toFixed(
      2,
      Decimal.ROUND_HALF_EVEN,
    );

    for (const item of pool.items) {
      const amount = new Decimal(item.amount).toFixed(
        2,
        Decimal.ROUND_HALF_EVEN,
      );
      const cells = [
        csvCell(String(taxYear)),
        csvCell(neutralizeFormula(pool.pool_name)),
        csvCell(neutralizeFormula(pool.pool_type)),
        csvCell(neutralizeFormula(item.account_code)),
        csvCell(neutralizeFormula(item.account_description)),
        // Numeric cells: no quoting unless they contain commas/quotes/newlines
        // (they won't, being decimal strings), and no neutralizeFormula.
        amount,
        poolTotal,
      ];
      rows.push(cells.join(","));
    }
  }

  return rows.join("\r\n") + "\r\n";
}

/** Quote a CSV cell value per RFC 4180. */
function csvCell(value: string): string {
  if (
    value.includes('"') ||
    value.includes(",") ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}
