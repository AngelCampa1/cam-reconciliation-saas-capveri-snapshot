/**
 * Tests for GLEntry Zod schemas.
 *
 * Tests match backend/tests/test_gl_entry.py behavior.
 */

import { describe, expect, it } from 'vitest'

import {
  formatGLAmount,
  GLEntryCreateSchema,
  GLEntrySchema,
  GLEntrySummarySchema,
  GLEntryUpdateSchema,
  isCredit,
  isDebit,
} from './gl-entry'

// Helper to generate a UUID
const uuid = () => crypto.randomUUID()

describe('GLEntrySchema', () => {
  describe('valid entries', () => {
    it('should accept GL entry with all fields', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Janitorial Services',
        amount: '1500.00',
        transaction_date: '2024-06-15',
        period_year: 2024,
        period_month: 6,
        vendor_name: 'ABC Cleaning Co',
        description: 'Monthly janitorial services',
        raw_row_data: {
          original_debit: '1500.00',
          original_account: '6000-001',
        },
        created_at: '2024-06-15T10:30:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.account_code).toBe('6000')
      expect(result.amount).toBe('1500.00')
      expect(result.period_year).toBe(2024)
      expect(result.period_month).toBe(6)
    })

    it('should accept GL entry with minimal fields', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '7000',
        account_description: 'Utilities',
        amount: '-500.25',
        transaction_date: '2024-01-15',
        period_year: 2024,
        period_month: 1,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-01-15T08:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.vendor_name).toBeNull()
      expect(result.description).toBeNull()
      expect(result.raw_row_data).toEqual({})
    })
  })

  describe('amount validation (signed decimals)', () => {
    it('should accept positive amount (debit)', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6100',
        account_description: 'Repairs',
        amount: '1234.56',
        transaction_date: '2024-03-15',
        period_year: 2024,
        period_month: 3,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-03-15T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.amount).toBe('1234.56')
      expect(parseFloat(result.amount)).toBeGreaterThan(0)
    })

    it('should accept negative amount (credit)', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6100',
        account_description: 'Repairs Credit',
        amount: '-750.00',
        transaction_date: '2024-03-20',
        period_year: 2024,
        period_month: 3,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-03-20T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.amount).toBe('-750.00')
      expect(parseFloat(result.amount)).toBeLessThan(0)
    })

    it('should accept zero amount', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6200',
        account_description: 'Zero Entry',
        amount: '0.00',
        transaction_date: '2024-04-01',
        period_year: 2024,
        period_month: 4,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-04-01T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.amount).toBe('0.00')
    })

    it('should accept large amounts', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '7100',
        account_description: 'Large Expense',
        amount: '9999999.99',
        transaction_date: '2024-05-01',
        period_year: 2024,
        period_month: 5,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-05-01T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.amount).toBe('9999999.99')
    })

    it('should accept amounts with many decimal places', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6300',
        account_description: 'Precise Amount',
        amount: '123.456789',
        transaction_date: '2024-06-01',
        period_year: 2024,
        period_month: 6,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-06-01T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.amount).toBe('123.456789')
    })

    it('should reject non-numeric amount', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Invalid Amount',
        amount: 'not-a-number',
        transaction_date: '2024-07-01',
        period_year: 2024,
        period_month: 7,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-07-01T12:00:00Z',
      }
      expect(() => GLEntrySchema.parse(data)).toThrow(/decimal/i)
    })

    it('should reject amount with currency symbol', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Currency Symbol Amount',
        amount: '$1,500.00',
        transaction_date: '2024-08-01',
        period_year: 2024,
        period_month: 8,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-08-01T12:00:00Z',
      }
      expect(() => GLEntrySchema.parse(data)).toThrow()
    })
  })

  describe('account_code validation', () => {
    it('should accept account_code at min length (1)', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: 'A',
        account_description: 'Single Char Account',
        amount: '100.00',
        transaction_date: '2024-01-01',
        period_year: 2024,
        period_month: 1,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.account_code).toBe('A')
    })

    it('should accept account_code at max length (50)', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: 'A'.repeat(50),
        account_description: 'Max Length Account',
        amount: '100.00',
        transaction_date: '2024-01-01',
        period_year: 2024,
        period_month: 1,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.account_code.length).toBe(50)
    })

    it('should reject empty account_code', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '',
        account_description: 'Empty Account',
        amount: '100.00',
        transaction_date: '2024-01-01',
        period_year: 2024,
        period_month: 1,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      expect(() => GLEntrySchema.parse(data)).toThrow()
    })

    it('should reject account_code over 50 characters', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: 'A'.repeat(51),
        account_description: 'Too Long Account',
        amount: '100.00',
        transaction_date: '2024-01-01',
        period_year: 2024,
        period_month: 1,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      expect(() => GLEntrySchema.parse(data)).toThrow()
    })
  })

  describe('account_description validation', () => {
    it('should accept account_description at max length (255)', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'D'.repeat(255),
        amount: '100.00',
        transaction_date: '2024-01-01',
        period_year: 2024,
        period_month: 1,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.account_description.length).toBe(255)
    })

    it('should reject account_description over 255 characters', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'D'.repeat(256),
        amount: '100.00',
        transaction_date: '2024-01-01',
        period_year: 2024,
        period_month: 1,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      expect(() => GLEntrySchema.parse(data)).toThrow()
    })
  })

  describe('period validation', () => {
    it('should accept period_year at minimum (1990)', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Old Entry',
        amount: '100.00',
        transaction_date: '1990-01-01',
        period_year: 1990,
        period_month: 1,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.period_year).toBe(1990)
    })

    it('should accept period_year at maximum (2100)', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Future Entry',
        amount: '100.00',
        transaction_date: '2100-12-31',
        period_year: 2100,
        period_month: 12,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.period_year).toBe(2100)
    })

    it('should reject period_year below 1990', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Too Old Entry',
        amount: '100.00',
        transaction_date: '1989-12-31',
        period_year: 1989,
        period_month: 12,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      expect(() => GLEntrySchema.parse(data)).toThrow()
    })

    it('should reject period_year above 2100', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Too Future Entry',
        amount: '100.00',
        transaction_date: '2101-01-01',
        period_year: 2101,
        period_month: 1,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      expect(() => GLEntrySchema.parse(data)).toThrow()
    })

    it('should accept all valid months (1-12)', () => {
      for (let month = 1; month <= 12; month++) {
        const data = {
          id: uuid(),
          import_batch_id: uuid(),
          property_id: uuid(),
          account_code: '6000',
          account_description: `Month ${month} Entry`,
          amount: '100.00',
          transaction_date: `2024-${String(month).padStart(2, '0')}-15`,
          period_year: 2024,
          period_month: month,
          vendor_name: null,
          description: null,
          raw_row_data: {},
          created_at: '2024-01-01T12:00:00Z',
        }
        const result = GLEntrySchema.parse(data)
        expect(result.period_month).toBe(month)
      }
    })

    it('should reject period_month 0', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Invalid Month Entry',
        amount: '100.00',
        transaction_date: '2024-01-01',
        period_year: 2024,
        period_month: 0,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      expect(() => GLEntrySchema.parse(data)).toThrow()
    })

    it('should reject period_month 13', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Invalid Month Entry',
        amount: '100.00',
        transaction_date: '2024-12-01',
        period_year: 2024,
        period_month: 13,
        vendor_name: null,
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      expect(() => GLEntrySchema.parse(data)).toThrow()
    })
  })

  describe('vendor_name validation', () => {
    it('should accept vendor_name at max length (255)', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Test Entry',
        amount: '100.00',
        transaction_date: '2024-01-01',
        period_year: 2024,
        period_month: 1,
        vendor_name: 'V'.repeat(255),
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.vendor_name?.length).toBe(255)
    })

    it('should reject vendor_name over 255 characters', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Test Entry',
        amount: '100.00',
        transaction_date: '2024-01-01',
        period_year: 2024,
        period_month: 1,
        vendor_name: 'V'.repeat(256),
        description: null,
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      expect(() => GLEntrySchema.parse(data)).toThrow()
    })
  })

  describe('description validation', () => {
    it('should accept description at max length (1000)', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Test Entry',
        amount: '100.00',
        transaction_date: '2024-01-01',
        period_year: 2024,
        period_month: 1,
        vendor_name: null,
        description: 'X'.repeat(1000),
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.description?.length).toBe(1000)
    })

    it('should reject description over 1000 characters', () => {
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Test Entry',
        amount: '100.00',
        transaction_date: '2024-01-01',
        period_year: 2024,
        period_month: 1,
        vendor_name: null,
        description: 'X'.repeat(1001),
        raw_row_data: {},
        created_at: '2024-01-01T12:00:00Z',
      }
      expect(() => GLEntrySchema.parse(data)).toThrow()
    })
  })

  describe('raw_row_data preservation', () => {
    it('should preserve raw_row_data exactly as provided', () => {
      const originalRow = {
        'GL Account': '6000-001',
        Description: 'Monthly cleaning',
        Debit: '1500.00',
        Credit: '',
        Vendor: 'ABC Cleaning',
        Date: '06/15/2024',
      }
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Janitorial',
        amount: '1500.00',
        transaction_date: '2024-06-15',
        period_year: 2024,
        period_month: 6,
        vendor_name: 'ABC Cleaning',
        description: 'Monthly cleaning',
        raw_row_data: originalRow,
        created_at: '2024-06-15T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.raw_row_data).toEqual(originalRow)
      expect(result.raw_row_data['GL Account']).toBe('6000-001')
      expect(result.raw_row_data['Debit']).toBe('1500.00')
    })

    it('should accept raw_row_data with various value types', () => {
      const complexRow = {
        stringVal: 'test',
        numberVal: 123,
        boolVal: true,
        nullVal: null,
        arrayVal: [1, 2, 3],
        nestedObj: { key: 'value' },
      }
      const data = {
        id: uuid(),
        import_batch_id: uuid(),
        property_id: uuid(),
        account_code: '6000',
        account_description: 'Test',
        amount: '100.00',
        transaction_date: '2024-01-01',
        period_year: 2024,
        period_month: 1,
        vendor_name: null,
        description: null,
        raw_row_data: complexRow,
        created_at: '2024-01-01T12:00:00Z',
      }
      const result = GLEntrySchema.parse(data)
      expect(result.raw_row_data).toEqual(complexRow)
    })
  })
})

