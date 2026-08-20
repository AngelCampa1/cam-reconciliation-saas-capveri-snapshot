import { describe, it, expect } from 'vitest'
import {
  getSubscriptionStatusVariant,
  formatSubscriptionStatus,
} from './subscription-status'

describe('getSubscriptionStatusVariant', () => {
  it('maps each known subscription status to its badge variant', () => {
    expect(getSubscriptionStatusVariant('active')).toBe('success')
    expect(getSubscriptionStatusVariant('trialing')).toBe('info')
    expect(getSubscriptionStatusVariant('past_due')).toBe('warning')
    expect(getSubscriptionStatusVariant('canceled')).toBe('destructive')
    expect(getSubscriptionStatusVariant('paused')).toBe('destructive')
  })

  it('falls back to the neutral default variant for unknown or missing status', () => {
    expect(getSubscriptionStatusVariant('something_else')).toBe('default')
    expect(getSubscriptionStatusVariant('')).toBe('default')
    expect(getSubscriptionStatusVariant(null)).toBe('default')
    expect(getSubscriptionStatusVariant(undefined)).toBe('default')
  })
})

describe('formatSubscriptionStatus', () => {
  it('maps each known subscription status to its human label', () => {
    expect(formatSubscriptionStatus('active')).toBe('Active')
    expect(formatSubscriptionStatus('trialing')).toBe('Trialing')
    expect(formatSubscriptionStatus('past_due')).toBe('Past Due')
    expect(formatSubscriptionStatus('canceled')).toBe('Canceled')
    expect(formatSubscriptionStatus('paused')).toBe('Paused')
  })

  it('shows unknown statuses verbatim and returns empty for missing', () => {
    expect(formatSubscriptionStatus('incomplete_expired')).toBe(
      'incomplete_expired'
    )
    expect(formatSubscriptionStatus('')).toBe('')
    expect(formatSubscriptionStatus(null)).toBe('')
    expect(formatSubscriptionStatus(undefined)).toBe('')
  })
})
