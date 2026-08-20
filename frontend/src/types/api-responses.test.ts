/**
 * Tests for API Response Wrapper Zod schemas and helper functions.
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  calculatePaginationInfo,
  createDataResponseSchema,
  createErrorResponse,
  createPaginatedResponse,
  createPaginatedSchema,
  createSuccessResponse,
  ErrorCodes,
  ErrorResponseSchema,
  formatErrorMessage,
  getFieldErrors,
  isErrorResponse,
  SuccessResponseSchema,
} from './api-responses'

// Sample schema for testing generic types
const SampleItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  value: z.number(),
})

type SampleItem = z.infer<typeof SampleItemSchema>

describe('createPaginatedSchema', () => {
  const PaginatedSampleSchema = createPaginatedSchema(SampleItemSchema)

  it('parses valid paginated response', () => {
    const input = {
      items: [
        { id: '1', name: 'Item 1', value: 100 },
        { id: '2', name: 'Item 2', value: 200 },
      ],
      total: 50,
      page: 1,
      page_size: 10,
      total_pages: 5,
      has_next: true,
      has_previous: false,
    }
    const result = PaginatedSampleSchema.parse(input)
    expect(result.items).toHaveLength(2)
    expect(result.total).toBe(50)
    expect(result.page).toBe(1)
    expect(result.page_size).toBe(10)
    expect(result.total_pages).toBe(5)
    expect(result.has_next).toBe(true)
    expect(result.has_previous).toBe(false)
  })

  it('parses empty items array', () => {
    const input = {
      items: [],
      total: 0,
      page: 1,
      page_size: 10,
      total_pages: 0,
      has_next: false,
      has_previous: false,
    }
    const result = PaginatedSampleSchema.parse(input)
    expect(result.items).toHaveLength(0)
  })

  it('rejects negative total', () => {
    const input = {
      items: [],
      total: -1,
      page: 1,
      page_size: 10,
      total_pages: 0,
      has_next: false,
      has_previous: false,
    }
    expect(() => PaginatedSampleSchema.parse(input)).toThrow(
      'total must be non-negative'
    )
  })

  it('rejects page less than 1', () => {
    const input = {
      items: [],
      total: 0,
      page: 0,
      page_size: 10,
      total_pages: 0,
      has_next: false,
      has_previous: false,
    }
    expect(() => PaginatedSampleSchema.parse(input)).toThrow(
      'page must be at least 1'
    )
  })

  it('rejects page_size less than 1', () => {
    const input = {
      items: [],
      total: 0,
      page: 1,
      page_size: 0,
      total_pages: 0,
      has_next: false,
      has_previous: false,
    }
    expect(() => PaginatedSampleSchema.parse(input)).toThrow(
      'page_size must be at least 1'
    )
  })

  it('rejects page_size greater than 100', () => {
    const input = {
      items: [],
      total: 0,
      page: 1,
      page_size: 101,
      total_pages: 0,
      has_next: false,
      has_previous: false,
    }
    expect(() => PaginatedSampleSchema.parse(input)).toThrow(
      'page_size must be at most 100'
    )
  })

  it('validates item types', () => {
    const input = {
      items: [{ invalid: 'item' }],
      total: 1,
      page: 1,
      page_size: 10,
      total_pages: 1,
      has_next: false,
      has_previous: false,
    }
    expect(() => PaginatedSampleSchema.parse(input)).toThrow()
  })

  it('works with string schema', () => {
    const PaginatedStringSchema = createPaginatedSchema(z.string())
    const input = {
      items: ['a', 'b', 'c'],
      total: 100,
      page: 2,
      page_size: 25,
      total_pages: 4,
      has_next: true,
      has_previous: true,
    }
    const result = PaginatedStringSchema.parse(input)
    expect(result.items).toEqual(['a', 'b', 'c'])
  })
})

describe('ErrorResponseSchema', () => {
  it('parses valid error response', () => {
    const input = {
      error: 'VALIDATION_ERROR',
      message: 'Invalid input data',
    }
    const result = ErrorResponseSchema.parse(input)
    expect(result.error).toBe('VALIDATION_ERROR')
    expect(result.message).toBe('Invalid input data')
    expect(result.details).toBeUndefined()
  })

  it('parses error response with details', () => {
    const input = {
      error: 'VALIDATION_ERROR',
      message: 'Multiple errors',
      details: {
        email: ['Invalid format'],
        name: ['Required', 'Too short'],
      },
    }
    const result = ErrorResponseSchema.parse(input)
    expect(result.details).toEqual({
      email: ['Invalid format'],
      name: ['Required', 'Too short'],
    })
  })

  it('parses error response with null details', () => {
    const input = {
      error: 'NOT_FOUND',
      message: 'Resource not found',
      details: null,
    }
    const result = ErrorResponseSchema.parse(input)
    expect(result.details).toBeNull()
  })

  it('parses nested details', () => {
    const input = {
      error: 'VALIDATION_ERROR',
      message: 'Nested error',
      details: {
        tenant: { contact: { email: 'Invalid' } },
      },
    }
    const result = ErrorResponseSchema.parse(input)
    expect((result.details?.tenant as Record<string, unknown>).contact).toEqual(
      {
        email: 'Invalid',
      }
    )
  })

  it('rejects empty error code', () => {
    const input = {
      error: '',
      message: 'Error occurred',
    }
    expect(() => ErrorResponseSchema.parse(input)).toThrow(
      'error code is required'
    )
  })

  it('rejects empty message', () => {
    const input = {
      error: 'ERROR_CODE',
      message: '',
    }
    expect(() => ErrorResponseSchema.parse(input)).toThrow(
      'error message is required'
    )
  })

  it('rejects missing error', () => {
    const input = {
      message: 'Error occurred',
    }
    expect(() => ErrorResponseSchema.parse(input)).toThrow()
  })

  it('rejects missing message', () => {
    const input = {
      error: 'ERROR_CODE',
    }
    expect(() => ErrorResponseSchema.parse(input)).toThrow()
  })
})

describe('SuccessResponseSchema', () => {
  it('parses empty success response', () => {
    const input = {}
    const result = SuccessResponseSchema.parse(input)
    expect(result.message).toBeUndefined()
    expect(result.data).toBeUndefined()
  })

  it('parses success response with message only', () => {
    const input = {
      message: 'Operation completed',
    }
    const result = SuccessResponseSchema.parse(input)
    expect(result.message).toBe('Operation completed')
    expect(result.data).toBeUndefined()
  })

  it('parses success response with data only', () => {
    const input = {
      data: { id: 'abc-123', status: 'created' },
    }
    const result = SuccessResponseSchema.parse(input)
    expect(result.message).toBeUndefined()
    expect(result.data).toEqual({ id: 'abc-123', status: 'created' })
  })

  it('parses success response with message and data', () => {
    const input = {
      message: 'Record created',
      data: { id: 'abc-123' },
    }
    const result = SuccessResponseSchema.parse(input)
    expect(result.message).toBe('Record created')
    expect(result.data).toEqual({ id: 'abc-123' })
  })

  it('parses success response with null values', () => {
    const input = {
      message: null,
      data: null,
    }
    const result = SuccessResponseSchema.parse(input)
    expect(result.message).toBeNull()
    expect(result.data).toBeNull()
  })

  it('parses success response with complex data', () => {
    const input = {
      message: 'Complex data',
      data: {
        user: { id: '123', name: 'John' },
        permissions: ['read', 'write'],
        metadata: { created_at: '2024-01-01' },
      },
    }
    const result = SuccessResponseSchema.parse(input)
    expect((result.data as Record<string, unknown>).user).toEqual({
      id: '123',
      name: 'John',
    })
  })

  it('parses success response with array data', () => {
    const input = {
      data: [1, 2, 3, 4, 5],
    }
    const result = SuccessResponseSchema.parse(input)
    expect(result.data).toEqual([1, 2, 3, 4, 5])
  })
})

describe('createDataResponseSchema', () => {
  const DataResponseSchema = createDataResponseSchema(SampleItemSchema)

  it('parses valid data response', () => {
    const input = {
      data: { id: '1', name: 'Test', value: 100 },
    }
    const result = DataResponseSchema.parse(input)
    expect(result.data).toEqual({ id: '1', name: 'Test', value: 100 })
    expect(result.message).toBeUndefined()
  })

  it('parses data response with message', () => {
    const input = {
      data: { id: '1', name: 'Test', value: 100 },
      message: 'Item retrieved',
    }
    const result = DataResponseSchema.parse(input)
    expect(result.message).toBe('Item retrieved')
  })

  it('parses data response with null message', () => {
    const input = {
      data: { id: '1', name: 'Test', value: 100 },
      message: null,
    }
    const result = DataResponseSchema.parse(input)
    expect(result.message).toBeNull()
  })

  it('rejects missing data', () => {
    const input = {
      message: 'No data',
    }
    expect(() => DataResponseSchema.parse(input)).toThrow()
  })

  it('validates data type', () => {
    const input = {
      data: { invalid: 'object' },
    }
    expect(() => DataResponseSchema.parse(input)).toThrow()
  })
})

describe('ErrorCodes', () => {
  it('has VALIDATION_ERROR', () => {
    expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
  })

  it('has NOT_FOUND', () => {
    expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND')
  })

  it('has UNAUTHORIZED', () => {
    expect(ErrorCodes.UNAUTHORIZED).toBe('UNAUTHORIZED')
  })

  it('has FORBIDDEN', () => {
    expect(ErrorCodes.FORBIDDEN).toBe('FORBIDDEN')
  })

  it('has CONFLICT', () => {
    expect(ErrorCodes.CONFLICT).toBe('CONFLICT')
  })

  it('has INTERNAL_ERROR', () => {
    expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR')
  })

  it('has BAD_REQUEST', () => {
    expect(ErrorCodes.BAD_REQUEST).toBe('BAD_REQUEST')
  })

  it('has RATE_LIMITED', () => {
    expect(ErrorCodes.RATE_LIMITED).toBe('RATE_LIMITED')
  })

  it('has SERVICE_UNAVAILABLE', () => {
    expect(ErrorCodes.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE')
  })
})

describe('createErrorResponse', () => {
  it('creates error response with required fields', () => {
    const response = createErrorResponse('ERROR_CODE', 'Error message')
    expect(response.error).toBe('ERROR_CODE')
    expect(response.message).toBe('Error message')
    expect(response.details).toBeNull()
  })

  it('creates error response with details', () => {
    const details = { field: ['error1', 'error2'] }
    const response = createErrorResponse(
      ErrorCodes.VALIDATION_ERROR,
      'Validation failed',
      details
    )
    expect(response.details).toEqual(details)
  })

  it('creates error response with null details', () => {
    const response = createErrorResponse('ERROR', 'Message', null)
    expect(response.details).toBeNull()
  })

  it('uses ErrorCodes constants', () => {
    const response = createErrorResponse(ErrorCodes.FORBIDDEN, 'Access denied')
    expect(response.error).toBe('FORBIDDEN')
  })

  it('throws on invalid input', () => {
    expect(() => createErrorResponse('', 'Message')).toThrow()
    expect(() => createErrorResponse('ERROR', '')).toThrow()
  })
})

describe('createSuccessResponse', () => {
  it('creates empty success response', () => {
    const response = createSuccessResponse()
    expect(response.message).toBeNull()
    expect(response.data).toBeNull()
  })

  it('creates success response with message', () => {
    const response = createSuccessResponse('Success!')
    expect(response.message).toBe('Success!')
    expect(response.data).toBeNull()
  })

  it('creates success response with data', () => {
    const data = { result: 'completed' }
    const response = createSuccessResponse(null, data)
    expect(response.message).toBeNull()
    expect(response.data).toEqual(data)
  })

  it('creates success response with both', () => {
    const response = createSuccessResponse('Created', { id: '123' })
    expect(response.message).toBe('Created')
    expect(response.data).toEqual({ id: '123' })
  })
})

describe('isErrorResponse', () => {
  it('returns true for valid error response', () => {
    const response = {
      error: 'NOT_FOUND',
      message: 'Resource not found',
    }
    expect(isErrorResponse(response)).toBe(true)
  })

  it('returns true for error response with details', () => {
    const response = {
      error: 'VALIDATION_ERROR',
      message: 'Invalid data',
      details: { field: ['error'] },
    }
    expect(isErrorResponse(response)).toBe(true)
  })

  it('returns false for success response', () => {
    const response = {
      message: 'Success',
      data: { id: '123' },
    }
    expect(isErrorResponse(response)).toBe(false)
  })

  it('returns false for null', () => {
    expect(isErrorResponse(null)).toBe(false)
  })

  it('returns false for undefined', () => {
    expect(isErrorResponse(undefined)).toBe(false)
  })

  it('returns false for string', () => {
    expect(isErrorResponse('error')).toBe(false)
  })

  it('returns false for empty object', () => {
    expect(isErrorResponse({})).toBe(false)
  })
})

describe('getFieldErrors', () => {
  it('returns errors for existing field', () => {
    const response = {
      error: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: {
        email: ['Invalid format', 'Already exists'],
      },
    }
    const errors = getFieldErrors(response, 'email')
    expect(errors).toEqual(['Invalid format', 'Already exists'])
  })

  it('returns empty array for missing field', () => {
    const response = {
      error: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: {
        email: ['Invalid'],
      },
    }
    const errors = getFieldErrors(response, 'name')
    expect(errors).toEqual([])
  })

  it('returns empty array when no details', () => {
    const response = {
      error: 'ERROR',
      message: 'Error',
    }
    const errors = getFieldErrors(response, 'field')
    expect(errors).toEqual([])
  })

  it('returns empty array when details is null', () => {
    const response = {
      error: 'ERROR',
      message: 'Error',
      details: null,
    }
    const errors = getFieldErrors(response, 'field')
    expect(errors).toEqual([])
  })

  it('wraps single string error in array', () => {
    const response = {
      error: 'VALIDATION_ERROR',
      message: 'Error',
      details: {
        name: 'Required',
      },
    }
    const errors = getFieldErrors(response, 'name')
    expect(errors).toEqual(['Required'])
  })

  it('filters out non-string errors', () => {
    const response = {
      error: 'VALIDATION_ERROR',
      message: 'Error',
      details: {
        field: ['valid', 123, 'also valid', null],
      },
    }
    const errors = getFieldErrors(response, 'field')
    expect(errors).toEqual(['valid', 'also valid'])
  })
})

describe('formatErrorMessage', () => {
  it('returns message when no details', () => {
    const response = {
      error: 'ERROR',
      message: 'Something went wrong',
    }
    expect(formatErrorMessage(response)).toBe('Something went wrong')
  })

  it('returns message when details is null', () => {
    const response = {
      error: 'ERROR',
      message: 'Something went wrong',
      details: null,
    }
    expect(formatErrorMessage(response)).toBe('Something went wrong')
  })

  it('returns message when details is empty', () => {
    const response = {
      error: 'ERROR',
      message: 'Something went wrong',
      details: {},
    }
    expect(formatErrorMessage(response)).toBe('Something went wrong')
  })

  it('formats message with field errors', () => {
    const response = {
      error: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: {
        email: ['Invalid format'],
        name: ['Required'],
      },
    }
    const result = formatErrorMessage(response)
    expect(result).toContain('Validation failed')
    expect(result).toContain('email: Invalid format')
    expect(result).toContain('name: Required')
  })

  it('formats multiple errors per field', () => {
    const response = {
      error: 'VALIDATION_ERROR',
      message: 'Errors',
      details: {
        password: ['Too short', 'No number'],
      },
    }
    const result = formatErrorMessage(response)
    expect(result).toContain('password: Too short, No number')
  })

  it('handles string error values', () => {
    const response = {
      error: 'VALIDATION_ERROR',
      message: 'Error',
      details: {
        field: 'Single error string',
      },
    }
    const result = formatErrorMessage(response)
    expect(result).toContain('field: Single error string')
  })

  it('ignores non-string/array values', () => {
    const response = {
      error: 'ERROR',
      message: 'Error occurred',
      details: {
        field: { nested: 'object' },
      },
    }
    expect(formatErrorMessage(response)).toBe('Error occurred')
  })
})

describe('calculatePaginationInfo', () => {
  it('calculates for first page', () => {
    const result = calculatePaginationInfo(50, 1, 10)
    expect(result.total_pages).toBe(5)
    expect(result.has_next).toBe(true)
    expect(result.has_previous).toBe(false)
  })

  it('calculates for middle page', () => {
    const result = calculatePaginationInfo(50, 3, 10)
    expect(result.total_pages).toBe(5)
    expect(result.has_next).toBe(true)
    expect(result.has_previous).toBe(true)
  })

  it('calculates for last page', () => {
    const result = calculatePaginationInfo(50, 5, 10)
    expect(result.total_pages).toBe(5)
    expect(result.has_next).toBe(false)
    expect(result.has_previous).toBe(true)
  })

  it('calculates for single page', () => {
    const result = calculatePaginationInfo(5, 1, 10)
    expect(result.total_pages).toBe(1)
    expect(result.has_next).toBe(false)
    expect(result.has_previous).toBe(false)
  })

  it('calculates for zero total', () => {
    const result = calculatePaginationInfo(0, 1, 10)
    expect(result.total_pages).toBe(0)
    expect(result.has_next).toBe(false)
    expect(result.has_previous).toBe(false)
  })

  it('rounds up total_pages', () => {
    const result = calculatePaginationInfo(51, 1, 10)
    expect(result.total_pages).toBe(6)
  })

  it('exact fit for pages', () => {
    const result = calculatePaginationInfo(100, 1, 10)
    expect(result.total_pages).toBe(10)
  })
})

describe('createPaginatedResponse', () => {
  it('creates paginated response with calculated fields', () => {
    const items = ['a', 'b', 'c']
    const result = createPaginatedResponse(items, 100, 2, 10)
    expect(result.items).toEqual(items)
    expect(result.total).toBe(100)
    expect(result.page).toBe(2)
    expect(result.page_size).toBe(10)
    expect(result.total_pages).toBe(10)
    expect(result.has_next).toBe(true)
    expect(result.has_previous).toBe(true)
  })

  it('creates first page response', () => {
    const result = createPaginatedResponse(['x'], 50, 1, 25)
    expect(result.has_previous).toBe(false)
    expect(result.has_next).toBe(true)
  })

  it('creates last page response', () => {
    const result = createPaginatedResponse(['x'], 50, 2, 25)
    expect(result.has_previous).toBe(true)
    expect(result.has_next).toBe(false)
  })

  it('creates empty response', () => {
    const result = createPaginatedResponse([], 0, 1, 10)
    expect(result.items).toEqual([])
    expect(result.total_pages).toBe(0)
    expect(result.has_next).toBe(false)
    expect(result.has_previous).toBe(false)
  })

  it('preserves item types', () => {
    const items: SampleItem[] = [
      { id: '1', name: 'Test', value: 100 },
      { id: '2', name: 'Test 2', value: 200 },
    ]
    const result = createPaginatedResponse(items, 2, 1, 10)
    expect(result.items[0].id).toBe('1')
    expect(result.items[1].value).toBe(200)
  })
})
