/**
 * Tests for ExpensePool Zod schemas.
 *
 * Tests match backend/tests/test_expense_pool.py behavior.
 */

import { describe, expect, it } from 'vitest'

import {
  ExpensePoolCreateSchema,
  ExpensePoolSchema,
  ExpensePoolSummarySchema,
  ExpensePoolUpdateSchema,
  ExpensePoolWithChildrenSchema,
  getPoolTypeDisplayName,
} from './expense-pool'

// Helper to generate a UUID
const uuid = () => crypto.randomUUID()

describe('ExpensePoolSchema', () => {
  describe('valid expense pools', () => {
    it('should accept expense pool with all fields', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'Operating Expenses',
        pool_type: 'operating',
        is_gross_up_applicable: true,
        gross_up_target: '0.95',
        description: 'General operating expenses for common areas',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = ExpensePoolSchema.parse(data)
      expect(result.name).toBe('Operating Expenses')
      expect(result.pool_type).toBe('operating')
      expect(result.is_gross_up_applicable).toBe(true)
      expect(result.gross_up_target).toBe('0.95')
    })

    it('should accept expense pool with minimal fields', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'Taxes',
        pool_type: 'tax',
        is_gross_up_applicable: false,
        description: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = ExpensePoolSchema.parse(data)
      expect(result.name).toBe('Taxes')
      expect(result.pool_type).toBe('tax')
      expect(result.is_gross_up_applicable).toBe(false)
      expect(result.gross_up_target).toBeUndefined()
    })

    it('should default is_gross_up_applicable to true', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'Insurance',
        pool_type: 'insurance',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = ExpensePoolSchema.parse(data)
      expect(result.is_gross_up_applicable).toBe(true)
    })
  })

  describe('pool_type validation', () => {
    it('should accept all valid pool types', () => {
      const poolTypes = [
        'operating',
        'tax',
        'insurance',
        'capital',
        'other',
      ] as const
      for (const poolType of poolTypes) {
        const data = {
          id: uuid(),
          property_id: uuid(),
          name: `${poolType} Pool`,
          pool_type: poolType,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        }
        const result = ExpensePoolSchema.parse(data)
        expect(result.pool_type).toBe(poolType)
      }
    })

    it('should reject invalid pool type', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'Invalid Pool',
        pool_type: 'invalid_type',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => ExpensePoolSchema.parse(data)).toThrow()
    })
  })

  describe('name validation', () => {
    it('should accept name at min length (1)', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'A',
        pool_type: 'operating',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = ExpensePoolSchema.parse(data)
      expect(result.name).toBe('A')
    })

    it('should accept name at max length (100)', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'N'.repeat(100),
        pool_type: 'operating',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = ExpensePoolSchema.parse(data)
      expect(result.name.length).toBe(100)
    })

    it('should reject empty name', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: '',
        pool_type: 'operating',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => ExpensePoolSchema.parse(data)).toThrow()
    })

    it('should reject name over 100 characters', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'N'.repeat(101),
        pool_type: 'operating',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => ExpensePoolSchema.parse(data)).toThrow()
    })
  })

  describe('gross_up_target validation', () => {
    it('should accept gross_up_target between 0 and 1', () => {
      const testCases = ['0', '0.5', '0.95', '1']
      for (const target of testCases) {
        const data = {
          id: uuid(),
          property_id: uuid(),
          name: 'Test Pool',
          pool_type: 'operating',
          is_gross_up_applicable: true,
          gross_up_target: target,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        }
        const result = ExpensePoolSchema.parse(data)
        expect(result.gross_up_target).toBe(target)
      }
    })

    it('should reject gross_up_target below 0', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'Test Pool',
        pool_type: 'operating',
        is_gross_up_applicable: true,
        gross_up_target: '-0.1',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => ExpensePoolSchema.parse(data)).toThrow()
    })

    it('should reject gross_up_target above 1', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'Test Pool',
        pool_type: 'operating',
        is_gross_up_applicable: true,
        gross_up_target: '1.01',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => ExpensePoolSchema.parse(data)).toThrow()
    })

    it('should accept null gross_up_target', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'Test Pool',
        pool_type: 'tax',
        is_gross_up_applicable: false,
        gross_up_target: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = ExpensePoolSchema.parse(data)
      expect(result.gross_up_target).toBeNull()
    })
  })

  describe('description validation', () => {
    it('should accept description at max length (500)', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'Test Pool',
        pool_type: 'operating',
        description: 'D'.repeat(500),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = ExpensePoolSchema.parse(data)
      expect(result.description?.length).toBe(500)
    })

    it('should reject description over 500 characters', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'Test Pool',
        pool_type: 'operating',
        description: 'D'.repeat(501),
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      expect(() => ExpensePoolSchema.parse(data)).toThrow()
    })
  })
})

