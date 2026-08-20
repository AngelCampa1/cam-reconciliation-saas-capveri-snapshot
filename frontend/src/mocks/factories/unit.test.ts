/**
 * Tests for unit factory functions
 *
 * Following test minimalism: Test factory logic, not faker internals.
 * Focus on override behavior and type correctness.
 */
import { describe, it, expect } from 'vitest'
import {
  createUnit,
  createUnitList,
  createUnitCreate,
  createTestUnit,
} from './unit'

describe('Unit Factories', () => {
  describe('createUnit', () => {
    it('creates valid unit with required fields', () => {
      const unit = createUnit()

      expect(unit.id).toBeTruthy()
      expect(unit.property_id).toBeTruthy()
      expect(unit.unit_number).toBeTruthy()
      expect(unit.rentable_sqft).toBeTruthy()
      expect(unit.usable_sqft).toBeTruthy()
      expect(unit.status).toMatch(/^(vacant|occupied|under_renovation)$/)
    })

    it('applies overrides correctly', () => {
      const unit = createUnit({
        id: 'custom-id',
        unit_number: '999Z',
        floor: 10,
        status: 'occupied',
      })

      expect(unit.id).toBe('custom-id')
      expect(unit.unit_number).toBe('999Z')
      expect(unit.floor).toBe(10)
      expect(unit.status).toBe('occupied')
    })

    it('calculates usable square footage less than rentable', () => {
      const unit = createUnit()

      const rentable = parseInt(unit.rentable_sqft)
      const usable = parseInt(unit.usable_sqft)

      // Usable should be less than rentable (92% ratio)
      expect(usable).toBeLessThan(rentable)
    })

    it('handles floor number correctly', () => {
      const unit = createUnit()

      expect(typeof unit.floor).toBe('number')
      expect(unit.floor).toBeGreaterThan(0)
    })
  })

  describe('createUnitList', () => {
    it('creates list of specified size', () => {
      const units = createUnitList(5)
      expect(units).toHaveLength(5)
    })

    it('creates default list of 10 units', () => {
      const units = createUnitList()
      expect(units).toHaveLength(10)
    })

    it('assigns same property_id when provided', () => {
      const propertyId = 'test-property-123'
      const units = createUnitList(3, propertyId)

      expect(units).toHaveLength(3)
      expect(units.every((u) => u.property_id === propertyId)).toBe(true)
    })

    it('creates empty list when count is 0', () => {
      const units = createUnitList(0)
      expect(units).toHaveLength(0)
    })
  })

  describe('createUnitCreate', () => {
    it('creates valid unit create DTO', () => {
      const dto = createUnitCreate()

      expect(dto.unit_number).toBeTruthy()
      expect(dto.rentable_sqft).toBeTruthy()
      expect(dto.usable_sqft).toBeTruthy()
      expect(dto.status).toMatch(/^(vacant|occupied|under_renovation)$/)
    })

    it('applies overrides correctly', () => {
      const dto = createUnitCreate({
        unit_number: '500B',
        status: 'vacant',
      })

      expect(dto.unit_number).toBe('500B')
      expect(dto.status).toBe('vacant')
    })

    it('calculates square footage relationship correctly', () => {
      const dto = createUnitCreate()

      const rentable = parseInt(dto.rentable_sqft)
      const usable = parseInt(dto.usable_sqft)

      expect(usable).toBeLessThan(rentable)
    })
  })

  describe('createTestUnit', () => {
    it('creates consistent test unit', () => {
      const unit1 = createTestUnit()
      const unit2 = createTestUnit()

      // Same values for consistency
      expect(unit1.id).toBe(unit2.id)
      expect(unit1.id).toBe('test-unit-789')
      expect(unit1.property_id).toBe('test-property-123')
      expect(unit1.unit_number).toBe('101A')
      expect(unit1.floor).toBe(1)
      expect(unit1.status).toBe('occupied')
    })

    it('uses custom property_id when provided', () => {
      const unit = createTestUnit('custom-prop')
      expect(unit.property_id).toBe('custom-prop')
    })

    it('has predictable square footage', () => {
      const unit = createTestUnit()

      expect(unit.rentable_sqft).toBe('2500')
      expect(unit.usable_sqft).toBe('2300')
    })
  })
})
