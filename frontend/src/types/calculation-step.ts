/**
 * CalculationStep domain types for audit trail of reconciliation calculations.
 *
 * These Zod schemas match exactly with backend/app/models/calculation_step.py.
 * Each step captures inputs, operation, output, and optional notes for audit purposes.
 */

import { z } from 'zod'
import { formatMoney } from '@/lib/money'

/**
 * Schema for output values - can be either a decimal string or a complex object.
 */
export const OutputValueSchema = z.union([
  z.string().regex(/^-?\d+(\.\d+)?$/, 'Must be a valid decimal number'),
  z.record(z.string(), z.unknown()),
])

/**
 * Schema for input values - flexible dict structure.
 * Must have at least one key.
 */
export const InputValuesSchema = z
  .record(z.string(), z.unknown())
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'input_values cannot be empty',
  })

/**
 * Full CalculationStep model for audit trail.
 *
 * Represents a single step in a reconciliation calculation,
 * capturing what inputs were used, what operation was performed,
 * and what output was produced.
 */
export const CalculationStepSchema = z.object({
  step_order: z.number().int().min(1, 'step_order must be at least 1'),
  step_name: z
    .string()
    .min(1, 'step_name is required')
    .max(100, 'step_name must be at most 100 characters'),
  input_values: InputValuesSchema,
  /** Per-input unit tags. Keys absent here default to 'currency' on display. */
  input_units: z.record(z.string(), z.string()).optional(),
  operation: z
    .string()
    .min(1, 'operation is required')
    .max(500, 'operation must be at most 500 characters'),
  output_value: OutputValueSchema,
  /** Unit tag for output_value. Defaults to 'currency' when absent. */
  output_unit: z.string().optional(),
  note: z
    .string()
    .max(500, 'note must be at most 500 characters')
    .nullable()
    .optional(),
})

export type CalculationStep = z.infer<typeof CalculationStepSchema>

/**
 * DTO for creating a calculation step.
 * Same as CalculationStep since all fields except note are required.
 */
export const CalculationStepCreateSchema = CalculationStepSchema

export type CalculationStepCreate = z.infer<typeof CalculationStepCreateSchema>

/**
 * Factory function to create a calculation step object.
 *
 * @param step_order - Order of this step (1-indexed)
 * @param step_name - Human-readable name for the step
 * @param input_values - Dict of inputs used in calculation
 * @param operation - Formula or description of operation
 * @param output_value - Result of the calculation
 * @param note - Optional explanation or warning
 * @returns A validated CalculationStep object
 */
export const createCalculationStep = (
  step_order: number,
  step_name: string,
  input_values: Record<string, unknown>,
  operation: string,
  output_value: string | Record<string, unknown>,
  note?: string | null
): CalculationStep => {
  return CalculationStepSchema.parse({
    step_order,
    step_name,
    input_values,
    operation,
    output_value,
    note: note ?? null,
  })
}

/**
 * Format a calculation step as a human-readable summary.
 *
 * @param step - The calculation step to format
 * @returns A formatted string summary of the step
 */
export const formatStepSummary = (step: CalculationStep): string => {
  let outputStr: string
  if (typeof step.output_value === 'string') {
    const num = parseFloat(step.output_value)
    if (!isNaN(num)) {
      outputStr = formatMoney(num)
    } else {
      outputStr = step.output_value
    }
  } else {
    outputStr = JSON.stringify(step.output_value)
  }

  let summary = `Step ${step.step_order}: ${step.step_name} = ${outputStr}`
  if (step.note) {
    summary += ` (${step.note})`
  }
  return summary
}

/**
 * Validate that a list of calculation steps has correct sequential ordering.
 *
 * @param steps - List of calculation steps to validate
 * @returns True if steps are correctly ordered (1, 2, 3, ...)
 * @throws Error if steps are not in sequential order starting from 1
 */
export const validateStepSequence = (steps: CalculationStep[]): boolean => {
  if (steps.length === 0) {
    return true
  }

  let expectedOrder = 1
  for (const step of steps) {
    if (step.step_order !== expectedOrder) {
      throw new Error(
        `Expected step_order ${expectedOrder}, got ${step.step_order}`
      )
    }
    expectedOrder++
  }

  return true
}

/**
 * Get a short description of what a step does based on its name.
 *
 * @param stepName - The step name to describe
 * @returns A short description or the original name if no match
 */
export const getStepDescription = (stepName: string): string => {
  const descriptions: Record<string, string> = {
    'Calculate Actual Occupancy': 'Determines current building occupancy rate',
    'Calculate Gross-Up Factor': 'Adjusts expenses for occupancy level',
    'Apply Gross-Up': 'Applies gross-up factor to variable expenses',
    'Calculate Base Year Amount': 'Retrieves or calculates base year expenses',
    'Calculate Tenant Share': "Computes tenant's pro-rata share of expenses",
    'Apply Cap': 'Limits increase based on cap provisions',
    'Calculate Admin Fee': 'Computes administrative fee amount',
    'Calculate Total Recovery': 'Sums all recoverable amounts',
  }
  return descriptions[stepName] || stepName
}

/**
 * Check if a step has a warning note.
 *
 * @param step - The calculation step to check
 * @returns True if the step has a note indicating a warning
 */
export const hasWarning = (step: CalculationStep): boolean => {
  if (!step.note) {
    return false
  }
  const warningKeywords = ['warning', 'exceeded', 'capped', 'limit', 'adjusted']
  return warningKeywords.some((keyword) =>
    step.note!.toLowerCase().includes(keyword)
  )
}
