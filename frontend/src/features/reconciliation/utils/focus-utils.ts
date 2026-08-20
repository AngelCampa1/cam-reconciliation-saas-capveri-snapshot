/**
 * Utilities for managing grid cell focus indicators and accessibility.
 */

import type { FocusedCell } from '../hooks/useGridKeyboard'

/**
 * Get CSS classes for a cell based on focus state.
 */
export function getCellFocusClasses(
  rowIndex: number,
  columnId: string,
  focusedCell: FocusedCell | null
): string {
  const isFocused =
    focusedCell?.rowIndex === rowIndex && focusedCell?.columnId === columnId

  return isFocused ? 'ring-2 ring-primary ring-offset-1 outline-none' : ''
}

/**
 * Get ARIA attributes for a cell to support screen readers.
 */
export function getCellAriaAttributes(
  rowIndex: number,
  columnLabel: string,
  cellValue: string | number | undefined,
  totalRows: number
): {
  role: string
  'aria-rowindex': number
  'aria-colindex': number
  'aria-label': string
  tabIndex: number
} {
  // Row index is 1-based for ARIA (0 is header)
  const ariaRowIndex = rowIndex + 2 // +1 for 1-based, +1 for header row
  // Column index is 1-based for ARIA
  const columns = ['Pool Name', 'Type', 'Total Expenses', 'Grossed Up'] // This should be dynamic
  const ariaColIndex = columns.indexOf(columnLabel) + 1

  const valueText = cellValue !== undefined ? String(cellValue) : 'empty'
  const positionText = `Row ${rowIndex + 1} of ${totalRows}, Column ${columnLabel}`
  const ariaLabel = `${positionText}, ${valueText}`

  return {
    role: 'gridcell',
    'aria-rowindex': ariaRowIndex,
    'aria-colindex': ariaColIndex,
    'aria-label': ariaLabel,
    tabIndex: -1, // Grid manages focus, not individual cells
  }
}

/**
 * Focus CSS class constant for consistent styling.
 */
export const FOCUS_INDICATOR_CLASSES =
  'ring-2 ring-primary ring-offset-1 outline-none' as const

/**
 * Check if a cell should be focusable based on edit state.
 */
export function isCellFocusable(isEditable: boolean): boolean {
  return isEditable
}
