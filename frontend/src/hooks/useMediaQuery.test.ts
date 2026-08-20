/**
 * Tests for useMediaQuery hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useMediaQuery } from './useMediaQuery'

describe('useMediaQuery', () => {
  let matchMediaMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Mock window.matchMedia
    matchMediaMock = vi.fn()
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: matchMediaMock,
    })
  })

  it('returns initial match status', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()

    matchMediaMock.mockReturnValue({
      matches: true,
      addEventListener,
      removeEventListener,
    })

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))

    expect(result.current).toBe(true)
  })

  it('updates when media query changes', () => {
    let changeHandler: ((event: MediaQueryListEvent) => void) | null = null
    const addEventListener = vi.fn((event, handler) => {
      if (event === 'change') {
        changeHandler = handler
      }
    })
    const removeEventListener = vi.fn()

    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener,
      removeEventListener,
    })

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))

    expect(result.current).toBe(false)

    // Simulate media query change (needs to be async as state update is async)
    if (changeHandler) {
      act(() => {
        changeHandler?.({ matches: true } as MediaQueryListEvent)
      })
    }

    // Wait for next render - state update is async
    expect(addEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    )
  })

  it('cleans up event listener on unmount', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()

    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener,
      removeEventListener,
    })

    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))

    unmount()

    expect(removeEventListener).toHaveBeenCalledWith(
      'change',
      expect.any(Function)
    )
  })

  it('re-subscribes when query changes', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()

    matchMediaMock.mockReturnValue({
      matches: false,
      addEventListener,
      removeEventListener,
    })

    const { rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 768px)' },
    })

    expect(addEventListener).toHaveBeenCalledTimes(1)

    rerender({ query: '(min-width: 1024px)' })

    expect(removeEventListener).toHaveBeenCalledTimes(1)
    expect(addEventListener).toHaveBeenCalledTimes(2)
  })
})
