/**
 * Tests for useViewport hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useViewport, BREAKPOINTS } from './useViewport'

describe('useViewport', () => {
  beforeEach(() => {
    // Mock window.matchMedia for different viewports
    const matchMediaMock = vi.fn((query: string) => {
      let matches = false

      // Parse the query to determine if it matches
      if (query.includes('max-width: 767px')) {
        matches = window.innerWidth < BREAKPOINTS.md
      } else if (
        query.includes('min-width: 768px') &&
        query.includes('max-width: 1023px')
      ) {
        matches =
          window.innerWidth >= BREAKPOINTS.md &&
          window.innerWidth < BREAKPOINTS.lg
      } else if (
        query.includes('min-width: 1024px') &&
        query.includes('max-width: 1279px')
      ) {
        matches =
          window.innerWidth >= BREAKPOINTS.lg &&
          window.innerWidth < BREAKPOINTS.xl
      } else if (query.includes('min-width: 1280px')) {
        matches = window.innerWidth >= BREAKPOINTS.xl
      }

      const listeners: Array<(event: MediaQueryListEvent) => void> = []

      return {
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn(
          (event: string, handler: (event: MediaQueryListEvent) => void) => {
            if (event === 'change') {
              listeners.push(handler)
            }
          }
        ),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }
    })

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: matchMediaMock,
    })
  })

  it('returns mobile viewport info for small screens', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    })
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 667,
    })

    const { result } = renderHook(() => useViewport())

    expect(result.current.isMobile).toBe(true)
    expect(result.current.isTablet).toBe(false)
    expect(result.current.isLaptop).toBe(false)
    expect(result.current.isDesktop).toBe(false)
    expect(result.current.size).toBe('mobile')
    expect(result.current.width).toBe(375)
    expect(result.current.height).toBe(667)
  })

  it('returns tablet viewport info for medium screens', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768,
    })
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 1024,
    })

    const { result } = renderHook(() => useViewport())

    expect(result.current.isMobile).toBe(false)
    expect(result.current.isTablet).toBe(true)
    expect(result.current.isLaptop).toBe(false)
    expect(result.current.isDesktop).toBe(false)
    expect(result.current.size).toBe('tablet')
    expect(result.current.width).toBe(768)
    expect(result.current.height).toBe(1024)
  })

  it('returns laptop viewport info for large screens', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    })
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 768,
    })

    const { result } = renderHook(() => useViewport())

    expect(result.current.isMobile).toBe(false)
    expect(result.current.isTablet).toBe(false)
    expect(result.current.isLaptop).toBe(true)
    expect(result.current.isDesktop).toBe(false)
    expect(result.current.size).toBe('laptop')
    expect(result.current.width).toBe(1024)
    expect(result.current.height).toBe(768)
  })

  it('returns desktop viewport info for extra large screens', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    })
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 1080,
    })

    const { result } = renderHook(() => useViewport())

    expect(result.current.isMobile).toBe(false)
    expect(result.current.isTablet).toBe(false)
    expect(result.current.isLaptop).toBe(false)
    expect(result.current.isDesktop).toBe(true)
    expect(result.current.size).toBe('desktop')
    expect(result.current.width).toBe(1920)
    expect(result.current.height).toBe(1080)
  })

  it('detects touch support', () => {
    Object.defineProperty(window, 'ontouchstart', {
      writable: true,
      configurable: true,
      value: {},
    })

    const { result } = renderHook(() => useViewport())

    expect(result.current.isTouch).toBe(true)
  })

  it('updates dimensions on window resize', () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375,
    })
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 667,
    })

    const { result } = renderHook(() => useViewport())

    expect(result.current.width).toBe(375)
    expect(result.current.height).toBe(667)

    // Simulate window resize
    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 768,
      })
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 1024,
      })
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current.width).toBe(768)
    expect(result.current.height).toBe(1024)
  })
})
