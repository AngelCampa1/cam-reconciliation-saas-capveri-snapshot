import Decimal from "decimal.js";

export type GlParsedEntry = {
  account_code: string;
  account_description: string;
  amount: string;
  transaction_date: string;
  accrual_date: string | null;
  period_year: number;
  period_month: number;
  vendor_name: string | null;
  description: string | null;
  raw_row_data: Record<string, string>;
};

export type CsvParseResult = {
  sourceSystem: "yardi" | "mri" | "generic";
  sourceConfidence: number;
  detectedColumns: string[];
  rowCount: number;
  errorCount: number;
  warnings: string[];
  entries: GlParsedEntry[];
};

export type SourceOverride = "yardi" | "mri" | "generic";

const yardiColumnMappings: Record<
  string,
  keyof GlParsedEntry | "debit" | "credit"
> = {
  "account code": "account_code",
  account: "account_code",
  acct: "account_code",
  "acct code": "account_code",
  "gl account": "account_code",
  "account description": "account_description",
  description: "description",
  desc: "description",
  "acct desc": "account_description",
  amount: "amount",
  "net amount": "amount",
  total: "amount",
  debit: "debit",
  dr: "debit",
  credit: "credit",
  cr: "credit",
  date: "transaction_date",
  "transaction date": "transaction_date",
  "trans date": "transaction_date",
  "posting date": "transaction_date",
  "journal date": "transaction_date",
  "accrual date": "accrual_date",
  "effective date": "accrual_date",
  "service date": "accrual_date",
  "invoice date": "accrual_date",
  vendor: "vendor_name",
  "vendor name": "vendor_name",
  payee: "vendor_name",
};

const mriColumnMappings: Record<
  string,
  keyof GlParsedEntry | "debit" | "credit" | "period"
> = {
  period: "period",
  account: "account_code",
  acct: "account_code",
  "account code": "account_code",
  "gl account": "account_code",
  description: "description",
  desc: "description",
  "account description": "account_description",
  debit: "debit",
  dr: "debit",
  credit: "credit",
  cr: "credit",
  amount: "amount",
  date: "transaction_date",
  "transaction date": "transaction_date",
  "trans date": "transaction_date",
  "posting date": "transaction_date",
  "accrual date": "accrual_date",
  "effective date": "accrual_date",
  "service date": "accrual_date",
  "invoice date": "accrual_date",
  vendor: "vendor_name",
  "vendor name": "vendor_name",
  payee: "vendor_name",
};

export function parseGlCsv(input: {
  text: string;
  filename: string;
  propertyId: string;
  sourceOverride?: SourceOverride;
  columnMapping?: Record<string, string>;
}): CsvParseResult {
  const parsed = parseCsv(input.text);
  const detectedColumns = parsed.headers;

  if (parsed.records.length === 0) {
    return {
      sourceSystem: input.sourceOverride ?? "generic",
      sourceConfidence: input.sourceOverride ? 1 : 0.1,
      detectedColumns,
      rowCount: 0,
      errorCount: 1,
      warnings: ["File is empty or could not be parsed"],
      entries: [],
    };
  }

  const source = input.sourceOverride
    ? { sourceSystem: input.sourceOverride, confidence: 1 }
    : detectSource(input.text, input.filename);
  if (source.sourceSystem === "generic" && !input.columnMapping) {
    return {
      sourceSystem: "generic",
      sourceConfidence: source.confidence,
      detectedColumns,
      rowCount: parsed.records.length,
      errorCount: 0,
      warnings: ["No column mapping provided - raw data returned"],
      entries: [],
    };
  }

  const entries = normalizeRecords({
    records: parsed.records,
    sourceSystem: source.sourceSystem,
    ...(input.columnMapping ? { columnMapping: input.columnMapping } : {}),
  });

  return {
    sourceSystem: source.sourceSystem,
    sourceConfidence: source.confidence,
    detectedColumns,
    rowCount: parsed.records.length,
    errorCount: entries.entries.length === 0 ? 1 : entries.errorCount,
    warnings: entries.warnings,
    entries: entries.entries,
  };
}

