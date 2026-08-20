import Decimal from "decimal.js";
import ExcelJS from "exceljs";

export type BilledAmountRow = {
  tenantName: string;
  billedAmount: string;
  suite: string | null;
};

export type BillingParseResult =
  | {
      success: true;
      sourceType: string;
      data: BilledAmountRow[];
      totalBilled: string;
      rowCount: number;
      errorCount: number;
      errors: string[];
      warnings: string[];
    }
  | {
      success: false;
      sourceType: string;
      data: [];
      totalBilled: "0";
      rowCount: 0;
      errorCount: number;
      errors: string[];
      warnings: string[];
    };

const tenantCandidates = [
  "tenant",
  "tenant_name",
  "lessee",
  "occupant",
  "name",
];
const amountCandidates = [
  "cam_charges",
  "cam_billed",
  "cam_amount",
  "annual_cam",
  "amount_billed",
  "amount_charged",
  "tenant_charges",
  "tenant_billed",
  "total_charges",
  "billed_amount",
  "billed",
  "amount",
  "total",
  "charges",
  "recovery",
];
const suiteCandidates = ["suite", "unit", "space"];

// DoS guards for the XLSX path. The upload route already caps the *compressed*
// file at 25MB, but a malicious workbook can declare an enormous sparse grid:
// a lone cell at column 16384 forces `columnCount` to span the whole sheet, and
// a tall sheet multiplies that across every row. The dense per-row read loop is
// then O(rows × columnCount) and can burn the Worker CPU budget. Bounding both
// dimensions before that loop neutralizes that amplifier. Real billing files are
// a handful of columns and at most a few thousand tenant rows, so these limits
// never reject legitimate input.
//
// Out of scope here (platform-bounded): the zip decompression inside
// `workbook.xlsx.load()` runs before these guards, so a high-ratio zip bomb is
// backstopped only by the 25MB compressed cap (upload route) plus Cloudflare's
// 128MB isolate memory + per-request CPU limits — a self-terminating single
// request, not a durable DoS. ExcelJS exposes no streaming/size hook to cap it.
const MAX_BILLING_ROWS = 100_000;
const MAX_BILLING_COLUMNS = 256;

export function parseBillingCsv(input: {
  text: string;
  filename: string;
}): BillingParseResult {
  const sourceType = detectBillingSourceType(
    input.text.slice(0, 4096),
    input.filename,
  );
  const records = parseCsvRecords(input.text);

  return parseBillingRecords({ records, sourceType });
}

export async function parseBillingXlsx(input: {
  bytes: ArrayBuffer;
  filename: string;
}): Promise<BillingParseResult> {
  const workbook = new ExcelJS.Workbook();
  try {
    const workbookBytes =
      input.bytes as unknown as Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(workbookBytes);
  } catch {
    return failed(
      detectBillingSourceType("", input.filename),
      ["Could not read Excel billing file. Save it as .xlsx and try again."],
    );
  }

  const worksheet = workbook.worksheets.find((sheet) => sheet.actualRowCount > 0);
  if (!worksheet) {
    return failed(
      detectBillingSourceType("", input.filename),
      ["File is empty - no billing data to parse"],
    );
  }

  // DoS guard: reject an absurdly tall sheet before materializing it row-by-row.
  if (worksheet.actualRowCount > MAX_BILLING_ROWS) {
    return failed(detectBillingSourceType("", input.filename), [
      `Billing file has too many rows (${worksheet.actualRowCount.toLocaleString()}). ` +
        `The maximum is ${MAX_BILLING_ROWS.toLocaleString()}.`,
    ]);
  }

  // DoS guard: clamp the per-row read width. A lone far-right cell can push the
  // spanned column count to 16,384; bounding it keeps the read loop O(rows × 256)
  // at worst. Real billing files use only a few leading columns, so the clamp
  // never drops a meaningful tenant/amount/suite column.
  const columnCount = Math.min(
    Math.max(worksheet.actualColumnCount, worksheet.columnCount),
    MAX_BILLING_COLUMNS,
  );
  const records: string[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const record: string[] = [];
    for (let column = 1; column <= columnCount; column += 1) {
      record.push(row.getCell(column).text);
    }
    if (record.some((cell) => cell.trim().length > 0)) {
      records.push(record);
    }
  });

  return parseBillingRecords({
    records,
    sourceType: detectBillingSourceType(
      records
        .slice(0, 10)
        .map((row) => row.join(","))
        .join("\n"),
      input.filename,
    ),
  });
}

