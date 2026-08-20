/**
 * Locale-stable plain-number formatting (non-currency).
 *
 * Mirrors the money helpers' rule: pin the locale to 'en-US' so the grouping
 * separator is the same for every visitor. A bare `value.toLocaleString()` with
 * no locale argument follows the visitor's BROWSER locale, so the same count
 * renders as "1,234" / "1.234" / "1 234" across users --- a coherence break.
 *
 * Use this for counts, row totals, square footage, and other plain numbers.
 * For money use `formatMoney`/`formatMoneyWhole`; for dates use
 * `formatCalendarDate`.
 *
 * With no options the output matches a bare `.toLocaleString()` on an en-US
 * runtime exactly (ECMA-402 defaults: min 0, max 3 fraction digits).
 */

const NUMERIC_STRING = /^[+-]?(\d+(\.\d*)?|\.\d+)$/

const isNumericString = (value: string): boolean =>
  NUMERIC_STRING.test(value.trim())

/**
 * Format a plain number for display with en-US grouping.
 *
 * Accepts a number, or an exact decimal string (formatted via an exact
 * ECMA-402 decimal parse, no float coercion). Non-numeric strings are returned
 * unchanged as a safe fallback.
 *
 * @example
 * formatNumber(1234)            // => '1,234'
 * formatNumber(1234.5)         // => '1,234.5'
 * formatNumber('1234.50')      // => '1,234.5'
 */
export function formatNumber(
  value: string | number,
  options: Intl.NumberFormatOptions = {}
): string {
  const formatter = new Intl.NumberFormat('en-US', options)

  if (typeof value === 'number') {
    return formatter.format(value)
  }

  const trimmed = value.trim()
  if (!isNumericString(trimmed)) {
    return value
  }

  // Intl.NumberFormat.format performs an exact decimal parse on a string
  // argument at runtime; the type signature only advertises number | bigint.
  return formatter.format(trimmed as unknown as number)
}

/**
 * Format a plain number as a whole number (no fraction digits), e.g. `1,235`.
 *
 * A thin wrapper over {@link formatNumber} that pins the fraction digits to 0,
 * mirroring {@link formatMoneyWhole}. Use it for square footage, counts, and
 * other plain integers that should render rounded and locale-stable. Rounds to
 * the nearest whole number (ECMA-402); non-numeric strings pass through
 * unchanged.
 *
 * @example
 * formatWholeNumber(1234.56)   // => '1,235'
 * formatWholeNumber('1234.49') // => '1,234'
 */
export function formatWholeNumber(value: string | number): string {
  return formatNumber(value, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}
