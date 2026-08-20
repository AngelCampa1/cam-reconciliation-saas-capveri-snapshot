/**
 * API Response Wrappers for consistent API response structures.
 *
 * These schemas provide standardized wrappers for:
 * - Paginated list responses
 * - Error responses with validation details
 * - Success responses with optional data payload
 * - Data responses for single item retrieval
 */

import { z } from 'zod'

// ============================================================================
// Paginated Response Schema Factory
// ============================================================================

/**
 * Creates a paginated response schema for a given item schema.
 *
 * @example
 * const PaginatedPropertySchema = createPaginatedSchema(PropertySchema)
 * type PaginatedProperty = z.infer<typeof PaginatedPropertySchema>
 */
export function createPaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number().int().min(0, 'total must be non-negative'),
    page: z.number().int().min(1, 'page must be at least 1'),
    page_size: z
      .number()
      .int()
      .min(1, 'page_size must be at least 1')
      .max(100, 'page_size must be at most 100'),
    total_pages: z.number().int().min(0),
    has_next: z.boolean(),
    has_previous: z.boolean(),
  })
}

/**
 * Type helper for paginated response.
 */
export type PaginatedResponse<T> = {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
  has_next: boolean
  has_previous: boolean
}

// ============================================================================
// Error Response Schema
// ============================================================================

/**
 * Schema for standard API error responses.
 *
 * @example
 * {
 *   error: "VALIDATION_ERROR",
 *   message: "Invalid input data",
 *   details: { email: ["Invalid email format"] }
 * }
 */
export const ErrorResponseSchema = z.object({
  error: z.string().min(1, 'error code is required'),
  message: z.string().min(1, 'error message is required'),
  details: z
    .record(z.string(), z.any())
    .nullable()
    .optional()
    .describe('Additional error details (e.g., field validation errors)'),
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>

// ============================================================================
// Success Response Schema
// ============================================================================

/**
 * Schema for standard success responses.
 *
 * @example
 * { message: "Record deleted successfully" }
 * { message: "Email sent", data: { id: "abc-123" } }
 */
export const SuccessResponseSchema = z.object({
  message: z
    .string()
    .nullable()
    .optional()
    .describe('Optional success message'),
  data: z.unknown().nullable().optional().describe('Optional response payload'),
})

export type SuccessResponse = z.infer<typeof SuccessResponseSchema>

// ============================================================================
// Data Response Schema Factory
// ============================================================================

/**
 * Creates a data response schema for a given item schema.
 * Used for single item retrieval endpoints.
 *
 * @example
 * const PropertyDataResponseSchema = createDataResponseSchema(PropertySchema)
 */
export function createDataResponseSchema<T extends z.ZodTypeAny>(
  dataSchema: T
) {
  return z.object({
    data: dataSchema,
    message: z.string().nullable().optional(),
  })
}

/**
 * Type helper for data response.
 */
export type DataResponse<T> = {
  data: T
  message?: string | null
}

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Standard error codes for consistent error handling.
 * Use these constants when creating ErrorResponse objects.
 */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a typed ErrorResponse object.
 *
 * @param error - Error code (use ErrorCodes constants)
 * @param message - Human-readable error message
 * @param details - Optional field-level error details
 */
export function createErrorResponse(
  error: string,
  message: string,
  details?: Record<string, unknown> | null
): ErrorResponse {
  return ErrorResponseSchema.parse({
    error,
    message,
    details: details ?? null,
  })
}

/**
 * Creates a typed SuccessResponse object.
 *
 * @param message - Optional success message
 * @param data - Optional response data
 */
export function createSuccessResponse(
  message?: string | null,
  data?: unknown
): SuccessResponse {
  return SuccessResponseSchema.parse({
    message: message ?? null,
    data: data ?? null,
  })
}

/**
 * Checks if a response is an error response.
 * Useful for type narrowing in API call handlers.
 */
export function isErrorResponse(response: unknown): response is ErrorResponse {
  return ErrorResponseSchema.safeParse(response).success
}

/**
 * Extracts field-specific errors from an ErrorResponse.
 *
 * @param response - The error response
 * @param field - The field name to get errors for
 * @returns Array of error messages for the field, or empty array
 */
export function getFieldErrors(
  response: ErrorResponse,
  field: string
): string[] {
  if (!response.details || typeof response.details !== 'object') {
    return []
  }
  const fieldErrors = response.details[field]
  if (Array.isArray(fieldErrors)) {
    return fieldErrors.filter((e): e is string => typeof e === 'string')
  }
  if (typeof fieldErrors === 'string') {
    return [fieldErrors]
  }
  return []
}

/**
 * Formats an error response for display.
 *
 * @param response - The error response
 * @returns Formatted error message string
 */
export function formatErrorMessage(response: ErrorResponse): string {
  if (!response.details || Object.keys(response.details).length === 0) {
    return response.message
  }

  const fieldErrorMessages: string[] = []
  for (const [field, errors] of Object.entries(response.details)) {
    if (Array.isArray(errors)) {
      const errorStrings = errors.filter(
        (e): e is string => typeof e === 'string'
      )
      if (errorStrings.length > 0) {
        fieldErrorMessages.push(`${field}: ${errorStrings.join(', ')}`)
      }
    } else if (typeof errors === 'string') {
      fieldErrorMessages.push(`${field}: ${errors}`)
    }
  }

  if (fieldErrorMessages.length === 0) {
    return response.message
  }

  return `${response.message}\n${fieldErrorMessages.join('\n')}`
}

/**
 * Calculates pagination info from total and page_size.
 * Useful for creating paginated responses.
 *
 * @param total - Total number of items
 * @param page - Current page number (1-indexed)
 * @param pageSize - Number of items per page
 */
export function calculatePaginationInfo(
  total: number,
  page: number,
  pageSize: number
): {
  total_pages: number
  has_next: boolean
  has_previous: boolean
} {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize)
  return {
    total_pages: totalPages,
    has_next: page < totalPages,
    has_previous: page > 1,
  }
}

/**
 * Creates a paginated response with calculated pagination fields.
 *
 * @param items - Array of items for the current page
 * @param total - Total number of items across all pages
 * @param page - Current page number (1-indexed)
 * @param pageSize - Number of items per page
 */
export function createPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResponse<T> {
  const { total_pages, has_next, has_previous } = calculatePaginationInfo(
    total,
    page,
    pageSize
  )

  return {
    items,
    total,
    page,
    page_size: pageSize,
    total_pages,
    has_next,
    has_previous,
  }
}
