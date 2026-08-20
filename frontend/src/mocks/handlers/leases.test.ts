/**
 * Tests for MSW Leases Handlers
 *
 * Tests all lease CRUD operations and recovery profile management
 * to ensure mock API behaves correctly in tests.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { resetLeasesStore, seedLeasesForProperty } from './leases'
import type { LeaseCreate, LeaseUpdate } from '@/api/generated/types.gen'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// MSW server is already set up globally in setupTests.ts
// We just need to reset the leases store before each test

describe('MSW Leases Handlers', () => {
  beforeEach(() => {
    // Reset leases to default state (8 default leases)
    resetLeasesStore()
  })

  describe('GET /api/v1/leases - List Leases', () => {
    it('returns paginated leases list', async () => {
      const response = await fetch(`${API_BASE}/api/v1/leases`)
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.data).toBeInstanceOf(Array)
      expect(data.data.length).toBeGreaterThan(0)
      expect(data.count).toBeGreaterThan(0)
      expect(typeof data.has_more).toBe('boolean')
    })

    it('filters by property_id', async () => {
      const testPropertyId = 'prop-test-123'
      seedLeasesForProperty(testPropertyId, 3)

      const response = await fetch(
        `${API_BASE}/api/v1/leases?property_id=${testPropertyId}`
      )
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.data.length).toBe(3)
      expect(
        data.data.every((l: any) => l.property_id === testPropertyId)
      ).toBe(true)
    })

    it('supports pagination with skip and limit', async () => {
      const response = await fetch(`${API_BASE}/api/v1/leases?skip=2&limit=3`)
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.data.length).toBeLessThanOrEqual(3)
    })

    it('returns empty array when no leases match filter', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/leases?property_id=nonexistent`
      )
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.data).toEqual([])
      expect(data.count).toBe(0)
      expect(data.has_more).toBe(false)
    })

    it('sets has_more=true when more results exist', async () => {
      // Default store has 8 leases
      const response = await fetch(`${API_BASE}/api/v1/leases?skip=0&limit=5`)
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.has_more).toBe(true)
    })

    it('sets has_more=false when no more results', async () => {
      const response = await fetch(`${API_BASE}/api/v1/leases?skip=0&limit=20`)
      const data = await response.json()

      expect(response.ok).toBe(true)
      expect(data.has_more).toBe(false)
    })
  })

  describe('GET /api/v1/leases/:leaseId - Get Lease', () => {
    it('returns lease by ID', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/leases`)
      const listData = await listResponse.json()
      const leaseId = listData.data[0].id

      const response = await fetch(`${API_BASE}/api/v1/leases/${leaseId}`)
      const lease = await response.json()

      expect(response.ok).toBe(true)
      expect(lease.id).toBe(leaseId)
      expect(lease.property_id).toBeDefined()
      expect(lease.tenant_name).toBeDefined()
      expect(lease.recovery_profile).toBeDefined()
    })

    it('returns 404 when lease not found', async () => {
      const response = await fetch(`${API_BASE}/api/v1/leases/nonexistent-id`)
      const error = await response.json()

      expect(response.status).toBe(404)
      expect(error.detail).toBe('Lease not found')
    })
  })

  describe('POST /api/v1/leases - Create Lease', () => {
    it('creates new lease with valid data', async () => {
      const newLease: LeaseCreate = {
        property_id: 'prop-123',
        tenant_name: 'Acme Corp',
        start_date: '2024-01-01',
        end_date: '2026-12-31',
        recovery_profile: {
          pro_rata_share: 0.15,
          cap_type: 'cumulative',
          base_year: 2023,
        },
      }

      const response = await fetch(`${API_BASE}/api/v1/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLease),
      })

      const created = await response.json()

      expect(response.status).toBe(201)
      expect(created.id).toBeDefined()
      expect(created.property_id).toBe('prop-123')
      expect(created.tenant_name).toBe('Acme Corp')
      expect(created.start_date).toBe('2024-01-01')
      expect(created.end_date).toBe('2026-12-31')
      expect(created.recovery_profile.pro_rata_share).toBe('0.15')
      expect(created.recovery_profile.cap_type).toBe('cumulative')
      expect(created.recovery_profile.base_year).toBe(2023)
    })

    it('sets default status to draft', async () => {
      const newLease: LeaseCreate = {
        property_id: 'prop-123',
        tenant_name: 'Test Corp',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: {
          pro_rata_share: 0.1,
        },
      }

      const response = await fetch(`${API_BASE}/api/v1/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLease),
      })

      const created = await response.json()

      expect(created.status).toBe('draft')
    })

    it('accepts optional unit_id', async () => {
      const newLease: LeaseCreate = {
        property_id: 'prop-123',
        unit_id: 'unit-456',
        tenant_name: 'Test Corp',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: {
          pro_rata_share: 0.1,
        },
      }

      const response = await fetch(`${API_BASE}/api/v1/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLease),
      })

      const created = await response.json()

      expect(created.unit_id).toBe('unit-456')
    })

    it('sets default admin_fee_percentage to 0.15', async () => {
      const newLease: LeaseCreate = {
        property_id: 'prop-123',
        tenant_name: 'Test Corp',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: {
          pro_rata_share: 0.1,
        },
      }

      const response = await fetch(`${API_BASE}/api/v1/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLease),
      })

      const created = await response.json()

      expect(created.recovery_profile.admin_fee_percentage).toBe('0.15')
    })

    it('accepts custom recovery profile fields', async () => {
      const newLease: LeaseCreate = {
        property_id: 'prop-123',
        tenant_name: 'Test Corp',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: {
          pro_rata_share: 0.25,
          base_year: 2023,
          base_year_amount: 50000,
          gross_up_base_year: true,
          cap_type: 'cumulative_compounding',
          cap_rate: 0.03,
          admin_fee_percentage: 0.2,
          excluded_pools: ['pool-1', 'pool-2'],
        },
      }

      const response = await fetch(`${API_BASE}/api/v1/leases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLease),
      })

      const created = await response.json()

      expect(created.recovery_profile.pro_rata_share).toBe('0.25')
      expect(created.recovery_profile.base_year).toBe(2023)
      expect(created.recovery_profile.base_year_amount).toBe('50000')
      expect(created.recovery_profile.gross_up_base_year).toBe(true)
      expect(created.recovery_profile.cap_type).toBe('cumulative_compounding')
      expect(created.recovery_profile.cap_rate).toBe('0.03')
      expect(created.recovery_profile.admin_fee_percentage).toBe('0.2')
      expect(created.recovery_profile.excluded_pools).toEqual([
        'pool-1',
        'pool-2',
      ])
    })
  })

  describe('PUT /api/v1/leases/:leaseId - Update Lease', () => {
    it('updates existing lease', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/leases`)
      const listData = await listResponse.json()
      const leaseId = listData.data[0].id

      const update: LeaseUpdate = {
        tenant_name: 'Updated Corp',
        status: 'active',
      }

      const response = await fetch(`${API_BASE}/api/v1/leases/${leaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })

      const updated = await response.json()

      expect(response.ok).toBe(true)
      expect(updated.id).toBe(leaseId)
      expect(updated.tenant_name).toBe('Updated Corp')
      expect(updated.status).toBe('active')
    })

    it('returns 404 for non-existent lease', async () => {
      const update: LeaseUpdate = {
        tenant_name: 'Test',
      }

      const response = await fetch(`${API_BASE}/api/v1/leases/nonexistent-id`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })

      const error = await response.json()

      expect(response.status).toBe(404)
      expect(error.detail).toBe('Lease not found')
    })

    it('preserves unchanged fields', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/leases`)
      const listData = await listResponse.json()
      const original = listData.data[0]

      const update: LeaseUpdate = {
        tenant_name: 'Updated Name Only',
      }

      const response = await fetch(`${API_BASE}/api/v1/leases/${original.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })

      const updated = await response.json()

      expect(updated.tenant_name).toBe('Updated Name Only')
      expect(updated.start_date).toBe(original.start_date)
      expect(updated.end_date).toBe(original.end_date)
      expect(updated.property_id).toBe(original.property_id)
    })

    it('updates recovery profile fields', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/leases`)
      const listData = await listResponse.json()
      const leaseId = listData.data[0].id

      const update: LeaseUpdate = {
        recovery_profile: {
          pro_rata_share: 0.33,
          cap_type: 'non_cumulative',
          cap_rate: 0.05,
        },
      }

      const response = await fetch(`${API_BASE}/api/v1/leases/${leaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })

      const updated = await response.json()

      expect(updated.recovery_profile.pro_rata_share).toBe('0.33')
      expect(updated.recovery_profile.cap_type).toBe('non_cumulative')
      expect(updated.recovery_profile.cap_rate).toBe('0.05')
    })

    it('can set unit_id to null', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/leases`)
      const listData = await listResponse.json()
      const leaseId = listData.data[0].id

      const update: LeaseUpdate = {
        unit_id: null,
      }

      const response = await fetch(`${API_BASE}/api/v1/leases/${leaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })

      const updated = await response.json()

      expect(updated.unit_id).toBeNull()
    })

    it('updates updated_at timestamp', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/leases`)
      const listData = await listResponse.json()
      const original = listData.data[0]

      const update: LeaseUpdate = {
        tenant_name: 'Updated',
      }

      const response = await fetch(`${API_BASE}/api/v1/leases/${original.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      })

      const updated = await response.json()

      expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
        new Date(original.updated_at).getTime()
      )
    })
  })

  describe('DELETE /api/v1/leases/:leaseId - Delete Lease', () => {
    it('deletes lease by ID', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/leases`)
      const listData = await listResponse.json()
      const leaseId = listData.data[0].id

      const response = await fetch(`${API_BASE}/api/v1/leases/${leaseId}`, {
        method: 'DELETE',
      })

      expect(response.status).toBe(204)

      // Verify lease is deleted
      const getResponse = await fetch(`${API_BASE}/api/v1/leases/${leaseId}`)
      expect(getResponse.status).toBe(404)
    })

    it('returns 404 when lease not found', async () => {
      const response = await fetch(`${API_BASE}/api/v1/leases/nonexistent-id`, {
        method: 'DELETE',
      })

      const error = await response.json()

      expect(response.status).toBe(404)
      expect(error.detail).toBe('Lease not found')
    })
  })

  describe('GET /api/v1/leases/:leaseId/recovery-profile - Get Recovery Profile', () => {
    it('returns recovery profile for lease', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/leases`)
      const listData = await listResponse.json()
      const leaseId = listData.data[0].id

      const response = await fetch(
        `${API_BASE}/api/v1/leases/${leaseId}/recovery-profile`
      )
      const profile = await response.json()

      expect(response.ok).toBe(true)
      expect(profile.pro_rata_share).toBeDefined()
      expect(profile.cap_type).toBeDefined()
      expect(profile.admin_fee_percentage).toBeDefined()
    })

    it('returns 404 when lease not found', async () => {
      const response = await fetch(
        `${API_BASE}/api/v1/leases/nonexistent-id/recovery-profile`
      )
      const error = await response.json()

      expect(response.status).toBe(404)
      expect(error.detail).toBe('Lease not found')
    })
  })

  describe('PUT /api/v1/leases/:leaseId/recovery-profile - Update Recovery Profile', () => {
    it('updates recovery profile', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/leases`)
      const listData = await listResponse.json()
      const leaseId = listData.data[0].id

      const update = {
        pro_rata_share: 0.4,
        cap_type: 'cumulative',
        cap_rate: 0.04,
      }

      const response = await fetch(
        `${API_BASE}/api/v1/leases/${leaseId}/recovery-profile`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const updated = await response.json()

      expect(response.ok).toBe(true)
      expect(updated.recovery_profile.pro_rata_share).toBe('0.4')
      expect(updated.recovery_profile.cap_type).toBe('cumulative')
      expect(updated.recovery_profile.cap_rate).toBe('0.04')
    })

    it('returns 404 for non-existent lease', async () => {
      const update = {
        pro_rata_share: 0.5,
      }

      const response = await fetch(
        `${API_BASE}/api/v1/leases/nonexistent-id/recovery-profile`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const error = await response.json()

      expect(response.status).toBe(404)
      expect(error.detail).toBe('Lease not found')
    })

    it('preserves unchanged profile fields', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/leases`)
      const listData = await listResponse.json()
      const original = listData.data[0]

      const update = {
        cap_rate: 0.02,
      }

      const response = await fetch(
        `${API_BASE}/api/v1/leases/${original.id}/recovery-profile`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const updated = await response.json()

      expect(updated.recovery_profile.cap_rate).toBe('0.02')
      expect(updated.recovery_profile.pro_rata_share).toBe(
        original.recovery_profile.pro_rata_share
      )
      expect(updated.recovery_profile.cap_type).toBe(
        original.recovery_profile.cap_type
      )
    })

    it('returns full lease object, not just profile', async () => {
      const listResponse = await fetch(`${API_BASE}/api/v1/leases`)
      const listData = await listResponse.json()
      const leaseId = listData.data[0].id

      const update = {
        pro_rata_share: 0.3,
      }

      const response = await fetch(
        `${API_BASE}/api/v1/leases/${leaseId}/recovery-profile`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(update),
        }
      )

      const updated = await response.json()

      expect(updated.id).toBeDefined()
      expect(updated.property_id).toBeDefined()
      expect(updated.tenant_name).toBeDefined()
      expect(updated.recovery_profile).toBeDefined()
    })
  })

  describe('Store Helpers', () => {
    it('resetLeasesStore creates 8 default leases', async () => {
      resetLeasesStore()

      const response = await fetch(`${API_BASE}/api/v1/leases`)
      const data = await response.json()

      expect(data.data.length).toBe(8)
    })

    it('seedLeasesForProperty adds leases for specific property', async () => {
      resetLeasesStore()
      seedLeasesForProperty('custom-prop', 5)

      const response = await fetch(
        `${API_BASE}/api/v1/leases?property_id=custom-prop`
      )
      const data = await response.json()

      expect(data.data.length).toBe(5)
      expect(data.data.every((l: any) => l.property_id === 'custom-prop')).toBe(
        true
      )
    })
  })
})
