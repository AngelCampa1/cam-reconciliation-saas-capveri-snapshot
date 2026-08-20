/**
 * Tests for property factory functions
 *
 * Following test minimalism: Test factory logic, not faker internals.
 * Focus on override behavior and type correctness.
 */
import { describe, it, expect } from 'vitest'
import {
  createProperty,
  createPropertyList,
  createPropertyCreate,
  createTestProperty,
} from './property'

describe('Property Factories', () => {
  describe('createProperty', () => {
    it('creates valid property with required fields', () => {
      const property = createProperty()

      expect(property.id).toBeTruthy()
      expect(property.organization_id).toBeTruthy()
      expect(property.name).toBeTruthy()
      expect(property.address_line1).toBeTruthy()
      expect(property.city).toBeTruthy()
      expect(property.state).toBeTruthy()
      expect(property.postal_code).toBeTruthy()
      expect(property.target_occupancy).toBe('0.95')
    })

    it('applies overrides correctly', () => {
      const property = createProperty({
        id: 'custom-id',
        name: 'Custom Tower',
        city: 'New York',
        state: 'NY',
      })

      expect(property.id).toBe('custom-id')
      expect(property.name).toBe('Custom Tower')
      expect(property.city).toBe('New York')
      expect(property.state).toBe('NY')
    })

    it('calculates square footage relationships correctly', () => {
      const property = createProperty()

      const rentable = parseInt(property.total_rentable_sqft)
      const usable = parseInt(property.total_usable_sqft)
      const commonArea = parseInt(property.common_area_sqft)

      // Rentable = Usable + Common Area
      expect(rentable).toBe(usable + commonArea)
    })

    it('handles optional address_line2', () => {
      const property = createProperty()

      // address_line2 can be null or string
      expect(
        property.address_line2 === null ||
          typeof property.address_line2 === 'string'
      ).toBe(true)
    })
  })

  describe('createPropertyList', () => {
    it('creates list of specified size', () => {
      const properties = createPropertyList(5)
      expect(properties).toHaveLength(5)
    })

    it('creates default list of 10 properties', () => {
      const properties = createPropertyList()
      expect(properties).toHaveLength(10)
    })

    it('creates empty list when count is 0', () => {
      const properties = createPropertyList(0)
      expect(properties).toHaveLength(0)
    })
  })

  describe('createPropertyCreate', () => {
    it('creates valid property create DTO', () => {
      const dto = createPropertyCreate()

      expect(dto.name).toBeTruthy()
      expect(dto.address_line1).toBeTruthy()
      expect(dto.city).toBeTruthy()
      expect(dto.state).toBeTruthy()
      expect(dto.postal_code).toBeTruthy()
      expect(dto.target_occupancy).toBe('0.95')
    })

    it('applies overrides correctly', () => {
      const dto = createPropertyCreate({
        name: 'Test Building',
        target_occupancy: '0.90',
      })

      expect(dto.name).toBe('Test Building')
      expect(dto.target_occupancy).toBe('0.90')
    })

    it('calculates square footage relationships correctly', () => {
      const dto = createPropertyCreate()

      const rentable = parseInt(dto.total_rentable_sqft)
      const usable = parseInt(dto.total_usable_sqft)
      const commonArea = parseInt(dto.common_area_sqft)

      expect(rentable).toBe(usable + commonArea)
    })
  })

  describe('createTestProperty', () => {
    it('creates consistent test property', () => {
      const property1 = createTestProperty()
      const property2 = createTestProperty()

      // Same values for consistency
      expect(property1.id).toBe(property2.id)
      expect(property1.id).toBe('test-property-123')
      expect(property1.organization_id).toBe('test-org-456')
      expect(property1.name).toBe('Test Property')
      expect(property1.city).toBe('Test City')
      expect(property1.state).toBe('NY')
    })

    it('has predictable square footage', () => {
      const property = createTestProperty()

      expect(property.total_rentable_sqft).toBe('50000')
      expect(property.total_usable_sqft).toBe('45000')
      expect(property.common_area_sqft).toBe('5000')
    })
  })
})
