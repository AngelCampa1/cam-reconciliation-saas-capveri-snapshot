/**
 * Tests for API Error Handling Utilities
 */
import { describe, it, expect } from 'vitest'
import {
  ApiError,
  isApiError,
  isErrorEnvelope,
  getErrorMessage,
} from './errors'

describe('ApiError', () => {
  describe('constructor and properties', () => {
    it('creates error with message and status code', () => {
      const error = new ApiError('Not found', 404)

      expect(error.message).toBe('Not found')
      expect(error.statusCode).toBe(404)
      expect(error.name).toBe('ApiError')
      expect(error.errors).toBeUndefined()
    })

    it('includes validation errors when provided', () => {
      const validationErrors = [
        { loc: ['body', 'name'], msg: 'Required', type: 'missing' },
        { loc: ['body', 'email'], msg: 'Invalid email', type: 'value_error' },
      ]
      const error = new ApiError('Validation failed', 422, validationErrors)

      expect(error.errors).toEqual(validationErrors)
      expect(error.isValidationError).toBe(true)
    })
  })

  describe('status type checks', () => {
    it('identifies auth errors (401)', () => {
      const error = new ApiError('Unauthorized', 401)
      expect(error.isAuthError).toBe(true)
      expect(error.isForbiddenError).toBe(false)
    })

    it('identifies forbidden errors (403)', () => {
      const error = new ApiError('Forbidden', 403)
      expect(error.isForbiddenError).toBe(true)
    })

    it('identifies not found errors (404)', () => {
      const error = new ApiError('Not found', 404)
      expect(error.isNotFoundError).toBe(true)
    })

    it('identifies server errors (5xx)', () => {
      expect(new ApiError('Error', 500).isServerError).toBe(true)
      expect(new ApiError('Error', 502).isServerError).toBe(true)
      expect(new ApiError('Error', 599).isServerError).toBe(true)
      expect(new ApiError('Error', 400).isServerError).toBe(false)
    })
  })

  describe('getFieldErrors', () => {
    it('returns empty object when no validation errors', () => {
      const error = new ApiError('Error', 400)
      expect(error.getFieldErrors()).toEqual({})
    })

    it('maps validation errors to field names', () => {
      const error = new ApiError('Validation failed', 422, [
        { loc: ['body', 'name'], msg: 'Required', type: 'missing' },
        { loc: ['body', 'email'], msg: 'Invalid format', type: 'value_error' },
      ])

      expect(error.getFieldErrors()).toEqual({
        name: 'Required',
        email: 'Invalid format',
      })
    })
  })

  describe('getUserMessage', () => {
    it('returns appropriate message for each error type', () => {
      expect(new ApiError('', 401).getUserMessage()).toContain('session')
      expect(new ApiError('', 403).getUserMessage()).toContain('permission')
      expect(new ApiError('', 404).getUserMessage()).toContain('not found')
      expect(new ApiError('', 500).getUserMessage()).toContain('unexpected')
    })

    it('returns first validation error message', () => {
      const error = new ApiError('Validation failed', 422, [
        { loc: ['body', 'name'], msg: 'Name is required', type: 'missing' },
      ])
      expect(error.getUserMessage()).toContain('Name is required')
    })

    it('returns original message for other errors', () => {
      const error = new ApiError('Custom error', 400)
      expect(error.getUserMessage()).toBe('Custom error')
    })
  })

  describe('fromResponse', () => {
    it('extracts string detail from response', async () => {
      const response = new Response(
        JSON.stringify({ detail: 'Resource not found' }),
        {
          status: 404,
        }
      )

      const error = await ApiError.fromResponse(response)

      expect(error.message).toBe('Resource not found')
      expect(error.statusCode).toBe(404)
    })

    it('extracts validation errors from response', async () => {
      const response = new Response(
        JSON.stringify({
          detail: [{ loc: ['body', 'name'], msg: 'Required', type: 'missing' }],
        }),
        { status: 422 }
      )

      const error = await ApiError.fromResponse(response)

      expect(error.message).toBe('Validation failed')
      expect(error.errors).toHaveLength(1)
    })

    it('handles non-JSON response', async () => {
      const response = new Response('Not JSON', { status: 500 })

      const error = await ApiError.fromResponse(response)

      expect(error.statusCode).toBe(500)
      expect(error.message).toContain('500')
    })
  })

  describe('fromUnknown', () => {
    it('returns same error if already ApiError', () => {
      const original = new ApiError('Test', 400)
      expect(ApiError.fromUnknown(original)).toBe(original)
    })

    it('wraps Error instances', () => {
      const original = new Error('Network failed')
      const wrapped = ApiError.fromUnknown(original)

      expect(wrapped.message).toBe('Network failed')
      expect(wrapped.statusCode).toBe(0)
      expect(wrapped.originalError).toBe(original)
    })

    it('handles non-Error values', () => {
      const wrapped = ApiError.fromUnknown('string error')
      expect(wrapped.message).toBe('string error')
      expect(wrapped.statusCode).toBe(0)
    })

    it('extracts statusCode and detail string from backend envelope', () => {
      const envelope = {
        status_code: 400,
        message: 'Bad request',
        detail:
          'No finalized snapshots found for current period 2025-01-01 to 2025-12-31',
      }
      const wrapped = ApiError.fromUnknown(envelope)

      expect(wrapped.statusCode).toBe(400)
      expect(wrapped.message).toBe(
        'No finalized snapshots found for current period 2025-01-01 to 2025-12-31'
      )
    })

    it('extracts statusCode, errors array, and message field from 422 envelope', () => {
      const envelope = {
        status_code: 422,
        message: 'Bad request',
        detail: [{ loc: ['body', 'x'], msg: 'required', type: 'missing' }],
      }
      const wrapped = ApiError.fromUnknown(envelope)

      expect(wrapped.statusCode).toBe(422)
      expect(wrapped.errors).toHaveLength(1)
      expect(wrapped.errors![0].msg).toBe('required')
      expect(wrapped.message).toBe('Bad request')
    })

    it('falls back to statusCode 0 for plain objects without status_code', () => {
      const plain = { code: 'X', detail: 'y' }
      const wrapped = ApiError.fromUnknown(plain)

      expect(wrapped.statusCode).toBe(0)
    })
  })
})

