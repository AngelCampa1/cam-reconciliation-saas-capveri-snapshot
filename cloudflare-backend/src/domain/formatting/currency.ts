import Decimal from "decimal.js";

/**
 * Format a dollar amount as USD currency string.
 * Negative values render as "-$1,234.56", positive as "$1,234.56".
 * Always two decimal places with thousands separators.
 */
export function formatUsd(amount: Decimal | string | number): string {
  const d = new Decimal(amount);
  const abs = d.abs();
  const isNeg = d.isNegative() && !d.isZero();

  // Format with two decimals (ROUND_HALF_EVEN matches Python's ":,.2f" f-string format)
  const fixed = abs.toFixed(2, Decimal.ROUND_HALF_EVEN);
  const [intPart, decPart] = fixed.split(".");
  const withCommas = (intPart ?? "0").replace(/\B(?=(\d{3})+(?!\d))/gu, ",");

  return `${isNeg ? "-" : ""}$${withCommas}.${decPart ?? "00"}`;
}

export type TraceUnit =
  | "currency"
  | "ratio"
  | "area"
  | "count"
  | "date"
  | "text"
  | string;

/**
 * Format a calculation trace value given its unit.
 * Mirrors the Python backend TenantPacketGenerator._format_trace_value for all
 * numeric and string cases. One divergence: Python's `None` renders as `"None"`
 * (via Python's `str(None)`), whereas this function returns `"null"` for JS
 * `null` and `undefined`. All other formatting is identical.
 */
export function formatTraceValue(
  value: unknown,
  unit: TraceUnit = "currency",
): string {
  if (value === null || value === undefined) {
    // Normalize both null and undefined to the same output: "null"
    return "null";
  }

  const asDecimal = tryDecimal(value);

  switch (unit) {
    case "ratio": {
      if (asDecimal !== null) {
        const prefix = asDecimal.isNegative() ? "-" : "";
        return `${prefix}${asDecimal.abs().toFixed(4)}`;
      }
      return String(value);
    }
    case "area": {
      if (asDecimal !== null) {
        // integer check: is it a whole number?
        const isWhole = asDecimal
          .mod(1)
          .abs()
          .lessThan(new Decimal("0.000001"));
        const formatted = isWhole
          ? asDecimal.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/gu, ",")
          : asDecimal.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
        return `${formatted} sq ft`;
      }
      return String(value);
    }
    case "count": {
      if (asDecimal !== null) {
        return asDecimal.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
      }
      return String(value);
    }
    case "date":
    case "text": {
      return String(value);
    }
    case "currency":
    default: {
      if (asDecimal !== null) {
        return formatUsd(asDecimal);
      }
      return String(value);
    }
  }
}

function tryDecimal(value: unknown): Decimal | null {
  if (typeof value === "number" || typeof value === "string") {
    try {
      return new Decimal(value);
    } catch {
      return null;
    }
  }
  return null;
}
