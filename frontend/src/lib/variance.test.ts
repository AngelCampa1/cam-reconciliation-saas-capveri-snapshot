import { describe, it, expect } from 'vitest'

import { formatVariancePercent } from './variance'

describe('formatVariancePercent', () => {
  it('prefixes a positive value with "+" and two decimals', () => {
    expect(formatVariancePercent(12.5)).toBe('+12.50%')
  })

  it('prefixes zero with "+"', () => {
    expect(formatVariancePercent(0)).toBe('+0.00%')
  })

  it('keeps the leading minus on a negative value', () => {
    expect(formatVariancePercent(-3.2)).toBe('-3.20%')
  })

  it('rounds to two decimal places', () => {
    expect(formatVariancePercent(3.456)).toBe('+3.46%')
  })
})
