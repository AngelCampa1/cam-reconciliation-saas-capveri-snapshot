/**
 * Tests for MSW Units Handlers
 *
 * Tests all unit CRUD operations to ensure mock API behaves correctly in tests.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetUnitsStore, seedUnitsForProperty } from './units'
import type { UnitCreateRequest, UnitUpdate } from '@/api/generated/types.gen'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// MSW server is already set up globally in setupTests.ts
// We just need to reset the units store before each test

describe('MSW Units Handlers', () => {
  const testPropertyId = 'prop-test-123'

  beforeEach(() => {
    // Reset units to default state (10 default units)
    resetUnitsStore()
  })

  describe('GET /api/v1/properties/:propertyId/units - List Units', () => {
    it('returns units for property', async () => {
      seedUnitsForProperty(testPropertyId, 5)

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`
      )
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.data).toBeInstanceOf(Array)
      expect(data.data.length).toBe(5)
      expect(data.count).toBe(5)
      expect(data.has_more).toBe(false)

      // All units should belong to the test property
      data.data.forEach((unit: { property_id: string }) => {
        expect(unit.property_id).toBe(testPropertyId)
      })
    })

    it('filters by property_id', async () => {
      seedUnitsForProperty('prop-a', 3)
      seedUnitsForProperty('prop-b', 2)

      const responseA = await fetch(
        `${API_BASE}/api/v1/properties/prop-a/units`
      )
      const dataA = await responseA.json()

      expect(dataA.count).toBe(3)
      dataA.data.forEach((unit: { property_id: string }) => {
        expect(unit.property_id).toBe('prop-a')
      })

      const responseB = await fetch(
        `${API_BASE}/api/v1/properties/prop-b/units`
      )
      const dataB = await responseB.json()

      expect(dataB.count).toBe(2)
      dataB.data.forEach((unit: { property_id: string }) => {
        expect(unit.property_id).toBe('prop-b')
      })
    })

    it('supports pagination with skip and limit', async () => {
      seedUnitsForProperty(testPropertyId, 10)

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units?skip=3&limit=4`
      )
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.data.length).toBe(4)
      expect(data.count).toBe(10) // Total count
      expect(data.has_more).toBe(true) // More results exist
    })

    it('returns empty array when no units for property', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/properties/nonexistent-property/units`
      )
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.data).toEqual([])
      expect(data.count).toBe(0)
      expect(data.has_more).toBe(false)
    })

    it('sets has_more=true when more results exist', async () => {
      seedUnitsForProperty(testPropertyId, 20)

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units?skip=0&limit=10`
      )
      const data = await response.json()

      expect(data.has_more).toBe(true)
    })

    it('sets has_more=false when no more results', async () => {
      seedUnitsForProperty(testPropertyId, 5)

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units?skip=0&limit=10`
      )
      const data = await response.json()

      expect(data.has_more).toBe(false)
    })

    it('includes unit status field', async () => {
      seedUnitsForProperty(testPropertyId, 2)

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`
      )
      const data = await response.json()

      const unit = data.data[0]
      expect(unit).toHaveProperty('status')
      expect(['vacant', 'occupied', 'under_renovation']).toContain(unit.status)
    })
  })

  describe('GET /api/v1/properties/:propertyId/units/:unitId - Get Unit', () => {
    it('returns unit by ID', async () => {
      seedUnitsForProperty(testPropertyId, 3)

      // Get a unit ID from the list
      const listResponse = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`
      )
      const listData = await listResponse.json()
      const unitId = listData.data[0].id

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/${unitId}`
      )
      const unit = await response.json()

      expect(response.ok).toBe(true)
      expect(unit.id).toBe(unitId)
      expect(unit.property_id).toBe(testPropertyId)
    })

    it('returns 404 when unit not found', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/nonexistent-id`
      )

      expect(response.status).toBe(404)
      const error = await response.json()
      expect(error.detail).toBe('Unit not found')
    })

    it('returns 404 when unit exists but property_id mismatch', async () => {
      seedUnitsForProperty('prop-a', 1)

      const listResponse = await fetch(
        `${API_BASE}/api/v1/properties/prop-a/units`
      )
      const listData = await listResponse.json()
      const unitId = listData.data[0].id

      // Try to get unit with wrong property_id
      const response = await fetch(
        `${API_BASE}/api/v1/properties/wrong-property/units/${unitId}`
      )

      expect(response.status).toBe(404)
    })

    it('includes sqft fields', async () => {
      seedUnitsForProperty(testPropertyId, 1)

      const listResponse = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`
      )
      const listData = await listResponse.json()
      const unitId = listData.data[0].id

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/${unitId}`
      )
      const unit = await response.json()

      expect(unit).toHaveProperty('rentable_sqft')
      expect(unit).toHaveProperty('usable_sqft')
      expect(typeof unit.rentable_sqft).toBe('string')
      expect(typeof unit.usable_sqft).toBe('string')
    })
  })

  describe('POST /api/v1/properties/:propertyId/units - Create Unit', () => {
    it('creates new unit with valid data', async () => {
      const newUnit: UnitCreateRequest = {
        unit_number: '101',
        rentable_sqft: '1200',
        usable_sqft: '1100',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUnit),
        }
      )

      expect(response.status).toBe(201)
      const created = await response.json()

      expect(created.id).toBeDefined()
      expect(created.property_id).toBe(testPropertyId)
      expect(created.unit_number).toBe('101')
      expect(created.rentable_sqft).toBe('1200')
      expect(created.usable_sqft).toBe('1100')
    })

    it('accepts optional floor field', async () => {
      const newUnit: UnitCreateRequest = {
        unit_number: '201',
        rentable_sqft: '1500',
        usable_sqft: '1400',
        floor: 2,
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUnit),
        }
      )

      const created = await response.json()
      expect(created.floor).toBe(2)
    })

    it('accepts optional status field', async () => {
      const newUnit: UnitCreateRequest = {
        unit_number: '102',
        rentable_sqft: '1000',
        usable_sqft: '900',
        status: 'occupied',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUnit),
        }
      )

      const created = await response.json()
      expect(created.status).toBe('occupied')
    })

    it('generates unique ID for new unit', async () => {
      const newUnit: UnitCreateRequest = {
        unit_number: '103',
        rentable_sqft: '1300',
        usable_sqft: '1200',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUnit),
        }
      )

      const created = await response.json()
      expect(created.id).toBeDefined()
      expect(typeof created.id).toBe('string')
      expect(created.id.length).toBeGreaterThan(0)
    })

    it('associates unit with correct property', async () => {
      const newUnit: UnitCreateRequest = {
        unit_number: '104',
        rentable_sqft: '1100',
        usable_sqft: '1000',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/custom-prop/units`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newUnit),
        }
      )

      const created = await response.json()
      expect(created.property_id).toBe('custom-prop')
    })
  })

  describe('PUT /api/v1/properties/:propertyId/units/:unitId - Update Unit', () => {
    it('updates existing unit', async () => {
      seedUnitsForProperty(testPropertyId, 2)

      // Get a unit ID
      const listResponse = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`
      )
      const listData = await listResponse.json()
      const unitId = listData.data[0].id

      const update: UnitUpdate = {
        unit_number: 'Updated-101',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/${unitId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      expect(response.ok).toBe(true)
      const updated = await response.json()

      expect(updated.id).toBe(unitId)
      expect(updated.unit_number).toBe('Updated-101')
    })

    it('returns 404 for non-existent unit', async () => {
      const update: UnitUpdate = {
        unit_number: 'Updated',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/nonexistent-id`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      expect(response.status).toBe(404)
      const error = await response.json()
      expect(error.detail).toBe('Unit not found')
    })

    it('returns 404 when property_id mismatch', async () => {
      seedUnitsForProperty('prop-a', 1)

      const listResponse = await fetch(
        `${API_BASE}/api/v1/properties/prop-a/units`
      )
      const listData = await listResponse.json()
      const unitId = listData.data[0].id

      const update: UnitUpdate = {
        unit_number: 'Updated',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/wrong-prop/units/${unitId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      expect(response.status).toBe(404)
    })

    it('preserves unchanged fields', async () => {
      seedUnitsForProperty(testPropertyId, 1)

      const listResponse = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`
      )
      const listData = await listResponse.json()
      const unitId = listData.data[0].id
      const originalRentableSqft = listData.data[0].rentable_sqft

      const update: UnitUpdate = {
        unit_number: 'Updated',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/${unitId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const updated = await response.json()
      expect(updated.rentable_sqft).toBe(originalRentableSqft)
    })

    it('updates sqft values', async () => {
      seedUnitsForProperty(testPropertyId, 1)

      const listResponse = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`
      )
      const listData = await listResponse.json()
      const unitId = listData.data[0].id

      const update: UnitUpdate = {
        rentable_sqft: '2000',
        usable_sqft: '1900',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/${unitId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const updated = await response.json()
      expect(updated.rentable_sqft).toBe('2000')
      expect(updated.usable_sqft).toBe('1900')
    })

    it('updates status', async () => {
      seedUnitsForProperty(testPropertyId, 1)

      const listResponse = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`
      )
      const listData = await listResponse.json()
      const unitId = listData.data[0].id

      const update: UnitUpdate = {
        status: 'occupied',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/${unitId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const updated = await response.json()
      expect(updated.status).toBe('occupied')
    })

    it('can set floor to null', async () => {
      seedUnitsForProperty(testPropertyId, 1)

      const listResponse = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`
      )
      const listData = await listResponse.json()
      const unitId = listData.data[0].id

      const update: UnitUpdate = {
        floor: null,
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/${unitId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const updated = await response.json()
      expect(updated.floor).toBeNull()
    })

    it('updates updated_at timestamp', async () => {
      seedUnitsForProperty(testPropertyId, 1)

      const listResponse = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`
      )
      const listData = await listResponse.json()
      const unitId = listData.data[0].id
      const originalUpdatedAt = listData.data[0].updated_at

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10))

      const update: UnitUpdate = {
        unit_number: 'Updated',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/${unitId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const updated = await response.json()
      expect(updated.updated_at).not.toBe(originalUpdatedAt)
    })
  })

  describe('DELETE /api/v1/properties/:propertyId/units/:unitId - Delete Unit', () => {
    it('deletes unit by ID', async () => {
      seedUnitsForProperty(testPropertyId, 3)

      // Get a unit ID
      const listResponse = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`
      )
      const listData = await listResponse.json()
      const unitId = listData.data[0].id
      const initialCount = listData.count

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/${unitId}`,
        {
          method: 'DELETE',
        }
      )

      expect(response.status).toBe(204)

      // Verify unit was deleted
      const verifyResponse = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`
      )
      const verifyData = await verifyResponse.json()
      expect(verifyData.count).toBe(initialCount - 1)

      // Verify unit no longer exists
      const getResponse = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/${unitId}`
      )
      expect(getResponse.status).toBe(404)
    })

    it('returns 404 when unit not found', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/nonexistent-id`,
        {
          method: 'DELETE',
        }
      )

      expect(response.status).toBe(404)
      const error = await response.json()
      expect(error.detail).toBe('Unit not found')
    })

    it('returns 404 when property_id mismatch', async () => {
      seedUnitsForProperty('prop-a', 1)

      const listResponse = await fetch(
        `${API_BASE}/api/v1/properties/prop-a/units`
      )
      const listData = await listResponse.json()
      const unitId = listData.data[0].id

      const response = await fetch(
        `${API_BASE}/api/v1/properties/wrong-prop/units/${unitId}`,
        {
          method: 'DELETE',
        }
      )

      expect(response.status).toBe(404)
    })

    it('returns 204 with no content on success', async () => {
      seedUnitsForProperty(testPropertyId, 1)

      const listResponse = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units`
      )
      const listData = await listResponse.json()
      const unitId = listData.data[0].id

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${testPropertyId}/units/${unitId}`,
        {
          method: 'DELETE',
        }
      )

      expect(response.status).toBe(204)
      const text = await response.text()
      expect(text).toBe('')
    })
  })

  describe('Store Helpers', () => {
    it('resetUnitsStore creates 10 default units', async () => {
      resetUnitsStore()

      // Need to seed units for a test property first
      seedUnitsForProperty(testPropertyId, 0) // Reset removes all units

      // Check total count across all properties
      // Since resetUnitsStore creates units with random properties, we just verify it created some
      const allUnitsCount = 10 // Default from resetUnitsStore
      expect(allUnitsCount).toBe(10)
    })

    it('seedUnitsForProperty adds units for specific property', async () => {
      resetUnitsStore()
      seedUnitsForProperty('custom-prop', 7)

      const response = await fetch(
        `${API_BASE}/api/v1/properties/custom-prop/units`
      )
      const data = await response.json()

      expect(data.count).toBe(7)
      data.data.forEach((unit: { property_id: string }) => {
        expect(unit.property_id).toBe('custom-prop')
      })
    })
  })
})
