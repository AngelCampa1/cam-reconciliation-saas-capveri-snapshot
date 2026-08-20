import { describe, it, expect } from 'vitest'

import { percentToDecimalString, decimalToPercentString } from './percent'

describe('percentToDecimalString', () => {
  it('converts whole-number percentages', () => {
    expect(percentToDecimalString('25')).toBe('0.25')
    expect(percentToDecimalString('5')).toBe('0.05')
    expect(percentToDecimalString('100')).toBe('1')
    expect(percentToDecimalString('15')).toBe('0.15')
  })

  it('converts fractional percentages without float error', () => {
    // 2.9 / 100 === 0.028999999999999998 in IEEE-754; the string path is exact.
    expect(percentToDecimalString('2.9')).toBe('0.029')
    expect(percentToDecimalString('33.33')).toBe('0.3333')
    expect(percentToDecimalString('0.5')).toBe('0.005')
    expect(percentToDecimalString('12.345')).toBe('0.12345')
  })

  it('handles zero and zero-like input', () => {
    expect(percentToDecimalString('0')).toBe('0')
    expect(percentToDecimalString('0.0')).toBe('0')
    expect(percentToDecimalString('00')).toBe('0')
  })

  it('preserves precision beyond IEEE-754 double range', () => {
    // 99999999999999.99 / 100 has 16 significant digits; parseFloat would
    // round it, the string shift keeps every digit.
    expect(percentToDecimalString('99999999999999.99')).toBe(
      '999999999999.9999'
    )
  })

  it('strips redundant leading/trailing zeros', () => {
    expect(percentToDecimalString('025')).toBe('0.25')
    expect(percentToDecimalString('25.00')).toBe('0.25')
    expect(percentToDecimalString('100.0')).toBe('1')
  })

  it('returns non-numeric input unchanged', () => {
    expect(percentToDecimalString('')).toBe('')
    expect(percentToDecimalString('abc')).toBe('abc')
    expect(percentToDecimalString('1.2.3')).toBe('1.2.3')
  })
})

describe('decimalToPercentString', () => {
  it('converts decimal fractions to whole percentages', () => {
    expect(decimalToPercentString('0.25')).toBe('25')
    expect(decimalToPercentString('0.05')).toBe('5')
    expect(decimalToPercentString('1')).toBe('100')
    expect(decimalToPercentString('0.15')).toBe('15')
  })

  it('converts fractional decimals without float error', () => {
    // 0.029 * 100 === 2.9000000000000004 in IEEE-754; the string path is exact.
    expect(decimalToPercentString('0.029')).toBe('2.9')
    expect(decimalToPercentString('0.3333')).toBe('33.33')
    expect(decimalToPercentString('0.005')).toBe('0.5')
    expect(decimalToPercentString('0.12345')).toBe('12.345')
  })

  it('handles zero', () => {
    expect(decimalToPercentString('0')).toBe('0')
    expect(decimalToPercentString('0.0')).toBe('0')
  })

  it('round-trips with percentToDecimalString', () => {
    for (const pct of ['25', '2.9', '33.33', '0.5', '100', '5', '12.345']) {
      expect(decimalToPercentString(percentToDecimalString(pct))).toBe(pct)
    }
  })

  it('canonicalizes non-canonical zero on round-trip', () => {
    // Round-tripping normalizes redundant representations of zero to "0".
    // Both sides represent the same magnitude, so this is intentional.
    expect(decimalToPercentString(percentToDecimalString('0.0'))).toBe('0')
    expect(decimalToPercentString(percentToDecimalString('25.00'))).toBe('25')
  })

  it('returns non-numeric input unchanged', () => {
    expect(decimalToPercentString('')).toBe('')
    expect(decimalToPercentString('abc')).toBe('abc')
  })
})
