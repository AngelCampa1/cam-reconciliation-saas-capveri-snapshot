/**
 * CSV Export Helper Functions
 *
 * Utilities for generating CSV exports from year-over-year comparison data.
 */

import type { YearOverYearComparison } from '../types'

/**
 * Escape CSV values to handle commas, quotes, and newlines.
 *
 * If value contains special characters, wraps in quotes and escapes internal quotes.
 */
export function escapeCSVValue(value: string): string {
  // If value contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Generate CSV content from year-over-year comparison data.
 *
 * Returns formatted CSV string with headers and pool comparison rows.
 */
export function generateCSVContent(data: YearOverYearComparison): string {
  const headers = [
    'Pool Name',
    ...data.years.map((y) => `${y} ($)`),
    'Variance ($)',
    'Variance (%)',
  ]

  const rows = data.pool_comparisons.map((pool) => [
    escapeCSVValue(pool.pool_name),
    ...data.years.map((year) => {
      const amount = pool.amounts[year]
      return amount !== null && amount !== undefined ? amount.toString() : 'N/A'
    }),
    pool.variance_amount?.toString() || 'N/A',
    pool.variance_percent?.toFixed(1) || 'N/A',
  ])

  return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n')
}

/**
 * Generate CSV filename for export.
 *
 * Includes property name and timestamp.
 */
export function generateCSVFilename(propertyName: string): string {
  const escapedName = escapeCSVValue(propertyName).replace(/"/g, '')
  return `yoy-comparison-${escapedName}-${Date.now()}.csv`
}
