/**
 * Column configuration hook with localStorage persistence.
 *
 * Manages column visibility, ordering, and user preferences.
 */

import { useState, useEffect, useCallback } from 'react'
import type { VisibilityState } from '@tanstack/react-table'

const STORAGE_KEY = 'reconciliation-grid-columns'

interface ColumnConfig {
  visibility?: VisibilityState | undefined
  order?: string[] | undefined
}

/**
 * Hook for managing column configuration with persistence.
 *
 * Features:
 * - Column visibility toggle
 * - Column reordering
 * - localStorage persistence
 * - Reset to defaults
 * - Minimum visible columns enforcement
 */
export function useColumnConfig() {
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    () => {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const config: ColumnConfig = JSON.parse(saved)
          return config.visibility || {}
        } catch {
          return {}
        }
      }
      return {}
    }
  )

  const [columnOrder, setColumnOrder] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const config: ColumnConfig = JSON.parse(saved)
        return config.order || []
      } catch {
        return []
      }
    }
    return []
  })

  /**
   * Persist configuration to localStorage whenever it changes.
   */
  useEffect(() => {
    const config: ColumnConfig = {
      visibility: columnVisibility,
      order: columnOrder.length > 0 ? columnOrder : undefined,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  }, [columnVisibility, columnOrder])

  /**
   * Toggle visibility of a single column.
   */
  const toggleColumn = useCallback((columnId: string) => {
    setColumnVisibility((prev) => {
      const currentValue = prev[columnId]
      // If undefined or true, set to false; if false, set to true
      const newValue = currentValue === false ? true : false
      return {
        ...prev,
        [columnId]: newValue,
      }
    })
  }, [])

  /**
   * Reset to default column configuration.
   */
  const resetToDefaults = useCallback(() => {
    setColumnVisibility({})
    setColumnOrder([])
  }, [])

  /**
   * Get count of currently visible columns.
   */
  const getVisibleColumnCount = useCallback(
    (allColumns: string[]) => {
      return allColumns.filter((colId) => columnVisibility[colId] !== false)
        .length
    },
    [columnVisibility]
  )

  /**
   * Check if a column can be hidden based on minimum threshold.
   */
  const canHideColumn = useCallback(
    (columnId: string, allColumns: string[], minVisibleColumns: number = 3) => {
      const visibleCount = getVisibleColumnCount(allColumns)
      const isVisible = columnVisibility[columnId] !== false

      if (!isVisible) {
        // Already hidden, can't hide again
        return false
      }

      // Check if hiding this column would drop below minimum
      return visibleCount > minVisibleColumns
    },
    [columnVisibility, getVisibleColumnCount]
  )

  return {
    columnVisibility,
    setColumnVisibility,
    columnOrder,
    setColumnOrder,
    toggleColumn,
    resetToDefaults,
    getVisibleColumnCount,
    canHideColumn,
  }
}
