/**
 * Variance formatting helpers.
 *
 * These live alongside the other pure formatters in `lib/` (money, number,
 * title-case, format-bytes) rather than the app's per-surface percent logic.
 * Percent formatting deliberately has no single SSOT — different surfaces show
 * different precision and sign conventions. This module covers only the signed
 * variance delta used by the reconciliation export report.
 */

/**
 * Format a variance percentage for display.
 *
 * `percent` is an already-computed percentage (e.g. 12.5 renders as "+12.50%"),
 * not a fraction. A leading "+" is shown for non-negative values so the figure
 * reads as a signed delta — a reconciliation total that moved up or down versus
 * the prior year. That sign carries meaning, which is why this is intentionally
 * separate from a plain percent formatter.
 *
 * Shared by VarianceReport and VarianceTable, which previously each held a
 * byte-identical copy of this transform.
 */
export function formatVariancePercent(percent: number): string {
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`
}
