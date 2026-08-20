import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ThemeProvider, useTheme } from './useTheme'

describe('useTheme', () => {
  let matchMediaMock: {
    matches: boolean
    media: string
    addEventListener: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear()

    // Mock matchMedia
    matchMediaMock = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }

    window.matchMedia = vi.fn().mockReturnValue(matchMediaMock)

    // Clear document classes
    document.documentElement.className = ''
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('defaults to system preference when no stored theme', async () => {
    matchMediaMock.matches = true // System prefers dark

    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    })

    await waitFor(() => {
      expect(result.current.theme).toBe('system')
      expect(result.current.resolvedTheme).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  it('uses light theme when system preference is light', async () => {
    matchMediaMock.matches = false // System prefers light

    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    })

    await waitFor(() => {
      expect(result.current.theme).toBe('system')
      expect(result.current.resolvedTheme).toBe('light')
      expect(document.documentElement.classList.contains('light')).toBe(true)
    })
  })

  it('persists theme selection to localStorage', async () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    })

    act(() => {
      result.current.setTheme('light')
    })

    await waitFor(() => {
      expect(localStorage.getItem('theme')).toBe('light')
      expect(result.current.theme).toBe('light')
      expect(result.current.resolvedTheme).toBe('light')
    })
  })

  it('reads stored theme from localStorage on mount', async () => {
    localStorage.setItem('theme', 'light')

    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    })

    await waitFor(() => {
      expect(result.current.theme).toBe('light')
      expect(result.current.resolvedTheme).toBe('light')
    })
  })

  it('applies dark class to document root when dark theme is active', async () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    })

    act(() => {
      result.current.setTheme('dark')
    })

    await waitFor(() => {
      expect(document.documentElement.classList.contains('dark')).toBe(true)
      expect(document.documentElement.classList.contains('light')).toBe(false)
    })
  })

  it('applies light class to document root when light theme is active', async () => {
    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    })

    act(() => {
      result.current.setTheme('light')
    })

    await waitFor(() => {
      expect(document.documentElement.classList.contains('light')).toBe(true)
      expect(document.documentElement.classList.contains('dark')).toBe(false)
    })
  })

  it('listens for system preference changes when theme is system', async () => {
    matchMediaMock.matches = false // Initially light

    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    })

    // Verify initial state
    await waitFor(() => {
      expect(result.current.resolvedTheme).toBe('light')
    })

    // Simulate system preference change to dark
    act(() => {
      matchMediaMock.matches = true
      const changeHandler = matchMediaMock.addEventListener.mock.calls.find(
        (call) => call[0] === 'change'
      )?.[1]
      if (changeHandler) {
        changeHandler()
      }
    })

    await waitFor(() => {
      expect(result.current.resolvedTheme).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })
  })

  it('manual theme setting overrides system preference', async () => {
    // Start with system preferring light
    matchMediaMock.matches = false

    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    })

    // Initially should be light (system preference)
    await waitFor(() => {
      expect(result.current.resolvedTheme).toBe('light')
    })

    // Manually set to dark (override system)
    act(() => {
      result.current.setTheme('dark')
    })

    // Should now be dark, regardless of system preference
    await waitFor(() => {
      expect(result.current.theme).toBe('dark')
      expect(result.current.resolvedTheme).toBe('dark')
      expect(document.documentElement.classList.contains('dark')).toBe(true)
    })

    // Verify it stays dark (doesn't follow system preference)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(result.current.resolvedTheme).toBe('dark')
    expect(result.current.theme).toBe('dark')
  })

  it('throws error when useTheme is used outside ThemeProvider', () => {
    // Suppress console.error for this test
    const originalError = console.error
    console.error = vi.fn()

    expect(() => {
      renderHook(() => useTheme())
    }).toThrow('useTheme must be used within ThemeProvider')

    console.error = originalError
  })

  it('switches between light, dark, and system themes', async () => {
    matchMediaMock.matches = true // System prefers dark

    const { result } = renderHook(() => useTheme(), {
      wrapper: ThemeProvider,
    })

    // Start with system (dark)
    await waitFor(() => {
      expect(result.current.theme).toBe('system')
      expect(result.current.resolvedTheme).toBe('dark')
    })

    // Switch to light
    act(() => {
      result.current.setTheme('light')
    })

    await waitFor(() => {
      expect(result.current.theme).toBe('light')
      expect(result.current.resolvedTheme).toBe('light')
      expect(localStorage.getItem('theme')).toBe('light')
    })

    // Switch to dark
    act(() => {
      result.current.setTheme('dark')
    })

    await waitFor(() => {
      expect(result.current.theme).toBe('dark')
      expect(result.current.resolvedTheme).toBe('dark')
      expect(localStorage.getItem('theme')).toBe('dark')
    })

    // Switch back to system
    act(() => {
      result.current.setTheme('system')
    })

    await waitFor(() => {
      expect(result.current.theme).toBe('system')
      expect(result.current.resolvedTheme).toBe('dark') // System still prefers dark
      expect(localStorage.getItem('theme')).toBe('system')
    })
  })
})
