/**
 * Expense Pool Form Validation Schema
 *
 * Zod schema for validating expense pool form data including:
 * - Name (required, max 100 chars)
 * - Pool type (required, enum)
 * - Gross-up settings (conditional validation)
 * - Description (optional, max 500 chars)
 * - Parent pool (optional, for child pools)
 */
import { z } from 'zod'

export const POOL_TYPES = [
  { value: 'operating', label: 'Operating' },
  { value: 'tax', label: 'Tax' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'capital', label: 'Capital' },
  { value: 'other', label: 'Other' },
] as const

export const expensePoolFormSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Pool name is required')
      .max(100, 'Pool name must be less than 100 characters'),
    pool_type: z.enum(['operating', 'tax', 'insurance', 'capital', 'other'], {
      required_error: 'Pool type is required',
    }),
    is_gross_up_applicable: z.boolean(),
    gross_up_target: z
      .string()
      .optional()
      .refine(
        (val) => {
          if (!val || val === '') return true
          const num = parseFloat(val)
          return !isNaN(num) && num >= 0 && num <= 100
        },
        { message: 'Must be a percentage between 0 and 100' }
      ),
    description: z
      .string()
      .max(500, 'Description must be less than 500 characters')
      .optional()
      .or(z.literal('')),
    parent_pool_id: z.string().optional().or(z.literal('')),
  })
  .refine(
    (data) => {
      // If gross-up is applicable, target must be provided
      if (data.is_gross_up_applicable) {
        const target = data.gross_up_target
        if (!target || target === '') return false
        const num = parseFloat(target)
        return !isNaN(num) && num > 0 && num <= 100
      }
      return true
    },
    {
      message: 'Gross-up target is required when gross-up is enabled (1-100%)',
      path: ['gross_up_target'],
    }
  )

export type ExpensePoolFormData = z.infer<typeof expensePoolFormSchema>
