/**
 * Tests for Unit domain types.
 * Schemas must match backend/app/models/unit.py.
 */

import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import {
  isValidUnitStatus,
  UnitCreateSchema,
  UnitSchema,
  UnitUpdateSchema,
} from './unit'

const validUnit = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  property_id: '660e8400-e29b-41d4-a716-446655440001',
  unit_number: 'Suite 101',
  rentable_sqft: '5000.00',
  usable_sqft: '4250.00',
  floor: 1,
  status: 'vacant' as const,
  created_at: '2024-01-15T10:30:00Z',
  updated_at: '2024-01-20T15:45:00Z',
}

describe('UnitSchema', () => {
  it('parses valid unit', () => {
    const result = UnitSchema.parse(validUnit)
    expect(result.unit_number).toBe('Suite 101')
    expect(result.status).toBe('vacant')
  })

  it('rejects invalid data', () => {
    expect(() => UnitSchema.parse({})).toThrow(ZodError)
    expect(() => UnitSchema.parse({ ...validUnit, unit_number: '' })).toThrow()
    expect(() =>
      UnitSchema.parse({ ...validUnit, rentable_sqft: '0' })
    ).toThrow()
  })

  it('enforces usable <= rentable', () => {
    expect(() =>
      UnitSchema.parse({
        ...validUnit,
        rentable_sqft: '3000',
        usable_sqft: '4000',
      })
    ).toThrow()
  })

  it('validates status enum', () => {
    expect(() =>
      UnitSchema.parse({ ...validUnit, status: 'invalid' })
    ).toThrow()
  })

  it('accepts null floor', () => {
    const result = UnitSchema.parse({ ...validUnit, floor: null })
    expect(result.floor).toBeNull()
  })
})

describe('UnitCreateSchema', () => {
  it('creates with required fields and defaults status to vacant', () => {
    const result = UnitCreateSchema.parse({
      property_id: '660e8400-e29b-41d4-a716-446655440001',
      unit_number: 'Suite 200',
      rentable_sqft: '4000',
      usable_sqft: '3500',
    })
    expect(result.unit_number).toBe('Suite 200')
    expect(result.status).toBe('vacant')
  })
})

describe('UnitUpdateSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(UnitUpdateSchema.parse({})).toEqual({})
  })

  it('validates fields when provided', () => {
    expect(() => UnitUpdateSchema.parse({ unit_number: '' })).toThrow()
    expect(() => UnitUpdateSchema.parse({ status: 'invalid' })).toThrow()
  })
})

describe('isValidUnitStatus helper', () => {
  it('validates unit statuses', () => {
    expect(isValidUnitStatus('vacant')).toBe(true)
    expect(isValidUnitStatus('occupied')).toBe(true)
    expect(isValidUnitStatus('invalid')).toBe(false)
  })
})