describe('GLEntryCreateSchema', () => {
  it('should accept create with all fields', () => {
    const data = {
      import_batch_id: uuid(),
      property_id: uuid(),
      account_code: '6000',
      account_description: 'Janitorial Services',
      amount: '1500.00',
      transaction_date: '2024-06-15',
      period_year: 2024,
      period_month: 6,
      vendor_name: 'ABC Cleaning Co',
      description: 'Monthly janitorial services',
      raw_row_data: { original: 'data' },
    }
    const result = GLEntryCreateSchema.parse(data)
    expect(result.account_code).toBe('6000')
    expect(result.amount).toBe('1500.00')
    expect(result.raw_row_data).toEqual({ original: 'data' })
  })

  it('should accept create with minimal fields', () => {
    const data = {
      import_batch_id: uuid(),
      property_id: uuid(),
      account_code: '7000',
      account_description: 'Utilities',
      amount: '-500.00',
      transaction_date: '2024-01-15',
      period_year: 2024,
      period_month: 1,
    }
    const result = GLEntryCreateSchema.parse(data)
    expect(result.vendor_name).toBeUndefined()
    expect(result.description).toBeUndefined()
    expect(result.raw_row_data).toEqual({})
  })

  it('should accept null vendor_name', () => {
    const data = {
      import_batch_id: uuid(),
      property_id: uuid(),
      account_code: '6000',
      account_description: 'Test',
      amount: '100.00',
      transaction_date: '2024-01-01',
      period_year: 2024,
      period_month: 1,
      vendor_name: null,
    }
    const result = GLEntryCreateSchema.parse(data)
    expect(result.vendor_name).toBeNull()
  })

  it('should require import_batch_id', () => {
    const data = {
      property_id: uuid(),
      account_code: '6000',
      account_description: 'Test',
      amount: '100.00',
      transaction_date: '2024-01-01',
      period_year: 2024,
      period_month: 1,
    }
    expect(() => GLEntryCreateSchema.parse(data)).toThrow()
  })

  it('should require property_id', () => {
    const data = {
      import_batch_id: uuid(),
      account_code: '6000',
      account_description: 'Test',
      amount: '100.00',
      transaction_date: '2024-01-01',
      period_year: 2024,
      period_month: 1,
    }
    expect(() => GLEntryCreateSchema.parse(data)).toThrow()
  })

  it('should validate account_code constraints', () => {
    const data = {
      import_batch_id: uuid(),
      property_id: uuid(),
      account_code: '',
      account_description: 'Test',
      amount: '100.00',
      transaction_date: '2024-01-01',
      period_year: 2024,
      period_month: 1,
    }
    expect(() => GLEntryCreateSchema.parse(data)).toThrow()
  })

  it('should validate period constraints', () => {
    const data = {
      import_batch_id: uuid(),
      property_id: uuid(),
      account_code: '6000',
      account_description: 'Test',
      amount: '100.00',
      transaction_date: '2024-01-01',
      period_year: 2024,
      period_month: 15, // Invalid month
    }
    expect(() => GLEntryCreateSchema.parse(data)).toThrow()
  })
})