describe('isApiError', () => {
  it('returns true for ApiError instances', () => {
    expect(isApiError(new ApiError('Test', 400))).toBe(true)
  })

  it('returns false for other errors', () => {
    expect(isApiError(new Error('Test'))).toBe(false)
    expect(isApiError(null)).toBe(false)
    expect(isApiError('error')).toBe(false)
  })
})

describe('isErrorEnvelope', () => {
  it('returns true for a backend envelope with a numeric status_code', () => {
    expect(isErrorEnvelope({ status_code: 400, detail: 'Bad request' })).toBe(
      true
    )
  })

  it('returns false when status_code is missing or not a number', () => {
    expect(isErrorEnvelope({ detail: 'Bad request' })).toBe(false)
    expect(isErrorEnvelope({ status_code: '400' })).toBe(false)
  })

  it('returns false for null, primitives, and arrays', () => {
    expect(isErrorEnvelope(null)).toBe(false)
    expect(isErrorEnvelope('error')).toBe(false)
    expect(isErrorEnvelope(400)).toBe(false)
    expect(isErrorEnvelope([{ status_code: 400 }])).toBe(false)
  })
})

describe('getErrorMessage', () => {
  it('returns user message for ApiError', () => {
    const error = new ApiError('Custom', 401)
    expect(getErrorMessage(error)).toContain('session')
  })

  it('returns message for regular Error', () => {
    expect(getErrorMessage(new Error('Test error'))).toBe('Test error')
  })

  it('returns default message for unknown errors', () => {
    expect(getErrorMessage(null)).toBe('An unexpected error occurred')
    expect(getErrorMessage(undefined)).toBe('An unexpected error occurred')
  })
})
