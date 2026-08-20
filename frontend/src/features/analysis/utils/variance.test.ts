/**
 * Tests for variance calculation and formatting utilities.
 *
 * Following test minimalism: Test calculation logic and formatting edge cases.
 */
import { describe, it, expect } from 'vitest'
import {
  getVarianceLevel,
  getVarianceColor,
  getVarianceBgColor,
  formatVariancePercent,
  formatVarianceAmount,
  formatAmount,
  getVarianceLabel,
  calculateVariancePercent,
  calculateVarianceAmount,
} from './variance'

describe('variance utilities', () => {
  describe('getVarianceLevel', () => {
    it('returns "normal" for variance below 5%', () => {
      expect(getVarianceLevel(4.9)).toBe('normal')
      expect(getVarianceLevel(-4.9)).toBe('normal')
      expect(getVarianceLevel(0)).toBe('normal')
    })

    it('returns "warning" for variance between 5-15%', () => {
      expect(getVarianceLevel(5)).toBe('warning')
      expect(getVarianceLevel(10)).toBe('warning')
      expect(getVarianceLevel(14.9)).toBe('warning')
      expect(getVarianceLevel(-10)).toBe('warning')
    })

    it('returns "critical" for variance above 15%', () => {
      expect(getVarianceLevel(15)).toBe('critical')
      expect(getVarianceLevel(25)).toBe('critical')
      expect(getVarianceLevel(-20)).toBe('critical')
    })
  })

  describe('getVarianceColor', () => {
    it('returns correct Tailwind color classes', () => {
      expect(getVarianceColor('normal')).toBe('text-success-strong')
      expect(getVarianceColor('warning')).toBe('text-warning-foreground')
      expect(getVarianceColor('critical')).toBe('text-destructive-strong')
    })
  })

  describe('getVarianceBgColor', () => {
    it('returns correct Tailwind background color classes', () => {
      expect(getVarianceBgColor('normal')).toBe('bg-success/10')
      expect(getVarianceBgColor('warning')).toBe('bg-warning/10')
      expect(getVarianceBgColor('critical')).toBe('bg-destructive/10')
    })
  })

  describe('formatVariancePercent', () => {
    it('formats positive variance with plus sign', () => {
      expect(formatVariancePercent(12.5)).toBe('+12.5%')
      expect(formatVariancePercent(0.1)).toBe('+0.1%')
    })

    it('formats negative variance with minus sign', () => {
      expect(formatVariancePercent(-8.3)).toBe('-8.3%')
    })

    it('formats zero with plus sign', () => {
      expect(formatVariancePercent(0)).toBe('+0.0%')
    })

    it('handles null and undefined values', () => {
      expect(formatVariancePercent(null)).toBe('N/A')
      expect(formatVariancePercent(undefined)).toBe('N/A')
    })

    it('rounds to 1 decimal place', () => {
      expect(formatVariancePercent(12.567)).toBe('+12.6%')
      expect(formatVariancePercent(-8.344)).toBe('-8.3%')
    })

    it('coerces Decimal-string inputs identically to numbers', () => {
      expect(formatVariancePercent('12.5')).toBe(formatVariancePercent(12.5))
      expect(formatVariancePercent('-8.3')).toBe(formatVariancePercent(-8.3))
    })

    it('returns N/A for non-numeric strings', () => {
      expect(formatVariancePercent('not-a-number')).toBe('N/A')
    })
  })

  describe('formatVarianceAmount', () => {
    it('formats positive variance with plus sign and currency', () => {
      expect(formatVarianceAmount(1234.56)).toBe('+$1,234.56')
      expect(formatVarianceAmount(0.01)).toBe('+$0.01')
    })

    it('formats negative variance with minus sign and currency', () => {
      expect(formatVarianceAmount(-987.65)).toBe('-$987.65')
    })

    it('formats zero with plus sign', () => {
      expect(formatVarianceAmount(0)).toBe('+$0.00')
    })

    it('handles null and undefined values', () => {
      expect(formatVarianceAmount(null)).toBe('N/A')
      expect(formatVarianceAmount(undefined)).toBe('N/A')
    })

    it('formats large amounts with thousand separators', () => {
      expect(formatVarianceAmount(1234567.89)).toBe('+$1,234,567.89')
      expect(formatVarianceAmount(-1234567.89)).toBe('-$1,234,567.89')
    })

    it('coerces Decimal-string inputs identically to numbers', () => {
      expect(formatVarianceAmount('1234.56')).toBe(
        formatVarianceAmount(1234.56)
      )
      expect(formatVarianceAmount('-987.65')).toBe(
        formatVarianceAmount(-987.65)
      )
    })

    it('returns N/A for non-numeric strings', () => {
      expect(formatVarianceAmount('not-a-number')).toBe('N/A')
    })
  })

  describe('formatAmount', () => {
    it('formats positive amounts as currency', () => {
      expect(formatAmount(1234.56)).toBe('$1,234.56')
      expect(formatAmount(0.01)).toBe('$0.01')
    })

    it('formats negative amounts as currency', () => {
      expect(formatAmount(-987.65)).toBe('-$987.65')
    })

    it('formats zero', () => {
      expect(formatAmount(0)).toBe('$0.00')
    })

    it('handles null and undefined values', () => {
      expect(formatAmount(null)).toBe('N/A')
      expect(formatAmount(undefined)).toBe('N/A')
    })

    it('formats large amounts with thousand separators', () => {
      expect(formatAmount(1234567.89)).toBe('$1,234,567.89')
    })

    it('coerces Decimal-string inputs identically to numbers', () => {
      expect(formatAmount('1000')).toBe(formatAmount(1000))
      expect(formatAmount('-987.65')).toBe(formatAmount(-987.65))
    })

    it('returns N/A for non-numeric strings', () => {
      expect(formatAmount('not-a-number')).toBe('N/A')
    })
  })

  describe('getVarianceLabel', () => {
    it('returns human-readable labels', () => {
      expect(getVarianceLabel('normal')).toBe('Normal Variance')
      expect(getVarianceLabel('warning')).toBe('Warning')
      expect(getVarianceLabel('critical')).toBe('Critical Variance')
    })
  })

  describe('calculateVariancePercent', () => {
    it('calculates percentage increase correctly', () => {
      expect(calculateVariancePercent(150, 100)).toBe(50)
      expect(calculateVariancePercent(200, 100)).toBe(100)
    })

    it('calculates percentage decrease correctly', () => {
      expect(calculateVariancePercent(50, 100)).toBe(-50)
      expect(calculateVariancePercent(75, 100)).toBe(-25)
    })

    it('returns null when base is zero', () => {
      expect(calculateVariancePercent(100, 0)).toBeNull()
    })

    it('returns 0 when values are equal', () => {
      expect(calculateVariancePercent(100, 100)).toBe(0)
    })

    it('handles decimal values', () => {
      expect(calculateVariancePercent(125.5, 100)).toBe(25.5)
    })
  })

  describe('calculateVarianceAmount', () => {
    it('calculates positive variance', () => {
      expect(calculateVarianceAmount(150, 100)).toBe(50)
      expect(calculateVarianceAmount(200, 100)).toBe(100)
    })

    it('calculates negative variance', () => {
      expect(calculateVarianceAmount(50, 100)).toBe(-50)
      expect(calculateVarianceAmount(75, 100)).toBe(-25)
    })

    it('returns 0 when values are equal', () => {
      expect(calculateVarianceAmount(100, 100)).toBe(0)
    })

    it('handles decimal values', () => {
      expect(calculateVarianceAmount(125.5, 100)).toBe(25.5)
    })
  })
})
