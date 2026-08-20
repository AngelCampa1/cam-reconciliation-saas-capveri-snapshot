/**
 * Tests for Lease Zod schemas.
 *
 * Tests match backend/tests/test_lease.py behavior.
 */

import { describe, expect, it } from 'vitest'

import {
  isValidLeaseStatus,
  LeaseCreateSchema,
  LeaseSchema,
  LeaseSummarySchema,
  LeaseUpdateSchema,
} from './lease'

// Helper to create a valid recovery profile
const createValidRecoveryProfile = () => ({
  pro_rata_share: '0.05',
  base_year: 2024,
  base_year_amount: '50000.00',
  gross_up_base_year: false,
  cap_type: 'none' as const,
  admin_fee_percentage: '0.15',
  excluded_pools: [],
})

// Helper to generate a UUID
const uuid = () => crypto.randomUUID()

describe('LeaseSchema', () => {
  describe('valid leases', () => {
    it('should accept lease with all fields', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        unit_id: uuid(),
        tenant_name: 'Acme Corporation',
        start_date: '2024-01-01',
        end_date: '2027-12-31',
        status: 'active',
        recovery_profile: createValidRecoveryProfile(),
        document_url: 'https://s3.amazonaws.com/bucket/lease.pdf',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = LeaseSchema.parse(data)
      expect(result.tenant_name).toBe('Acme Corporation')
      expect(result.status).toBe('active')
      expect(result.recovery_profile.pro_rata_share).toBe('0.05')
    })

    it('should accept lease with minimal fields', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'Minimal Tenant',
        start_date: '2024-01-01',
        end_date: '2025-01-02',
        recovery_profile: createValidRecoveryProfile(),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = LeaseSchema.parse(data)
      expect(result.unit_id).toBeUndefined()
      expect(result.status).toBe('draft')
      expect(result.document_url).toBeUndefined()
    })

    it('should accept null unit_id', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        unit_id: null,
        tenant_name: 'Multi-Unit Tenant',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: createValidRecoveryProfile(),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = LeaseSchema.parse(data)
      expect(result.unit_id).toBeNull()
    })

    it('should accept null document_url', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'No Doc Tenant',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: createValidRecoveryProfile(),
        document_url: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = LeaseSchema.parse(data)
      expect(result.document_url).toBeNull()
    })
  })

  describe('tenant_name validation', () => {
    it('should reject empty tenant_name', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: '',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: createValidRecoveryProfile(),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => LeaseSchema.parse(data)).toThrow()
    })

    it('should reject tenant_name over 255 characters', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'A'.repeat(256),
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: createValidRecoveryProfile(),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => LeaseSchema.parse(data)).toThrow()
    })

    it('should accept tenant_name at exactly 255 characters', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'A'.repeat(255),
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: createValidRecoveryProfile(),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = LeaseSchema.parse(data)
      expect(result.tenant_name.length).toBe(255)
    })
  })

  describe('date validation', () => {
    it('should accept end_date after start_date', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'Valid Dates Tenant',
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        recovery_profile: createValidRecoveryProfile(),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = LeaseSchema.parse(data)
      expect(new Date(result.end_date) > new Date(result.start_date)).toBe(true)
    })

    it('should reject end_date equal to start_date', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'Same Date Tenant',
        start_date: '2024-06-15',
        end_date: '2024-06-15',
        recovery_profile: createValidRecoveryProfile(),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => LeaseSchema.parse(data)).toThrow(
        /end date must be after start date/i
      )
    })

    it('should reject end_date before start_date', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'Reversed Date Tenant',
        start_date: '2024-12-31',
        end_date: '2024-01-01',
        recovery_profile: createValidRecoveryProfile(),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => LeaseSchema.parse(data)).toThrow(
        /end date must be after start date/i
      )
    })

    it('should accept one-day lease', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'Short Term Tenant',
        start_date: '2024-06-15',
        end_date: '2024-06-16',
        recovery_profile: createValidRecoveryProfile(),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = LeaseSchema.parse(data)
      expect(result.start_date).toBe('2024-06-15')
      expect(result.end_date).toBe('2024-06-16')
    })

    it('should accept multi-year lease', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'Long Term Tenant',
        start_date: '2020-01-01',
        end_date: '2035-12-31',
        recovery_profile: createValidRecoveryProfile(),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = LeaseSchema.parse(data)
      expect(result.start_date).toBe('2020-01-01')
      expect(result.end_date).toBe('2035-12-31')
    })
  })

  describe('status validation', () => {
    it('should accept all valid statuses', () => {
      const statuses = ['draft', 'active', 'expired', 'terminated'] as const
      for (const status of statuses) {
        const data = {
          id: uuid(),
          property_id: uuid(),
          tenant_name: `Tenant with ${status}`,
          start_date: '2024-01-01',
          end_date: '2025-12-31',
          status,
          recovery_profile: createValidRecoveryProfile(),
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        }
        const result = LeaseSchema.parse(data)
        expect(result.status).toBe(status)
      }
    })

    it('should default status to draft', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'New Tenant',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: createValidRecoveryProfile(),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = LeaseSchema.parse(data)
      expect(result.status).toBe('draft')
    })

    it('should reject invalid status', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'Invalid Status Tenant',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        status: 'invalid_status',
        recovery_profile: createValidRecoveryProfile(),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => LeaseSchema.parse(data)).toThrow()
    })
  })

  describe('embedded recovery_profile', () => {
    it('should require recovery_profile', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'No Profile Tenant',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => LeaseSchema.parse(data)).toThrow()
    })

    it('should validate recovery_profile with cap type', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'Capped Tenant',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: {
          pro_rata_share: '0.08',
          cap_type: 'cumulative',
          cap_rate: '0.05',
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = LeaseSchema.parse(data)
      expect(result.recovery_profile.cap_type).toBe('cumulative')
      expect(result.recovery_profile.cap_rate).toBe('0.05')
    })

    it('should validate recovery_profile with exclusions', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'Exclusions Tenant',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: {
          pro_rata_share: '0.10',
          excluded_pools: ['capital', 'other'],
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = LeaseSchema.parse(data)
      expect(result.recovery_profile.excluded_pools).toContain('capital')
      expect(result.recovery_profile.excluded_pools).toContain('other')
    })

    it('should reject invalid recovery_profile (cap_type without cap_rate)', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'Invalid Profile Tenant',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: {
          pro_rata_share: '0.05',
          cap_type: 'cumulative',
          // Missing cap_rate
        },
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => LeaseSchema.parse(data)).toThrow(/cap rate is required/i)
    })
  })

  describe('document_url validation', () => {
    it('should accept valid URL', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'S3 Doc Tenant',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: createValidRecoveryProfile(),
        document_url: 'https://my-bucket.s3.amazonaws.com/leases/doc.pdf',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = LeaseSchema.parse(data)
      expect(result.document_url).toContain('s3.amazonaws.com')
    })

    it('should accept URL at exactly 2048 characters', () => {
      const baseUrl = 'https://example.com/'
      const path = 'x'.repeat(2048 - baseUrl.length)
      const longUrl = baseUrl + path

      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'Long URL Tenant',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: createValidRecoveryProfile(),
        document_url: longUrl,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = LeaseSchema.parse(data)
      expect(result.document_url?.length).toBe(2048)
    })

    it('should reject URL over 2048 characters', () => {
      const longUrl = 'https://example.com/' + 'x'.repeat(2040)

      const data = {
        id: uuid(),
        property_id: uuid(),
        tenant_name: 'Too Long URL Tenant',
        start_date: '2024-01-01',
        end_date: '2025-12-31',
        recovery_profile: createValidRecoveryProfile(),
        document_url: longUrl,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => LeaseSchema.parse(data)).toThrow()
    })
  })
})

