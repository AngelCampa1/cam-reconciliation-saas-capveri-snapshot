import Decimal from "decimal.js";

export type RentRollPropertyMetadata = {
  name: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
};

export type RentRollUnit = {
  unit_number: string;
  rentable_sqft: string;
  usable_sqft: string | null;
  floor: number | null;
  tenant_name: string | null;
  lease_start: string | null;
  lease_end: string | null;
  base_rent: string | null;
  cam_share: string | null;
};

export type RentRollParseResult = {
  success: boolean;
  source_system: "yardi_rent_roll" | "mri_rent_roll" | "generic_rent_roll";
  property_metadata: RentRollPropertyMetadata;
  units: RentRollUnit[];
  row_count: number;
  error_count: number;
  total_units: number;
  occupied_units: number;
  errors: string[];
  warnings: string[];
};

type CsvTable = {
  headers: string[];
  records: Record<string, string>[];
};

const emptyMetadata: RentRollPropertyMetadata = {
  name: null,
  address_line1: null,
  city: null,
  state: null,
  postal_code: null,
};

export function parseRentRollCsv(input: {
  text: string;
  filename: string;
}): RentRollParseResult {
  if (input.text.trim().length === 0) {
    return failure("generic_rent_roll", "File is empty or could not be read");
  }

  try {
    const sourceSystem = detectSource(input.text, input.filename);
    const propertyMetadata = extractPropertyMetadata(input.text, sourceSystem);
    const table = parseCsv(input.text);
    if (table.records.length === 0) {
      return {
        success: true,
        source_system: sourceSystem,
        property_metadata: propertyMetadata,
        units: [],
        row_count: 0,
        error_count: 0,
        total_units: 0,
        occupied_units: 0,
        errors: [],
        warnings: [],
      };
    }

    const columnMap = buildColumnMap(table.headers);
    const warnings: string[] = [];
    const units: RentRollUnit[] = [];
    const seenUnits = new Set<string>();
    let errorCount = 0;

    table.records.forEach((record, rowIndex) => {
      try {
        const unit = parseRecord(record, columnMap, rowIndex + 1, warnings);
        if (!unit) {
          return;
        }
        if (seenUnits.has(unit.unit_number)) {
          warnings.push(
            `Row ${rowIndex + 1}: Duplicate unit number '${unit.unit_number}' - will be skipped`,
          );
          return;
        }
        seenUnits.add(unit.unit_number);
        units.push(unit);
      } catch (error) {
        errorCount += 1;
        warnings.push(
          `Row ${rowIndex + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });

    return {
      success: true,
      source_system: sourceSystem,
      property_metadata: propertyMetadata,
      units,
      row_count: units.length,
      error_count: errorCount,
      total_units: units.length,
      occupied_units: units.filter((unit) => unit.tenant_name !== null).length,
      errors: [],
      warnings,
    };
  } catch (error) {
    return failure(
      "generic_rent_roll",
      `Parse error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function failure(
  sourceSystem: RentRollParseResult["source_system"],
  message: string,
): RentRollParseResult {
  return {
    success: false,
    source_system: sourceSystem,
    property_metadata: emptyMetadata,
    units: [],
    row_count: 0,
    error_count: 1,
    total_units: 0,
    occupied_units: 0,
    errors: [message],
    warnings: [],
  };
}

function detectSource(
  text: string,
  filename: string,
): RentRollParseResult["source_system"] {
  const upper = `${filename}\n${text.slice(0, 8192)}`.toUpperCase();
  let yardi = 0;
  let mri = 0;

  if (upper.includes("YARDI")) {
    yardi += 0.4;
  }
  if (upper.includes("VOYAGER")) {
    yardi += 0.3;
  }
  if (upper.includes("RENT ROLL")) {
    yardi += 0.2;
    mri += 0.1;
  }
  if (upper.includes("MRI SOFTWARE") || upper.includes("PROPERTY CODE:")) {
    mri += 0.5;
  }
  if (upper.includes("SUITE SF") || upper.includes("LEASE START")) {
    yardi += 0.2;
  }

  if (yardi > mri && yardi >= 0.2) {
    return "yardi_rent_roll";
  }
  if (mri > yardi && mri >= 0.2) {
    return "mri_rent_roll";
  }

  return "generic_rent_roll";
}

function extractPropertyMetadata(
  text: string,
  sourceSystem: RentRollParseResult["source_system"],
): RentRollPropertyMetadata {
  const lines = text
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .slice(0, sourceSystem === "mri_rent_roll" ? 15 : 10)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (sourceSystem === "mri_rent_roll") {
    return extractMriPropertyMetadata(lines);
  }

  if (sourceSystem === "yardi_rent_roll") {
    return extractYardiPropertyMetadata(lines);
  }

  return emptyMetadata;
}

function extractYardiPropertyMetadata(
  lines: string[],
): RentRollPropertyMetadata {
  let name: string | null = null;
  let address: ParsedAddress = emptyAddress();

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("property:")) {
      name = valueAfterColon(line);
    } else if (lower.startsWith("address:")) {
      address = parseAddress(valueAfterColon(line) ?? "");
    }
  }

  return {
    name,
    address_line1: address.address_line1,
    city: address.city,
    state: address.state,
    postal_code: address.postal_code,
  };
}

function extractMriPropertyMetadata(lines: string[]): RentRollPropertyMetadata {
  const metadata: RentRollPropertyMetadata = { ...emptyMetadata };

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("property name:")) {
      metadata.name = valueAfterColon(line);
    } else if (lower.startsWith("address:")) {
      metadata.address_line1 = valueAfterColon(line);
    } else if (lower.startsWith("city:")) {
      metadata.city = valueAfterColon(line);
    } else if (lower.startsWith("state:")) {
      metadata.state = valueAfterColon(line);
    } else if (lower.startsWith("zip:")) {
      metadata.postal_code = valueAfterColon(line);
    }
  }

  return metadata;
}

function valueAfterColon(line: string): string | null {
  const value = line.split(":", 2)[1]?.trim();

  return value && value.length > 0 ? value : null;
}

type ParsedAddress = Omit<RentRollPropertyMetadata, "name">;

function emptyAddress(): ParsedAddress {
  return {
    address_line1: null,
    city: null,
    state: null,
    postal_code: null,
  };
}

function parseAddress(value: string): ParsedAddress {
  const address = emptyAddress();
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  address.address_line1 = parts[0] ?? null;
  address.city = parts[1] ?? null;

  const stateZip = parts[2] ?? "";
  const stateZipMatch = /^([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/u.exec(stateZip);
  if (stateZipMatch?.[1]) {
    address.state = stateZipMatch[1];
    address.postal_code = stateZipMatch[2] ?? null;
  } else if (/^\d{5}/u.test(stateZip)) {
    address.postal_code = stateZip.slice(0, 5);
  }

  return address;
}

function parseCsv(text: string): CsvTable {
  const rows = parseCsvRows(text.replace(/^\uFEFF/u, ""));
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
  const scanLimit = Math.min(rows.length, 100);
  for (let index = 0; index < scanLimit; index += 1) {
    const text = rows[index]?.join(" ").toLowerCase() ?? "";
    const matches = [
      "unit",
      "suite",
      "space",
      "tenant",
      "sqft",
      "sf",
      "lease",
      "rent",
    ].filter((keyword) => text.includes(keyword)).length;
    if (matches >= 2) {
      return index;
    }
  }

  return 0;
}

function buildColumnMap(headers: string[]): Map<keyof RentRollUnit, string> {
  const map = new Map<keyof RentRollUnit, string>();

  for (const header of headers) {
    const normalized = header.toLowerCase().trim();
    if (
      (normalized.includes("unit") ||
        normalized.includes("suite") ||
        normalized.includes("space")) &&
      (normalized.includes("number") ||
        normalized.includes("id") ||
        normalized.includes("code") ||
        ["unit", "suite", "space"].includes(normalized))
    ) {
      map.set("unit_number", header);
    }
    if (
      normalized.includes("sf") ||
      normalized.includes("sqft") ||
      normalized.includes("feet") ||
      normalized.includes("area")
    ) {
      if (normalized.includes("rentable") || normalized === "rsf") {
        map.set("rentable_sqft", header);
      } else if (normalized.includes("usable") || normalized === "usf") {
        map.set("usable_sqft", header);
      } else if (!map.has("rentable_sqft")) {
        map.set("rentable_sqft", header);
      }
    }
    if (
      normalized.includes("tenant") ||
      normalized.includes("occupant") ||
      normalized.includes("lessee")
    ) {
      map.set("tenant_name", header);
    }
    if (
      normalized.includes("start") ||
      normalized.includes("commence") ||
      normalized.includes("begin")
    ) {
      map.set("lease_start", header);
    }
    if (
      normalized.includes("end") ||
      normalized.includes("expir") ||
      normalized.includes("termin")
    ) {
      map.set("lease_end", header);
    }
    if (
      normalized.includes("rent") &&
      (normalized.includes("base") ||
        normalized.includes("monthly") ||
        normalized === "rent")
    ) {
      map.set("base_rent", header);
    }
    if (
      normalized.includes("share") ||
      normalized.includes("pro rata") ||
      normalized.includes("cam") ||
      normalized.includes("percentage") ||
      normalized.includes("%")
    ) {
      map.set("cam_share", header);
    }
    if (["floor", "flr", "level"].includes(normalized)) {
      map.set("floor", header);
    }
  }

  return map;
}

function parseRecord(
  record: Record<string, string>,
  columnMap: Map<keyof RentRollUnit, string>,
  rowNumber: number,
  warnings: string[],
): RentRollUnit | null {
  const unitNumber = stringValue(record, columnMap.get("unit_number"));
  if (
    unitNumber &&
    ["total", "totals", "subtotal", "grand total"].includes(
      unitNumber.toLowerCase(),
    )
  ) {
    return null;
  }
  if (!unitNumber) {
    return null;
  }

  const rentableSqft = decimalValue(record, columnMap.get("rentable_sqft"), 2);
  if (!rentableSqft) {
    warnings.push(`Row ${rowNumber}: Missing or invalid rentable_sqft`);
    return null;
  }
  // The Python oracle (schemas.RentRollRow field validators) rejects
  // non-positive sqft per row; without this gate a 0.00-sqft row passes preview
  // silently and then fails the whole import on the units rentable-sqft DB check.
  if (new Decimal(rentableSqft).lte(0)) {
    throw new Error(`Rentable sqft must be positive, got ${rentableSqft}`);
  }
  const usableSqft = decimalValue(record, columnMap.get("usable_sqft"), 2);
  if (usableSqft !== null && new Decimal(usableSqft).lte(0)) {
    throw new Error(`Usable sqft must be positive, got ${usableSqft}`);
  }
  // usable_sqft is OPTIONAL and commonly absent/blank — that must NOT warn.
  // But decimalValue also returns null for a non-empty POISON cell (e.g. a
  // formula or hex/scientific literal that fails the plain-decimal contract),
  // and that case was silently swallowed: the unit was kept with
  // usable_sqft: null and no audit trail, unlike rentable_sqft (which throws
  // and warns). Distinguish the two by checking the raw cell directly: only
  // warn when the raw value was non-empty but failed to parse.
  if (usableSqft === null) {
    const rawUsableSqft = stringValue(record, columnMap.get("usable_sqft"));
    if (rawUsableSqft) {
      warnings.push(
        `Row ${rowNumber}: Ignored invalid usable_sqft "${rawUsableSqft}"`,
      );
    }
  }

  const tenantName = stringValue(record, columnMap.get("tenant_name"));
  const baseRent = decimalValue(record, columnMap.get("base_rent"), 2);
  // Same silent-drop shape as usable_sqft: base_rent is optional, so a
  // blank/absent cell must not warn, but a non-empty cell that fails the
  // numeric contract should leave an audit trail instead of vanishing.
  if (baseRent === null) {
    const rawBaseRent = stringValue(record, columnMap.get("base_rent"));
    if (rawBaseRent) {
      warnings.push(
        `Row ${rowNumber}: Ignored invalid base_rent "${rawBaseRent}"`,
      );
    }
  }

  return {
    unit_number: unitNumber,
    rentable_sqft: rentableSqft,
    usable_sqft: usableSqft,
    floor: intValue(record, columnMap.get("floor")),
    tenant_name: tenantName,
    lease_start: dateValue(
      record,
      columnMap.get("lease_start"),
      warnings,
      rowNumber,
    ),
    lease_end: dateValue(
      record,
      columnMap.get("lease_end"),
      warnings,
      rowNumber,
    ),
    base_rent: baseRent === "0.00" && !tenantName ? null : baseRent,
    cam_share: camShareValue(record, columnMap.get("cam_share")),
  };
}

function stringValue(
  record: Record<string, string>,
  header: string | undefined,
): string | null {
  if (!header) {
    return null;
  }
  const value = record[header]?.trim();
  if (!value || value.toLowerCase() === "nan") {
    return null;
  }

  return value;
}

function decimalValue(
  record: Record<string, string>,
  header: string | undefined,
  precision: number,
): string | null {
  const value = stringValue(record, header);
  if (!value) {
    return null;
  }
  // Canonicalize the Unicode minus sign U+2212 ("−") to ASCII "-" before any
  // sign detection, mirroring the GL parser's cleanCurrency contract
  // (csv-parser.ts) and the billing parser's parseMoney. Without this, a
  // locale export that emits a real minus glyph ("−500.00") falls out of the
  // plain-decimal contract below and the row silently drops.
  const normalized = value
    .replaceAll("$", "")
    .replaceAll(",", "")
    .replaceAll("−", "-")
    .trim();
  const unsigned = normalized.startsWith("-") ? normalized.slice(1).trim() : normalized;
  // A numeric cell must be a plain decimal literal after decoration is stripped.
  // Without this contract `new Decimal()` silently accepts scientific ("1e3" ->
  // 1000) and hex ("0x64" -> 100) literals, and the non-finite tokens
  // "Infinity"/"NaN" — any of which would corrupt rentable_sqft (the pro-rata
  // denominator) with no error surfaced. Mirrors the GL parser's cleanCurrency
  // numeric contract.
  if (!/^\d+(\.\d+)?$/u.test(unsigned)) {
    return null;
  }
  try {
    // The Python rent-roll oracle (generic_rent_roll._get_decimal_value) quantizes
    // with the default decimal context — i.e. ROUND_HALF_EVEN (banker's rounding) —
    // unlike the calculation layer, which is explicitly ROUND_HALF_UP. Match the
    // parser oracle here so half-boundary sqft/rent values agree penny-for-penny.
    return new Decimal(normalized)
      .toDecimalPlaces(precision, Decimal.ROUND_HALF_EVEN)
      .toFixed(precision);
  } catch {
    return null;
  }
}

function camShareValue(
  record: Record<string, string>,
  header: string | undefined,
): string | null {
  const value = stringValue(record, header);
  if (!value) {
    return null;
  }
  try {
    const raw = new Decimal(value.replace("%", "").trim());
    const normalized = raw.gt(1) ? raw.div(100) : raw;

    // Match the Python oracle (_get_cam_share): quantize to 4dp with the default
    // decimal context (ROUND_HALF_EVEN / banker's), not decimal.js's HALF_UP default.
    return normalized.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN).toFixed(4);
  } catch {
    return null;
  }
}

function intValue(
  record: Record<string, string>,
  header: string | undefined,
): number | null {
  const value = stringValue(record, header);
  if (!value) {
    return null;
  }
  const parsed = Number(value);

  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function dateValue(
  record: Record<string, string>,
  header: string | undefined,
  warnings: string[],
  rowNumber: number,
): string | null {
  const value = stringValue(record, header);
  if (!value) {
    return null;
  }
  const parsed = parseDate(value);
  if (!parsed) {
    warnings.push(
      `Row ${rowNumber}: Could not parse date '${value}' in ${header}`,
    );
  }

  return parsed;
}

function parseDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(trimmed);
  if (iso) {
    // Validate the calendar date instead of trusting the shape. A string like
    // "2024-13-05" matches the ISO pattern but is not a real date; returning it
    // raw would persist a garbage lease boundary that feeds day-weighted
    // occupancy and proration. The oracle rejects it (generic_rent_roll.py:494
    // pd.to_datetime raises -> None), so we route it through the same validity
    // gate the slash/dash branches already use.
    return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/u.exec(trimmed);
  if (slash) {
    const [month, day] = resolveMonthDay(Number(slash[1]), Number(slash[2]));
    return validDate(Number(slash[3]), month, day);
  }

  const dash = /^(\d{1,2})-(\d{1,2})-(\d{4})$/u.exec(trimmed);
  if (dash) {
    const [month, day] = resolveMonthDay(Number(dash[1]), Number(dash[2]));
    return validDate(Number(dash[3]), month, day);
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

// Disambiguate a numeric DD/MM-vs-MM/DD date the same way the GL CSV parser does
// (csv-parser.ts) and the Python oracle does (yardi_rent_roll._get_date_value
// tries "%m/%d/%Y" then "%d/%m/%Y"). Default to US MM/DD; when the first field
// cannot be a month but the second can, the value is unambiguously DD/MM — honor
// it instead of dropping the row. Without this, a rent roll exported in a DD/MM
// locale silently lost every day-13+ lease_start / lease_end to null, feeding
// day-weighted occupancy and proration garbage boundaries.
function resolveMonthDay(first: number, second: number): [number, number] {
  if (first > 12 && second <= 12) {
    return [second, first];
  }
  return [first, second];
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}
