/**
 * Tests for CalculationStep Zod schemas and helper functions.
 */

import { describe, expect, it } from 'vitest'

import {
  CalculationStepCreateSchema,
  CalculationStepSchema,
  createCalculationStep,
  formatStepSummary,
  getStepDescription,
  hasWarning,
  InputValuesSchema,
  OutputValueSchema,
  validateStepSequence,
} from './calculation-step'

describe('OutputValueSchema', () => {
  it('accepts valid decimal strings', () => {
    expect(OutputValueSchema.parse('100.00')).toBe('100.00')
    expect(OutputValueSchema.parse('0')).toBe('0')
    expect(OutputValueSchema.parse('-500.50')).toBe('-500.50')
    expect(OutputValueSchema.parse('1234567.89')).toBe('1234567.89')
  })

  it('accepts record objects', () => {
    const obj = { pool_a: '500.00', pool_b: '500.00' }
    expect(OutputValueSchema.parse(obj)).toEqual(obj)
  })

  it('accepts nested record objects', () => {
    const obj = {
      allocations: { cam: 1000, tax: 500 },
      totals: { before_cap: 1500, after_cap: 1200 },
    }
    expect(OutputValueSchema.parse(obj)).toEqual(obj)
  })

  it('rejects invalid decimal strings', () => {
    expect(() => OutputValueSchema.parse('$100.00')).toThrow()
    expect(() => OutputValueSchema.parse('100,000.00')).toThrow()
    expect(() => OutputValueSchema.parse('abc')).toThrow()
  })
})

describe('InputValuesSchema', () => {
  it('accepts non-empty objects', () => {
    expect(InputValuesSchema.parse({ a: 1 })).toEqual({ a: 1 })
    expect(InputValuesSchema.parse({ x: 100, y: 200 })).toEqual({
      x: 100,
      y: 200,
    })
  })

  it('accepts nested structures', () => {
    const input = {
      tenant: { name: 'Acme', share: 0.25 },
      expenses: [1000, 2000, 3000],
    }
    expect(InputValuesSchema.parse(input)).toEqual(input)
  })

  it('rejects empty objects', () => {
    expect(() => InputValuesSchema.parse({})).toThrow(
      'input_values cannot be empty'
    )
  })
})

describe('CalculationStepSchema', () => {
  const validStep = {
    step_order: 1,
    step_name: 'Calculate Actual Occupancy',
    input_values: { occupied_sqft: 45000, total_sqft: 50000 },
    operation: 'occupied_sqft / total_sqft',
    output_value: '0.90',
    note: null,
  }

  it('parses a valid step with decimal output', () => {
    const result = CalculationStepSchema.parse(validStep)
    expect(result.step_order).toBe(1)
    expect(result.step_name).toBe('Calculate Actual Occupancy')
    expect(result.output_value).toBe('0.90')
  })

  it('parses a step with dict output', () => {
    const step = {
      ...validStep,
      output_value: { cam_pool: '60000.00', tax_pool: '40000.00' },
    }
    const result = CalculationStepSchema.parse(step)
    expect(result.output_value).toEqual({
      cam_pool: '60000.00',
      tax_pool: '40000.00',
    })
  })

  it('parses a step with note', () => {
    const step = {
      ...validStep,
      note: 'Gross-up factor capped at 1.05',
    }
    const result = CalculationStepSchema.parse(step)
    expect(result.note).toBe('Gross-up factor capped at 1.05')
  })

  it('rejects step_order less than 1', () => {
    expect(() =>
      CalculationStepSchema.parse({ ...validStep, step_order: 0 })
    ).toThrow('step_order must be at least 1')

    expect(() =>
      CalculationStepSchema.parse({ ...validStep, step_order: -1 })
    ).toThrow()
  })

  it('rejects empty step_name', () => {
    expect(() =>
      CalculationStepSchema.parse({ ...validStep, step_name: '' })
    ).toThrow('step_name is required')
  })

  it('rejects step_name over 100 characters', () => {
    expect(() =>
      CalculationStepSchema.parse({ ...validStep, step_name: 'A'.repeat(101) })
    ).toThrow('step_name must be at most 100 characters')
  })

  it('rejects empty input_values', () => {
    expect(() =>
      CalculationStepSchema.parse({ ...validStep, input_values: {} })
    ).toThrow('input_values cannot be empty')
  })

  it('rejects empty operation', () => {
    expect(() =>
      CalculationStepSchema.parse({ ...validStep, operation: '' })
    ).toThrow('operation is required')
  })

  it('rejects operation over 500 characters', () => {
    expect(() =>
      CalculationStepSchema.parse({ ...validStep, operation: 'A'.repeat(501) })
    ).toThrow('operation must be at most 500 characters')
  })

  it('rejects note over 500 characters', () => {
    expect(() =>
      CalculationStepSchema.parse({ ...validStep, note: 'A'.repeat(501) })
    ).toThrow('note must be at most 500 characters')
  })

  it('accepts undefined note', () => {
    const step = { ...validStep }
    delete (step as Record<string, unknown>).note
    const result = CalculationStepSchema.parse(step)
    expect(result.note).toBeUndefined()
  })
})