describe('ExpensePoolCreateSchema', () => {
  it('should accept create with all fields', () => {
    const data = {
      property_id: uuid(),
      name: 'Operating Expenses',
      pool_type: 'operating',
      is_gross_up_applicable: true,
      gross_up_target: '0.95',
      description: 'Common area operating costs',
    }
    const result = ExpensePoolCreateSchema.parse(data)
    expect(result.name).toBe('Operating Expenses')
    expect(result.pool_type).toBe('operating')
    expect(result.gross_up_target).toBe('0.95')
  })

  it('should accept create with minimal fields', () => {
    const data = {
      property_id: uuid(),
      name: 'Taxes',
      pool_type: 'tax',
    }
    const result = ExpensePoolCreateSchema.parse(data)
    expect(result.name).toBe('Taxes')
    expect(result.is_gross_up_applicable).toBe(true) // default
    expect(result.gross_up_target).toBeUndefined()
  })

  it('should require property_id', () => {
    const data = {
      name: 'Missing Property Pool',
      pool_type: 'operating',
    }
    expect(() => ExpensePoolCreateSchema.parse(data)).toThrow()
  })

  it('should require name', () => {
    const data = {
      property_id: uuid(),
      pool_type: 'operating',
    }
    expect(() => ExpensePoolCreateSchema.parse(data)).toThrow()
  })

  it('should require pool_type', () => {
    const data = {
      property_id: uuid(),
      name: 'Missing Type Pool',
    }
    expect(() => ExpensePoolCreateSchema.parse(data)).toThrow()
  })

  it('should reject gross_up_target when is_gross_up_applicable is false', () => {
    const data = {
      property_id: uuid(),
      name: 'Fixed Pool',
      pool_type: 'tax',
      is_gross_up_applicable: false,
      gross_up_target: '0.95',
    }
    expect(() => ExpensePoolCreateSchema.parse(data)).toThrow(
      /gross_up_target/i
    )
  })

  it('should accept gross_up_target when is_gross_up_applicable is true', () => {
    const data = {
      property_id: uuid(),
      name: 'Variable Pool',
      pool_type: 'operating',
      is_gross_up_applicable: true,
      gross_up_target: '0.95',
    }
    const result = ExpensePoolCreateSchema.parse(data)
    expect(result.gross_up_target).toBe('0.95')
  })

  it('should validate name length constraints', () => {
    expect(() =>
      ExpensePoolCreateSchema.parse({
        property_id: uuid(),
        name: '',
        pool_type: 'operating',
      })
    ).toThrow()

    expect(() =>
      ExpensePoolCreateSchema.parse({
        property_id: uuid(),
        name: 'N'.repeat(101),
        pool_type: 'operating',
      })
    ).toThrow()
  })
})

describe('ExpensePoolUpdateSchema', () => {
  it('should accept empty update (all optional)', () => {
    const data = {}
    const result = ExpensePoolUpdateSchema.parse(data)
    expect(result).toEqual({})
  })

  it('should accept update with name only', () => {
    const data = {
      name: 'Updated Pool Name',
    }
    const result = ExpensePoolUpdateSchema.parse(data)
    expect(result.name).toBe('Updated Pool Name')
    expect(result.pool_type).toBeUndefined()
  })

  it('should accept update with pool_type only', () => {
    const data = {
      pool_type: 'capital',
    }
    const result = ExpensePoolUpdateSchema.parse(data)
    expect(result.pool_type).toBe('capital')
    expect(result.name).toBeUndefined()
  })

  it('should accept update with gross-up settings', () => {
    const data = {
      is_gross_up_applicable: false,
      gross_up_target: null,
    }
    const result = ExpensePoolUpdateSchema.parse(data)
    expect(result.is_gross_up_applicable).toBe(false)
    expect(result.gross_up_target).toBeNull()
  })

  it('should accept update with description', () => {
    const data = {
      description: 'Updated description text',
    }
    const result = ExpensePoolUpdateSchema.parse(data)
    expect(result.description).toBe('Updated description text')
  })

  it('should accept update with all fields', () => {
    const data = {
      name: 'Fully Updated Pool',
      pool_type: 'insurance',
      is_gross_up_applicable: true,
      gross_up_target: '0.90',
      description: 'New description',
    }
    const result = ExpensePoolUpdateSchema.parse(data)
    expect(result.name).toBe('Fully Updated Pool')
    expect(result.pool_type).toBe('insurance')
    expect(result.is_gross_up_applicable).toBe(true)
    expect(result.gross_up_target).toBe('0.90')
    expect(result.description).toBe('New description')
  })

  it('should validate name length constraints', () => {
    expect(() => ExpensePoolUpdateSchema.parse({ name: '' })).toThrow()
    expect(() =>
      ExpensePoolUpdateSchema.parse({ name: 'N'.repeat(101) })
    ).toThrow()
  })

  it('should validate gross_up_target range', () => {
    expect(() =>
      ExpensePoolUpdateSchema.parse({ gross_up_target: '-0.1' })
    ).toThrow()
    expect(() =>
      ExpensePoolUpdateSchema.parse({ gross_up_target: '1.5' })
    ).toThrow()
  })
})

