/**
 * Tests for Year Selection Helper Functions
 *
 * Validates year toggle logic for multi-year selection.
 */
import { describe, it, expect } from 'vitest'
import { handleYearToggle } from './yearSelection'

describe('handleYearToggle', () => {
  it('adds year when checked and under limit', () => {
    const currentYears = [2022, 2023]
    const result = handleYearToggle(currentYears, 2024, true)

    expect(result).toEqual([2022, 2023, 2024])
    expect(result.length).toBe(3)
  })

  it('sorts years after adding', () => {
    const currentYears = [2023, 2022]
    const result = handleYearToggle(currentYears, 2021, true)

    expect(result).toEqual([2021, 2022, 2023])
  })

  it('removes year when unchecked', () => {
    const currentYears = [2022, 2023, 2024]
    const result = handleYearToggle(currentYears, 2023, false)

    expect(result).toEqual([2022, 2024])
    expect(result.length).toBe(2)
  })

  it('does not add year when at max limit', () => {
    const currentYears = [2021, 2022, 2023, 2024]
    const result = handleYearToggle(currentYears, 2025, true)

    // Should return unchanged array (already at max of 4)
    expect(result).toEqual([2021, 2022, 2023, 2024])
    expect(result.length).toBe(4)
  })

  it('returns new array (immutability)', () => {
    const currentYears = [2022, 2023]
    const result = handleYearToggle(currentYears, 2024, true)

    // Should be a new array, not mutating original
    expect(result).not.toBe(currentYears)
    expect(currentYears).toEqual([2022, 2023]) // Original unchanged
    expect(result).toEqual([2022, 2023, 2024])
  })
})
