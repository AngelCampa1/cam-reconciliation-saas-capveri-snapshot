import { describe, it, expect } from 'vitest'
import { formatNumber, formatWholeNumber } from './number'

describe('formatNumber', () => {
  it('groups a whole number with en-US separators', () => {
    expect(formatNumber(1234)).toBe('1,234')
    expect(formatNumber(1234567)).toBe('1,234,567')
  })

  it('matches a bare en-US toLocaleString for fractional defaults', () => {
    expect(formatNumber(1234.5)).toBe('1,234.5')
    // ECMA-402 default is max 3 fraction digits — same as a bare call.
    expect(formatNumber(1234.5678)).toBe('1,234.568')
  })

  it('formats an exact decimal string without float coercion', () => {
    expect(formatNumber('1234.50')).toBe('1,234.5')
    expect(formatNumber('1000')).toBe('1,000')
  })

  it('parses large strings exactly (beyond float safe-integer range)', () => {
    expect(formatNumber('12345678901234')).toBe('12,345,678,901,234')
  })

  it('formats negative values', () => {
    expect(formatNumber(-1500)).toBe('-1,500')
    expect(formatNumber('-2500.25')).toBe('-2,500.25')
  })

  it('respects explicit fraction-digit options', () => {
    expect(
      formatNumber(1234, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    ).toBe('1,234.00')
  })

  it('returns a non-numeric string unchanged', () => {
    expect(formatNumber('n/a')).toBe('n/a')
  })

  it('formats zero', () => {
    expect(formatNumber(0)).toBe('0')
  })
})

describe('formatWholeNumber', () => {
  it('rounds to a whole number with en-US grouping', () => {
    expect(formatWholeNumber(1234.56)).toBe('1,235')
    expect(formatWholeNumber(1234.49)).toBe('1,234')
  })

  it('rounds numeric strings without float coercion', () => {
    expect(formatWholeNumber('1234.49')).toBe('1,234')
    expect(formatWholeNumber('12345.67')).toBe('12,346')
  })

  it('formats an already-whole value unchanged in magnitude', () => {
    expect(formatWholeNumber(1000)).toBe('1,000')
    expect(formatWholeNumber('0')).toBe('0')
  })

  it('returns a non-numeric string unchanged (parity with the old sqft helper)', () => {
    expect(formatWholeNumber('n/a')).toBe('n/a')
    expect(formatWholeNumber('')).toBe('')
  })
})
