/**
 * Schema synchronization tests.
 *
 * Ensures Zod and Pydantic schemas accept the same inputs.
 * These tests validate that frontend Zod schemas can parse
 * JSON data in the same format that backend Pydantic models generate.
 *
 * This catches schema drift before deployment.
 */

import { describe, expect, it } from 'vitest'

import {
  CalculationStepSchema,
  CapTypeSchema,
  ErrorResponseSchema,
  ExpensePoolSchema,
  GLEntrySchema,
  LeaseRecoveryProfileSchema,
  LeaseSchema,
  LeaseStatusSchema,
  OrganizationSchema,
  PoolMappingSchema,
  PropertySchema,
  ReconciliationSnapshotSchema,
  SuccessResponseSchema,
  UnitSchema,
  UnitStatusSchema,
  UserRoleSchema,
  UserSchema,
  createPaginatedSchema,
} from '../types'

// ============================================================================
// Test Helper: Simulated Backend Data
// ============================================================================

/**
 * These objects simulate JSON output from Pydantic models.
 * They use the exact format that model_dump_json() produces:
 * - Decimals as strings
 * - Dates as ISO strings (YYYY-MM-DD)
 * - Datetimes as ISO strings with timezone
 * - UUIDs as hyphenated strings
 * - Enums as lowercase strings
 */

const sampleUuid1 = '550e8400-e29b-41d4-a716-446655440000'
const sampleUuid2 = '550e8400-e29b-41d4-a716-446655440001'
const sampleUuid3 = '550e8400-e29b-41d4-a716-446655440002'

// ============================================================================
// Organization Schema Sync Tests
// ============================================================================

describe('OrganizationSchemaSync', () => {
  it('should validate organization data from backend', () => {
    const backendData = {
      id: sampleUuid1,
      name: 'Test Organization',
      subscription_status: 'active',
      settings: {
        timezone: 'America/New_York',
        default_currency: 'USD',
        fiscal_year_end_month: 12,
      },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = OrganizationSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Test Organization')
      expect(result.data.settings.timezone).toBe('America/New_York')
    }
  })

  it('should validate organization with all settings', () => {
    const backendData = {
      id: sampleUuid1,
      name: 'Full Settings Org',
      subscription_status: 'trial',
      settings: {
        timezone: 'Europe/London',
        default_currency: 'GBP',
        fiscal_year_end_month: 3,
      },
      created_at: '2024-06-15T12:30:00Z',
      updated_at: '2024-06-15T12:30:00Z',
    }

    const result = OrganizationSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.settings.fiscal_year_end_month).toBe(3)
    }
  })
})

// ============================================================================
// User Schema Sync Tests
// ============================================================================

