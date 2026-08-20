/**
 * Tests for PoolAllocation domain types
 *
 * Covers Zod schema validation for:
 * - PoolAllocation
 * - PoolAllocationCreate with type-specific validation
 * - PoolAllocationUpdate
 * - validateAllocationsSumTo100 function
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'

import {
  PoolAllocationSchema,
  PoolAllocationCreateSchema,
  PoolAllocationUpdateSchema,
  validateAllocationsSumTo100,
  type PoolAllocationCreate,
} from './pool-allocation'

describe('PoolAllocationSchema', () => {
  it('parses valid percentage allocation', () => {
    const data = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
      target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
      allocation_type: 'percentage',
      allocation_value: '50.00',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = PoolAllocationSchema.parse(data)
    expect(result.allocation_type).toBe('percentage')
    expect(result.allocation_value).toBe('50.00')
  })

  it('parses valid fixed amount allocation', () => {
    const data = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
      target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
      allocation_type: 'fixed_amount',
      allocation_value: '1000.00',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    const result = PoolAllocationSchema.parse(data)
    expect(result.allocation_type).toBe('fixed_amount')
    expect(result.allocation_value).toBe('1000.00')
  })

  it('rejects invalid allocation_type', () => {
    const data = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
      target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
      allocation_type: 'invalid_type',
      allocation_value: '50.00',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    }

    expect(() => PoolAllocationSchema.parse(data)).toThrow(z.ZodError)
  })
})

describe('PoolAllocationCreateSchema', () => {
  it('parses valid percentage allocation', () => {
    const data = {
      source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
      target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
      allocation_type: 'percentage',
      allocation_value: '25.50',
    }

    const result = PoolAllocationCreateSchema.parse(data)
    expect(result.allocation_value).toBe('25.50')
  })

  it('parses valid fixed amount allocation', () => {
    const data = {
      source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
      target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
      allocation_type: 'fixed_amount',
      allocation_value: '500.00',
    }

    const result = PoolAllocationCreateSchema.parse(data)
    expect(result.allocation_value).toBe('500.00')
  })

  it('rejects percentage allocation over 100', () => {
    const data = {
      source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
      target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
      allocation_type: 'percentage',
      allocation_value: '150',
    }

    expect(() => PoolAllocationCreateSchema.parse(data)).toThrow(z.ZodError)
  })

  it('rejects percentage allocation at 0', () => {
    const data = {
      source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
      target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
      allocation_type: 'percentage',
      allocation_value: '0',
    }

    expect(() => PoolAllocationCreateSchema.parse(data)).toThrow(z.ZodError)
  })

  it('accepts fixed amount allocation with any positive value', () => {
    const data = {
      source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
      target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
      allocation_type: 'fixed_amount',
      allocation_value: '5000.00',
    }

    const result = PoolAllocationCreateSchema.parse(data)
    expect(result.allocation_value).toBe('5000.00')
  })
})

describe('PoolAllocationUpdateSchema', () => {
  it('parses partial update with target_pool_id only', () => {
    const data = {
      target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
    }

    const result = PoolAllocationUpdateSchema.parse(data)
    expect(result.target_pool_id).toBe('550e8400-e29b-41d4-a716-446655440002')
  })

  it('parses partial update with allocation_type only', () => {
    const data = {
      allocation_type: 'fixed_amount',
    }

    const result = PoolAllocationUpdateSchema.parse(data)
    expect(result.allocation_type).toBe('fixed_amount')
  })

  it('parses partial update with allocation_value only', () => {
    const data = {
      allocation_value: '75.00',
    }

    const result = PoolAllocationUpdateSchema.parse(data)
    expect(result.allocation_value).toBe('75.00')
  })

  it('parses empty update', () => {
    const data = {}

    const result = PoolAllocationUpdateSchema.parse(data)
    expect(result).toEqual({})
  })
})

describe('validateAllocationsSumTo100', () => {
  it('returns valid for empty allocations list', () => {
    const result = validateAllocationsSumTo100([])
    expect(result.isValid).toBe(true)
    expect(result.error).toBe('')
  })

  it('returns valid for only fixed amount allocations', () => {
    const allocations: PoolAllocationCreate[] = [
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
        allocation_type: 'fixed_amount',
        allocation_value: '1000',
      },
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440003',
        allocation_type: 'fixed_amount',
        allocation_value: '2000',
      },
    ]

    const result = validateAllocationsSumTo100(allocations)
    expect(result.isValid).toBe(true)
    expect(result.error).toBe('')
  })

  it('returns valid when percentage allocations sum to 100', () => {
    const allocations: PoolAllocationCreate[] = [
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
        allocation_type: 'percentage',
        allocation_value: '40.00',
      },
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440003',
        allocation_type: 'percentage',
        allocation_value: '60.00',
      },
    ]

    const result = validateAllocationsSumTo100(allocations)
    expect(result.isValid).toBe(true)
    expect(result.error).toBe('')
  })

  it('returns invalid when percentage allocations sum to less than 100', () => {
    const allocations: PoolAllocationCreate[] = [
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
        allocation_type: 'percentage',
        allocation_value: '40.00',
      },
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440003',
        allocation_type: 'percentage',
        allocation_value: '50.00',
      },
    ]

    const result = validateAllocationsSumTo100(allocations)
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('must sum to 100%')
    expect(result.error).toContain('90.00')
  })

  it('returns invalid when percentage allocations sum to more than 100', () => {
    const allocations: PoolAllocationCreate[] = [
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
        allocation_type: 'percentage',
        allocation_value: '60.00',
      },
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440003',
        allocation_type: 'percentage',
        allocation_value: '50.00',
      },
    ]

    const result = validateAllocationsSumTo100(allocations)
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('must sum to 100%')
    expect(result.error).toContain('110.00')
  })

  it('validates only percentage allocations in mixed list', () => {
    const allocations: PoolAllocationCreate[] = [
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
        allocation_type: 'percentage',
        allocation_value: '100.00',
      },
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440003',
        allocation_type: 'fixed_amount',
        allocation_value: '5000.00', // Should be ignored
      },
    ]

    const result = validateAllocationsSumTo100(allocations)
    expect(result.isValid).toBe(true)
    expect(result.error).toBe('')
  })

  it('returns valid when percentage sum is within tolerance', () => {
    const allocations: PoolAllocationCreate[] = [
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
        allocation_type: 'percentage',
        allocation_value: '33.33',
      },
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440003',
        allocation_type: 'percentage',
        allocation_value: '33.33',
      },
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440004',
        allocation_type: 'percentage',
        allocation_value: '33.34',
      },
    ]

    const result = validateAllocationsSumTo100(allocations)
    expect(result.isValid).toBe(true)
    expect(result.error).toBe('')
  })

  it('accepts a many-addend split that sums to exactly 100 without float drift (F-106)', () => {
    // 0.1 + 0.2 + ... summed as floats accumulates IEEE-754 error; here we
    // build 1000 allocations of 0.10 that must total exactly 100.00.
    const allocations: PoolAllocationCreate[] = Array.from(
      { length: 1000 },
      (_, i) => ({
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: `550e8400-e29b-41d4-a716-${String(i).padStart(12, '0')}`,
        allocation_type: 'percentage' as const,
        allocation_value: '0.10',
      })
    )

    const result = validateAllocationsSumTo100(allocations)
    expect(result.isValid).toBe(true)
    expect(result.error).toBe('')
  })

  it('reports the summed total in the error for an invalid split with mixed precision', () => {
    const allocations: PoolAllocationCreate[] = [
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440002',
        allocation_type: 'percentage',
        allocation_value: '33.333',
      },
      {
        source_pool_id: '550e8400-e29b-41d4-a716-446655440001',
        target_pool_id: '550e8400-e29b-41d4-a716-446655440003',
        allocation_type: 'percentage',
        allocation_value: '33.333',
      },
    ]

    const result = validateAllocationsSumTo100(allocations)
    expect(result.isValid).toBe(false)
    expect(result.error).toContain('66.67')
  })
})
