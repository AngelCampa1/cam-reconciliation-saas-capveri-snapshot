/**
 * Tests for PoolMapping Zod schemas and helper functions.
 *
 * Covers:
 * - PoolMappingSchema validation
 * - PoolMappingCreateSchema validation
 * - PoolMappingUpdateSchema validation
 * - PoolMappingSummarySchema validation
 * - Helper functions (isValidGLPattern, patternToRegex, matchesGLPattern)
 * - Display helpers (formatAllocationPercentage, describeGLPattern)
 */

import { describe, expect, it } from 'vitest'
import {
  PoolMappingSchema,
  PoolMappingCreateSchema,
  PoolMappingUpdateSchema,
  PoolMappingSummarySchema,
  isValidGLPattern,
  patternToRegex,
  matchesGLPattern,
  formatAllocationPercentage,
  describeGLPattern,
} from './pool-mapping'

describe('isValidGLPattern', () => {
  describe('valid patterns', () => {
    it('should accept digits only', () => {
      expect(isValidGLPattern('5100')).toBe(true)
      expect(isValidGLPattern('123456')).toBe(true)
    })

    it('should accept asterisk wildcard', () => {
      expect(isValidGLPattern('51*')).toBe(true)
      expect(isValidGLPattern('*100')).toBe(true)
      expect(isValidGLPattern('5*00')).toBe(true)
    })

    it('should accept question wildcard', () => {
      expect(isValidGLPattern('51??')).toBe(true)
      expect(isValidGLPattern('?100')).toBe(true)
      expect(isValidGLPattern('5?0?')).toBe(true)
    })

    it('should accept mixed wildcards', () => {
      expect(isValidGLPattern('5*??')).toBe(true)
      expect(isValidGLPattern('?*00')).toBe(true)
    })

    it('should accept hyphens', () => {
      expect(isValidGLPattern('5100-5199')).toBe(true)
      expect(isValidGLPattern('51*-52*')).toBe(true)
    })
  })

  describe('invalid patterns', () => {
    it('should reject empty string', () => {
      expect(isValidGLPattern('')).toBe(false)
    })

    it('should reject letters', () => {
      expect(isValidGLPattern('51AB')).toBe(false)
      expect(isValidGLPattern('ABC*')).toBe(false)
    })

    it('should reject special characters', () => {
      expect(isValidGLPattern('51.00')).toBe(false)
      expect(isValidGLPattern('51@00')).toBe(false)
      expect(isValidGLPattern('51#00')).toBe(false)
      expect(isValidGLPattern('51 00')).toBe(false)
    })
  })
})

describe('patternToRegex', () => {
  it('should convert digits-only pattern to exact match', () => {
    const regex = patternToRegex('5100')
    expect(regex.source).toBe('^5100$')
  })

  it('should convert asterisk to .*', () => {
    const regex = patternToRegex('51*')
    expect(regex.source).toBe('^51.*$')
  })

  it('should convert question mark to .', () => {
    const regex = patternToRegex('51??')
    expect(regex.source).toBe('^51..$')
  })

  it('should handle mixed wildcards', () => {
    const regex = patternToRegex('5*??')
    expect(regex.source).toBe('^5.*..$')
  })
})

describe('matchesGLPattern', () => {
  describe('exact match', () => {
    it('should match exact pattern', () => {
      expect(matchesGLPattern('5100', '5100')).toBe(true)
    })

    it('should not match different value', () => {
      expect(matchesGLPattern('5100', '5101')).toBe(false)
    })
  })

  describe('asterisk wildcard', () => {
    it('should match any sequence at end', () => {
      expect(matchesGLPattern('5100', '51*')).toBe(true)
      expect(matchesGLPattern('51999', '51*')).toBe(true)
    })

    it('should not match different prefix', () => {
      expect(matchesGLPattern('52000', '51*')).toBe(false)
    })

    it('should match any prefix', () => {
      expect(matchesGLPattern('5100', '*100')).toBe(true)
      expect(matchesGLPattern('99100', '*100')).toBe(true)
    })

    it('should match empty sequence', () => {
      expect(matchesGLPattern('51', '51*')).toBe(true)
    })
  })

  describe('question wildcard', () => {
    it('should match exactly one character', () => {
      expect(matchesGLPattern('5100', '51??')).toBe(true)
      expect(matchesGLPattern('5199', '51??')).toBe(true)
    })

    it('should not match wrong length', () => {
      expect(matchesGLPattern('51000', '51??')).toBe(false)
      expect(matchesGLPattern('510', '51??')).toBe(false)
    })
  })

  describe('mixed wildcards', () => {
    it('should work with both * and ?', () => {
      expect(matchesGLPattern('51234', '5?2*')).toBe(true)
      expect(matchesGLPattern('5123456', '5?2*')).toBe(true)
      expect(matchesGLPattern('53234', '5?2*')).toBe(true)
      expect(matchesGLPattern('53100', '5?2*')).toBe(false)
    })
  })
})