describe('ExpensePoolSummarySchema', () => {
  it('should accept summary with all fields', () => {
    const data = {
      id: uuid(),
      property_id: uuid(),
      name: 'Operating Expenses',
      pool_type: 'operating',
      is_gross_up_applicable: true,
      total_amount: '50000.00',
      entry_count: 150,
    }
    const result = ExpensePoolSummarySchema.parse(data)
    expect(result.name).toBe('Operating Expenses')
    expect(result.total_amount).toBe('50000.00')
    expect(result.entry_count).toBe(150)
  })

  it('should accept summary with minimal fields', () => {
    const data = {
      id: uuid(),
      property_id: uuid(),
      name: 'Empty Pool',
      pool_type: 'other',
      is_gross_up_applicable: false,
    }
    const result = ExpensePoolSummarySchema.parse(data)
    expect(result.total_amount).toBeUndefined()
    expect(result.entry_count).toBe(0) // default
  })

  it('should accept summary with zero entries', () => {
    const data = {
      id: uuid(),
      property_id: uuid(),
      name: 'New Pool',
      pool_type: 'capital',
      is_gross_up_applicable: false,
      total_amount: '0.00',
      entry_count: 0,
    }
    const result = ExpensePoolSummarySchema.parse(data)
    expect(result.total_amount).toBe('0.00')
    expect(result.entry_count).toBe(0)
  })

  it('should accept summary with negative total_amount', () => {
    const data = {
      id: uuid(),
      property_id: uuid(),
      name: 'Credit Pool',
      pool_type: 'other',
      is_gross_up_applicable: false,
      total_amount: '-5000.00',
      entry_count: 5,
    }
    const result = ExpensePoolSummarySchema.parse(data)
    expect(result.total_amount).toBe('-5000.00')
  })

  it('should reject negative entry_count', () => {
    const data = {
      id: uuid(),
      property_id: uuid(),
      name: 'Invalid Count Pool',
      pool_type: 'operating',
      is_gross_up_applicable: true,
      entry_count: -1,
    }
    expect(() => ExpensePoolSummarySchema.parse(data)).toThrow()
  })
})

describe('helper functions', () => {
  describe('getPoolTypeDisplayName', () => {
    it('should return correct display names for valid pool types', () => {
      expect(getPoolTypeDisplayName('operating')).toBe('Operating Expenses')
      expect(getPoolTypeDisplayName('tax')).toBe('Taxes')
      expect(getPoolTypeDisplayName('insurance')).toBe('Insurance')
      expect(getPoolTypeDisplayName('capital')).toBe('Capital Expenses')
      expect(getPoolTypeDisplayName('other')).toBe('Other')
    })

    it('should return original value for unknown pool types', () => {
      expect(getPoolTypeDisplayName('unknown')).toBe('unknown')
      expect(getPoolTypeDisplayName('custom_pool')).toBe('custom_pool')
    })
  })
})

describe('pool hierarchy', () => {
  describe('parent_pool_id field', () => {
    it('should accept pool with parent_pool_id', () => {
      const parentId = uuid()
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'Child Pool',
        pool_type: 'operating',
        parent_pool_id: parentId,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = ExpensePoolSchema.parse(data)
      expect(result.parent_pool_id).toBe(parentId)
    })

    it('should accept pool without parent_pool_id (root pool)', () => {
      const data = {
        id: uuid(),
        property_id: uuid(),
        name: 'Root Pool',
        pool_type: 'operating',
        parent_pool_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      }
      const result = ExpensePoolSchema.parse(data)
      expect(result.parent_pool_id).toBeNull()
    })

    it('should accept create with parent_pool_id', () => {
      const parentId = uuid()
      const data = {
        property_id: uuid(),
        name: 'Child Pool',
        pool_type: 'operating',
        parent_pool_id: parentId,
      }
      const result = ExpensePoolCreateSchema.parse(data)
      expect(result.parent_pool_id).toBe(parentId)
    })

    it('should accept update with parent_pool_id', () => {
      const parentId = uuid()
      const data = {
        parent_pool_id: parentId,
      }
      const result = ExpensePoolUpdateSchema.parse(data)
      expect(result.parent_pool_id).toBe(parentId)
    })
  })
})

