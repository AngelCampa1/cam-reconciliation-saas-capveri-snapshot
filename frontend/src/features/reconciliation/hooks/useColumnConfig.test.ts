/**
 * Tests for useColumnConfig hook.
 *
 * Validates column visibility persistence, reordering, and reset functionality.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useColumnConfig } from './useColumnConfig'

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

describe('useColumnConfig', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('initializes with default column visibility', () => {
    const { result } = renderHook(() => useColumnConfig())

    expect(result.current.columnVisibility).toEqual({})
  })

  it('loads saved column visibility from localStorage', () => {
    const savedState = { pool_name: false, variance: false }
    const config = { visibility: savedState }
    localStorage.setItem('reconciliation-grid-columns', JSON.stringify(config))

    const { result } = renderHook(() => useColumnConfig())

    expect(result.current.columnVisibility).toEqual(savedState)
  })

  it('saves column visibility to localStorage when changed', () => {
    const { result } = renderHook(() => useColumnConfig())

    act(() => {
      result.current.setColumnVisibility({ pool_name: false })
    })

    const saved = localStorage.getItem('reconciliation-grid-columns')
    const parsed = JSON.parse(saved!)
    expect(parsed.visibility).toEqual({ pool_name: false })
  })

  it('toggles column visibility', () => {
    const { result } = renderHook(() => useColumnConfig())

    act(() => {
      result.current.toggleColumn('pool_name')
    })

    expect(result.current.columnVisibility.pool_name).toBe(false)

    act(() => {
      result.current.toggleColumn('pool_name')
    })

    expect(result.current.columnVisibility.pool_name).toBe(true)
  })

  it('resets to default configuration', () => {
    const { result } = renderHook(() => useColumnConfig())

    // Set some custom visibility
    act(() => {
      result.current.setColumnVisibility({
        pool_name: false,
        variance: false,
      })
    })

    expect(result.current.columnVisibility).toEqual({
      pool_name: false,
      variance: false,
    })

    // Reset to defaults
    act(() => {
      result.current.resetToDefaults()
    })

    expect(result.current.columnVisibility).toEqual({})
  })

  it('counts visible columns correctly', () => {
    const { result } = renderHook(() => useColumnConfig())

    const allColumns = [
      'pool_name',
      'total_expenses',
      'recoverable_amount',
      'variance',
    ]

    // All visible by default
    expect(result.current.getVisibleColumnCount(allColumns)).toBe(4)

    // Hide one column
    act(() => {
      result.current.setColumnVisibility({ pool_name: false })
    })

    expect(result.current.getVisibleColumnCount(allColumns)).toBe(3)

    // Hide another
    act(() => {
      result.current.setColumnVisibility({ pool_name: false, variance: false })
    })

    expect(result.current.getVisibleColumnCount(allColumns)).toBe(2)
  })

  it('prevents hiding columns below minimum threshold', () => {
    const { result } = renderHook(() => useColumnConfig())

    const allColumns = [
      'pool_name',
      'total_expenses',
      'recoverable_amount',
      'variance',
    ]

    // With 4 columns visible and minimum 3, can hide one
    const canHide = result.current.canHideColumn('pool_name', allColumns, 3)

    expect(canHide).toBe(true) // 4 visible, can hide to get to 3

    // Hide one column
    act(() => {
      result.current.setColumnVisibility({ pool_name: false })
    })

    // Now 3 are visible (minimum), can't hide more
    const canHideMore = result.current.canHideColumn(
      'total_expenses',
      allColumns,
      3
    )

    expect(canHideMore).toBe(false)
  })

  it('handles column order persistence', () => {
    const { result } = renderHook(() => useColumnConfig())

    const newOrder = ['variance', 'pool_name', 'total_expenses']

    act(() => {
      result.current.setColumnOrder(newOrder)
    })

    expect(result.current.columnOrder).toEqual(newOrder)

    // Should persist to localStorage
    const saved = localStorage.getItem('reconciliation-grid-columns')
    const parsed = JSON.parse(saved!)
    expect(parsed.order).toEqual(newOrder)
  })

  it('loads column order from localStorage', () => {
    const savedState = {
      order: ['variance', 'pool_name', 'total_expenses'],
    }
    localStorage.setItem(
      'reconciliation-grid-columns',
      JSON.stringify(savedState)
    )

    const { result } = renderHook(() => useColumnConfig())

    expect(result.current.columnOrder).toEqual(savedState.order)
  })

  it('resets column order to default', () => {
    const { result } = renderHook(() => useColumnConfig())

    act(() => {
      result.current.setColumnOrder(['variance', 'pool_name'])
    })

    expect(result.current.columnOrder).toEqual(['variance', 'pool_name'])

    act(() => {
      result.current.resetToDefaults()
    })

    expect(result.current.columnOrder).toEqual([])
  })
})