function parseBillingRecords(input: {
  records: string[][];
  sourceType: string;
}): BillingParseResult {
  const { records, sourceType } = input;

  if (records.length === 0) {
    return failed(sourceType, ["File is empty - no billing data to parse"]);
  }

  const header = records[0];
  if (!header || header.length === 0) {
    return failed(sourceType, ["File is empty or could not be parsed"]);
  }

  const columns = header.map(standardizeColumn);
  const tenantIndex = findColumnIndex(columns, tenantCandidates);
  const amountIndex = findColumnIndex(columns, amountCandidates);
  const suiteIndex = findColumnIndex(columns, suiteCandidates);
  const errors: string[] = [];

  if (tenantIndex === null) {
    errors.push(
      "Could not find tenant column. Expected: tenant, lessee, occupant, or name",
    );
  }
  if (amountIndex === null) {
    errors.push(
      "Could not find amount column. Expected: billed, amount, total, charges, amount billed, or CAM billed",
    );
  }
  if (errors.length > 0) {
    return failed(sourceType, errors);
  }
  if (tenantIndex === null || amountIndex === null) {
    return failed(sourceType, errors);
  }

  const rows: BilledAmountRow[] = [];
  let totalBilled = new Decimal(0);
  let errorCount = 0;
  const skippedWarnings: string[] = [];

  for (const [index, record] of records.slice(1).entries()) {
    const rowNumber = index + 2;
    const tenantName = (record[tenantIndex] ?? "").trim();
    const rawAmount = (record[amountIndex] ?? "").trim();
    if (!tenantName || ["nan", "none"].includes(tenantName.toLowerCase())) {
      if (rawAmount) {
        skippedWarnings.push(`Skipped row ${rowNumber}: tenant was blank`);
        errorCount += 1;
      }
      continue;
    }
    if (isAggregateTenantRow(tenantName)) {
      continue;
    }

    if (!rawAmount) {
      skippedWarnings.push(`Skipped row ${rowNumber}: amount was blank`);
      errorCount += 1;
      continue;
    }

    const amount = parseMoney(rawAmount);
    if (!amount) {
      skippedWarnings.push(
        `Skipped row ${rowNumber}: amount was not a number`,
      );
      errorCount += 1;
      continue;
    }
    if (amount.lte(0)) {
      skippedWarnings.push(
        `Skipped row ${rowNumber}: amount was zero or negative`,
      );
      errorCount += 1;
      continue;
    }

    const suite =
      suiteIndex === null
        ? null
        : normalizeOptionalCell(record[suiteIndex] ?? "");
    const billedAmount = amount.toFixed();
    rows.push({ tenantName, billedAmount, suite });
    totalBilled = totalBilled.plus(amount);
  }

  if (rows.length === 0) {
    return failed(sourceType, ["No valid billing data found in file"]);
  }

  return {
    success: true,
    sourceType,
    data: rows,
    totalBilled: totalBilled.toFixed(),
    rowCount: rows.length,
    errorCount,
    errors: [],
    warnings: buildSkippedWarnings(skippedWarnings, errorCount),
  };
}

