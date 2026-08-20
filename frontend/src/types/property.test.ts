/**
 * Tests for Property domain types.
 * Schemas must match backend/app/models/property.py.
 */

import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import {
  calculateLoadFactor,
  decimalString,
  parseDecimal,
  toDecimalString,
  PropertyCreateSchema,
  PropertySchema,
  PropertyUpdateSchema,
} from './property'

const validProperty = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  organization_id: '660e8400-e29b-41d4-a716-446655440001',
  name: 'Test Building',
  address_line1: '123 Main Street',
  address_line2: null,
  city: 'New York',
  state: 'NY',
  postal_code: '10001',
  total_rentable_sqft: '100000.00',
  total_usable_sqft: '85000.00',
  common_area_sqft: '15000.00',
  target_occupancy: '0.95',
  created_at: '2024-01-15T10:30:00Z',
  updated_at: '2024-01-20T15:45:00Z',
}

describe('decimalString helper', () => {
  it('validates numeric strings with constraints', () => {
    const schema = decimalString({ ge: 0, le: 1 })
    expect(schema.parse('0.5')).toBe('0.5')
    expect(() => schema.parse('-0.1')).toThrow()
    expect(() => schema.parse('1.1')).toThrow()
    expect(() => schema.parse('abc')).toThrow()
  })

  it('validates gt (greater than) constraint', () => {
    const schema = decimalString({ gt: 0 })
    expect(schema.parse('0.1')).toBe('0.1')
    expect(schema.parse('100')).toBe('100')
    expect(() => schema.parse('0')).toThrow()
    expect(() => schema.parse('-5')).toThrow()
  })

  it('rejects invalid numeric formats', () => {
    const schema = decimalString()
    expect(() => schema.parse('abc123')).toThrow()
    expect(() => schema.parse('12.34.56')).toThrow()
    expect(() => schema.parse('1e5')).toThrow()
    expect(() => schema.parse('NaN')).toThrow()
  })

  it('includes constraint info in error messages', () => {
    const gtSchema = decimalString({ gt: 0 })
    try {
      gtSchema.parse('-1')
    } catch (error) {
      expect((error as Error).message).toContain('must be > 0')
    }

    const geSchema = decimalString({ ge: 10 })
    try {
      geSchema.parse('5')
    } catch (error) {
      expect((error as Error).message).toContain('must be >= 10')
    }

    const leSchema = decimalString({ le: 100 })
    try {
      leSchema.parse('200')
    } catch (error) {
      expect((error as Error).message).toContain('must be <= 100')
    }
  })

  it('validates without constraints', () => {
    const schema = decimalString()
    expect(schema.parse('123.45')).toBe('123.45')
    expect(schema.parse('-50.5')).toBe('-50.5')
    expect(schema.parse('0')).toBe('0')
  })
})

describe('PropertySchema', () => {
  it('parses valid property', () => {
    const result = PropertySchema.parse(validProperty)
    expect(result.name).toBe('Test Building')
    expect(result.total_rentable_sqft).toBe('100000.00')
  })

  it('rejects invalid data', () => {
    expect(() => PropertySchema.parse({})).toThrow(ZodError)
    expect(() =>
      PropertySchema.parse({ ...validProperty, state: 'NYC' })
    ).toThrow()
    expect(() =>
      PropertySchema.parse({ ...validProperty, total_rentable_sqft: '0' })
    ).toThrow()
  })

  it('enforces usable <= rentable (BOMA constraint)', () => {
    expect(() =>
      PropertySchema.parse({
        ...validProperty,
        total_rentable_sqft: '50000',
        total_usable_sqft: '60000',
      })
    ).toThrow()
  })

  it('validates target_occupancy range (0-1)', () => {
    expect(() =>
      PropertySchema.parse({ ...validProperty, target_occupancy: '1.5' })
    ).toThrow()
  })
})

describe('PropertyCreateSchema', () => {
  it('creates with required fields and defaults target_occupancy', () => {
    const result = PropertyCreateSchema.parse({
      name: 'New Building',
      address_line1: '456 Oak Ave',
      city: 'Chicago',
      state: 'IL',
      postal_code: '60601',
      total_rentable_sqft: '75000',
      total_usable_sqft: '65000',
      common_area_sqft: '10000',
    })
    expect(result.name).toBe('New Building')
    expect(result.target_occupancy).toBe('0.95')
  })
})

describe('PropertyUpdateSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(PropertyUpdateSchema.parse({})).toEqual({})
  })

  it('validates fields when provided', () => {
    expect(() => PropertyUpdateSchema.parse({ name: '' })).toThrow()
    expect(() => PropertyUpdateSchema.parse({ state: 'NYC' })).toThrow()
  })
})

describe('calculateLoadFactor', () => {
  it('calculates R/U ratio correctly', () => {
    expect(calculateLoadFactor('100000', '85000')).toBeCloseTo(1.1765, 3)
    expect(calculateLoadFactor('50000', '50000')).toBe(1)
    expect(calculateLoadFactor('100000', '0')).toBe(0)
  })
})

describe('toDecimalString', () => {
  it('converts numbers to decimal strings', () => {
    expect(toDecimalString(123.45)).toBe('123.45')
    expect(toDecimalString(0)).toBe('0')
    expect(toDecimalString(-50.5)).toBe('-50.5')
    expect(toDecimalString(1000)).toBe('1000')
  })

  it('handles integer values', () => {
    expect(toDecimalString(100)).toBe('100')
    expect(toDecimalString(-25)).toBe('-25')
  })

  it('handles very small decimals', () => {
    expect(toDecimalString(0.0001)).toBe('0.0001')
    expect(toDecimalString(0.95)).toBe('0.95')
  })
})

describe('parseDecimal', () => {
  it('parses valid decimal strings to numbers', () => {
    expect(parseDecimal('123.45')).toBe(123.45)
    expect(parseDecimal('0')).toBe(0)
    expect(parseDecimal('-50.5')).toBe(-50.5)
    expect(parseDecimal('1000')).toBe(1000)
  })

  it('throws error for invalid decimal strings', () => {
    expect(() => parseDecimal('abc')).toThrow('Invalid decimal value: abc')
    expect(() => parseDecimal('not-a-number')).toThrow(
      'Invalid decimal value: not-a-number'
    )
    expect(() => parseDecimal('')).toThrow('Invalid decimal value: ')
  })

  it('throws error for NaN results', () => {
    expect(() => parseDecimal('NaN')).toThrow('Invalid decimal value: NaN')
  })

  it('parses integer strings', () => {
    expect(parseDecimal('100')).toBe(100)
    expect(parseDecimal('-25')).toBe(-25)
  })
})