describe('GLEntryUpdateSchema', () => {
  it('should accept empty update (all optional)', () => {
    const data = {}
    const result = GLEntryUpdateSchema.parse(data)
    expect(result).toEqual({})
  })

  it('should accept update with vendor_name only', () => {
    const data = {
      vendor_name: 'Updated Vendor Name',
    }
    const result = GLEntryUpdateSchema.parse(data)
    expect(result.vendor_name).toBe('Updated Vendor Name')
    expect(result.description).toBeUndefined()
  })

  it('should accept update with description only', () => {
    const data = {
      description: 'Updated description text',
    }
    const result = GLEntryUpdateSchema.parse(data)
    expect(result.description).toBe('Updated description text')
    expect(result.vendor_name).toBeUndefined()
  })

  it('should accept update with both fields', () => {
    const data = {
      vendor_name: 'New Vendor',
      description: 'New description',
    }
    const result = GLEntryUpdateSchema.parse(data)
    expect(result.vendor_name).toBe('New Vendor')
    expect(result.description).toBe('New description')
  })

  it('should accept null values', () => {
    const data = {
      vendor_name: null,
      description: null,
    }
    const result = GLEntryUpdateSchema.parse(data)
    expect(result.vendor_name).toBeNull()
    expect(result.description).toBeNull()
  })

  it('should validate vendor_name max length', () => {
    const data = {
      vendor_name: 'V'.repeat(256),
    }
    expect(() => GLEntryUpdateSchema.parse(data)).toThrow()
  })

  it('should validate description max length', () => {
    const data = {
      description: 'D'.repeat(1001),
    }
    expect(() => GLEntryUpdateSchema.parse(data)).toThrow()
  })
})