describe('LeaseCreateSchema', () => {
  it('should accept create with all fields', () => {
    const data = {
      property_id: uuid(),
      unit_id: uuid(),
      tenant_name: 'New Tenant Inc.',
      start_date: '2024-01-01',
      end_date: '2027-12-31',
      status: 'active',
      recovery_profile: createValidRecoveryProfile(),
      document_url: 'https://example.com/lease.pdf',
    }
    const result = LeaseCreateSchema.parse(data)
    expect(result.tenant_name).toBe('New Tenant Inc.')
    expect(result.status).toBe('active')
  })

  it('should accept create with minimal fields', () => {
    const data = {
      property_id: uuid(),
      tenant_name: 'Minimal Tenant',
      start_date: '2024-01-01',
      end_date: '2025-12-31',
      recovery_profile: createValidRecoveryProfile(),
    }
    const result = LeaseCreateSchema.parse(data)
    expect(result.unit_id).toBeUndefined()
    expect(result.status).toBe('draft')
    expect(result.document_url).toBeUndefined()
  })

  it('should validate dates (end > start)', () => {
    const data = {
      property_id: uuid(),
      tenant_name: 'Invalid Date Tenant',
      start_date: '2024-12-31',
      end_date: '2024-01-01',
      recovery_profile: createValidRecoveryProfile(),
    }
    expect(() => LeaseCreateSchema.parse(data)).toThrow(
      /end date must be after start date/i
    )
  })

  it('should require property_id', () => {
    const data = {
      tenant_name: 'No Property Tenant',
      start_date: '2024-01-01',
      end_date: '2025-12-31',
      recovery_profile: createValidRecoveryProfile(),
    }
    expect(() => LeaseCreateSchema.parse(data)).toThrow()
  })
})

