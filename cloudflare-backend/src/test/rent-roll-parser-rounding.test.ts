import { describe, expect, it } from "vitest";
import { parseRentRollCsv } from "../domain/rent-roll/parser";

// Pins the rent-roll CSV parser's numeric quantization to the Python oracle
// (backend/app/services/ingestion/parsers/generic_rent_roll.py). That oracle
// quantizes rentable_sqft / usable_sqft / base_rent (via _get_decimal_value) and
// cam_share (via _get_cam_share) with the DEFAULT decimal context, i.e.
// ROUND_HALF_EVEN (banker's rounding) — not the calculation layer's explicit
// ROUND_HALF_UP. decimal.js defaults toDecimalPlaces() to ROUND_HALF_UP, so the
// parser must override to ROUND_HALF_EVEN to stay penny-faithful. These cases all
// sit exactly on a half boundary, where HALF_UP and HALF_EVEN disagree.
function parse(header: string, dataRow: string) {
  const text = `${header}\n${dataRow}\n`;
  return parseRentRollCsv({ text, filename: "rounding.csv" });
}

describe("rent-roll parser numeric rounding parity (ROUND_HALF_EVEN oracle)", () => {
  it("rounds rentable_sqft half-down toward even (1234.125 -> 1234.12)", () => {
    // Decimal('1234.125').quantize(Decimal('0.01')) -> 1234.12 (2 is even)
    const res = parse("unit,rentable sqft", "101,1234.125");
    expect(res.units).toHaveLength(1);
    expect(res.units[0]?.rentable_sqft).toBe("1234.12");
  });

  it("rounds rentable_sqft half-up toward even (1234.135 -> 1234.14)", () => {
    // Decimal('1234.135').quantize(Decimal('0.01')) -> 1234.14 (3 is odd -> up)
    const res = parse("unit,rentable sqft", "101,1234.135");
    expect(res.units[0]?.rentable_sqft).toBe("1234.14");
  });

  it("rounds base_rent half toward even (100.125 -> 100.12)", () => {
    // rentable sqft column is required for the parser to emit a unit row.
    const res = parse("unit,rentable sqft,base rent", "101,1000,100.125");
    expect(res.units[0]?.base_rent).toBe("100.12");
  });

  it("rounds usable_sqft half toward even (50.005 -> 50.00)", () => {
    // Decimal('50.005').quantize(Decimal('0.01')) -> 50.00 (0 is even)
    const res = parse("unit,rentable sqft,usable sqft", "101,1000,50.005");
    expect(res.units[0]?.usable_sqft).toBe("50.00");
  });

  it("rounds cam_share (fraction form) half toward even (0.00125 -> 0.0012)", () => {
    // value <= 1, so no /100; Decimal('0.00125').quantize('0.0001') -> 0.0012
    const res = parse("unit,rentable sqft,pro rata share", "101,1000,0.00125");
    expect(res.units[0]?.cam_share).toBe("0.0012");
  });

  it("rounds cam_share (fraction form) half toward even, odd up (0.00135 -> 0.0014)", () => {
    const res = parse("unit,rentable sqft,pro rata share", "101,1000,0.00135");
    expect(res.units[0]?.cam_share).toBe("0.0014");
  });

  it("rounds cam_share (percentage form) after /100 conversion (5.235% -> 0.0524)", () => {
    // raw 5.235 > 1 -> /100 = 0.05235; quantize('0.0001') HALF_EVEN -> 0.0524 (3 odd -> up)
    const res = parse("unit,rentable sqft,pro rata share", "101,1000,5.235%");
    expect(res.units[0]?.cam_share).toBe("0.0524");
  });

  it("leaves non-boundary values unchanged (1000.50 -> 1000.50)", () => {
    const res = parse("unit,rentable sqft", "101,1000.50");
    expect(res.units[0]?.rentable_sqft).toBe("1000.50");
  });
});