describe('GLEntrySummarySchema', () => {
  it('should accept summary with all fields', () => {
    const data = {
      account_code: '6000',
      account_description: 'Janitorial Services',
      total_amount: '15000.00',
      entry_count: 12,
    }
    const result = GLEntrySummarySchema.parse(data)
    expect(result.account_code).toBe('6000')
    expect(result.total_amount).toBe('15000.00')
    expect(result.entry_count).toBe(12)
  })

  it('should accept summary with zero entry_count', () => {
    const data = {
      account_code: '7000',
      account_description: 'Empty Account',
      total_amount: '0.00',
      entry_count: 0,
    }
    const result = GLEntrySummarySchema.parse(data)
    expect(result.entry_count).toBe(0)
  })

  it('should accept summary with negative total_amount', () => {
    const data = {
      account_code: '8000',
      account_description: 'Net Credit Account',
      total_amount: '-5000.00',
      entry_count: 5,
    }
    const result = GLEntrySummarySchema.parse(data)
    expect(result.total_amount).toBe('-5000.00')
  })

  it('should reject negative entry_count', () => {
    const data = {
      account_code: '6000',
      account_description: 'Invalid Count',
      total_amount: '100.00',
      entry_count: -1,
    }
    expect(() => GLEntrySummarySchema.parse(data)).toThrow()
  })

  it('should reject non-numeric total_amount', () => {
    const data = {
      account_code: '6000',
      account_description: 'Invalid Amount',
      total_amount: 'not-a-number',
      entry_count: 1,
    }
    expect(() => GLEntrySummarySchema.parse(data)).toThrow()
  })
})