function parseCsv(text: string): {
  headers: string[];
  records: Record<string, string>[];
} {
  const rows = parseCsvRows(text.replace(/^\uFEFF/, ""));
  const headerIndex = findHeaderRow(rows);
  const headers = (rows[headerIndex] ?? []).map((header) => header.trim());
  const records = rows
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = row[index]?.trim() ?? "";
      });
      return record;
    });

  return { headers, records };
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      quoted = !quoted;
      continue;
    }

    if (char === "," && !quoted) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function findHeaderRow(rows: string[][]): number {
  const patterns = [
    /\baccount\b/i,
    /\bdescription\b/i,
    /\bamount\b/i,
    /\bdate\b/i,
  ];
  const scanLimit = Math.min(rows.length, 100);

  for (let index = 0; index < scanLimit; index += 1) {
    const text = rows[index]?.join(" ") ?? "";
    if (patterns.filter((pattern) => pattern.test(text)).length >= 2) {
      return index;
    }
  }

  return 0;
}

function detectSource(
  text: string,
  filename: string,
): { sourceSystem: "yardi" | "mri" | "generic"; confidence: number } {
  const upper = `${filename}\n${text.slice(0, 4096)}`.toUpperCase();
  let yardi = 0;
  let mri = 0;

  if (upper.includes("YARDI")) {
    yardi += 0.5;
  }
  if (upper.includes("VOYAGER")) {
    yardi += 0.3;
  }
  if (upper.includes("GL DETAIL")) {
    yardi += 0.2;
  }
  if (upper.includes("MRI")) {
    mri += 0.5;
  }
  if (/\bPERIOD\b/.test(upper)) {
    mri += 0.2;
  }
  if (/\bDEBIT\b/.test(upper) && /\bCREDIT\b/.test(upper)) {
    mri += 0.2;
  }
  if (/ACCOUNT[^,\n]*,/.test(upper) && /\bAMOUNT\b/.test(upper)) {
    yardi += 0.2;
  }

  if (mri >= 0.4 && mri >= yardi) {
    return { sourceSystem: "mri", confidence: Math.min(mri, 1) };
  }

  if (yardi >= 0.3) {
    return { sourceSystem: "yardi", confidence: Math.min(yardi, 1) };
  }

  return { sourceSystem: "generic", confidence: 0.1 };
}

function normalizeRecords(input: {
  records: Record<string, string>[];
  sourceSystem: "yardi" | "mri" | "generic";
  columnMapping?: Record<string, string>;
}): { entries: GlParsedEntry[]; errorCount: number; warnings: string[] } {
  const warnings: string[] = [];
  const entries: GlParsedEntry[] = [];
  let invalidCount = 0;

  for (const record of input.records) {
    const normalized = normalizeRecord(
      record,
      input.sourceSystem,
      input.columnMapping,
    );
    if (!normalized) {
      invalidCount += 1;
      continue;
    }
    entries.push(normalized);
  }

  if (invalidCount > 0) {
    warnings.push(`Excluded ${invalidCount} rows with missing required data`);
  }

  if (entries.length === 0) {
    warnings.push("No valid rows found");
  }

  return { entries, errorCount: invalidCount > 0 ? invalidCount : 0, warnings };
}

function normalizeRecord(
  record: Record<string, string>,
  sourceSystem: "yardi" | "mri" | "generic",
  columnMapping: Record<string, string> | undefined,
): GlParsedEntry | null {
  const mapped = mapRecord(record, sourceSystem, columnMapping);
  const date = parseDate(mapped.transaction_date || mapped.period || "");
  const amount = parseAmount(mapped.amount, mapped.debit, mapped.credit);
  const accountCode = (mapped.account_code ?? "").trim();

  if (!accountCode || !date || amount === null) {
    return null;
  }

  return {
    account_code: accountCode.replace(/\.0$/, ""),
    account_description: (mapped.account_description ?? "").trim(),
    amount,
    transaction_date: date.iso,
    accrual_date: parseDate(mapped.accrual_date ?? "")?.iso ?? null,
    period_year: date.year,
    period_month: date.month,
    vendor_name: emptyToNull(mapped.vendor_name),
    description: emptyToNull(mapped.description),
    raw_row_data: record,
  };
}

