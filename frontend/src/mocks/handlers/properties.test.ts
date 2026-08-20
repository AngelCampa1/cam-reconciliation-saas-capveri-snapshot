/**
 * Tests for MSW Properties Handlers
 *
 * Tests all property CRUD operations to ensure mock API behaves correctly in tests.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetPropertiesStore } from './properties'
import type { PropertyCreate, PropertyUpdate } from '@/api/generated/types.gen'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// MSW server is already set up globally in setupTests.ts
// We just need to reset the properties store before each test

describe('MSW Properties Handlers', () => {
  beforeEach(() => {
    // Reset properties to default state (5 default properties)
    resetPropertiesStore()
  })

  describe('GET /api/v1/properties - List Properties', () => {
    it('returns paginated properties list', async () => {
      const response = await fetch(`${API_BASE}/api/v1/properties`)
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.data).toBeInstanceOf(Array)
      expect(data.data.length).toBe(5) // Default store has 5 properties
      expect(data.count).toBe(5)
      expect(data.has_more).toBe(false)
    })

    it('supports pagination with skip and limit', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/properties?skip=2&limit=2`
      )
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.data.length).toBe(2)
      expect(data.count).toBe(5) // Total count
      expect(data.has_more).toBe(true) // More results exist
    })

    it('returns empty array when skip exceeds total', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/properties?skip=100&limit=10`
      )
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.data).toEqual([])
      expect(data.count).toBe(5)
      expect(data.has_more).toBe(false)
    })

    it('sets has_more=false when no more results', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/properties?skip=0&limit=10`
      )
      const data = await response.json()

      expect(data.has_more).toBe(false)
    })

    it('includes required BOMA fields in response', async () => {
      const response = await fetch(`${API_BASE}/api/v1/properties`)
      const data = await response.json()

      const property = data.data[0]
      expect(property).toHaveProperty('total_rentable_sqft')
      expect(property).toHaveProperty('total_usable_sqft')
      expect(property).toHaveProperty('common_area_sqft')
      expect(property).toHaveProperty('target_occupancy')
    })
  })

  describe('GET /api/v1/properties/:propertyId - Get Property', () => {
    it('returns property by ID', async () => {
      // First get a property ID from the list
      const listResponse = await fetch(`${API_BASE}/api/v1/properties`)
      const listData = await listResponse.json()
      const propertyId = listData.data[0].id

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${propertyId}`
      )
      const property = await response.json()

      expect(response.ok).toBe(true)
      expect(property.id).toBe(propertyId)
      expect(property).toHaveProperty('name')
      expect(property).toHaveProperty('address_line1')
    })

    it('returns 404 when property not found', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/properties/nonexistent-id`
      )

      expect(response.status).toBe(404)
      const error = await response.json()
      expect(error.detail).toBe('Property not found')
    })

    it('includes all address fields', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/properties`)
      const listData = await listResponse.json()
      const propertyId = listData.data[0].id

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${propertyId}`
      )
      const property = await response.json()

      expect(property).toHaveProperty('address_line1')
      expect(property).toHaveProperty('city')
      expect(property).toHaveProperty('state')
      expect(property).toHaveProperty('postal_code')
    })
  })

  describe('POST /api/v1/properties - Create Property', () => {
    it('creates new property with valid data', async () => {
      const newProperty: PropertyCreate = {
        name: 'Test Building',
        address_line1: '123 Test St',
        city: 'Test City',
        state: 'TS',
        postal_code: '12345',
        total_rentable_sqft: '50000',
        total_usable_sqft: '45000',
        common_area_sqft: '5000',
      }

      const response = await fetch(`${API_BASE}/api/v1/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProperty),
      })

      expect(response.status).toBe(201)
      const created = await response.json()

      expect(created.id).toBeDefined()
      expect(created.name).toBe('Test Building')
      expect(created.address_line1).toBe('123 Test St')
      expect(created.total_rentable_sqft).toBe('50000')
    })

    it('sets default target_occupancy to 0.95', async () => {
      const newProperty: PropertyCreate = {
        name: 'Test Building',
        address_line1: '123 Test St',
        city: 'Test City',
        state: 'TS',
        postal_code: '12345',
        total_rentable_sqft: '50000',
        total_usable_sqft: '45000',
        common_area_sqft: '5000',
      }

      const response = await fetch(`${API_BASE}/api/v1/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProperty),
      })

      const created = await response.json()
      expect(created.target_occupancy).toBe('0.95')
    })

    it('accepts custom target_occupancy', async () => {
      const newProperty: PropertyCreate = {
        name: 'Test Building',
        address_line1: '123 Test St',
        city: 'Test City',
        state: 'TS',
        postal_code: '12345',
        total_rentable_sqft: '50000',
        total_usable_sqft: '45000',
        common_area_sqft: '5000',
        target_occupancy: '0.90',
      }

      const response = await fetch(`${API_BASE}/api/v1/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProperty),
      })

      const created = await response.json()
      expect(created.target_occupancy).toBe('0.90')
    })

    it('accepts optional address_line2', async () => {
      const newProperty: PropertyCreate = {
        name: 'Test Building',
        address_line1: '123 Test St',
        address_line2: 'Suite 100',
        city: 'Test City',
        state: 'TS',
        postal_code: '12345',
        total_rentable_sqft: '50000',
        total_usable_sqft: '45000',
        common_area_sqft: '5000',
      }

      const response = await fetch(`${API_BASE}/api/v1/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProperty),
      })

      const created = await response.json()
      expect(created.address_line2).toBe('Suite 100')
    })

    it('generates unique ID for new property', async () => {
      const newProperty: PropertyCreate = {
        name: 'Test Building',
        address_line1: '123 Test St',
        city: 'Test City',
        state: 'TS',
        postal_code: '12345',
        total_rentable_sqft: '50000',
        total_usable_sqft: '45000',
        common_area_sqft: '5000',
      }

      const response = await fetch(`${API_BASE}/api/v1/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProperty),
      })

      const created = await response.json()
      expect(created.id).toBeDefined()
      expect(typeof created.id).toBe('string')
      expect(created.id.length).toBeGreaterThan(0)
    })
  })

  describe('PUT /api/v1/properties/:propertyId - Update Property', () => {
    it('updates existing property', async () => {
      // Get a property ID
      const listResponse = await fetch(`${API_BASE}/api/v1/properties`)
      const listData = await listResponse.json()
      const propertyId = listData.data[0].id

      const update: PropertyUpdate = {
        name: 'Updated Building Name',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${propertyId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      expect(response.ok).toBe(true)
      const updated = await response.json()

      expect(updated.id).toBe(propertyId)
      expect(updated.name).toBe('Updated Building Name')
    })

    it('returns 404 for non-existent property', async () => {
      const update: PropertyUpdate = {
        name: 'Updated Name',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/nonexistent-id`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      expect(response.status).toBe(404)
      const error = await response.json()
      expect(error.detail).toBe('Property not found')
    })

    it('preserves unchanged fields', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/properties`)
      const listData = await listResponse.json()
      const propertyId = listData.data[0].id
      const originalCity = listData.data[0].city

      const update: PropertyUpdate = {
        name: 'Updated Name',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${propertyId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const updated = await response.json()
      expect(updated.city).toBe(originalCity)
    })

    it('updates BOMA area fields', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/properties`)
      const listData = await listResponse.json()
      const propertyId = listData.data[0].id

      const update: PropertyUpdate = {
        total_rentable_sqft: '60000',
        total_usable_sqft: '55000',
        common_area_sqft: '5000',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${propertyId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const updated = await response.json()
      expect(updated.total_rentable_sqft).toBe('60000')
      expect(updated.total_usable_sqft).toBe('55000')
      expect(updated.common_area_sqft).toBe('5000')
    })

    it('updates target_occupancy', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/properties`)
      const listData = await listResponse.json()
      const propertyId = listData.data[0].id

      const update: PropertyUpdate = {
        target_occupancy: '0.85',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${propertyId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const updated = await response.json()
      expect(updated.target_occupancy).toBe('0.85')
    })

    it('updates updated_at timestamp', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/properties`)
      const listData = await listResponse.json()
      const propertyId = listData.data[0].id
      const originalUpdatedAt = listData.data[0].updated_at

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10))

      const update: PropertyUpdate = {
        name: 'Updated Name',
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${propertyId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const updated = await response.json()
      expect(updated.updated_at).not.toBe(originalUpdatedAt)
    })

    it('can set address_line2 to null', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/properties`)
      const listData = await listResponse.json()
      const propertyId = listData.data[0].id

      const update: PropertyUpdate = {
        address_line2: null,
      }

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${propertyId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const updated = await response.json()
      expect(updated.address_line2).toBeNull()
    })
  })

  describe('DELETE /api/v1/properties/:propertyId - Delete Property', () => {
    it('deletes property by ID', async () => {
      // Get a property ID
      const listResponse = await fetch(`${API_BASE}/api/v1/properties`)
      const listData = await listResponse.json()
      const propertyId = listData.data[0].id
      const initialCount = listData.count

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${propertyId}`,
        {
          method: 'DELETE',
        }
      )

      expect(response.status).toBe(204)

      // Verify property was deleted
      const verifyResponse = await fetch(`${API_BASE}/api/v1/properties`)
      const verifyData = await verifyResponse.json()
      expect(verifyData.count).toBe(initialCount - 1)

      // Verify property no longer exists
      const getResponse = await fetch(
        `${API_BASE}/api/v1/properties/${propertyId}`
      )
      expect(getResponse.status).toBe(404)
    })

    it('returns 404 when property not found', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/properties/nonexistent-id`,
        {
          method: 'DELETE',
        }
      )

      expect(response.status).toBe(404)
      const error = await response.json()
      expect(error.detail).toBe('Property not found')
    })

    it('returns 204 with no content on success', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/properties`)
      const listData = await listResponse.json()
      const propertyId = listData.data[0].id

      const response = await fetch(
        `${API_BASE}/api/v1/properties/${propertyId}`,
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
    it('resetPropertiesStore creates 5 default properties', async () => {
      resetPropertiesStore()

      const response = await fetch(`${API_BASE}/api/v1/properties`)
      const data = await response.json()

      expect(data.data.length).toBe(5)
      expect(data.count).toBe(5)
    })
  })
})