describe('LeaseUpdateSchema', () => {
  it('should accept empty update (all optional)', () => {
    const data = {}
    const result = LeaseUpdateSchema.parse(data)
    expect(result).toEqual({})
  })

  it('should accept partial update with tenant_name only', () => {
    const data = {
      tenant_name: 'Updated Tenant Name',
    }
    const result = LeaseUpdateSchema.parse(data)
    expect(result.tenant_name).toBe('Updated Tenant Name')
    expect(result.status).toBeUndefined()
  })

  it('should accept partial update with status only', () => {
    const data = {
      status: 'terminated',
    }
    const result = LeaseUpdateSchema.parse(data)
    expect(result.status).toBe('terminated')
    expect(result.tenant_name).toBeUndefined()
  })

  it('should accept partial update with recovery_profile', () => {
    const data = {
      recovery_profile: {
        pro_rata_share: '0.08',
      },
    }
    const result = LeaseUpdateSchema.parse(data)
    expect(result.recovery_profile?.pro_rata_share).toBe('0.08')
  })

  it('should validate tenant_name constraints', () => {
    expect(() => LeaseUpdateSchema.parse({ tenant_name: '' })).toThrow()
    expect(() =>
      LeaseUpdateSchema.parse({ tenant_name: 'A'.repeat(256) })
    ).toThrow()
  })

  it('should NOT cross-validate dates (deferred to service)', () => {
    // This should not throw - cross-validation deferred to service layer
    const data = {
      start_date: '2025-12-31',
      end_date: '2024-01-01',
    }
    const result = LeaseUpdateSchema.parse(data)
    expect(result.start_date).toBe('2025-12-31')
    expect(result.end_date).toBe('2024-01-01')
  })

  it('should accept null values for nullable fields', () => {
    const data = {
      unit_id: null,
      document_url: null,
    }
    const result = LeaseUpdateSchema.parse(data)
    expect(result.unit_id).toBeNull()
    expect(result.document_url).toBeNull()
  })

  it('should accept full update', () => {
    const data = {
      tenant_name: 'Fully Updated Tenant',
      start_date: '2025-01-01',
      end_date: '2028-12-31',
      status: 'active',
      recovery_profile: {
        pro_rata_share: '0.10',
        cap_type: 'non_cumulative',
        cap_rate: '0.03',
      },
      unit_id: uuid(),
      document_url: 'https://example.com/updated.pdf',
    }
    const result = LeaseUpdateSchema.parse(data)
    expect(result.tenant_name).toBe('Fully Updated Tenant')
    expect(result.status).toBe('active')
  })
})

describe('LeaseSummarySchema', () => {
  it('should accept summary with all fields', () => {
    const data = {
      id: uuid(),
      property_id: uuid(),
      unit_id: uuid(),
      tenant_name: 'Summary Tenant',
      start_date: '2024-01-01',
      end_date: '2025-12-31',
      status: 'active',
    }
    const result = LeaseSummarySchema.parse(data)
    expect(result.tenant_name).toBe('Summary Tenant')
    expect(result.status).toBe('active')
  })

  it('should accept summary with null unit_id', () => {
    const data = {
      id: uuid(),
      property_id: uuid(),
      unit_id: null,
      tenant_name: 'No Unit Tenant',
      start_date: '2024-01-01',
      end_date: '2025-12-31',
      status: 'draft',
    }
    const result = LeaseSummarySchema.parse(data)
    expect(result.unit_id).toBeNull()
  })

  it('should accept summary without unit_id', () => {
    const data = {
      id: uuid(),
      property_id: uuid(),
      tenant_name: 'Minimal Summary Tenant',
      start_date: '2024-01-01',
      end_date: '2025-12-31',
      status: 'draft',
    }
    const result = LeaseSummarySchema.parse(data)
    expect(result.unit_id).toBeUndefined()
  })
})

describe('helper functions', () => {
  describe('isValidLeaseStatus', () => {
    it('should return true for valid statuses', () => {
      expect(isValidLeaseStatus('draft')).toBe(true)
      expect(isValidLeaseStatus('active')).toBe(true)
      expect(isValidLeaseStatus('expired')).toBe(true)
      expect(isValidLeaseStatus('terminated')).toBe(true)
    })

    it('should return false for invalid statuses', () => {
      expect(isValidLeaseStatus('invalid')).toBe(false)
      expect(isValidLeaseStatus('')).toBe(false)
      expect(isValidLeaseStatus('DRAFT')).toBe(false) // case sensitive
      expect(isValidLeaseStatus('Active')).toBe(false)
    })
  })
})

describe('type inference', () => {
  it('should correctly infer Lease type', () => {
    const lease = LeaseSchema.parse({
      id: uuid(),
      property_id: uuid(),
      tenant_name: 'Type Test Tenant',
      start_date: '2024-01-01',
      end_date: '2025-12-31',
      status: 'active',
      recovery_profile: createValidRecoveryProfile(),
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })

    // TypeScript compile-time check - these assignments should work
    const _id: string = lease.id
    const _tenantName: string = lease.tenant_name
    const _status: string = lease.status
    const _proRataShare: string = lease.recovery_profile.pro_rata_share

    expect(_id).toBeTruthy()
    expect(_tenantName).toBe('Type Test Tenant')
    expect(_status).toBe('active')
    expect(_proRataShare).toBe('0.05')
  })
})