describe('PoolMappingSchema', () => {
  const validData = {
    id: crypto.randomUUID(),
    expense_pool_id: crypto.randomUUID(),
    gl_account_pattern: '51*',
    allocation_percentage: '0.75',
    priority: 10,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }

  it('should validate complete data', () => {
    const result = PoolMappingSchema.safeParse(validData)
    expect(result.success).toBe(true)
  })

  it('should accept various valid patterns', () => {
    const patterns = ['5100', '51*', '51??', '5*??', '5100-5199']
    for (const pattern of patterns) {
      const result = PoolMappingSchema.safeParse({
        ...validData,
        gl_account_pattern: pattern,
      })
      expect(result.success).toBe(true)
    }
  })

  it('should reject invalid pattern', () => {
    const result = PoolMappingSchema.safeParse({
      ...validData,
      gl_account_pattern: '51ABC',
    })
    expect(result.success).toBe(false)
  })

  it('should reject empty pattern', () => {
    const result = PoolMappingSchema.safeParse({
      ...validData,
      gl_account_pattern: '',
    })
    expect(result.success).toBe(false)
  })

  it('should reject pattern over 50 chars', () => {
    const result = PoolMappingSchema.safeParse({
      ...validData,
      gl_account_pattern: '5'.repeat(51),
    })
    expect(result.success).toBe(false)
  })

  it('should reject allocation below 0', () => {
    const result = PoolMappingSchema.safeParse({
      ...validData,
      allocation_percentage: '-0.1',
    })
    expect(result.success).toBe(false)
  })

  it('should reject allocation above 1', () => {
    const result = PoolMappingSchema.safeParse({
      ...validData,
      allocation_percentage: '1.1',
    })
    expect(result.success).toBe(false)
  })

  it('should reject negative priority', () => {
    const result = PoolMappingSchema.safeParse({
      ...validData,
      priority: -1,
    })
    expect(result.success).toBe(false)
  })

  it('should reject non-integer priority', () => {
    const result = PoolMappingSchema.safeParse({
      ...validData,
      priority: 1.5,
    })
    expect(result.success).toBe(false)
  })
})

describe('PoolMappingCreateSchema', () => {
  it('should validate minimal data with defaults', () => {
    const result = PoolMappingCreateSchema.safeParse({
      expense_pool_id: crypto.randomUUID(),
      gl_account_pattern: '51*',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.allocation_percentage).toBe('1.0')
      expect(result.data.priority).toBe(0)
    }
  })

  it('should validate with all fields', () => {
    const result = PoolMappingCreateSchema.safeParse({
      expense_pool_id: crypto.randomUUID(),
      gl_account_pattern: '52??',
      allocation_percentage: '0.5',
      priority: 5,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.allocation_percentage).toBe('0.5')
      expect(result.data.priority).toBe(5)
    }
  })

  it('should require expense_pool_id', () => {
    const result = PoolMappingCreateSchema.safeParse({
      gl_account_pattern: '51*',
    })
    expect(result.success).toBe(false)
  })

  it('should require gl_account_pattern', () => {
    const result = PoolMappingCreateSchema.safeParse({
      expense_pool_id: crypto.randomUUID(),
    })
    expect(result.success).toBe(false)
  })

  it('should validate pattern format', () => {
    const result = PoolMappingCreateSchema.safeParse({
      expense_pool_id: crypto.randomUUID(),
      gl_account_pattern: '51ABC',
    })
    expect(result.success).toBe(false)
  })
})

