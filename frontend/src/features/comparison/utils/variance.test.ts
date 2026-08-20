/**
 * Tests for Module B variance display helpers.
 *
 * These are pure formatting helpers (no money math). We cover every branch of
 * all five functions, including the sign and malformed-input edges.
 */
import { describe, it, expect } from 'vitest'
import { formatMoney } from '@/lib/money'
import {
  directionLabel,
  directionBadgeVariant,
  directionTextColor,
  signedMoney,
  formatVariancePct,
} from './variance'

describe('directionLabel', () => {
  it('maps each direction to its human label', () => {
    expect(directionLabel('overcharge')).toBe('Overcharged')
    expect(directionLabel('undercharge')).toBe('Undercharged')
    expect(directionLabel('match')).toBe('Match')
  })
})

describe('directionBadgeVariant', () => {
  it('maps each direction to its badge variant', () => {
    expect(directionBadgeVariant('overcharge')).toBe('destructive')
    expect(directionBadgeVariant('undercharge')).toBe('warning')
    expect(directionBadgeVariant('match')).toBe('success')
  })
})

describe('directionTextColor', () => {
  it('maps each direction to its text color class', () => {
    // Dark on-light tokens for WCAG AA on the white/muted variance cell
    // (bright text-destructive 3.78:1 / text-warning 2.13:1 both fail at text-sm).
    expect(directionTextColor('overcharge')).toBe('text-destructive-strong')
    expect(directionTextColor('undercharge')).toBe('text-warning-foreground')
    expect(directionTextColor('match')).toBe('text-muted-foreground')
  })
})

describe('signedMoney', () => {
  it('prefixes a leading + for a positive value', () => {
    expect(signedMoney('1234.56', formatMoney)).toBe('+$1,234.56')
  })

  it('keeps the formatMoney minus sign for a negative value', () => {
    expect(signedMoney('-12.00', formatMoney)).toBe('-$12.00')
  })

  it('does not add a sign for zero', () => {
    expect(signedMoney('0', formatMoney)).toBe('$0.00')
  })

  it('prefixes + for a sub-dollar positive value', () => {
    expect(signedMoney('0.50', formatMoney)).toBe('+$0.50')
    expect(signedMoney('0.04', formatMoney)).toBe('+$0.04')
  })

  it('keeps the minus for a sub-dollar negative value', () => {
    expect(signedMoney('-0.50', formatMoney)).toBe('-$0.50')
  })

  it('treats an explicit +-prefixed value as positive', () => {
    expect(signedMoney('+50', formatMoney)).toBe('+$50.00')
  })
})

describe('formatVariancePct', () => {
  it('prefixes + for a positive percent', () => {
    expect(formatVariancePct('12.5')).toBe('+12.5%')
  })

  it('keeps the minus for a negative percent', () => {
    expect(formatVariancePct('-4')).toBe('-4%')
  })

  it('renders zero without a sign', () => {
    expect(formatVariancePct('0')).toBe('0%')
  })

  it('prefixes + for a sub-1% positive percent', () => {
    expect(formatVariancePct('0.5')).toBe('+0.5%')
  })

  it('keeps the minus for a sub-1% negative percent', () => {
    expect(formatVariancePct('-0.5')).toBe('-0.5%')
  })

  it('renders a dash for null', () => {
    expect(formatVariancePct(null)).toBe('-')
  })

  it('renders a dash for malformed input', () => {
    expect(formatVariancePct('abc')).toBe('-')
    expect(formatVariancePct('')).toBe('-')
  })
})
