/**
 * Exact, string-safe money helpers.
 *
 * Backend money values are serialized as decimal STRINGS to preserve full
 * precision (the backend uses Python Decimal --- "never float"). Converting those
 * strings to JS `number` via `parseFloat`/`Number()` loses precision beyond ~15
 * significant digits and introduces float drift when accumulating many values.
 *
 * - `formatMoney` formats an exact decimal string for display WITHOUT first
 *   coercing it to a float: `Intl.NumberFormat.format()` performs an exact
 *   ECMA-402 decimal parse when handed a string at runtime (the TS types only
 *   advertise `number | bigint`, hence the cast).
 * - `sumMoney` adds decimal strings exactly using integer (BigInt) scaling,
 *   returning a canonical decimal string --- no float ever touched.
 */

const NUMERIC_STRING = /^[+-]?(\d+(\.\d*)?|\.\d+)$/

const isNumericString = (value: string): boolean =>
  NUMERIC_STRING.test(value.trim())

/**
 * Format a money value for display as USD (or another ISO currency).
 *
 * Accepts either an exact decimal string (preferred --- preserves precision) or a
 * number. Numeric strings are formatted via an exact decimal parse; non-numeric
 * strings are returned unchanged as a safe fallback.
 *
 * @example
 * formatMoney('1234.56')              // => '$1,234.56'
 * formatMoney('999999999999.9999')    // => '$1,000,000,000,000.00' (exact parse, then rounded for display)
 * formatMoney(1234.5)                 // => '$1,234.50'
 */
export function formatMoney(
  value: string | number,
  currency: string = 'usd',
  options: Intl.NumberFormatOptions = {}
): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    ...options,
  })

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
 * Format a money value as whole dollars (no cents), e.g. `$1,235`.
 *
 * A thin wrapper over {@link formatMoney} that pins the fraction digits to 0 so
 * dashboards, estimates, and summary tiles that intentionally show rounded
 * figures stay visually consistent. Rounds to the nearest dollar (ECMA-402).
 *
 * @example
 * formatMoneyWhole(1234.56)   // => '$1,235'
 * formatMoneyWhole('1234.49') // => '$1,234'
 */
export function formatMoneyWhole(
  value: string | number,
  currency: string = 'usd'
): string {
  return formatMoney(value, currency, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

interface Decomposed {
  negative: boolean
  intPart: string
  fracPart: string
}

const decompose = (value: string): Decomposed | null => {
  const trimmed = value.trim()
  if (!isNumericString(trimmed)) {
    return null
  }
  let negative = false
  let rest = trimmed
  if (rest[0] === '+' || rest[0] === '-') {
    negative = rest[0] === '-'
    rest = rest.slice(1)
  }
  const [intRaw = '', fracRaw = ''] = rest.split('.')
  return { negative, intPart: intRaw, fracPart: fracRaw }
}

/**
 * Add a list of money values exactly, returning a canonical decimal string.
 *
 * Accepts ONLY exact decimal STRINGS --- never `number`. Summing JS floats would
 * reintroduce the precision loss this helper exists to prevent (and a float
 * stringified to exponential notation, e.g. `1e-7`, would be silently dropped).
 * Callers must pass the backend's decimal strings directly.
 *
 * Null/undefined/empty entries are treated as 0. Non-numeric strings are
 * ignored (treated as 0) so a single malformed row never corrupts the total.
 * Uses BigInt integer scaling --- no floating-point arithmetic.
 *
 * @example
 * sumMoney(['0.1', '0.2'])           // => '0.3'  (float would give 0.30000000000000004)
 * sumMoney(['1234.56', '7.44'])      // => '1242'
 * sumMoney([])                       // => '0'
 */
export function sumMoney(values: Array<string | null | undefined>): string {
  const decomposed: Decomposed[] = []
  let maxFrac = 0

  for (const raw of values) {
    if (raw === null || raw === undefined || raw === '') {
      continue
    }
    const parts = decompose(raw)
    if (parts === null) {
      continue
    }
    maxFrac = Math.max(maxFrac, parts.fracPart.length)
    decomposed.push(parts)
  }

  let total = 0n
  for (const { negative, intPart, fracPart } of decomposed) {
    const scaledDigits = `${intPart}${fracPart.padEnd(maxFrac, '0')}`
    const magnitude = BigInt(scaledDigits === '' ? '0' : scaledDigits)
    total += negative ? -magnitude : magnitude
  }

  return formatScaledBigInt(total, maxFrac)
}

const formatScaledBigInt = (total: bigint, scale: number): string => {
  const negative = total < 0n
  const digits = (negative ? -total : total).toString()

  let intResult: string
  let fracResult: string
  if (scale === 0) {
    intResult = digits
    fracResult = ''
  } else {
    const padded = digits.padStart(scale + 1, '0')
    intResult = padded.slice(0, padded.length - scale)
    fracResult = padded.slice(padded.length - scale)
  }

  const fracTrimmed = fracResult.replace(/0+$/, '')
  const sign = negative && total !== 0n ? '-' : ''
  if (fracTrimmed === '') {
    return `${sign}${intResult}`
  }
  return `${sign}${intResult}.${fracTrimmed}`
}