describe('PoolMappingUpdateSchema', () => {
  it('should allow empty update', () => {
    const result = PoolMappingUpdateSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('should allow updating pattern only', () => {
    const result = PoolMappingUpdateSchema.safeParse({
      gl_account_pattern: '52*',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.gl_account_pattern).toBe('52*')
      expect(result.data.allocation_percentage).toBeUndefined()
    }
  })

  it('should allow updating allocation only', () => {
    const result = PoolMappingUpdateSchema.safeParse({
      allocation_percentage: '0.75',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.allocation_percentage).toBe('0.75')
      expect(result.data.gl_account_pattern).toBeUndefined()
    }
  })

  it('should allow updating priority only', () => {
    const result = PoolMappingUpdateSchema.safeParse({
      priority: 20,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.priority).toBe(20)
    }
  })

  it('should allow updating all fields', () => {
    const result = PoolMappingUpdateSchema.safeParse({
      gl_account_pattern: '53*',
      allocation_percentage: '0.25',
      priority: 15,
    })
    expect(result.success).toBe(true)
  })

  it('should validate pattern format', () => {
    const result = PoolMappingUpdateSchema.safeParse({
      gl_account_pattern: '51ABC',
    })
    expect(result.success).toBe(false)
  })

  it('should validate allocation range', () => {
    const result = PoolMappingUpdateSchema.safeParse({
      allocation_percentage: '1.5',
    })
    expect(result.success).toBe(false)
  })

  it('should validate priority is non-negative', () => {
    const result = PoolMappingUpdateSchema.safeParse({
      priority: -5,
    })
    expect(result.success).toBe(false)
  })
})

describe('PoolMappingSummarySchema', () => {
  it('should validate with pool_name', () => {
    const result = PoolMappingSummarySchema.safeParse({
      id: crypto.randomUUID(),
      expense_pool_id: crypto.randomUUID(),
      gl_account_pattern: '51*',
      allocation_percentage: '0.5',
      priority: 5,
      pool_name: 'Operating Expenses',
    })
    expect(result.success).toBe(true)
  })

  it('should allow null pool_name', () => {
    const result = PoolMappingSummarySchema.safeParse({
      id: crypto.randomUUID(),
      expense_pool_id: crypto.randomUUID(),
      gl_account_pattern: '51*',
      allocation_percentage: '1.0',
      priority: 0,
      pool_name: null,
    })
    expect(result.success).toBe(true)
  })

  it('should allow missing pool_name', () => {
    const result = PoolMappingSummarySchema.safeParse({
      id: crypto.randomUUID(),
      expense_pool_id: crypto.randomUUID(),
      gl_account_pattern: '51*',
      allocation_percentage: '1.0',
      priority: 0,
    })
    expect(result.success).toBe(true)
  })
})

describe('formatAllocationPercentage', () => {
  it('should format 1.0 as 100%', () => {
    expect(formatAllocationPercentage('1.0')).toBe('100%')
  })

  it('should format 0.5 as 50%', () => {
    expect(formatAllocationPercentage('0.5')).toBe('50%')
  })

  it('should format 0.75 as 75%', () => {
    expect(formatAllocationPercentage('0.75')).toBe('75%')
  })

  it('should format 0.25 as 25%', () => {
    expect(formatAllocationPercentage('0.25')).toBe('25%')
  })

  it('should format 0 as 0%', () => {
    expect(formatAllocationPercentage('0')).toBe('0%')
  })

  it('should return original for invalid input', () => {
    expect(formatAllocationPercentage('invalid')).toBe('invalid')
  })
})

describe('describeGLPattern', () => {
  it('should describe exact match pattern', () => {
    expect(describeGLPattern('5100')).toBe('Exact match: 5100')
  })

  it('should describe asterisk pattern', () => {
    const description = describeGLPattern('51*')
    expect(description).toContain('Pattern: 51*')
    expect(description).toContain('* matches any sequence')
  })

  it('should describe question pattern', () => {
    const description = describeGLPattern('51??')
    expect(description).toContain('Pattern: 51??')
    expect(description).toContain('? matches single character')
  })

  it('should describe mixed wildcards', () => {
    const description = describeGLPattern('5*??')
    expect(description).toContain('Pattern: 5*??')
    expect(description).toContain('* matches any sequence')
    expect(description).toContain('? matches single character')
  })
})

describe('Type exports', () => {
  it('should export PoolMapping type', () => {
    const mapping: import('./pool-mapping').PoolMapping = {
      id: crypto.randomUUID(),
      expense_pool_id: crypto.randomUUID(),
      gl_account_pattern: '51*',
      allocation_percentage: '0.75',
      priority: 5,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    expect(mapping).toBeDefined()
  })

  it('should export PoolMappingCreate type', () => {
    const create: import('./pool-mapping').PoolMappingCreate = {
      expense_pool_id: crypto.randomUUID(),
      gl_account_pattern: '51*',
      allocation_percentage: '1.0',
      priority: 0,
    }
    expect(create).toBeDefined()
  })

  it('should export PoolMappingUpdate type', () => {
    const update: import('./pool-mapping').PoolMappingUpdate = {
      gl_account_pattern: '52*',
    }
    expect(update).toBeDefined()
  })

  it('should export PoolMappingSummary type', () => {
    const summary: import('./pool-mapping').PoolMappingSummary = {
      id: crypto.randomUUID(),
      expense_pool_id: crypto.randomUUID(),
      gl_account_pattern: '51*',
      allocation_percentage: '1.0',
      priority: 0,
      pool_name: 'Operating',
    }
    expect(summary).toBeDefined()
  })
})

describe('Index exports', () => {
  it('should export all from index', async () => {
    const index = await import('./index')
    expect(index.PoolMappingSchema).toBeDefined()
    expect(index.PoolMappingCreateSchema).toBeDefined()
    expect(index.PoolMappingUpdateSchema).toBeDefined()
    expect(index.PoolMappingSummarySchema).toBeDefined()
    expect(index.isValidGLPattern).toBeDefined()
    expect(index.patternToRegex).toBeDefined()
    expect(index.matchesGLPattern).toBeDefined()
    expect(index.formatAllocationPercentage).toBeDefined()
    expect(index.describeGLPattern).toBeDefined()
  })
})
