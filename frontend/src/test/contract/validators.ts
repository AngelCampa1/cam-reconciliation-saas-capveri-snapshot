/**
 * Contract testing utilities
 *
 * Validates that API responses match expected schemas.
 * Provides clear error messages when contracts are violated.
 */
import { z, type ZodType, type ZodError } from 'zod'

import {
  PropertySchema,
  PropertyListResponseSchema,
  UnitSchema,
  UnitListResponseSchema,
  LeaseSchema,
  LeaseListResponseSchema,
  ErrorResponseSchema,
} from './schemas'

/**
 * Custom error for contract violations
 */
export class ContractError extends Error {
  constructor(
    message: string,
    public zodError: ZodError
  ) {
    super(message)
    this.name = 'ContractError'
  }
}

/**
 * Format Zod errors for readable output
 */
function formatZodError(error: ZodError, context?: string): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)'
    return `  - ${path}: ${issue.message}`
  })

  const prefix = context
    ? `Contract violation in ${context}:`
    : 'Contract violation:'
  return `${prefix}\n${issues.join('\n')}`
}

/**
 * Validate data against a Zod schema
 *
 * @throws ContractError if validation fails
 */
export function validateSchema<T>(
  schema: ZodType<T>,
  data: unknown,
  context?: string
): T {
  const result = schema.safeParse(data)
  if (result.success) {
    return result.data
  }
  const message = formatZodError(result.error, context)
  throw new ContractError(message, result.error)
}

/**
 * Validator object with type-safe methods
 */
export interface Validator<T> {
  /** Validate data or throw ContractError */
  validate: (data: unknown) => T
  /** Check if data is valid without throwing */
  isValid: (data: unknown) => data is T
  /** Get list of error messages (empty if valid) */
  getErrors: (data: unknown) => string[]
  /** Get the underlying Zod schema */
  schema: ZodType<T>
}

/**
 * Create a contract validator for a specific schema
 */
export function createValidator<T>(
  schema: ZodType<T>,
  name: string
): Validator<T> {
  return {
    validate: (data: unknown): T => validateSchema(schema, data, name),
    isValid: (data: unknown): data is T => schema.safeParse(data).success,
    getErrors: (data: unknown): string[] => {
      const result = schema.safeParse(data)
      if (result.success) return []
      return result.error.issues.map((i) => {
        const path = i.path.length > 0 ? i.path.join('.') : '(root)'
        return `${path}: ${i.message}`
      })
    },
    schema,
  }
}

// ============================================================================
// Pre-built validators for common types
// ============================================================================

export const validators = {
  // Property validators
  property: createValidator(PropertySchema, 'Property'),
  propertyList: createValidator(
    PropertyListResponseSchema,
    'PropertyListResponse'
  ),

  // Unit validators
  unit: createValidator(UnitSchema, 'Unit'),
  unitList: createValidator(UnitListResponseSchema, 'UnitListResponse'),

  // Lease validators
  lease: createValidator(LeaseSchema, 'Lease'),
  leaseList: createValidator(LeaseListResponseSchema, 'LeaseListResponse'),

  // Error validators
  error: createValidator(ErrorResponseSchema, 'ErrorResponse'),
}

/**
 * Assert that an API response matches expected schema
 *
 * Usage in tests:
 *   const response = await api.getProperty("123");
 *   assertValidResponse(validators.property, response);
 *
 * @throws ContractError if validation fails
 */
export function assertValidResponse<T>(
  validator: Validator<T>,
  data: unknown
): asserts data is T {
  validator.validate(data)
}

/**
 * Validate a specific field in an object
 *
 * @throws ContractError if field validation fails
 */
export function validateField<T extends object, K extends keyof T>(
  validator: Validator<T>,
  data: unknown,
  field: K
): T[K] {
  const validated = validator.validate(data)
  return validated[field]
}

/**
 * Create a partial validator from an existing validator
 * Useful for validating updates where all fields are optional
 */
export function createPartialValidator<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  name: string
): Validator<Partial<z.infer<z.ZodObject<T>>>> {
  return createValidator(schema.partial(), `${name} (partial)`)
}

/**
 * Combine multiple validators to validate nested structures
 */
export function validateNested<T, U>(
  outerValidator: Validator<T>,
  innerPath: (data: T) => unknown,
  innerValidator: Validator<U>,
  data: unknown
): U {
  const outer = outerValidator.validate(data)
  const inner = innerPath(outer)
  return innerValidator.validate(inner)
}
