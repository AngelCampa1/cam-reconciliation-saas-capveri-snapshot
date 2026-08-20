/**
 * String-based percent <-> decimal conversion helpers.
 *
 * CapVeri rule: "Use Decimal for money - never float." The lease recovery
 * profile stores rates as decimal fractions on the backend (pro_rata_share
 * 0.25, cap_rate 0.05, admin_fee_percentage 0.15) but the form edits them as
 * human-readable percentages ("25", "5", "15"). Converting between the two
 * with `parseFloat(value) / 100` or `* 100` coerces the value to an IEEE-754
 * double and loses precision: e.g. `2.9 / 100 === 0.028999999999999998`. That
 * lossy value is then persisted to the backend.
 *
 * These helpers shift the decimal point by exactly two places using string
 * manipulation, so no rounding error is ever introduced. The backend accepts
 * decimal strings for these fields (anyOf: [number, string]), so the exact
 * string can be submitted verbatim.
 */

const isNumericString = (value: string): boolean => {
  // Accept an optional leading sign, digits, and a single decimal point.
  return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(value.trim())
}

/**
 * Split a numeric string into sign, integer digits, and fraction digits.
 * Returns null when the input is not a plain decimal number.
 */
const decompose = (
  value: string
): { sign: string; intPart: string; fracPart: string } | null => {
  const trimmed = value.trim()
  if (!isNumericString(trimmed)) {
    return null
  }
  let sign = ''
  let rest = trimmed
  if (rest[0] === '+' || rest[0] === '-') {
    sign = rest[0] === '-' ? '-' : ''
    rest = rest.slice(1)
  }
  const [intRaw = '', fracRaw = ''] = rest.split('.')
  return { sign, intPart: intRaw, fracPart: fracRaw }
}

/**
 * Strip leading zeros from the integer part and trailing zeros from the
 * fraction part, then reassemble into a canonical decimal string. Returns
 * "0" for any all-zero magnitude (sign dropped).
 */
const canonicalize = (
  sign: string,
  intPart: string,
  fracPart: string
): string => {
  const intTrimmed = intPart.replace(/^0+/, '')
  const fracTrimmed = fracPart.replace(/0+$/, '')
  const intFinal = intTrimmed === '' ? '0' : intTrimmed
  if (fracTrimmed === '') {
    // Whole number; "0" should never carry a sign.
    return intFinal === '0' ? '0' : `${sign}${intFinal}`
  }
  const magnitudeIsZero = intFinal === '0' && fracTrimmed === ''
  return magnitudeIsZero ? '0' : `${sign}${intFinal}.${fracTrimmed}`
}

/**
 * Convert a percentage string ("25", "2.9", "33.33") to its decimal-fraction
 * string ("0.25", "0.029", "0.3333") by shifting the decimal point left two
 * places. Non-numeric input is returned unchanged so callers can let backend
 * validation surface the error.
 */
export const percentToDecimalString = (percent: string): string => {
  const parts = decompose(percent)
  if (parts === null) {
    return percent
  }
  const { sign, intPart, fracPart } = parts
  // All digits, in order, with no decimal point.
  const digits = `${intPart}${fracPart}`
  // The decimal point currently sits after intPart.length digits; shifting
  // left by 2 means it sits after (intPart.length - 2) digits.
  const pointFromLeft = intPart.length - 2
  let intResult: string
  let fracResult: string
  if (pointFromLeft <= 0) {
    // Need leading zeros in the fraction.
    intResult = '0'
    fracResult = '0'.repeat(-pointFromLeft) + digits
  } else {
    intResult = digits.slice(0, pointFromLeft)
    fracResult = digits.slice(pointFromLeft)
  }
  return canonicalize(sign, intResult, fracResult)
}

/**
 * Convert a decimal-fraction string ("0.25", "0.029", "0.3333") to its
 * percentage string ("25", "2.9", "33.33") by shifting the decimal point
 * right two places. Non-numeric input is returned unchanged.
 */
export const decimalToPercentString = (decimal: string): string => {
  const parts = decompose(decimal)
  if (parts === null) {
    return decimal
  }
  const { sign, intPart, fracPart } = parts
  const digits = `${intPart}${fracPart}`
  // The decimal point currently sits after intPart.length digits; shifting
  // right by 2 means it sits after (intPart.length + 2) digits.
  const pointFromLeft = intPart.length + 2
  let intResult: string
  let fracResult: string
  if (pointFromLeft >= digits.length) {
    // Need trailing zeros on the integer part.
    intResult = digits + '0'.repeat(pointFromLeft - digits.length)
    fracResult = ''
  } else {
    intResult = digits.slice(0, pointFromLeft)
    fracResult = digits.slice(pointFromLeft)
  }
  return canonicalize(sign, intResult, fracResult)
}