describe('UserSchemaSync', () => {
  it('should validate user data from backend', () => {
    const backendData = {
      id: sampleUuid1,
      organization_id: sampleUuid2,
      email: 'user@example.com',
      full_name: 'Test User',
      role: 'member',
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = UserSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('user@example.com')
      expect(result.data.role).toBe('member')
    }
  })

  it('should validate all user roles', () => {
    const roles = ['owner', 'admin', 'member', 'viewer']

    for (const role of roles) {
      const result = UserRoleSchema.safeParse(role)
      expect(result.success).toBe(true)
    }
  })

  it('should reject invalid role', () => {
    const result = UserRoleSchema.safeParse('superuser')
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// Property Schema Sync Tests
// ============================================================================

describe('PropertySchemaSync', () => {
  it('should validate property data from backend', () => {
    const backendData = {
      id: sampleUuid1,
      organization_id: sampleUuid2,
      name: 'Test Property',
      address_line1: '123 Main St',
      address_line2: null,
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      total_rentable_sqft: '50000.00',
      total_usable_sqft: '45000.00',
      common_area_sqft: '5000.00',
      target_occupancy: '0.95',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = PropertySchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Test Property')
      expect(result.data.total_rentable_sqft).toBe('50000.00')
    }
  })

  it('should validate property with decimal precision', () => {
    const backendData = {
      id: sampleUuid1,
      organization_id: sampleUuid2,
      name: 'Precise Property',
      address_line1: '456 Oak Ave',
      address_line2: 'Suite 100',
      city: 'Los Angeles',
      state: 'CA',
      postal_code: '90001',
      total_rentable_sqft: '123456.789',
      total_usable_sqft: '110000.5',
      common_area_sqft: '13456.289',
      target_occupancy: '0.9375',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = PropertySchema.safeParse(backendData)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// Unit Schema Sync Tests
// ============================================================================

describe('UnitSchemaSync', () => {
  it('should validate unit data from backend', () => {
    const backendData = {
      id: sampleUuid1,
      property_id: sampleUuid2,
      unit_number: 'Suite 100',
      floor: 1,
      rentable_sqft: '2500.00',
      usable_sqft: '2300.00',
      status: 'occupied',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = UnitSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.unit_number).toBe('Suite 100')
      expect(result.data.status).toBe('occupied')
    }
  })

  it('should validate all unit statuses', () => {
    const statuses = ['vacant', 'occupied', 'under_renovation']

    for (const status of statuses) {
      const result = UnitStatusSchema.safeParse(status)
      expect(result.success).toBe(true)
    }
  })
})

// ============================================================================
// LeaseRecoveryProfile Schema Sync Tests
// ============================================================================

describe('LeaseRecoveryProfileSchemaSync', () => {
  it('should validate recovery profile from backend', () => {
    const backendData = {
      base_year: 2023,
      base_year_amount: '100000.00',
      gross_up_base_year: true,
      pro_rata_share: '0.05',
      cap_type: 'cumulative',
      cap_rate: '0.05',
      admin_fee_percentage: '0.15',
      excluded_pools: ['capital'],
    }

    const result = LeaseRecoveryProfileSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.cap_type).toBe('cumulative')
      expect(result.data.pro_rata_share).toBe('0.05')
    }
  })

  it('should validate all cap types', () => {
    const capTypes = [
      'none',
      'non_cumulative',
      'cumulative',
      'cumulative_compounding',
    ]

    for (const capType of capTypes) {
      const result = CapTypeSchema.safeParse(capType)
      expect(result.success).toBe(true)
    }
  })

  it('should validate recovery profile without cap', () => {
    const backendData = {
      base_year: null,
      base_year_amount: null,
      gross_up_base_year: false,
      pro_rata_share: '0.10',
      cap_type: 'none',
      cap_rate: null,
      admin_fee_percentage: '0',
      excluded_pools: [],
    }

    const result = LeaseRecoveryProfileSchema.safeParse(backendData)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// Lease Schema Sync Tests
// ============================================================================

describe('LeaseSchemaSync', () => {
  it('should validate lease with recovery profile from backend', () => {
    const backendData = {
      id: sampleUuid1,
      property_id: sampleUuid2,
      unit_id: null,
      tenant_name: 'Acme Corp',
      start_date: '2024-01-01',
      end_date: '2029-12-31',
      status: 'active',
      recovery_profile: {
        base_year: 2023,
        base_year_amount: '100000.00',
        gross_up_base_year: true,
        pro_rata_share: '0.05',
        cap_type: 'cumulative',
        cap_rate: '0.05',
        admin_fee_percentage: '0.15',
        excluded_pools: [],
      },
      document_url: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = LeaseSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tenant_name).toBe('Acme Corp')
      expect(result.data.recovery_profile.cap_type).toBe('cumulative')
    }
  })

  it('should validate all lease statuses', () => {
    const statuses = ['draft', 'active', 'expired', 'terminated']

    for (const status of statuses) {
      const result = LeaseStatusSchema.safeParse(status)
      expect(result.success).toBe(true)
    }
  })
})

// ============================================================================
// GLEntry Schema Sync Tests
// ============================================================================

describe('GLEntrySchemaSync', () => {
  it('should validate GL entry from backend', () => {
    const backendData = {
      id: sampleUuid1,
      import_batch_id: sampleUuid3,
      property_id: sampleUuid2,
      account_code: '6000',
      account_description: 'Janitorial Services',
      amount: '15000.00',
      transaction_date: '2024-06-15',
      period_year: 2024,
      period_month: 6,
      vendor_name: 'ABC Cleaning Co',
      description: 'Monthly janitorial service',
      raw_row_data: { original_ref: 'JE-001' },
      created_at: '2024-01-01T00:00:00Z',
    }

    const result = GLEntrySchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.account_code).toBe('6000')
      expect(result.data.amount).toBe('15000.00')
    }
  })

  it('should validate GL entry with credit amount', () => {
    const backendData = {
      id: sampleUuid1,
      import_batch_id: sampleUuid3,
      property_id: sampleUuid2,
      account_code: '4000',
      account_description: 'Revenue',
      amount: '-5000.00',
      transaction_date: '2024-12-31',
      period_year: 2024,
      period_month: 12,
      vendor_name: null,
      description: 'Year-end adjustment',
      raw_row_data: {},
      created_at: '2024-12-31T23:59:59Z',
    }

    const result = GLEntrySchema.safeParse(backendData)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// ExpensePool Schema Sync Tests
// ============================================================================

describe('ExpensePoolSchemaSync', () => {
  it('should validate expense pool from backend', () => {
    const backendData = {
      id: sampleUuid1,
      property_id: sampleUuid2,
      name: 'Operating Expenses',
      pool_type: 'operating',
      is_gross_up_applicable: true,
      description: 'General operating expenses',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = ExpensePoolSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pool_type).toBe('operating')
      expect(result.data.is_gross_up_applicable).toBe(true)
    }
  })

  it('should validate expense pool without gross up', () => {
    const backendData = {
      id: sampleUuid1,
      property_id: sampleUuid2,
      name: 'Property Taxes',
      pool_type: 'tax',
      is_gross_up_applicable: false,
      description: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = ExpensePoolSchema.safeParse(backendData)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// PoolMapping Schema Sync Tests
// ============================================================================

describe('PoolMappingSchemaSync', () => {
  it('should validate pool mapping from backend', () => {
    const backendData = {
      id: sampleUuid1,
      expense_pool_id: sampleUuid2,
      gl_account_pattern: '6*',
      allocation_percentage: '1.00',
      priority: 0,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = PoolMappingSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.gl_account_pattern).toBe('6*')
      expect(result.data.allocation_percentage).toBe('1.00')
    }
  })

  it('should validate pool mapping with partial allocation', () => {
    const backendData = {
      id: sampleUuid1,
      expense_pool_id: sampleUuid2,
      gl_account_pattern: '6100-6199',
      allocation_percentage: '0.50',
      priority: 10,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = PoolMappingSchema.safeParse(backendData)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// ReconciliationSnapshot Schema Sync Tests
// ============================================================================

describe('ReconciliationSnapshotSchemaSync', () => {
  it('should validate reconciliation snapshot from backend', () => {
    const backendData = {
      id: sampleUuid1,
      property_id: sampleUuid2,
      lease_id: sampleUuid3,
      period_start_date: '2024-01-01',
      period_end_date: '2024-12-31',
      status: 'draft',
      total_operating_expenses: '500000.00',
      grossed_up_expenses: '520000.00',
      base_year_amount: '450000.00',
      tenant_share_before_cap: '55000.00',
      tenant_share_after_cap: '52000.00',
      admin_fee: '7800.00',
      total_recovery: '59800.00',
      calculation_trace: [],
      finalized_at: null,
      finalized_by_user_id: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = ReconciliationSnapshotSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('draft')
      expect(result.data.total_recovery).toBe('59800.00')
    }
  })

  it('should validate finalized snapshot', () => {
    const backendData = {
      id: sampleUuid1,
      property_id: sampleUuid2,
      lease_id: sampleUuid3,
      period_start_date: '2024-01-01',
      period_end_date: '2024-12-31',
      status: 'finalized',
      total_operating_expenses: '500000.00',
      grossed_up_expenses: '520000.00',
      base_year_amount: '450000.00',
      tenant_share_before_cap: '55000.00',
      tenant_share_after_cap: '52000.00',
      admin_fee: '7800.00',
      total_recovery: '59800.00',
      calculation_trace: [{ step: 'gross_up', value: '520000.00' }],
      finalized_at: '2024-12-31T23:59:59Z',
      finalized_by_user_id: sampleUuid1,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-12-31T23:59:59Z',
    }

    const result = ReconciliationSnapshotSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.status).toBe('finalized')
      expect(result.data.finalized_at).toBe('2024-12-31T23:59:59Z')
    }
  })
})

// ============================================================================
// CalculationStep Schema Sync Tests
// ============================================================================

describe('CalculationStepSchemaSync', () => {
  it('should validate calculation step from backend', () => {
    const backendData = {
      step_order: 1,
      step_name: 'calculate_gross_up',
      input_values: {
        actual_expenses: '500000.00',
        occupancy: '0.85',
        target_occupancy: '0.95',
      },
      operation: 'actual_expenses * (target_occupancy / occupancy)',
      output_value: '558823.53',
      note: null,
    }

    const result = CalculationStepSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.step_name).toBe('calculate_gross_up')
      expect(result.data.output_value).toBe('558823.53')
    }
  })

  it('should validate calculation step with dict output', () => {
    const backendData = {
      step_order: 2,
      step_name: 'apply_cap',
      input_values: {
        tenant_share: '55000.00',
        cap_rate: '0.05',
        prior_year_amount: '50000.00',
      },
      operation: 'min(tenant_share, prior_year_amount * (1 + cap_rate))',
      output_value: {
        capped_amount: '52500.00',
        cap_applied: true,
        excess: '2500.00',
      },
      note: 'Cap was applied',
    }

    const result = CalculationStepSchema.safeParse(backendData)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// API Response Schema Sync Tests
// ============================================================================

describe('APIResponseSchemaSync', () => {
  it('should validate paginated response from backend', () => {
    const PropertyPaginatedSchema = createPaginatedSchema(PropertySchema)

    const backendData = {
      items: [
        {
          id: sampleUuid1,
          organization_id: sampleUuid2,
          name: 'Property 1',
          address_line1: '123 Main St',
          address_line2: null,
          city: 'New York',
          state: 'NY',
          postal_code: '10001',
          total_rentable_sqft: '50000.00',
          total_usable_sqft: '45000.00',
          common_area_sqft: '5000.00',
          target_occupancy: '0.95',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
      has_next: false,
      has_previous: false,
    }

    const result = PropertyPaginatedSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.total).toBe(1)
      expect(result.data.has_next).toBe(false)
    }
  })

  it('should validate error response from backend', () => {
    const backendData = {
      error: 'VALIDATION_ERROR',
      message: 'Invalid input data',
      details: {
        email: ['Invalid email format'],
        name: ['Name is required'],
      },
    }

    const result = ErrorResponseSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.error).toBe('VALIDATION_ERROR')
    }
  })

  it('should validate success response from backend', () => {
    const backendData = {
      message: 'Record deleted successfully',
      data: { id: sampleUuid1 },
    }

    const result = SuccessResponseSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message).toBe('Record deleted successfully')
    }
  })
})

// ============================================================================
// Decimal Serialization Tests
// ============================================================================

describe('DecimalSerializationSync', () => {
  it('should parse decimal strings from backend', () => {
    const backendData = {
      id: sampleUuid1,
      property_id: sampleUuid2,
      name: 'Test Pool',
      pool_type: 'operating',
      is_gross_up_applicable: true,
      description: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = ExpensePoolSchema.safeParse(backendData)
    expect(result.success).toBe(true)
  })

  it('should handle high precision decimals', () => {
    const backendData = {
      id: sampleUuid1,
      organization_id: sampleUuid2,
      name: 'Precision Test',
      address_line1: '123 Main St',
      address_line2: null,
      city: 'New York',
      state: 'NY',
      postal_code: '10001',
      total_rentable_sqft: '123456.789012345',
      total_usable_sqft: '100000.123456789',
      common_area_sqft: '23456.665555556',
      target_occupancy: '0.9500000001',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = PropertySchema.safeParse(backendData)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// DateTime Serialization Tests
// ============================================================================

describe('DateTimeSerializationSync', () => {
  it('should parse ISO date strings', () => {
    const backendData = {
      id: sampleUuid1,
      property_id: sampleUuid2,
      unit_id: null,
      tenant_name: 'Test Tenant',
      start_date: '2024-01-01',
      end_date: '2029-12-31',
      status: 'active',
      recovery_profile: {
        base_year: null,
        base_year_amount: null,
        gross_up_base_year: false,
        pro_rata_share: '0.10',
        cap_type: 'none',
        cap_rate: null,
        admin_fee_percentage: '0',
        excluded_pools: [],
      },
      document_url: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = LeaseSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.start_date).toBe('2024-01-01')
      expect(result.data.end_date).toBe('2029-12-31')
    }
  })

  it('should parse datetime with timezone', () => {
    const backendData = {
      id: sampleUuid1,
      name: 'Test Org',
      subscription_status: 'active',
      settings: {
        timezone: 'UTC',
        default_currency: 'USD',
        fiscal_year_end_month: 12,
      },
      created_at: '2024-06-15T14:30:45.123456Z',
      updated_at: '2024-06-15T14:30:45.123456Z',
    }

    const result = OrganizationSchema.safeParse(backendData)
    expect(result.success).toBe(true)
  })
})

// ============================================================================
// UUID Serialization Tests
// ============================================================================

describe('UUIDSerializationSync', () => {
  it('should parse hyphenated UUID strings', () => {
    const backendData = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      organization_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      email: 'test@example.com',
      full_name: 'Test User',
      role: 'member',
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = UserSchema.safeParse(backendData)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe('550e8400-e29b-41d4-a716-446655440000')
    }
  })

  it('should reject invalid UUID format', () => {
    const backendData = {
      id: 'invalid-uuid',
      organization_id: sampleUuid2,
      email: 'test@example.com',
      full_name: 'Test User',
      role: 'member',
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = UserSchema.safeParse(backendData)
    expect(result.success).toBe(false)
  })
})

// ============================================================================
// Enum Serialization Tests
// ============================================================================

describe('EnumSerializationSync', () => {
  it('should parse lowercase enum values', () => {
    // Test various enums
    expect(UserRoleSchema.safeParse('owner').success).toBe(true)
    expect(UserRoleSchema.safeParse('admin').success).toBe(true)
    expect(UserRoleSchema.safeParse('member').success).toBe(true)
    expect(UserRoleSchema.safeParse('viewer').success).toBe(true)

    expect(LeaseStatusSchema.safeParse('draft').success).toBe(true)
    expect(LeaseStatusSchema.safeParse('active').success).toBe(true)
    expect(LeaseStatusSchema.safeParse('expired').success).toBe(true)
    expect(LeaseStatusSchema.safeParse('terminated').success).toBe(true)

    expect(UnitStatusSchema.safeParse('vacant').success).toBe(true)
    expect(UnitStatusSchema.safeParse('occupied').success).toBe(true)
    expect(UnitStatusSchema.safeParse('under_renovation').success).toBe(true)

    expect(CapTypeSchema.safeParse('none').success).toBe(true)
    expect(CapTypeSchema.safeParse('cumulative').success).toBe(true)
    expect(CapTypeSchema.safeParse('non_cumulative').success).toBe(true)
    expect(CapTypeSchema.safeParse('cumulative_compounding').success).toBe(true)
  })

  it('should reject uppercase enum values', () => {
    expect(UserRoleSchema.safeParse('OWNER').success).toBe(false)
    expect(LeaseStatusSchema.safeParse('ACTIVE').success).toBe(false)
    expect(CapTypeSchema.safeParse('CUMULATIVE').success).toBe(false)
  })
})

// ============================================================================
// Cross-Schema Validation Tests
// ============================================================================

describe('CrossSchemaValidationSync', () => {
  it('should validate complete property with units and leases', () => {
    // This test validates a realistic scenario where we parse
    // multiple related objects from a backend response

    const propertyData = {
      id: sampleUuid1,
      organization_id: sampleUuid2,
      name: 'Main Office Building',
      address_line1: '100 Corporate Drive',
      address_line2: null,
      city: 'San Francisco',
      state: 'CA',
      postal_code: '94105',
      total_rentable_sqft: '100000.00',
      total_usable_sqft: '90000.00',
      common_area_sqft: '10000.00',
      target_occupancy: '0.95',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const unitData = {
      id: sampleUuid3,
      property_id: sampleUuid1,
      unit_number: 'Suite 500',
      floor: 5,
      rentable_sqft: '5000.00',
      usable_sqft: '4500.00',
      status: 'occupied',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const leaseData = {
      id: '550e8400-e29b-41d4-a716-446655440004',
      property_id: sampleUuid1,
      unit_id: sampleUuid3,
      tenant_name: 'TechCorp Inc',
      start_date: '2024-01-01',
      end_date: '2029-12-31',
      status: 'active',
      recovery_profile: {
        base_year: 2023,
        base_year_amount: '250000.00',
        gross_up_base_year: true,
        pro_rata_share: '0.05',
        cap_type: 'cumulative',
        cap_rate: '0.05',
        admin_fee_percentage: '0.15',
        excluded_pools: [],
      },
      document_url: 'https://storage.example.com/leases/techcorp.pdf',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    expect(PropertySchema.safeParse(propertyData).success).toBe(true)
    expect(UnitSchema.safeParse(unitData).success).toBe(true)
    expect(LeaseSchema.safeParse(leaseData).success).toBe(true)
  })
})