export function detectBillingSourceType(
  fileHeader: string,
  filename: string,
): string {
  const text = fileHeader.toUpperCase();
  if (text.includes("YARDI") || text.includes("VOYAGER")) {
    return "yardi_recon";
  }
  if (text.includes("MRI")) {
    return "mri_recon";
  }

  const lowerName = filename.toLowerCase();
  if (lowerName.includes("yardi")) {
    return "yardi_recon";
  }
  if (lowerName.includes("mri")) {
    return "mri_recon";
  }

  return "csv_import";
}

function failed(sourceType: string, errors: string[]): BillingParseResult {
  return {
    success: false,
    sourceType,
    data: [],
    totalBilled: "0",
    rowCount: 0,
    errorCount: 0,
    errors,
    warnings: [],
  };
}

function buildSkippedWarnings(warnings: string[], errorCount: number): string[] {
  if (errorCount === 0) {
    return [];
  }

  const visibleWarnings = warnings.slice(0, 5);
  const remainingCount = errorCount - visibleWarnings.length;
  if (remainingCount > 0) {
    visibleWarnings.push(`Skipped ${remainingCount} more rows`);
  }

  return visibleWarnings;
}

function standardizeColumn(value: string): string {
  return value.trim().toLowerCase().replaceAll(" ", "_");
}

function findColumnIndex(
  columns: string[],
  candidates: string[],
): number | null {
  for (const candidate of candidates) {
    const exact = columns.indexOf(candidate);
    if (exact >= 0) {
      return exact;
    }
  }

  for (const candidate of candidates) {
    const partial = columns.findIndex((column) => column.includes(candidate));
    if (partial >= 0) {
      return partial;
    }
  }

  return null;
}

function isAggregateTenantRow(tenantName: string): boolean {
  const normalized = tenantName.toLowerCase();

  return ["total", "subtotal", "sum", "grand"].some((word) =>
    normalized.includes(word),
  );
}

function normalizeOptionalCell(value: string): string | null {
  const trimmed = value.trim();

  return trimmed && !["nan", "none"].includes(trimmed.toLowerCase())
    ? trimmed
    : null;
}

// A money cell must be a plain decimal literal AFTER decoration is stripped.
// This is the same numeric contract the GL parser enforces (csv-parser.ts
// cleanCurrency). Without it, `new Decimal()` silently accepts scientific
// notation ("1e3" -> 1000), hex ("0x10" -> 16), binary/octal, and the
// non-finite tokens "NaN"/"Infinity". "NaN" is the worst case: it survives the
// `amount.lte(0)` positivity gate (all NaN comparisons are false) and Postgres
// accepts `'NaN'::numeric`, so a poison value would persist and corrupt every
// downstream total. Reject anything that is not a finite plain-decimal number.
const PLAIN_DECIMAL = /^\d+(\.\d+)?$/u;

function parseMoney(value: string): Decimal | null {
  // Canonicalize the Unicode minus sign U+2212 ("−") to ASCII "-" before any
  // sign detection, mirroring the GL parser's cleanCurrency contract
  // (csv-parser.ts). Without this, a locale export that emits a real minus
  // glyph ("−500.00") misses the leading-minus branch below and falls out of
  // the PLAIN_DECIMAL contract, silently dropping the row.
  let normalized = value
    .replaceAll("$", "")
    .replaceAll(",", "")
    .replaceAll("−", "-")
    .trim();
  let negative = false;
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    negative = true;
    normalized = normalized.slice(1, -1).trim();
  }
  if (normalized.startsWith("-")) {
    negative = true;
    normalized = normalized.slice(1).trim();
  }

  if (!PLAIN_DECIMAL.test(normalized)) {
    return null;
  }

  try {
    const decimal = new Decimal(normalized);
    return negative ? decimal.negated() : decimal;
  } catch {
    return null;
  }
}

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      record.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      record.push(cell);
      if (record.some((value) => value.trim().length > 0)) {
        records.push(record);
      }
      record = [];
      cell = "";
      continue;
    }

    cell += char ?? "";
  }

  record.push(cell);
  if (record.some((value) => value.trim().length > 0)) {
    records.push(record);
  }

  return records;
}