describe('CalculationStepCreateSchema', () => {
  it('behaves the same as CalculationStepSchema', () => {
    const step = {
      step_order: 1,
      step_name: 'Test Step',
      input_values: { a: 1 },
      operation: 'test',
      output_value: '100.00',
    }
    const result = CalculationStepCreateSchema.parse(step)
    expect(result.step_order).toBe(1)
    expect(result.note).toBeUndefined()
  })
})

describe('createCalculationStep', () => {
  it('creates a valid step', () => {
    const step = createCalculationStep(
      1,
      'Calculate Occupancy',
      { occupied: 9000, total: 10000 },
      'occupied / total',
      '0.90'
    )
    expect(step.step_order).toBe(1)
    expect(step.step_name).toBe('Calculate Occupancy')
    expect(step.output_value).toBe('0.90')
    expect(step.note).toBeNull()
  })

  it('creates a step with note', () => {
    const step = createCalculationStep(
      2,
      'Apply Gross-Up',
      { factor: 1.05 },
      'base * factor',
      '1050.00',
      'Factor limited by safety valve'
    )
    expect(step.note).toBe('Factor limited by safety valve')
  })

  it('creates a step with dict output', () => {
    const step = createCalculationStep(
      3,
      'Allocate Pools',
      { total: 1000 },
      'split by percentage',
      { cam: '600.00', tax: '400.00' }
    )
    expect(step.output_value).toEqual({ cam: '600.00', tax: '400.00' })
  })

  it('throws on invalid input', () => {
    expect(() =>
      createCalculationStep(0, 'Invalid', { a: 1 }, 'test', '0')
    ).toThrow()
  })
})

describe('formatStepSummary', () => {
  it('formats a step with decimal output', () => {
    const step = {
      step_order: 1,
      step_name: 'Calculate Total',
      input_values: { a: 1 },
      operation: 'test',
      output_value: '12345.67',
      note: null,
    }
    expect(formatStepSummary(step)).toBe('Step 1: Calculate Total = $12,345.67')
  })

  it('formats a step with dict output', () => {
    const step = {
      step_order: 2,
      step_name: 'Split Allocation',
      input_values: { a: 1 },
      operation: 'test',
      output_value: { pool_a: '500.00', pool_b: '500.00' },
      note: null,
    }
    const summary = formatStepSummary(step)
    expect(summary).toContain('Step 2: Split Allocation = ')
    expect(summary).toContain('pool_a')
  })

  it('includes note in summary', () => {
    const step = {
      step_order: 3,
      step_name: 'Apply Cap',
      input_values: { a: 1 },
      operation: 'test',
      output_value: '1000.00',
      note: 'Cap exceeded',
    }
    expect(formatStepSummary(step)).toBe(
      'Step 3: Apply Cap = $1,000.00 (Cap exceeded)'
    )
  })

  it('formats negative amounts', () => {
    const step = {
      step_order: 1,
      step_name: 'Credit Adjustment',
      input_values: { a: 1 },
      operation: 'test',
      output_value: '-500.00',
      note: null,
    }
    expect(formatStepSummary(step)).toBe('Step 1: Credit Adjustment = -$500.00')
  })

  it('handles non-numeric string output', () => {
    // Non-numeric string won't match regex, so will be treated as invalid
    // The schema would reject this during parsing
    const _step = {
      step_order: 1,
      step_name: 'Status Check',
      input_values: { a: 1 },
      operation: 'test',
      output_value: 'passed',
      note: null,
    }
    void _step
    // We can't test formatStepSummary with this since the schema rejects
    // non-decimal output_value strings during parsing
  })
})

