/**
 * Shared dispute constants used by both landlord and tenant-portal surfaces.
 */

export const CATEGORY_LABELS: Record<string, string> = {
  calculation_error: 'Calculation Error',
  missing_credit: 'Missing Credit',
  incorrect_area: 'Incorrect Square Footage',
  base_year_issue: 'Base Year Issue',
  billing_question: 'Billing Question',
  other: 'Other',
}

/** Returns a human-readable label for a dispute category, falling back to the raw value. */
export function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category
}