function mapRecord(
  record: Record<string, string>,
  sourceSystem: "yardi" | "mri" | "generic",
  columnMapping: Record<string, string> | undefined,
): Record<string, string> {
  const mapped: Record<string, string> = {};
  const sourceMap =
    sourceSystem === "generic"
      ? mappingToSourceLookup(columnMapping ?? {})
      : sourceSystem === "mri"
        ? mriColumnMappings
        : yardiColumnMappings;

  for (const [column, value] of Object.entries(record)) {
    const key = normalizeHeader(column);
    const target = sourceMap[key];
    if (target) {
      mapped[target] = value;
    }
  }

  // A bare "Description"/"Desc" column maps to the `description` memo field, but
  // in a GL export with no explicit "Account Description" column that bare column
  // IS the GL account name (e.g. "Landscaping"). Promote it to account_description
  // so the account name reaches audit/GL-narrative reports instead of landing in
  // the unused memo field — matching the Python oracle (yardi.py:333-334,
  // mri.py:361-362), which renames a bare description to account_description. When
  // BOTH columns are present the explicit account_description wins and the bare
  // column stays a genuine memo (the oracle's blanket rename collides here; this
  // is the correct disambiguation).
  const memo = mapped.description ?? "";
  if ((mapped.account_description ?? "").trim() === "" && memo.trim() !== "") {
    mapped.account_description = memo;
    delete mapped.description;
  }

  return mapped;
}

function mappingToSourceLookup(
  mapping: Record<string, string>,
): Record<string, string> {
  const lookup: Record<string, string> = {};
  for (const [target, source] of Object.entries(mapping)) {
    lookup[normalizeHeader(source)] = target;
  }
  return lookup;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase();
}

function parseAmount(
  amount: string | undefined,
  debit: string | undefined,
  credit: string | undefined,
): string | null {
  // Oracle parity (cleaners.py `split_amount_columns`, wired into yardi.py:194
  // and mri.py:156): when BOTH a debit AND a credit column are present, the
  // signed amount is ALWAYS `clean(debit) - clean(credit)`, with each cell
  // currency-cleaned and a blank/unparseable cell coerced to 0 (`.fillna(0)`).
  // This nets every double-entry row and never drops it — it takes precedence
  // over any amount column, exactly as the ERP parsers run split first.
  //
  // Two prior bugs lived in the old priority-chain (amount → debit → credit):
  //   BUG-1: a non-empty debit (even "0.00") returned the gross debit and
  //          silently ignored the credit, so `debit="0.00", credit="500"`
  //          produced 0 instead of -500 (the expense vanished).
  //   BUG-2: a pre-signed credit ("(500.00)", "500 CR", "500.00-") was
  //          force-negated, flipping an already-credited value's sign. Netting
  //          `0 - (-500) = +500` cancels the double-negative correctly.
  const hasDebitColumn = debit !== undefined;
  const hasCreditColumn = credit !== undefined;
  if (hasDebitColumn && hasCreditColumn) {
    const debitValue = cleanCurrency(debit) ?? "0";
    const creditValue = cleanCurrency(credit) ?? "0";
    return new Decimal(debitValue)
      .minus(creditValue)
      .toFixed(2, Decimal.ROUND_HALF_UP);
  }

  if (amount !== undefined && amount.trim() !== "") {
    return cleanCurrency(amount);
  }

  if (debit !== undefined && debit.trim() !== "") {
    return cleanCurrency(debit);
  }

  if (credit !== undefined && credit.trim() !== "") {
    const cleaned = cleanCurrency(credit);
    if (cleaned === null) {
      return null;
    }
    return cleaned.startsWith("-") ? cleaned : `-${cleaned}`;
  }

  return null;
}

