/**
 * Year Selection Helper Functions
 *
 * Utilities for managing multi-year selection in year-over-year comparisons.
 */

/**
 * Handle year toggle logic for multi-year selection.
 *
 * Adds or removes a year from selection, enforcing max limit and sorting.
 *
 * @param currentYears - Currently selected years
 * @param year - Year to add or remove
 * @param checked - Whether to add (true) or remove (false) the year
 * @param maxYears - Maximum number of years allowed (default: 4)
 * @returns New array of selected years (sorted)
 */
export function handleYearToggle(
  currentYears: number[],
  year: number,
  checked: boolean,
  maxYears: number = 4
): number[] {
  if (checked) {
    // Add year if under limit
    if (currentYears.length < maxYears) {
      return [...currentYears, year].sort((a, b) => a - b)
    }
    // Don't add if at max limit
    return currentYears
  } else {
    // Remove year
    return currentYears.filter((y) => y !== year)
  }
}
