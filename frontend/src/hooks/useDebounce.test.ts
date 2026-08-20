/**
 * useDebounce Hook Tests
 *
 * Tests the debouncing functionality for high-frequency value updates.
 */
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from './useDebounce'

describe('useDebounce', () => {
  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 50))
    expect(result.current).toBe('initial')
  })

  it('debounces value changes', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 50),
      { initialProps: { value: 'first' } }
    )

    // Initial value
    expect(result.current).toBe('first')

    // Update value
    act(() => {
      rerender({ value: 'second' })
    })

    // Value should not update immediately
    expect(result.current).toBe('first')

    // Wait for debounce delay
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
    })

    // Value should update after delay
    expect(result.current).toBe('second')
  })

  it('cancels pending updates when value changes before delay', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 100),
      { initialProps: { value: 'first' } }
    )

    // Update value multiple times quickly
    act(() => {
      rerender({ value: 'second' })
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })

    act(() => {
      rerender({ value: 'third' })
    })

    // Wait for full debounce delay
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 110))
    })

    // Only the last value should be applied
    expect(result.current).toBe('third')
  })

  it('works with different data types', async () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 50),
      { initialProps: { value: 42 } }
    )

    expect(result.current).toBe(42)

    act(() => {
      rerender({ value: 100 })
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60))
    })

    expect(result.current).toBe(100)
  })
})
