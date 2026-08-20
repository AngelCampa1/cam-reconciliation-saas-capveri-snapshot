/**
 * Display helpers for Module B system comparison (over/under/match variance).
 *
 * Pure formatting only. NO money math. Backend computes every signed amount,
 * total, and count; the frontend just renders the decimal STRINGS it returns.
 */
import type { VarianceDirection } from '@/api/comparison'

/** Human label for a variance direction. */
export function directionLabel(direction: VarianceDirection): string {
  switch (direction) {
    case 'overcharge':
      return 'Overcharged'
    case 'undercharge':
      return 'Undercharged'
    case 'match':
      return 'Match'
  }
}

/**
 * Badge variant for a direction.
 *
 * Overcharge (tenant billed too much → refund exposure) and undercharge
 * (recovery left on the table) are both problems, so both read as non-neutral;
 * match is the confirmed-correct, calm state.
 */
export function directionBadgeVariant(
  direction: VarianceDirection
): 'destructive' | 'warning' | 'success' {
  switch (direction) {
    case 'overcharge':
      return 'destructive'
    case 'undercharge':
      return 'warning'
    case 'match':
      return 'success'
  }
}

/** Text color class for a direction (used on the signed variance figure). */
export function directionTextColor(direction: VarianceDirection): string {
  switch (direction) {
    case 'overcharge':
      // Dark on-light token (8.37:1). Bright `text-destructive` fails WCAG AA
      // (3.78:1) on the white/muted table cell at this text-sm size.
      return 'text-destructive-strong'
    case 'undercharge':
      // Dark on-light token (14.59:1). Bright `text-warning` is only 2.13:1.
      // (There is no warning `-strong`; `-foreground` is the dark variant.)
      return 'text-warning-foreground'
    case 'match':
      return 'text-muted-foreground'
  }
}

/**
 * Format a signed money string with an explicit leading sign for non-zero
 * values, so the over/under direction is legible at a glance.
 *
 * Uses the precise, string-safe `formatMoney` (never coerces to float). A
 * positive variance renders with a leading `+`; `formatMoney` already renders
 * the `-` for negatives.
 *
 * @example signedMoney('1234.56')  // => '+$1,234.56'
 * @example signedMoney('-12.00')   // => '-$12.00'
 * @example signedMoney('0')        // => '$0.00'
 */
export function signedMoney(
  value: string,
  formatMoney: (v: string) => string
): string {
  const trimmed = value.trim()
  const numeric = trimmed.replace(/[$,]/g, '')
  // Positive = has a non-zero digit anywhere and is not negative. This catches
  // sub-dollar overcharges like "0.50" that a leading-digit test would miss.
  const isPositive = /[1-9]/.test(numeric) && !numeric.startsWith('-')
  const formatted = formatMoney(trimmed)
  return isPositive ? `+${formatted}` : formatted
}

/**
 * Format a percentage decimal STRING (e.g. "12.5") as a signed percent for
 * display, or a dash when null (capveri_correct was zero).
 *
 * @example formatVariancePct('12.5')   // => '+12.5%'
 * @example formatVariancePct('-4')     // => '-4%'
 * @example formatVariancePct(null)     // => '-'
 */
export function formatVariancePct(value: string | null): string {
  if (value === null) {
    return '-'
  }
  const trimmed = value.trim()
  if (trimmed === '' || !/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(trimmed)) {
    return '-'
  }
  // Positive = has a non-zero digit anywhere and is not negative, so a
  // sub-1% overcharge like "0.5" still reads with a leading "+".
  const isPositive = /[1-9]/.test(trimmed) && !trimmed.startsWith('-')
  const body = trimmed.replace(/^\+/, '')
  return `${isPositive ? '+' : ''}${body}%`
}
