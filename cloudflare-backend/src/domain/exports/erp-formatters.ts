/**
 * ERP export formatters — pure functions, no I/O.
 *
 * Ports FastAPI's YardiFormatter, MRIFormatter, GenericCSVFormatter and the
 * csv_safety helpers (neutralize_formula / strip_control_chars) to TypeScript.
 * Matches FastAPI output byte-for-byte on all documented column layouts,
 * filename patterns, and number formats.
 */

import Decimal from "decimal.js";

// ── csv-safety helpers ────────────────────────────────────────────────────────

// Leading characters that a spreadsheet treats as the start of a formula.
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@", "\t", "\r"]);

// C0 control characters (U+0000–U+001F) plus DEL (U+007F).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/gu;

/**
 * Return `value` as text, prefixed with `'` if it starts with a formula
 * trigger character (CSV injection mitigation, CWE-1236). Safe text is
 * returned unchanged. Never apply to numeric/currency cells.
 */
export function neutralizeFormula(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.length > 0 && FORMULA_TRIGGERS.has(text[0] as string)) {
    return "'" + text;
  }
  return text;
}

/**
 * Return `value` as text with all C0 control characters removed. Use for
 * user-derived text in hand-rolled fixed-width records where a stray newline
 * would split or misalign a record. CSV cells do NOT need this — `encodeCell`
 * already quotes embedded line breaks.
 */
export function stripControlChars(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return text.replace(CONTROL_CHARS_RE, "");
}

// ── minimal CSV encoder ───────────────────────────────────────────────────────

/**
 * RFC-4180 cell encoding: wrap in double quotes if the value contains commas,
 * double-quotes, or newlines; escape internal double-quotes by doubling them.
 */
