/**
 * useExitIntent Hook Tests (TDD — written before implementation)
 *
 * Validates exit-intent detection for signup abandonment capture.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExitIntent } from './useExitIntent'

// Helper to fire native DOM events
function fireMouseLeave(clientY: number) {
  const event = new MouseEvent('mouseleave', {
    bubbles: true,
    clientY,
  })
  document.documentElement.dispatchEvent(event)
}

function fireVisibilityChange(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => hidden,
  })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useExitIntent', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    // Reset document.hidden
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    })
  })

  it('returns triggered: false initially', () => {
    const { result } = renderHook(() => useExitIntent())
    expect(result.current.triggered).toBe(false)
  })

  it('triggers on mouseleave with clientY <= 0', () => {
    const { result } = renderHook(() => useExitIntent())

    act(() => {
      fireMouseLeave(-5)
    })

    expect(result.current.triggered).toBe(true)
  })

  it('does NOT trigger on mouseleave with clientY > 0', () => {
    const { result } = renderHook(() => useExitIntent())

    act(() => {
      fireMouseLeave(100)
    })

    expect(result.current.triggered).toBe(false)
  })

  it('triggers on visibilitychange when document.hidden is true', () => {
    const { result } = renderHook(() => useExitIntent())

    act(() => {
      fireVisibilityChange(true)
    })

    expect(result.current.triggered).toBe(true)
  })

  it('does NOT trigger on visibilitychange when document.hidden is false', () => {
    const { result } = renderHook(() => useExitIntent())

    act(() => {
      fireVisibilityChange(false)
    })

    expect(result.current.triggered).toBe(false)
  })

  it('triggers after idle timeout with no interaction', () => {
    const { result } = renderHook(() => useExitIntent({ idleTimeout: 5000 }))

    act(() => {
      vi.advanceTimersByTime(5000)
    })

    expect(result.current.triggered).toBe(true)
  })

  it('resets idle timer on mousemove / keydown / scroll', () => {
    const { result } = renderHook(() => useExitIntent({ idleTimeout: 5000 }))

    // Advance partway
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current.triggered).toBe(false)

    // Reset via mousemove
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove'))
    })

    // Advance another 3s (total 6s from start, but only 3s from reset)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current.triggered).toBe(false)

    // Now advance full timeout from last reset
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.triggered).toBe(true)
  })

  it('does NOT trigger when form element has focus (suppression)', () => {
    const formEl = document.createElement('form')
    const inputEl = document.createElement('input')
    formEl.appendChild(inputEl)
    document.body.appendChild(formEl)

    const formRef = { current: formEl }
    const { result } = renderHook(() => useExitIntent({ formRef }))

    // Focus input inside form
    inputEl.focus()

    act(() => {
      fireMouseLeave(-5)
    })

    expect(result.current.triggered).toBe(false)

    document.body.removeChild(formEl)
  })

  it('does NOT trigger twice (sessionStorage one-shot)', () => {
    const { result, rerender } = renderHook(() => useExitIntent())

    // First trigger
    act(() => {
      fireMouseLeave(-5)
    })
    expect(result.current.triggered).toBe(true)
    expect(sessionStorage.getItem('exit-intent-shown')).toBe('1')

    // Dismiss
    act(() => {
      result.current.dismiss()
    })
    expect(result.current.triggered).toBe(false)

    // Re-render (simulates component re-mount)
    rerender()

    // Try to trigger again — should not work because sessionStorage is set
    act(() => {
      fireMouseLeave(-5)
    })
    expect(result.current.triggered).toBe(false)
  })

  it('dismiss() sets triggered back to false', () => {
    const { result } = renderHook(() => useExitIntent())

    act(() => {
      fireMouseLeave(-5)
    })
    expect(result.current.triggered).toBe(true)

    act(() => {
      result.current.dismiss()
    })
    expect(result.current.triggered).toBe(false)
  })

  it('cleans up event listeners on unmount', () => {
    const removeSpy = vi.spyOn(document.documentElement, 'removeEventListener')
    const docRemoveSpy = vi.spyOn(document, 'removeEventListener')

    const { unmount } = renderHook(() => useExitIntent())
    unmount()

    // Should have removed mouseleave from documentElement
    expect(removeSpy).toHaveBeenCalledWith('mouseleave', expect.any(Function))
    // Should have removed visibilitychange and interaction listeners from document
    expect(docRemoveSpy).toHaveBeenCalledWith(
      'visibilitychange',
      expect.any(Function)
    )

    removeSpy.mockRestore()
    docRemoveSpy.mockRestore()
  })

  it('skips trigger when sessionStorage key already set on mount', () => {
    sessionStorage.setItem('exit-intent-shown', '1')

    const { result } = renderHook(() => useExitIntent())

    act(() => {
      fireMouseLeave(-5)
    })

    expect(result.current.triggered).toBe(false)
  })
})
