/**
 * Tests for useGroupExpansion hook.
 *
 * Validates group expansion state management with localStorage persistence.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGroupExpansion } from './useGroupExpansion'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true,
})

describe('useGroupExpansion', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('initializes with all groups expanded by default', () => {
    const { result } = renderHook(() => useGroupExpansion())

    expect(result.current.expandedGroups).toEqual({})
    expect(result.current.isGroupExpanded('pool-1')).toBe(true)
  })

  it('loads saved expansion state from localStorage', () => {
    const savedState = { 'pool-1': false, 'pool-2': false }
    localStorage.setItem(
      'reconciliation-group-expansion',
      JSON.stringify(savedState)
    )

    const { result } = renderHook(() => useGroupExpansion())

    expect(result.current.expandedGroups).toEqual(savedState)
    expect(result.current.isGroupExpanded('pool-1')).toBe(false)
    expect(result.current.isGroupExpanded('pool-2')).toBe(false)
  })

  it('saves expansion state to localStorage when changed', () => {
    const { result } = renderHook(() => useGroupExpansion())

    act(() => {
      result.current.toggleGroup('pool-1')
    })

    const saved = localStorage.getItem('reconciliation-group-expansion')
    const parsed = JSON.parse(saved!)
    expect(parsed).toEqual({ 'pool-1': false })
  })

  it('toggles group expansion state', () => {
    const { result } = renderHook(() => useGroupExpansion())

    // Initially expanded
    expect(result.current.isGroupExpanded('pool-1')).toBe(true)

    // Toggle to collapsed
    act(() => {
      result.current.toggleGroup('pool-1')
    })

    expect(result.current.isGroupExpanded('pool-1')).toBe(false)

    // Toggle back to expanded
    act(() => {
      result.current.toggleGroup('pool-1')
    })

    expect(result.current.isGroupExpanded('pool-1')).toBe(true)
  })

  it('expands all groups', () => {
    const { result } = renderHook(() => useGroupExpansion())

    // Collapse some groups
    act(() => {
      result.current.toggleGroup('pool-1')
      result.current.toggleGroup('pool-2')
    })

    expect(result.current.isGroupExpanded('pool-1')).toBe(false)
    expect(result.current.isGroupExpanded('pool-2')).toBe(false)

    // Expand all
    act(() => {
      result.current.expandAll()
    })

    expect(result.current.isGroupExpanded('pool-1')).toBe(true)
    expect(result.current.isGroupExpanded('pool-2')).toBe(true)
    expect(result.current.expandedGroups).toEqual({})
  })

  it('collapses all groups', () => {
    const { result } = renderHook(() => useGroupExpansion())
    const groupIds = ['pool-1', 'pool-2', 'pool-3']

    // Collapse all
    act(() => {
      result.current.collapseAll(groupIds)
    })

    expect(result.current.isGroupExpanded('pool-1')).toBe(false)
    expect(result.current.isGroupExpanded('pool-2')).toBe(false)
    expect(result.current.isGroupExpanded('pool-3')).toBe(false)
    expect(result.current.expandedGroups).toEqual({
      'pool-1': false,
      'pool-2': false,
      'pool-3': false,
    })
  })

  it('sets specific expansion state for a group', () => {
    const { result } = renderHook(() => useGroupExpansion())

    act(() => {
      result.current.setGroupExpanded('pool-1', false)
    })

    expect(result.current.isGroupExpanded('pool-1')).toBe(false)

    act(() => {
      result.current.setGroupExpanded('pool-1', true)
    })

    expect(result.current.isGroupExpanded('pool-1')).toBe(true)
  })

  it('handles invalid localStorage data gracefully', () => {
    localStorage.setItem('reconciliation-group-expansion', 'invalid json')

    const { result } = renderHook(() => useGroupExpansion())

    expect(result.current.expandedGroups).toEqual({})
  })

  it('persists state across hook re-renders', () => {
    const { result, rerender } = renderHook(() => useGroupExpansion())

    act(() => {
      result.current.toggleGroup('pool-1')
    })

    expect(result.current.isGroupExpanded('pool-1')).toBe(false)

    rerender()

    expect(result.current.isGroupExpanded('pool-1')).toBe(false)
  })
})
