/**
 * Tests for lease factory functions
 *
 * Following test minimalism: Test factory logic, not faker internals.
 * Focus on override behavior and type correctness.
 */
import { describe, it, expect } from 'vitest'
import {
  createRecoveryProfile,
  createRecoveryProfileInput,
  createLease,
  createLeaseList,
  createLeaseCreate,
  createTestLease,
} from './lease'

describe('Lease Factories', () => {
  describe('createRecoveryProfile', () => {
    it('creates valid recovery profile with defaults', () => {
      const profile = createRecoveryProfile()

      expect(profile).toHaveProperty('pro_rata_share')
      expect(profile).toHaveProperty('cap_type')
      expect(profile).toHaveProperty('admin_fee_percentage', '0.15')
      expect(profile).toHaveProperty('excluded_pools')
      expect(Array.isArray(profile.excluded_pools)).toBe(true)
    })

    it('applies overrides correctly', () => {
      const profile = createRecoveryProfile({
        base_year: 2023,
        pro_rata_share: '0.1500',
        cap_type: 'cumulative',
        cap_rate: '0.0500',
      })

      expect(profile.base_year).toBe(2023)
      expect(profile.pro_rata_share).toBe('0.1500')
      expect(profile.cap_type).toBe('cumulative')
      expect(profile.cap_rate).toBe('0.0500')
    })

    it('handles nullable fields', () => {
      const profile = createRecoveryProfile()

      // These can be null
      expect(
        profile.base_year === null || typeof profile.base_year === 'number'
      ).toBe(true)
      expect(
        profile.base_year_amount === null ||
          typeof profile.base_year_amount === 'string'
      ).toBe(true)
      expect(
        profile.cap_rate === null || typeof profile.cap_rate === 'string'
      ).toBe(true)
    })
  })

  describe('createRecoveryProfileInput', () => {
    it('creates valid recovery profile input', () => {
      const input = createRecoveryProfileInput()

      expect(input).toHaveProperty('pro_rata_share')
      expect(input).toHaveProperty('cap_type')
      expect(input).toHaveProperty('admin_fee_percentage', '0.15')
      expect(Array.isArray(input.excluded_pools)).toBe(true)
    })

    it('applies overrides correctly', () => {
      const input = createRecoveryProfileInput({
        base_year: 2022,
        cap_type: 'non_cumulative',
      })

      expect(input.base_year).toBe(2022)
      expect(input.cap_type).toBe('non_cumulative')
    })
  })

  describe('createLease', () => {
    it('creates valid lease with required fields', () => {
      const lease = createLease()

      expect(lease.id).toBeTruthy()
      expect(lease.property_id).toBeTruthy()
      expect(lease.tenant_name).toBeTruthy()
      expect(lease.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/) // YYYY-MM-DD
      expect(lease.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(lease.status).toMatch(/^(draft|active|expired|terminated)$/)
      expect(lease.recovery_profile).toBeDefined()
    })

    it('applies overrides correctly', () => {
      const lease = createLease({
        id: 'custom-id',
        tenant_name: 'Custom Tenant',
        status: 'active',
      })

      expect(lease.id).toBe('custom-id')
      expect(lease.tenant_name).toBe('Custom Tenant')
      expect(lease.status).toBe('active')
    })

    it('handles optional fields correctly', () => {
      const lease = createLease()

      // unit_id and document_url can be null
      expect(lease.unit_id === null || typeof lease.unit_id === 'string').toBe(
        true
      )
      expect(
        lease.document_url === null || typeof lease.document_url === 'string'
      ).toBe(true)
    })
  })

  describe('createLeaseList', () => {
    it('creates list of specified size', () => {
      const leases = createLeaseList(5)
      expect(leases).toHaveLength(5)
    })

    it('creates default list of 10 leases', () => {
      const leases = createLeaseList()
      expect(leases).toHaveLength(10)
    })

    it('assigns same property_id when provided', () => {
      const propertyId = 'test-property-123'
      const leases = createLeaseList(3, propertyId)

      expect(leases).toHaveLength(3)
      expect(leases.every((l) => l.property_id === propertyId)).toBe(true)
    })

    it('creates empty list when count is 0', () => {
      const leases = createLeaseList(0)
      expect(leases).toHaveLength(0)
    })
  })

  describe('createLeaseCreate', () => {
    it('creates valid lease create DTO', () => {
      const dto = createLeaseCreate()

      expect(dto.property_id).toBeTruthy()
      expect(dto.tenant_name).toBeTruthy()
      expect(dto.start_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(dto.end_date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(dto.status).toBe('draft') // Default status
      expect(dto.recovery_profile).toBeDefined()
    })

    it('applies overrides correctly', () => {
      const dto = createLeaseCreate({
        property_id: 'prop-123',
        status: 'active',
      })

      expect(dto.property_id).toBe('prop-123')
      expect(dto.status).toBe('active')
    })
  })

  describe('createTestLease', () => {
    it('creates consistent test lease', () => {
      const lease1 = createTestLease()
      const lease2 = createTestLease()

      // Same IDs and values for consistency
      expect(lease1.id).toBe(lease2.id)
      expect(lease1.id).toBe('test-lease-abc')
      expect(lease1.property_id).toBe('test-property-123')
      expect(lease1.tenant_name).toBe('Test Tenant Inc.')
      expect(lease1.status).toBe('active')
    })

    it('uses custom property_id when provided', () => {
      const lease = createTestLease('custom-prop')
      expect(lease.property_id).toBe('custom-prop')
    })

    it('has predictable recovery profile', () => {
      const lease = createTestLease()

      expect(lease.recovery_profile.base_year).toBe(2024)
      expect(lease.recovery_profile.pro_rata_share).toBe('0.0500')
      expect(lease.recovery_profile.cap_type).toBe('cumulative')
      expect(lease.recovery_profile.cap_rate).toBe('0.0500')
    })
  })
})