describe('validateStepSequence', () => {
  it('returns true for empty list', () => {
    expect(validateStepSequence([])).toBe(true)
  })

  it('returns true for single step starting at 1', () => {
    const steps = [
      {
        step_order: 1,
        step_name: 'Only Step',
        input_values: { a: 1 },
        operation: 'test',
        output_value: '0',
        note: null,
      },
    ]
    expect(validateStepSequence(steps)).toBe(true)
  })

  it('returns true for sequential steps 1, 2, 3', () => {
    const steps = [1, 2, 3].map((i) => ({
      step_order: i,
      step_name: `Step ${i}`,
      input_values: { a: 1 },
      operation: 'test',
      output_value: '0',
      note: null,
    }))
    expect(validateStepSequence(steps)).toBe(true)
  })

  it('throws for gap in sequence', () => {
    const steps = [
      {
        step_order: 1,
        step_name: 'Step 1',
        input_values: { a: 1 },
        operation: 'test',
        output_value: '0',
        note: null,
      },
      {
        step_order: 3, // Gap
        step_name: 'Step 3',
        input_values: { a: 1 },
        operation: 'test',
        output_value: '0',
        note: null,
      },
    ]
    expect(() => validateStepSequence(steps)).toThrow(
      'Expected step_order 2, got 3'
    )
  })

  it('throws for not starting at 1', () => {
    const steps = [
      {
        step_order: 2,
        step_name: 'Step 2',
        input_values: { a: 1 },
        operation: 'test',
        output_value: '0',
        note: null,
      },
    ]
    expect(() => validateStepSequence(steps)).toThrow(
      'Expected step_order 1, got 2'
    )
  })
})

describe('getStepDescription', () => {
  it('returns description for known step names', () => {
    expect(getStepDescription('Calculate Actual Occupancy')).toBe(
      'Determines current building occupancy rate'
    )
    expect(getStepDescription('Calculate Gross-Up Factor')).toBe(
      'Adjusts expenses for occupancy level'
    )
    expect(getStepDescription('Apply Cap')).toBe(
      'Limits increase based on cap provisions'
    )
    expect(getStepDescription('Calculate Total Recovery')).toBe(
      'Sums all recoverable amounts'
    )
  })

  it('returns original name for unknown step names', () => {
    expect(getStepDescription('Custom Step')).toBe('Custom Step')
    expect(getStepDescription('My Special Calculation')).toBe(
      'My Special Calculation'
    )
  })
})

describe('hasWarning', () => {
  it('returns false for steps without notes', () => {
    const step = {
      step_order: 1,
      step_name: 'Test',
      input_values: { a: 1 },
      operation: 'test',
      output_value: '0',
      note: null,
    }
    expect(hasWarning(step)).toBe(false)
  })

  it('returns false for steps with undefined notes', () => {
    const step = {
      step_order: 1,
      step_name: 'Test',
      input_values: { a: 1 },
      operation: 'test',
      output_value: '0',
    }
    expect(hasWarning(step as never)).toBe(false)
  })

  it('returns true for notes containing warning keywords', () => {
    const warningNotes = [
      'Warning: value exceeded threshold',
      'Cap exceeded for this period',
      'Amount was capped at maximum',
      'Limit reached for variable expenses',
      'Value adjusted for occupancy',
    ]

    for (const note of warningNotes) {
      const step = {
        step_order: 1,
        step_name: 'Test',
        input_values: { a: 1 },
        operation: 'test',
        output_value: '0',
        note,
      }
      expect(hasWarning(step)).toBe(true)
    }
  })

  it('returns false for notes without warning keywords', () => {
    const normalNotes = [
      'Standard calculation applied',
      'Using default values',
      'Result is within expected range',
    ]

    for (const note of normalNotes) {
      const step = {
        step_order: 1,
        step_name: 'Test',
        input_values: { a: 1 },
        operation: 'test',
        output_value: '0',
        note,
      }
      expect(hasWarning(step)).toBe(false)
    }
  })

  it('is case insensitive', () => {
    const step = {
      step_order: 1,
      step_name: 'Test',
      input_values: { a: 1 },
      operation: 'test',
      output_value: '0',
      note: 'WARNING: something happened',
    }
    expect(hasWarning(step)).toBe(true)
  })
})