describe('ExpensePoolWithChildrenSchema', () => {
  it('should parse leaf pool with no children', () => {
    const data = {
      id: uuid(),
      property_id: uuid(),
      name: 'Leaf Pool',
      pool_type: 'operating',
      is_gross_up_applicable: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      children: [],
    }
    const result = ExpensePoolWithChildrenSchema.parse(data)
    expect(result.is_parent).toBe(false)
    expect(result.is_child).toBe(false)
    expect(result.children).toEqual([])
  })

  it('should parse parent pool with children', () => {
    const data = {
      id: uuid(),
      property_id: uuid(),
      name: 'Parent Pool',
      pool_type: 'operating',
      is_gross_up_applicable: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      children: [
        {
          id: uuid(),
          property_id: uuid(),
          name: 'Child 1',
          pool_type: 'operating',
          is_gross_up_applicable: true,
          parent_pool_id: uuid(),
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          children: [],
        },
        {
          id: uuid(),
          property_id: uuid(),
          name: 'Child 2',
          pool_type: 'operating',
          is_gross_up_applicable: true,
          parent_pool_id: uuid(),
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          children: [],
        },
      ],
    }
    const result = ExpensePoolWithChildrenSchema.parse(data)
    expect(result.is_parent).toBe(true)
    expect(result.children.length).toBe(2)
    expect(result.children[0].name).toBe('Child 1')
    expect(result.children[1].name).toBe('Child 2')
  })

  it('should identify child pools correctly', () => {
    const parentId = uuid()
    const childData = {
      id: uuid(),
      property_id: uuid(),
      name: 'Child Pool',
      pool_type: 'operating',
      is_gross_up_applicable: true,
      parent_pool_id: parentId,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      children: [],
    }
    const rootData = {
      id: uuid(),
      property_id: uuid(),
      name: 'Root Pool',
      pool_type: 'operating',
      is_gross_up_applicable: true,
      parent_pool_id: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      children: [],
    }
    const child = ExpensePoolWithChildrenSchema.parse(childData)
    const root = ExpensePoolWithChildrenSchema.parse(rootData)

    expect(child.is_child).toBe(true)
    expect(root.is_child).toBe(false)
  })

  it('should include total_amount for rollup calculations', () => {
    const data = {
      id: uuid(),
      property_id: uuid(),
      name: 'Pool with Amount',
      pool_type: 'operating',
      is_gross_up_applicable: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      children: [],
      total_amount: '12500.50',
    }
    const result = ExpensePoolWithChildrenSchema.parse(data)
    expect(result.total_amount).toBe('12500.50')
  })

  it('should support 2-level hierarchy', () => {
    const parentId = uuid()
    const childId = uuid()
    const data = {
      id: parentId,
      property_id: uuid(),
      name: 'Parent',
      pool_type: 'operating',
      is_gross_up_applicable: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      children: [
        {
          id: childId,
          property_id: uuid(),
          name: 'Child',
          pool_type: 'operating',
          is_gross_up_applicable: true,
          parent_pool_id: parentId,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          children: [
            {
              id: uuid(),
              property_id: uuid(),
              name: 'Grandchild',
              pool_type: 'operating',
              is_gross_up_applicable: true,
              parent_pool_id: childId,
              created_at: '2024-01-01T00:00:00Z',
              updated_at: '2024-01-01T00:00:00Z',
              children: [],
            },
          ],
        },
      ],
    }
    const result = ExpensePoolWithChildrenSchema.parse(data)

    expect(result.is_parent).toBe(true)
    expect(result.children[0].is_parent).toBe(true)
    expect(result.children[0].children[0].is_parent).toBe(false)
  })
})

describe('type inference', () => {
  it('should correctly infer ExpensePool type', () => {
    const pool = ExpensePoolSchema.parse({
      id: uuid(),
      property_id: uuid(),
      name: 'Type Test Pool',
      pool_type: 'operating',
      is_gross_up_applicable: true,
      gross_up_target: '0.95',
      description: 'Test description',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    })

    // TypeScript compile-time check - these assignments should work
    const _id: string = pool.id
    const _name: string = pool.name
    const _poolType: string = pool.pool_type
    const _isGrossUpApplicable: boolean = pool.is_gross_up_applicable

    expect(_id).toBeTruthy()
    expect(_name).toBe('Type Test Pool')
    expect(_poolType).toBe('operating')
    expect(_isGrossUpApplicable).toBe(true)
  })

  it('should correctly infer ExpensePoolSummary type', () => {
    const summary = ExpensePoolSummarySchema.parse({
      id: uuid(),
      property_id: uuid(),
      name: 'Summary Test Pool',
      pool_type: 'tax',
      is_gross_up_applicable: false,
      total_amount: '10000.00',
      entry_count: 25,
    })

    // TypeScript compile-time check
    const _name: string = summary.name
    const _entryCount: number = summary.entry_count

    expect(_name).toBe('Summary Test Pool')
    expect(_entryCount).toBe(25)
  })
})
