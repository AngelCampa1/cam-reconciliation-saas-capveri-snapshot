import { describe, it, expect } from 'vitest'
import { formatMoney, formatMoneyWhole, sumMoney } from './money'

describe('formatMoney', () => {
  it('formats an exact decimal string as USD', () => {
    expect(formatMoney('1234.56')).toBe('$1,234.56')
  })

  it('pads to two fraction digits', () => {
    expect(formatMoney('1234.5')).toBe('$1,234.50')
    expect(formatMoney('1000')).toBe('$1,000.00')
  })

  it('formats a number input', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50')
  })

  it('parses large strings exactly (beyond float safe-integer range)', () => {
    // 12345678901234.56 has 16 significant digits — parseFloat would drift.
    expect(formatMoney('12345678901234.56')).toBe('$12,345,678,901,234.56')
  })

  it('formats negative values', () => {
    expect(formatMoney('-50.25')).toBe('-$50.25')
  })

  it('supports an alternate currency', () => {
    expect(formatMoney('99.99', 'eur')).toBe('€99.99')
  })

  it('renders the correct symbol for other currencies', () => {
    expect(formatMoney(1234.56, 'gbp')).toBe('£1,234.56')
  })

  it('formats a zero amount', () => {
    expect(formatMoney(0, 'usd')).toBe('$0.00')
  })

  it('honors option overrides (compact whole-dollar)', () => {
    expect(
      formatMoney('1234.56', 'usd', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      })
    ).toBe('$1,235')
  })

  it('returns non-numeric strings unchanged as a safe fallback', () => {
    expect(formatMoney('N/A')).toBe('N/A')
  })
})

describe('formatMoneyWhole', () => {
  it('renders whole dollars, rounding to the nearest dollar', () => {
    expect(formatMoneyWhole(1234.56)).toBe('$1,235')
    expect(formatMoneyWhole('1234.49')).toBe('$1,234')
  })

  it('accepts an exact decimal string and a number', () => {
    expect(formatMoneyWhole('1000')).toBe('$1,000')
    expect(formatMoneyWhole(0)).toBe('$0')
  })

  it('formats negative whole dollars', () => {
    expect(formatMoneyWhole(-1500.4)).toBe('-$1,500')
  })

  it('supports an alternate currency', () => {
    expect(formatMoneyWhole(99.99, 'eur')).toBe('€100')
  })
})

describe('sumMoney', () => {
  it('adds two values exactly where float would drift', () => {
    expect(sumMoney(['0.1', '0.2'])).toBe('0.3')
  })

  it('returns an integer string when the fraction cancels', () => {
    expect(sumMoney(['1234.56', '7.44'])).toBe('1242')
  })

  it('treats null/undefined/empty as zero', () => {
    expect(sumMoney(['10.00', null, undefined, ''])).toBe('10')
  })

  it('ignores non-numeric entries', () => {
    expect(sumMoney(['10.00', 'oops', '5.50'])).toBe('15.5')
  })

  it('handles mixed fraction lengths', () => {
    expect(sumMoney(['1.5', '2.25', '0.005'])).toBe('3.755')
  })

  it('accumulates many values without float error', () => {
    const values = Array.from({ length: 1000 }, () => '0.01')
    expect(sumMoney(values)).toBe('10')
  })

  it('handles negative values and net-negative totals', () => {
    expect(sumMoney(['100.00', '-150.50'])).toBe('-50.5')
  })

  it('returns 0 for an empty list', () => {
    expect(sumMoney([])).toBe('0')
  })

  it('preserves precision for large magnitudes', () => {
    expect(sumMoney(['99999999999999.99', '0.01'])).toBe('100000000000000')
  })
})