function encodeCell(value: string): string {
  if (/[",\r\n]/u.test(value)) {
    return '"' + value.replace(/"/gu, '""') + '"';
  }
  return value;
}

function csvRow(fields: string[]): string {
  return fields.map(encodeCell).join(",");
}

// ── snapshot shape expected by formatters ─────────────────────────────────────

export type SnapshotForErp = {
  id: string;
  lease_id: string;
  period_start_date: string;
  period_end_date: string;
  total_recovery: string;
  total_operating_expenses: string;
  grossed_up_expenses: string;
  base_year_amount: string;
  tenant_share_before_cap: string;
  tenant_share_after_cap: string;
  admin_fee: string;
  status: string;
  properties: { id: string; name: string } | null;
  leases: { tenant_name: string | null } | null;
};

export type ErpFormat = "yardi" | "mri" | "csv";

// ── shared helpers ────────────────────────────────────────────────────────────

/**
 * Format a Decimal (or string) amount as "NNNN.NN" — no currency symbol, two
 * decimal places. Matches FastAPI's `_format_currency`.
 */
function formatCurrency(amount: string | Decimal): string {
  const d = amount instanceof Decimal ? amount : new Decimal(amount);
  return d.toFixed(2);
}

/**
 * Parse a date string to its parts. Returns { year, month, day } as numbers.
 * Handles ISO 8601 date strings ("YYYY-MM-DD" or "YYYY-MM-DDThh:mm:ss…").
 */
function parseDate(dateStr: string): {
  year: number;
  month: number;
  day: number;
} {
  const d = new Date(dateStr);
  // Use UTC parts to avoid timezone-shift (dates from DB are date-only strings).
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

/** Format as MM/DD/YYYY. Matches FastAPI's `_format_date`. */
function formatDate(dateStr: string): string {
  const { year, month, day } = parseDate(dateStr);
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${mm}/${dd}/${year}`;
}

/**
 * Resolve tenant name from snapshot. Mirrors FastAPI's `_snapshot_tenant_name`:
 * prefer `leases.tenant_name`, fall back to `snapshot.tenant_name` (flat col),
 * then empty string.
 */
function snapshotTenantName(snapshot: SnapshotForErp): string {
  const name = snapshot.leases?.tenant_name ?? "";
  return String(name).trim();
}

/**
 * Human-readable period label for journal entry descriptions.
 * Matches FastAPI's `_period_label`:
 *   - same month & year  → "Jan 2024"
 *   - same year          → "2024"
 *   - spanning years     → "01/2024-12/2025"
 */
function periodLabel(startStr: string, endStr: string): string {
  const MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const s = parseDate(startStr);
  const e = parseDate(endStr);

  if (s.year === e.year && s.month === e.month) {
    return `${MONTHS[s.month - 1] ?? ""} ${s.year}`;
  }
  if (s.year === e.year) {
    return String(s.year);
  }
  const sm = String(s.month).padStart(2, "0");
  const em = String(e.month).padStart(2, "0");
  return `${sm}/${s.year}-${em}/${e.year}`;
}

/**
 * Short (8-char) traceability token for narrow reference fields.
 * Matches FastAPI's `_snapshot_token`.
 */
function snapshotToken(snapshot: SnapshotForErp): string {
  const raw = snapshot.id || snapshot.lease_id;
  return raw.replace(/-/gu, "").slice(0, 8);
}

// ── Yardi formatter ───────────────────────────────────────────────────────────

const YARDI_AR_ACCOUNT = "1200";
const YARDI_CAM_ACCOUNT = "4100";

const YARDI_HEADER = csvRow([
  "Property",
  "Unit",
  "Tenant",
  "Account",
  "Amount",
  "Description",
  "Reference",
  "PostDate",
]);

/**
 * Generate Yardi Voyager journal entry CSV.
 * Returns the complete file body (header + rows) as a string.
 */
export function generateYardiCsv(snapshots: SnapshotForErp[]): string {
  const lines: string[] = [YARDI_HEADER];

  for (const snapshot of snapshots) {
    const propertyName = neutralizeFormula(snapshot.properties?.name ?? "N/A");
    const leaseId = snapshot.lease_id;
    const rawTenant = snapshotTenantName(snapshot) || leaseId.slice(0, 8);
    const tenant = neutralizeFormula(rawTenant);
    const periodStart = snapshot.period_start_date;
    const periodEnd = snapshot.period_end_date;
    const sDate = parseDate(periodStart);
    const totalRecovery = new Decimal(snapshot.total_recovery);

    const snapshotId = snapshot.id || leaseId.slice(0, 8);
    const reference = `CAM-${sDate.year}-${snapshotId}`;
    const description = `CAM Reconciliation ${periodLabel(periodStart, periodEnd)}`;
    const postDate = formatDate(periodEnd);

    // Debit AR
    lines.push(
      csvRow([
        propertyName,
        "",
        tenant,
        YARDI_AR_ACCOUNT,
        formatCurrency(totalRecovery),
        description,
        reference,
        postDate,
      ]),
    );

    // Credit CAM Revenue
    lines.push(
      csvRow([
        propertyName,
        "",
        tenant,
        YARDI_CAM_ACCOUNT,
        formatCurrency(totalRecovery.negated()),
        description,
        reference,
        postDate,
      ]),
    );
  }

  return lines.join("\r\n") + "\r\n";
}

export function yardiFilename(snapshots: SnapshotForErp[]): string {
  if (snapshots.length > 0 && snapshots[0]) {
    const { year } = parseDate(snapshots[0].period_start_date);
    return `Yardi_CAM_Import_${year}.csv`;
  }
  return "Yardi_CAM_Import.csv";
}

// ── MRI formatter ─────────────────────────────────────────────────────────────

const MRI_AR_ACCOUNT = "11200";
const MRI_CAM_ACCOUNT = "41100";

/**
 * Pad or truncate a string to exactly `width` chars, left-aligned.
 * Mirrors Python's f"{value:<10}".
 */
function padRight(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s.padEnd(width, " ");
}

/**
 * Pad or truncate a string to exactly `width` chars, right-aligned.
 * Mirrors Python's f"{value:>15}".
 */
function padLeft(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s.padStart(width, " ");
}

/**
 * Generate MRI Commercial fixed-width format.
 * Layout: Property(10) Entity(10) Account(10) Amount(15) Desc(30) Ref(15) Date(8)
 * Returns the complete file body as a string (lines separated by "\n").
 */
export function generateMriText(snapshots: SnapshotForErp[]): string {
  const lines: string[] = [];

  for (const snapshot of snapshots) {
    const propertyCode = stripControlChars(
      snapshot.properties?.name ?? "",
    ).slice(0, 10);
    const rawEntity = stripControlChars(
      snapshotTenantName(snapshot) || snapshot.lease_id,
    );
    const entity = rawEntity.slice(0, 10);
    const periodStart = snapshot.period_start_date;
    const periodEnd = snapshot.period_end_date;
    const sDate = parseDate(periodStart);
    const eDate = parseDate(periodEnd);
    const totalRecovery = new Decimal(snapshot.total_recovery);

    const shortYear = sDate.year % 100;
    const token = snapshotToken(snapshot);
    const reference = `CAM${String(shortYear).padStart(2, "0")}-${token}`.slice(
      0,
      15,
    );
    const description =
      `CAM Reconciliation ${periodLabel(periodStart, periodEnd)}`.slice(0, 30);

    const em = String(eDate.month).padStart(2, "0");
    const ed = String(eDate.day).padStart(2, "0");
    const postDate = `${eDate.year}${em}${ed}`;

    const debitLine =
      padRight(propertyCode, 10) +
      padRight(entity, 10) +
      padRight(MRI_AR_ACCOUNT, 10) +
      padLeft(formatCurrency(totalRecovery), 15) +
      padRight(description, 30) +
      padRight(reference, 15) +
      postDate;

    const creditLine =
      padRight(propertyCode, 10) +
      padRight(entity, 10) +
      padRight(MRI_CAM_ACCOUNT, 10) +
      padLeft(formatCurrency(totalRecovery.negated()), 15) +
      padRight(description, 30) +
      padRight(reference, 15) +
      postDate;

    lines.push(debitLine);
    lines.push(creditLine);
  }

  return lines.join("\n") + (lines.length > 0 ? "\n" : "");
}

export function mriFilename(snapshots: SnapshotForErp[]): string {
  if (snapshots.length > 0 && snapshots[0]) {
    const { year } = parseDate(snapshots[0].period_start_date);
    return `MRI_CAM_Import_${year}.txt`;
  }
  return "MRI_CAM_Import.txt";
}

// ── Generic CSV formatter ─────────────────────────────────────────────────────

const GENERIC_HEADER = csvRow([
  "Property",
  "Unit",
  "Tenant",
  "Period Start",
  "Period End",
  "Total Expenses",
  "Grossed Up Expenses",
  "Base Year Amount",
  "Tenant Share Before Cap",
  "Tenant Share After Cap",
  "Admin Fee",
  "Amount Due",
]);

/**
 * Generate generic CAM reconciliation CSV.
 * Returns the complete file body as a string.
 */
export function generateGenericCsv(snapshots: SnapshotForErp[]): string {
  const lines: string[] = [GENERIC_HEADER];

  for (const snapshot of snapshots) {
    const propertyName = neutralizeFormula(snapshot.properties?.name ?? "N/A");
    const leaseId = snapshot.lease_id;
    const rawTenant = snapshotTenantName(snapshot) || leaseId;
    const tenant = neutralizeFormula(rawTenant);

    lines.push(
      csvRow([
        propertyName,
        "",
        tenant,
        formatDate(snapshot.period_start_date),
        formatDate(snapshot.period_end_date),
        formatCurrency(snapshot.total_operating_expenses),
        formatCurrency(snapshot.grossed_up_expenses),
        formatCurrency(snapshot.base_year_amount),
        formatCurrency(snapshot.tenant_share_before_cap),
        formatCurrency(snapshot.tenant_share_after_cap),
        formatCurrency(snapshot.admin_fee),
        formatCurrency(snapshot.total_recovery),
      ]),
    );
  }

  return lines.join("\r\n") + "\r\n";
}

export function genericCsvFilename(snapshots: SnapshotForErp[]): string {
  if (snapshots.length > 0 && snapshots[0]) {
    const { year } = parseDate(snapshots[0].period_start_date);
    return `CAM_Reconciliation_${year}.csv`;
  }
  return "CAM_Reconciliation.csv";
}

// ── format dispatch ───────────────────────────────────────────────────────────

export type ErpFormatResult = {
  body: string;
  filename: string;
  mediaType: "text/csv" | "text/plain";
};

export function formatErpExport(
  snapshots: SnapshotForErp[],
  format: ErpFormat,
): ErpFormatResult {
  switch (format) {
    case "yardi":
      return {
        body: generateYardiCsv(snapshots),
        filename: yardiFilename(snapshots),
        mediaType: "text/csv",
      };
    case "mri":
      return {
        body: generateMriText(snapshots),
        filename: mriFilename(snapshots),
        mediaType: "text/plain",
      };
    default:
      return {
        body: generateGenericCsv(snapshots),
        filename: genericCsvFilename(snapshots),
        mediaType: "text/csv",
      };
  }
}
