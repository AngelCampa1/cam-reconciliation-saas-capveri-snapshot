/**
 * Keyboard navigation hook for the reconciliation grid.
 *
 * Provides full keyboard navigation including arrow keys, tab, enter, home/end,
 * and page up/down for power users.
 */

import { useState, useCallback, useEffect } from 'react'
import type { Table } from '@tanstack/react-table'
import type { ReconciliationRow } from '../types/reconciliation-row'

export interface FocusedCell {
  rowIndex: number
  columnId: string
}

export interface UseGridKeyboardOptions {
  onEnterEdit?: (cell: FocusedCell) => void
  onPageUp?: () => void
  onPageDown?: () => void
}

/**
 * Hook for managing keyboard navigation in the reconciliation grid.
 *
 * Features:
 * - Arrow keys for cell-by-cell navigation
 * - Tab/Shift+Tab for moving between editable cells
 * - Enter to activate edit mode
 * - Home/End for row navigation
 * - Ctrl+Home/End for first/last row
 * - Page Up/Down for scrolling
 */
export function useGridKeyboard(
  table: Table<ReconciliationRow>,
  options: UseGridKeyboardOptions = {}
) {
  const { onEnterEdit, onPageUp, onPageDown } = options
  const [focusedCell, setFocusedCell] = useState<FocusedCell | null>(null)

  /**
   * Check if a column is editable based on its meta property.
   */
  const isColumnEditable = useCallback(
    (columnId: string): boolean => {
      const column = table.getAllColumns().find((col) => col.id === columnId)
      return (
        (column?.columnDef.meta as { editable?: boolean } | undefined)
          ?.editable === true
      )
    },
    [table]
  )

  /**
   * Get the next editable column in the specified direction.
   */
  const getNextEditableColumn = useCallback(
    (
      currentColumnId: string,
      direction: 'forward' | 'backward'
    ): string | null => {
      const columns = table.getAllColumns()
      const currentIndex = columns.findIndex(
        (col) => col.id === currentColumnId
      )

      if (currentIndex === -1) return null

      const step = direction === 'forward' ? 1 : -1
      let index = currentIndex + step

      while (index >= 0 && index < columns.length) {
        const column = columns[index]
        if (column && isColumnEditable(column.id)) {
          return column.id
        }
        index += step
      }

      return null
    },
    [table, isColumnEditable]
  )

  /**
   * Handle keyboard events for grid navigation.
   */
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!focusedCell) return

      const rows = table.getRowModel().rows
      const columns = table.getAllColumns()
      const { rowIndex, columnId } = focusedCell

      // Get current column index
      const columnIndex = columns.findIndex((col) => col.id === columnId)
      if (columnIndex === -1) return

      switch (e.key) {
        case 'ArrowUp':
          if (rowIndex > 0) {
            setFocusedCell({ rowIndex: rowIndex - 1, columnId })
          }
          break

        case 'ArrowDown':
          if (rowIndex < rows.length - 1) {
            setFocusedCell({ rowIndex: rowIndex + 1, columnId })
          }
          break

        case 'ArrowLeft': {
          const prevColumn = columns[columnIndex - 1]
          if (columnIndex > 0 && prevColumn) {
            setFocusedCell({ rowIndex, columnId: prevColumn.id })
          }
          break
        }

        case 'ArrowRight': {
          const nextColumn = columns[columnIndex + 1]
          if (columnIndex < columns.length - 1 && nextColumn) {
            setFocusedCell({ rowIndex, columnId: nextColumn.id })
          }
          break
        }

        case 'Tab': {
          e.preventDefault()
          if (e.shiftKey) {
            // Move to previous editable cell
            const prevColumn = getNextEditableColumn(columnId, 'backward')
            if (prevColumn) {
              setFocusedCell({ rowIndex, columnId: prevColumn })
            } else if (rowIndex > 0) {
              // Wrap to last editable column of previous row
              const lastEditableCol = [...columns]
                .reverse()
                .find((col) => isColumnEditable(col.id))
              if (lastEditableCol) {
                setFocusedCell({
                  rowIndex: rowIndex - 1,
                  columnId: lastEditableCol.id,
                })
              }
            }
          } else {
            // Move to next editable cell
            const nextColumn = getNextEditableColumn(columnId, 'forward')
            if (nextColumn) {
              setFocusedCell({ rowIndex, columnId: nextColumn })
            } else if (rowIndex < rows.length - 1) {
              // Wrap to first editable column of next row
              const firstEditableCol = columns.find((col) =>
                isColumnEditable(col.id)
              )
              if (firstEditableCol) {
                setFocusedCell({
                  rowIndex: rowIndex + 1,
                  columnId: firstEditableCol.id,
                })
              }
            }
          }
          break
        }

        case 'Enter':
          if (onEnterEdit) {
            onEnterEdit(focusedCell)
          }
          break

        case 'Home':
          if (e.ctrlKey) {
            // Ctrl+Home: Jump to first row
            setFocusedCell({ rowIndex: 0, columnId })
          } else if (columns[0]) {
            // Home: Jump to first column
            setFocusedCell({ rowIndex, columnId: columns[0].id })
          }
          break

        case 'End': {
          if (e.ctrlKey) {
            // Ctrl+End: Jump to last row
            setFocusedCell({ rowIndex: rows.length - 1, columnId })
          } else {
            // End: Jump to last column
            const lastColumn = columns[columns.length - 1]
            if (lastColumn) {
              setFocusedCell({
                rowIndex,
                columnId: lastColumn.id,
              })
            }
          }
          break
        }

        case 'PageUp':
          if (onPageUp) {
            onPageUp()
          }
          break

        case 'PageDown':
          if (onPageDown) {
            onPageDown()
          }
          break
      }
    },
    [
      focusedCell,
      table,
      onEnterEdit,
      onPageUp,
      onPageDown,
      getNextEditableColumn,
      isColumnEditable,
    ]
  )

  /**
   * Attach keyboard event listener on mount.
   */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => handleKeyDown(e)
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleKeyDown])

  return {
    focusedCell,
    setFocusedCell,
    handleKeyDown,
    isColumnEditable,
  }
}