// Pins the ISO-date branch of parseDate to the oracle
// (backend/app/services/ingestion/parsers/generic_rent_roll.py:494 — pd.to_datetime
// raises on an out-of-range calendar date and returns None). The ISO branch used
// to return any "\d{4}-\d{2}-\d{2}"-shaped string verbatim, so an impossible date
// like "2024-13-05" persisted as a real lease boundary and fed day-weighted
// occupancy / proration with garbage. The slash/dash branches already validated;
// the ISO branch now uses the same validity gate.
describe("rent-roll ISO date calendar validation (oracle parity)", () => {
  it("rejects an impossible ISO month (2024-13-05 -> null), not stored raw", () => {
    const res = parse("unit,rentable sqft,lease start", "101,1000,2024-13-05");
    expect(res.units).toHaveLength(1);
    expect(res.units[0]?.lease_start).toBeNull();
  });

  it("rejects an impossible ISO day (2024-02-30 -> null)", () => {
    const res = parse("unit,rentable sqft,lease start", "101,1000,2024-02-30");
    expect(res.units[0]?.lease_start).toBeNull();
  });

  it("still accepts a valid ISO date (2024-06-15 -> 2024-06-15)", () => {
    const res = parse("unit,rentable sqft,lease start", "101,1000,2024-06-15");
    expect(res.units[0]?.lease_start).toBe("2024-06-15");
  });
});

// Pins parseDate's slash/dash branches to the oracle's DD/MM disambiguation
// (backend/app/services/ingestion/parsers/yardi_rent_roll.py _get_date_value
// tries "%m/%d/%Y" then "%d/%m/%Y", so 15/06/2024 -> 2024-06-15). The GL CSV
// parser already carries this heuristic (csv-parser.ts); the rent-roll parser
// did not, so a rent roll exported in a DD/MM locale silently dropped every
// day-13+ lease_start / lease_end to null — corrupting day-weighted occupancy
// and proration. Unambiguous DD/MM (first field > 12) swaps; genuinely
// ambiguous dates (both fields <= 12) keep the US MM/DD default the oracle's
// first format also produces.
describe("rent-roll slash/dash date DD/MM disambiguation (oracle parity)", () => {
  it("reads an unambiguous DD/MM/YYYY slash date instead of dropping it (15/06/2024 -> 2024-06-15)", () => {
    const res = parse("unit,rentable sqft,lease start", "101,1000,15/06/2024");
    expect(res.units).toHaveLength(1);
    expect(res.units[0]?.lease_start).toBe("2024-06-15");
  });

  it("reads an unambiguous DD-MM-YYYY dash date (15-06-2024 -> 2024-06-15)", () => {
    const res = parse("unit,rentable sqft,lease start", "101,1000,15-06-2024");
    expect(res.units[0]?.lease_start).toBe("2024-06-15");
  });

  it("keeps the US MM/DD default for a genuinely ambiguous slash date (06/05/2024 -> 2024-06-05)", () => {
    const res = parse("unit,rentable sqft,lease start", "101,1000,06/05/2024");
    expect(res.units[0]?.lease_start).toBe("2024-06-05");
  });

  it("still rejects a slash date impossible under both readings (31/13/2024 -> null)", () => {
    const res = parse("unit,rentable sqft,lease start", "101,1000,31/13/2024");
    expect(res.units[0]?.lease_start).toBeNull();
  });
});

