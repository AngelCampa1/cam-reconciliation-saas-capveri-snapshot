/**
 * Contract validation tests
 *
 * Tests the contract validation utilities to ensure they correctly
 * validate API responses against Zod schemas.
 */
import { describe, it, expect } from 'vitest'

import {
  validators,
  validateSchema,
  ContractError,
  createValidator,
  assertValidResponse,
  validateField,
  PropertySchema,
} from './index'
import { createProperty } from '@/mocks/factories/property'
import { createUnit } from '@/mocks/factories/unit'
import { createLease } from '@/mocks/factories/lease'

describe('Contract Validation', () => {
  describe('PropertySchema validation', () => {
    it('validates correct property data', () => {
      const property = createProperty()
      expect(() => validators.property.validate(property)).not.toThrow()
    })

    it('rejects property with missing required fields', () => {
      const invalid = { id: '123e4567-e89b-12d3-a456-426614174000' }
      expect(() => validators.property.validate(invalid)).toThrow(ContractError)
    })

    it('rejects property with wrong field types', () => {
      const property = createProperty()
      const invalid = { ...property, total_rentable_sqft: 50000 }

      expect(() => validators.property.validate(invalid)).toThrow(ContractError)
    })

    it('provides helpful error messages', () => {
      const invalid = { id: '123e4567-e89b-12d3-a456-426614174000' }
      const errors = validators.property.getErrors(invalid)

      expect(errors.some((e) => e.includes('organization_id'))).toBe(true)
      expect(errors.some((e) => e.includes('name'))).toBe(true)
    })
  })

  describe('UnitSchema validation', () => {
    it('validates correct unit data', () => {
      const unit = createUnit()
      expect(() => validators.unit.validate(unit)).not.toThrow()
    })

    it('rejects unit with invalid status', () => {
      const unit = createUnit()
      const invalid = { ...unit, status: 'invalid_status' }
      expect(() => validators.unit.validate(invalid)).toThrow(ContractError)
    })
  })

  describe('LeaseSchema validation', () => {
    it('validates correct lease data', () => {
      const lease = createLease()
      expect(() => validators.lease.validate(lease)).not.toThrow()
    })

    it('validates nested recovery_profile', () => {
      const lease = createLease()
      const validated = validators.lease.validate(lease)
      expect(validated.recovery_profile).toBeDefined()
      expect(validated.recovery_profile.pro_rata_share).toBeDefined()
    })
  })

  describe('List response validation', () => {
    it('validates property list response', () => {
      const response = {
        data: [createProperty(), createProperty()],
        count: 2,
        has_more: false,
      }
      expect(() => validators.propertyList.validate(response)).not.toThrow()
    })

    it('rejects list with invalid items', () => {
      const response = {
        data: [{ id: 'invalid' }],
        count: 1,
        has_more: false,
      }
      expect(() => validators.propertyList.validate(response)).toThrow(
        ContractError
      )
    })
  })

  describe('isValid helper', () => {
    it('returns true for valid data', () => {
      const property = createProperty()
      expect(validators.property.isValid(property)).toBe(true)
    })

    it('returns false for invalid data', () => {
      expect(validators.property.isValid({ id: '123' })).toBe(false)
    })
  })

  describe('validateSchema function', () => {
    it('returns validated data on success', () => {
      const property = createProperty()
      const result = validateSchema(PropertySchema, property, 'test')
      expect(result.id).toBe(property.id)
    })

    it('throws ContractError with context on failure', () => {
      try {
        validateSchema(PropertySchema, {}, 'MyContext')
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ContractError)
        expect((error as ContractError).message).toContain('MyContext')
      }
    })
  })

  describe('createValidator function', () => {
    it('creates a validator with all methods', () => {
      const validator = createValidator(PropertySchema, 'CustomProperty')

      expect(validator.validate).toBeInstanceOf(Function)
      expect(validator.isValid).toBeInstanceOf(Function)
      expect(validator.getErrors).toBeInstanceOf(Function)
      expect(validator.schema).toBe(PropertySchema)
    })
  })

  describe('assertValidResponse function', () => {
    it('passes for valid data', () => {
      const property = createProperty()
      expect(() =>
        assertValidResponse(validators.property, property)
      ).not.toThrow()
    })

    it('throws for invalid data', () => {
      expect(() => assertValidResponse(validators.property, {})).toThrow(
        ContractError
      )
    })
  })

  describe('validateField function', () => {
    it('extracts and validates a specific field', () => {
      const property = createProperty()
      const name = validateField(validators.property, property, 'name')
      expect(name).toBe(property.name)
    })
  })

  describe('ContractError', () => {
    it('contains zodError property', () => {
      try {
        validators.property.validate({})
        expect.fail('Should have thrown')
      } catch (error) {
        expect(error).toBeInstanceOf(ContractError)
        expect((error as ContractError).zodError).toBeDefined()
        expect((error as ContractError).zodError.issues.length).toBeGreaterThan(
          0
        )
      }
    })

    it('has descriptive message', () => {
      try {
        validators.property.validate({ id: 'not-a-uuid' })
        expect.fail('Should have thrown')
      } catch (error) {
        const message = (error as ContractError).message
        expect(message).toContain('Contract violation')
        expect(message).toContain('Property')
      }
    })
  })
})
