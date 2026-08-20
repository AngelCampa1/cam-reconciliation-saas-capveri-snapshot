/**
 * Variance calculation and formatting utilities for year-over-year analysis.
 */

export type VarianceLevel = 'normal' | 'warning' | 'critical'

/**
 * Determine variance significance level based on percentage.
 *
 * @param variancePercent - Percentage variance (can be negative)
 * @returns VarianceLevel:
 *   - normal: <5% (green)
 *   - warning: 5-15% (amber)
 *   - critical: >15% (red)
 */
export function getVarianceLevel(variancePercent: number): VarianceLevel {
  const abs = Math.abs(variancePercent)

  if (abs < 5) return 'normal'
  if (abs < 15) return 'warning'
  return 'critical'
}

/**
 * Get CSS color class for variance level.
 *
 * @param level - Variance level
 * @returns Tailwind color class
 */
export function getVarianceColor(level: VarianceLevel): string {
  switch (level) {
    case 'normal':
      return 'text-success-strong'
    case 'warning':
      return 'text-warning-foreground'
    case 'critical':
      return 'text-destructive-strong'
  }
}

/**
 * Get background CSS color class for variance level.
 *
 * @param level - Variance level
 * @returns Tailwind background color class
 */
export function getVarianceBgColor(level: VarianceLevel): string {
  switch (level) {
    case 'normal':
      return 'bg-success/10'
    case 'warning':
      return 'bg-warning/10'
    case 'critical':
      return 'bg-destructive/10'
  }
}

/**
 * Format variance percentage with sign and color.
 *
 * @param variancePercent - Percentage variance
 * @returns Formatted string with sign (e.g., "+12.5%" or "-8.3%")
 */
export function formatVariancePercent(
  variancePercent: number | string | null | undefined
): string {
  if (variancePercent === null || variancePercent === undefined) {
    return 'N/A'
  }

  const value = Number(variancePercent)
  if (Number.isNaN(value)) {
    return 'N/A'
  }

  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

/**
 * Format currency variance with sign.
 *
 * @param varianceAmount - Dollar variance
 * @returns Formatted string with sign (e.g., "+$1,234.56" or "-$987.65")
 */
export function formatVarianceAmount(
  varianceAmount: number | string | null | undefined
): string {
  if (varianceAmount === null || varianceAmount === undefined) {
    return 'N/A'
  }

  const value = Number(varianceAmount)
  if (Number.isNaN(value)) {
    return 'N/A'
  }

  const sign = value >= 0 ? '+' : '-'
  const absValue = Math.abs(value)

  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absValue)

  return `${sign}${formatted}`
}

/**
 * Format currency amount without sign.
 *
 * @param amount - Dollar amount
 * @returns Formatted string (e.g., "$1,234.56")
 */
export function formatAmount(
  amount: number | string | null | undefined
): string {
  if (amount === null || amount === undefined) {
    return 'N/A'
  }

  const value = Number(amount)
  if (Number.isNaN(value)) {
    return 'N/A'
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/**
 * Get human-readable label for variance level.
 *
 * @param level - Variance level
 * @returns Label (e.g., "Normal Variance")
 */
export function getVarianceLabel(level: VarianceLevel): string {
  switch (level) {
    case 'normal':
      return 'Normal Variance'
    case 'warning':
      return 'Warning'
    case 'critical':
      return 'Critical Variance'
  }
}

/**
 * Calculate variance percentage from two values.
 *
 * @param current - Current value
 * @param base - Base value
 * @returns Percentage change or null if base is zero
 */
export function calculateVariancePercent(
  current: number,
  base: number
): number | null {
  if (base === 0) {
    return null
  }

  return ((current - base) / base) * 100
}

/**
 * Calculate variance amount from two values.
 *
 * @param current - Current value
 * @param base - Base value
 * @returns Absolute change
 */
export function calculateVarianceAmount(current: number, base: number): number {
  return current - base
}
