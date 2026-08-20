/**
 * Tests for LeaseRecoveryProfile Zod schemas.
 * Schemas must match backend/app/models/lease_recovery_profile.py.
 */

import { describe, expect, it } from 'vitest'

import {
  isValidCapType,
  isValidPoolType,
  LeaseRecoveryProfileCreateSchema,
  LeaseRecoveryProfileSchema,
  LeaseRecoveryProfileUpdateSchema,
} from './lease-recovery-profile'

describe('LeaseRecoveryProfileSchema', () => {
  it('parses minimal valid profile', () => {
    const result = LeaseRecoveryProfileSchema.parse({ pro_rata_share: '0.05' })
    expect(result.pro_rata_share).toBe('0.05')
    expect(result.cap_type).toBe('none')
    expect(result.admin_fee_percentage).toBe('0')
    expect(result.excluded_pools).toEqual([])
  })

  it('parses full profile', () => {
    const result = LeaseRecoveryProfileSchema.parse({
      base_year: 2024,
      base_year_amount: '50000.00',
      gross_up_base_year: true,
      pro_rata_share: '0.05',
      cap_type: 'cumulative',
      cap_rate: '0.05',
      admin_fee_percentage: '0.15',
      excluded_pools: ['capital', 'other'],
    })
    expect(result.base_year).toBe(2024)
    expect(result.cap_type).toBe('cumulative')
  })

  it('requires cap_rate when cap_type is not none', () => {
    expect(() =>
      LeaseRecoveryProfileSchema.parse({
        pro_rata_share: '0.05',
        cap_type: 'cumulative',
      })
    ).toThrow(/cap rate is required/i)
  })

  it('validates numeric ranges', () => {
    // pro_rata_share must be 0-1
    expect(() =>
      LeaseRecoveryProfileSchema.parse({ pro_rata_share: '1.5' })
    ).toThrow()
    // base_year must be 1990-2100
    expect(() =>
      LeaseRecoveryProfileSchema.parse({
        pro_rata_share: '0.05',
        base_year: 1900,
      })
    ).toThrow()
    // admin_fee_percentage must be 0-0.20
    expect(() =>
      LeaseRecoveryProfileSchema.parse({
        pro_rata_share: '0.05',
        admin_fee_percentage: '0.30',
      })
    ).toThrow()
  })

  it('validates excluded_pools are valid pool types', () => {
    expect(() =>
      LeaseRecoveryProfileSchema.parse({
        pro_rata_share: '0.05',
        excluded_pools: ['invalid_pool'],
      })
    ).toThrow()
  })
})

describe('LeaseRecoveryProfileCreateSchema', () => {
  it('requires pro_rata_share', () => {
    expect(() => LeaseRecoveryProfileCreateSchema.parse({})).toThrow()
  })

  it('applies defaults', () => {
    const result = LeaseRecoveryProfileCreateSchema.parse({
      pro_rata_share: '0.05',
    })
    expect(result.cap_type).toBe('none')
    expect(result.gross_up_base_year).toBe(false)
  })
})

describe('LeaseRecoveryProfileUpdateSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(LeaseRecoveryProfileUpdateSchema.parse({})).toEqual({})
  })

  it('validates fields when provided', () => {
    expect(() =>
      LeaseRecoveryProfileUpdateSchema.parse({ pro_rata_share: '2.0' })
    ).toThrow()
  })
})

describe('Helper functions', () => {
  it('isValidCapType validates cap types', () => {
    expect(isValidCapType('cumulative')).toBe(true)
    expect(isValidCapType('invalid')).toBe(false)
  })

  it('isValidPoolType validates pool types', () => {
    expect(isValidPoolType('operating')).toBe(true)
    expect(isValidPoolType('invalid')).toBe(false)
  })
})