function cleanCurrency(value: string): string | null {
  // Canonicalize the Unicode minus sign U+2212 ("−") to ASCII "-" before any
  // sign detection. Some ERP/Excel locale exports emit a real minus glyph for
  // negatives; without this, "−500.00" misses every leading/trailing-minus
  // branch below and falls out of the numeric contract, dropping the row (an
  // expense reversal silently vanishes). The oracle's loose digit strip would
  // instead lose the sign entirely (turning −500 into +500); canonicalizing to
  // ASCII gives the financially correct -500.00.
  const trimmed = value.trim().replace(/−/g, "-");
  if (!trimmed) {
    return null;
  }

  // Detect the ERP sign conventions documented by the oracle
  // (backend/app/services/ingestion/cleaners.py clean_currency_column, 13-62):
  //   - parentheses → negative
  //   - "CR" suffix → negative; "DR" suffix → positive (both stripped)
  //   - trailing minus "500.00-" → negative
  //   - leading minus, optionally after a currency symbol, "$-1,234.56" → negative
  //
  // Sign is detected from INDEPENDENT signals (mirroring the oracle's vectorized
  // boolean masks at lines 51-61) rather than stripped in a fixed order. A fixed
  // order silently dropped a legitimate COMBINATION such as "(1,234.56) CR" —
  // parentheses AND a CR suffix: the old paren matcher only fired when "(...)"
  // wrapped the WHOLE string, so the trailing " CR" defeated it and the leftover
  // ")" failed the numeric contract, vanishing a real CAM cost from the recon
  // (oracle imports -1234.56 via its CR mask). Parentheses mark a negative
  // whether or not a CR/DR suffix follows them.
  const upper = trimmed.toUpperCase();
  const parenNegative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const crNegative = upper.endsWith("CR");
  const trailingNegative = trimmed.endsWith("-");
  const leadingNegative = /^([$£€¥]?)\s*-/.test(trimmed);
  const negative =
    parenNegative || crNegative || trailingNegative || leadingNegative;

  // Strip every RECOGNIZED decoration to expose the bare number. Parentheses are
  // removed FIRST so a CR/DR that sat inside them (e.g. "(500 CR)") is left as a
  // strippable suffix. Unlike the oracle's loose `replace([^0-9.])` strip (which
  // would turn "1e3" into "13"), we remove only known tokens and then validate
  // the remainder against the same numeric contract Money.parse enforces,
  // dropping the row if anything else remains. Money must stay exact — never
  // round currency through a JS float.
  const normalized = trimmed
    .replace(/[()]/g, "") // parentheses (sign captured above)
    .replace(/\s*[CD]R$/i, "") // CR/DR suffix, now exposed
    .replace(/^([$£€¥]?)\s*-/, "$1") // leading minus, after an optional symbol
    .replace(/-$/, "") // trailing minus
    .replace(/[$£€¥,\s]/g, ""); // currency symbols, thousands separators, spaces

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  let amount: Decimal;
  try {
    amount = new Decimal(normalized);
  } catch {
    return null;
  }

  const signed = negative ? amount.abs().negated() : amount;
  return signed.toFixed(2, Decimal.ROUND_HALF_UP);
}

function parseDate(
  value: string,
): { iso: string; year: number; month: number } | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const ymd = /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/.exec(trimmed);
  if (ymd) {
    return buildDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3] ?? "1"));
  }

  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(trimmed);
  if (mdy) {
    const rawYear = Number(mdy[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const first = Number(mdy[1]);
    const second = Number(mdy[2]);
    // Default to US MM/DD/YYYY. When the first field cannot be a month but the
    // second can, the value is unambiguously DD/MM/YYYY — honor it instead of
    // silently dropping the row (a GL export in DD/MM locale would otherwise
    // lose every day-13+ row and misparse the rest). Genuinely ambiguous dates
    // (both fields <= 12) keep the US default.
    if (first > 12 && second <= 12) {
      return buildDate(year, second, first);
    }
    return buildDate(year, first, second);
  }

  const my = /^(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (my) {
    return buildDate(Number(my[2]), Number(my[1]), 1);
  }

  return null;
}

function buildDate(
  year: number,
  month: number,
  day: number,
): { iso: string; year: number; month: number } | null {
  if (
    year < 1990 ||
    year > 2100 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const iso = `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  const date = new Date(`${iso}T00:00:00.000Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { iso, year, month };
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}
