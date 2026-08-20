/**
 * Tests for focus utility functions.
 *
 * Validates CSS class generation and ARIA attributes for accessibility.
 */

import { describe, it, expect } from 'vitest'
import {
  getCellFocusClasses,
  getCellAriaAttributes,
  isCellFocusable,
  FOCUS_INDICATOR_CLASSES,
} from './focus-utils'

describe('focus-utils', () => {
  describe('getCellFocusClasses', () => {
    it('returns focus classes when cell is focused', () => {
      const focusedCell = { rowIndex: 0, columnId: 'col-1' }
      const classes = getCellFocusClasses(0, 'col-1', focusedCell)

      expect(classes).toBe('ring-2 ring-primary ring-offset-1 outline-none')
    })

    it('returns empty string when cell is not focused', () => {
      const focusedCell = { rowIndex: 0, columnId: 'col-1' }
      const classes = getCellFocusClasses(1, 'col-1', focusedCell)

      expect(classes).toBe('')
    })

    it('returns empty string when no cell is focused', () => {
      const classes = getCellFocusClasses(0, 'col-1', null)

      expect(classes).toBe('')
    })

    it('matches different column when focused cell has different column', () => {
      const focusedCell = { rowIndex: 0, columnId: 'col-2' }
      const classes = getCellFocusClasses(0, 'col-1', focusedCell)

      expect(classes).toBe('')
    })

    it('matches different row when focused cell has different row', () => {
      const focusedCell = { rowIndex: 1, columnId: 'col-1' }
      const classes = getCellFocusClasses(0, 'col-1', focusedCell)

      expect(classes).toBe('')
    })
  })

  describe('getCellAriaAttributes', () => {
    it('generates correct ARIA attributes for a cell', () => {
      const attrs = getCellAriaAttributes(0, 'Pool Name', 'CAM Pool', 10)

      expect(attrs.role).toBe('gridcell')
      expect(attrs['aria-rowindex']).toBe(2) // Row 0 + header + 1-based
      expect(attrs['aria-colindex']).toBe(1) // First column
      expect(attrs['aria-label']).toContain('Row 1 of 10')
      expect(attrs['aria-label']).toContain('Column Pool Name')
      expect(attrs['aria-label']).toContain('CAM Pool')
      expect(attrs.tabIndex).toBe(-1)
    })

    it('handles undefined cell value', () => {
      const attrs = getCellAriaAttributes(1, 'Total Expenses', undefined, 10)

      expect(attrs['aria-label']).toContain('empty')
    })

    it('handles numeric cell value', () => {
      const attrs = getCellAriaAttributes(0, 'Total Expenses', 15000.5, 10)

      expect(attrs['aria-label']).toContain('15000.5')
    })

    it('sets correct row index for different rows', () => {
      const attrs = getCellAriaAttributes(5, 'Pool Name', 'Test', 10)

      expect(attrs['aria-rowindex']).toBe(7) // Row 5 + header + 1-based
    })
  })

  describe('isCellFocusable', () => {
    it('returns true for editable cells', () => {
      expect(isCellFocusable(true)).toBe(true)
    })

    it('returns false for non-editable cells', () => {
      expect(isCellFocusable(false)).toBe(false)
    })
  })

  describe('FOCUS_INDICATOR_CLASSES', () => {
    it('is defined as a constant string', () => {
      expect(typeof FOCUS_INDICATOR_CLASSES).toBe('string')
      expect(FOCUS_INDICATOR_CLASSES).toContain('ring-2')
      expect(FOCUS_INDICATOR_CLASSES).toContain('ring-primary')
    })
  })
})