// Pins the oracle's positive-sqft row validation (schemas.RentRollRow
// positive_rentable_sqft / positive_usable_sqft raise per row -> parser catches
// -> error_count + warning, other rows unaffected). Without it a 0.00-sqft row
// passed preview clean and then failed the entire import on the units
// rentable-sqft DB check.
describe("rent-roll parser non-positive sqft row rejection (oracle parity)", () => {
  it("excludes a 0.00 rentable_sqft row with an error and keeps valid rows", () => {
    const res = parseRentRollCsv({
      text: "unit,rentable sqft\n101,0.00\n102,1500.00\n",
      filename: "zero-sqft.csv",
    });
    expect(res.units).toHaveLength(1);
    expect(res.units[0]?.unit_number).toBe("102");
    expect(res.error_count).toBe(1);
    expect(res.warnings.join("\n")).toContain(
      "Row 1: Rentable sqft must be positive, got 0.00",
    );
  });

  it("excludes a negative rentable_sqft row with an error", () => {
    const res = parseRentRollCsv({
      text: "unit,rentable sqft\n101,-25.00\n",
      filename: "negative-sqft.csv",
    });
    expect(res.units).toHaveLength(0);
    expect(res.error_count).toBe(1);
    expect(res.warnings.join("\n")).toContain(
      "Row 1: Rentable sqft must be positive, got -25.00",
    );
  });

  it("excludes a 0.00 usable_sqft row with an error and keeps valid rows", () => {
    const res = parseRentRollCsv({
      text: "unit,rentable sqft,usable sqft\n101,1000.00,0.00\n102,1500.00,1200.00\n",
      filename: "zero-usable.csv",
    });
    expect(res.units).toHaveLength(1);
    expect(res.units[0]?.unit_number).toBe("102");
    expect(res.error_count).toBe(1);
    expect(res.warnings.join("\n")).toContain(
      "Row 1: Usable sqft must be positive, got 0.00",
    );
  });

  it("still allows an omitted usable_sqft (null) without error", () => {
    const res = parseRentRollCsv({
      text: "unit,rentable sqft,usable sqft\n101,1000.00,\n",
      filename: "blank-usable.csv",
    });
    expect(res.units).toHaveLength(1);
    expect(res.units[0]?.usable_sqft).toBeNull();
    expect(res.error_count).toBe(0);
  });
});

// Pins the audit-trail warning for a poison (non-empty, non-numeric)
// usable_sqft / base_rent cell. decimalValue returns null for BOTH an
// absent/blank optional cell (must NOT warn — these columns are optional and
// commonly missing) AND a non-empty cell that fails the plain-decimal
// contract (SHOULD warn — the unit is kept with the field forced to null with
// no audit trail otherwise, unlike rentable_sqft which throws + warns).
describe("rent-roll parser optional-field poison audit trail (usable_sqft / base_rent)", () => {
  it("keeps the unit and warns when usable_sqft is a poison (non-numeric) cell", () => {
    const res = parseRentRollCsv({
      text: "unit,rentable sqft,usable sqft\n101,1000.00,1e3\n",
      filename: "poison-usable.csv",
    });
    expect(res.units).toHaveLength(1);
    expect(res.units[0]?.usable_sqft).toBeNull();
    expect(res.warnings.join("\n")).toContain(
      'Row 1: Ignored invalid usable_sqft "1e3"',
    );
  });

  it("does not warn when usable_sqft column is entirely absent", () => {
    const res = parseRentRollCsv({
      text: "unit,rentable sqft\n101,1000.00\n",
      filename: "no-usable-column.csv",
    });
    expect(res.units).toHaveLength(1);
    expect(res.units[0]?.usable_sqft).toBeNull();
    expect(
      res.warnings.some((warning) => warning.includes("usable_sqft")),
    ).toBe(false);
  });

  it("keeps the unit and warns when base_rent is a poison (non-numeric) cell", () => {
    // "NaN"/"None" are treated as an absent cell by stringValue (used
    // throughout this parser), so use a genuinely poison numeric literal
    // that fails the plain-decimal contract without being absent-like.
    const res = parseRentRollCsv({
      text: "unit,rentable sqft,base rent\n101,1000.00,0x64\n",
      filename: "poison-base-rent.csv",
    });
    expect(res.units).toHaveLength(1);
    expect(res.units[0]?.base_rent).toBeNull();
    expect(res.warnings.join("\n")).toContain(
      'Row 1: Ignored invalid base_rent "0x64"',
    );
  });

  it("does not warn when base_rent column is entirely absent", () => {
    const res = parseRentRollCsv({
      text: "unit,rentable sqft\n101,1000.00\n",
      filename: "no-base-rent-column.csv",
    });
    expect(res.units).toHaveLength(1);
    expect(res.units[0]?.base_rent).toBeNull();
    expect(
      res.warnings.some((warning) => warning.includes("base_rent")),
    ).toBe(false);
  });
});