describe('helper functions', () => {
  describe('isDebit', () => {
    it('should return true for positive amounts', () => {
      expect(isDebit('100.00')).toBe(true)
      expect(isDebit('0.01')).toBe(true)
      expect(isDebit('999999.99')).toBe(true)
    })

    it('should return false for negative amounts', () => {
      expect(isDebit('-100.00')).toBe(false)
      expect(isDebit('-0.01')).toBe(false)
    })

    it('should return false for zero', () => {
      expect(isDebit('0')).toBe(false)
      expect(isDebit('0.00')).toBe(false)
    })

    it('should return false for invalid strings', () => {
      expect(isDebit('not-a-number')).toBe(false)
      expect(isDebit('')).toBe(false)
    })
  })

  describe('isCredit', () => {
    it('should return true for negative amounts', () => {
      expect(isCredit('-100.00')).toBe(true)
      expect(isCredit('-0.01')).toBe(true)
      expect(isCredit('-999999.99')).toBe(true)
    })

    it('should return false for positive amounts', () => {
      expect(isCredit('100.00')).toBe(false)
      expect(isCredit('0.01')).toBe(false)
    })

    it('should return false for zero', () => {
      expect(isCredit('0')).toBe(false)
      expect(isCredit('0.00')).toBe(false)
    })

    it('should return false for invalid strings', () => {
      expect(isCredit('not-a-number')).toBe(false)
      expect(isCredit('')).toBe(false)
    })
  })

  describe('formatGLAmount', () => {
    it('should format positive amounts without parentheses', () => {
      expect(formatGLAmount('100.00')).toBe('100.00')
      expect(formatGLAmount('1234.56')).toBe('1234.56')
    })

    it('should format negative amounts with parentheses', () => {
      expect(formatGLAmount('-100.00')).toBe('(100.00)')
      expect(formatGLAmount('-1234.56')).toBe('(1234.56)')
    })

    it('should format zero', () => {
      expect(formatGLAmount('0')).toBe('0.00')
      expect(formatGLAmount('0.00')).toBe('0.00')
    })

    it('should round to two decimal places', () => {
      expect(formatGLAmount('100.999')).toBe('101.00')
      expect(formatGLAmount('100.001')).toBe('100.00')
    })

    it('should return original string for invalid input', () => {
      expect(formatGLAmount('not-a-number')).toBe('not-a-number')
      expect(formatGLAmount('')).toBe('')
    })
  })
})

describe('type inference', () => {
  it('should correctly infer GLEntry type', () => {
    const entry = GLEntrySchema.parse({
      id: uuid(),
      import_batch_id: uuid(),
      property_id: uuid(),
      account_code: '6000',
      account_description: 'Test Account',
      amount: '1500.00',
      transaction_date: '2024-06-15',
      period_year: 2024,
      period_month: 6,
      vendor_name: 'Test Vendor',
      description: 'Test description',
      raw_row_data: { test: 'data' },
      created_at: '2024-06-15T12:00:00Z',
    })

    // TypeScript compile-time check - these assignments should work
    const _id: string = entry.id
    const _accountCode: string = entry.account_code
    const _amount: string = entry.amount
    const _periodYear: number = entry.period_year
    const _periodMonth: number = entry.period_month
    const _rawData: Record<string, unknown> = entry.raw_row_data

    expect(_id).toBeTruthy()
    expect(_accountCode).toBe('6000')
    expect(_amount).toBe('1500.00')
    expect(_periodYear).toBe(2024)
    expect(_periodMonth).toBe(6)
    expect(_rawData).toEqual({ test: 'data' })
  })

  it('should correctly infer GLEntrySummary type', () => {
    const summary = GLEntrySummarySchema.parse({
      account_code: '6000',
      account_description: 'Test Account',
      total_amount: '15000.00',
      entry_count: 12,
    })

    // TypeScript compile-time check
    const _accountCode: string = summary.account_code
    const _totalAmount: string = summary.total_amount
    const _entryCount: number = summary.entry_count

    expect(_accountCode).toBe('6000')
    expect(_totalAmount).toBe('15000.00')
    expect(_entryCount).toBe(12)
  })
})
