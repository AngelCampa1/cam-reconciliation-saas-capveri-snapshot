/**
 * Group expansion state hook with localStorage persistence.
 *
 * Manages collapsed/expanded state for expense pool groups in the reconciliation grid.
 */

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'reconciliation-group-expansion'

export type ExpansionState = Record<string, boolean>

/**
 * Hook for managing group expansion state with persistence.
 *
 * Features:
 * - Groups expanded by default
 * - Toggle individual groups
 * - Expand all / collapse all
 * - localStorage persistence
 *
 * State structure:
 * - Expanded groups have no entry or value = true
 * - Collapsed groups have value = false
 */
export function useGroupExpansion() {
  const [expandedGroups, setExpandedGroups] = useState<ExpansionState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return {}
      }
    }
    return {}
  })

  /**
   * Persist state to localStorage whenever it changes.
   */
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expandedGroups))
  }, [expandedGroups])

  /**
   * Check if a group is expanded.
   * Groups are expanded by default (true if not in state or explicitly true).
   */
  const isGroupExpanded = useCallback(
    (groupId: string): boolean => {
      return expandedGroups[groupId] !== false
    },
    [expandedGroups]
  )

  /**
   * Toggle expansion state of a single group.
   */
  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const currentState = prev[groupId] !== false // Default to expanded
      return {
        ...prev,
        [groupId]: !currentState,
      }
    })
  }, [])

  /**
   * Set specific expansion state for a group.
   */
  const setGroupExpanded = useCallback((groupId: string, expanded: boolean) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: expanded,
    }))
  }, [])

  /**
   * Expand all groups (reset to default state).
   */
  const expandAll = useCallback(() => {
    setExpandedGroups({})
  }, [])

  /**
   * Collapse all groups.
   */
  const collapseAll = useCallback((groupIds: string[]) => {
    const collapsed = groupIds.reduce((acc, id) => {
      acc[id] = false
      return acc
    }, {} as ExpansionState)
    setExpandedGroups(collapsed)
  }, [])

  return {
    expandedGroups,
    isGroupExpanded,
    toggleGroup,
    setGroupExpanded,
    expandAll,
    collapseAll,
  }
}
