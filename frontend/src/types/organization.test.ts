/**
 * Tests for Organization domain types.
 * Schemas must match backend/app/models/organization.py.
 */

import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import {
  OrganizationCreateSchema,
  OrganizationSchema,
  OrganizationSettingsSchema,
  OrganizationUpdateSchema,
  SubscriptionStatus,
} from './organization'

describe('SubscriptionStatus', () => {
  it('has correct values matching backend', () => {
    expect(Object.values(SubscriptionStatus)).toEqual([
      'active',
      'trial',
      'suspended',
      'cancelled',
    ])
  })
})

describe('OrganizationSettingsSchema', () => {
  it('applies defaults for empty input', () => {
    const result = OrganizationSettingsSchema.parse({})
    expect(result).toEqual({
      timezone: 'America/New_York',
      default_currency: 'USD',
      fiscal_year_end_month: 12,
    })
  })

  it('validates fiscal_year_end_month range (1-12)', () => {
    expect(() =>
      OrganizationSettingsSchema.parse({ fiscal_year_end_month: 0 })
    ).toThrow(ZodError)
    expect(() =>
      OrganizationSettingsSchema.parse({ fiscal_year_end_month: 13 })
    ).toThrow(ZodError)
  })
})

describe('OrganizationSchema', () => {
  const validOrg = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    name: 'Acme Corp',
    subscription_status: 'active',
    settings: {
      timezone: 'UTC',
      default_currency: 'USD',
      fiscal_year_end_month: 12,
    },
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-20T15:45:00Z',
  }

  it('parses valid organization', () => {
    const result = OrganizationSchema.parse(validOrg)
    expect(result.id).toBe(validOrg.id)
    expect(result.name).toBe('Acme Corp')
  })

  it('rejects invalid data', () => {
    expect(() => OrganizationSchema.parse({})).toThrow(ZodError)
    expect(() => OrganizationSchema.parse({ ...validOrg, id: 'bad' })).toThrow(
      ZodError
    )
    expect(() => OrganizationSchema.parse({ ...validOrg, name: '' })).toThrow(
      ZodError
    )
  })
})

describe('OrganizationCreateSchema', () => {
  it('creates with name only, defaults subscription to trial', () => {
    const result = OrganizationCreateSchema.parse({ name: 'New Org' })
    expect(result.name).toBe('New Org')
    expect(result.subscription_status).toBe('trial')
  })

  it('requires name', () => {
    expect(() => OrganizationCreateSchema.parse({})).toThrow(ZodError)
  })
})

describe('OrganizationUpdateSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    const result = OrganizationUpdateSchema.parse({})
    expect(result).toEqual({})
  })

  it('validates fields when provided', () => {
    expect(() => OrganizationUpdateSchema.parse({ name: '' })).toThrow(ZodError)
    expect(() =>
      OrganizationUpdateSchema.parse({ subscription_status: 'invalid' })
    ).toThrow(ZodError)
  })
})
