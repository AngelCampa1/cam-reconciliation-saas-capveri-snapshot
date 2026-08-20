/**
 * English noun pluralization for count-driven UI copy.
 *
 * Many surfaces render "{count} {noun}" where the noun was hardcoded plural
 * ("1 items", "1 tenants", "1 days") — grammatically wrong when the count is
 * exactly one, and a small but visible polish defect for every client who
 * lands on a single-item state. Some sibling components already guarded this
 * inline (`noun{count !== 1 ? 's' : ''}`); these helpers make that the one
 * canonical rule instead of a scattered, easy-to-forget pattern.
 *
 * `pluralize` returns just the noun so callers keep control of the count's own
 * formatting (thousands separators, surrounding copy). `pluralizeWithCount`
 * is the common-case convenience that prefixes a locale-formatted count.
 */

import { formatNumber } from './number'

/**
 * Return the correct singular or plural form of a noun for the given count.
 *
 * Defaults to the regular `-s` plural; pass an explicit `plural` for irregular
 * nouns ("person" -> "people", "is" -> "are"). Only a count of exactly 1 is
 * singular — 0 and negative counts take the plural form, matching English
 * usage ("0 items", "-1 items").
 */
export const pluralize = (
  count: number,
  singular: string,
  plural?: string
): string => {
  return count === 1 ? singular : (plural ?? `${singular}s`)
}

/**
 * Render "{count} {noun}" with the count formatted using locale thousands
 * separators and the noun pluralized to match. Keeps large counts readable
 * ("8,432 rows") and grammatically correct at the singular boundary
 * ("1 row").
 */
export const pluralizeWithCount = (
  count: number,
  singular: string,
  plural?: string
): string => {
  return `${formatNumber(count)} ${pluralize(count, singular, plural)}`
}
