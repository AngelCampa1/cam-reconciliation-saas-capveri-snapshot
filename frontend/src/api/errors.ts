/**
 * API Error Handling Utilities
 *
 * Custom error classes and utilities for handling API errors
 * in a consistent, user-friendly manner.
 */

/**
 * Validation error detail from FastAPI's HTTPValidationError
 */
export interface ValidationErrorDetail {
  loc: (string | number)[]
  msg: string
  type: string
}

/**
 * Custom API error class with enhanced error information.
 *
 * Provides structured access to error details for UI display
 * and form validation integration.
 */
export class ApiError extends Error {
  public readonly statusCode: number
  public readonly errors: ValidationErrorDetail[] | undefined
  public readonly originalError: unknown | undefined

  constructor(
    message: string,
    statusCode: number,
    errors?: ValidationErrorDetail[],
    originalError?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.errors = errors
    this.originalError = originalError

    // Maintains proper stack trace for where error was thrown (V8 engines)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError)
    }
  }

  /**
   * Check if this is a validation error (422)
   */
  get isValidationError(): boolean {
    return this.statusCode === 422
  }

  /**
   * Check if this is an authentication error (401)
   */
  get isAuthError(): boolean {
    return this.statusCode === 401
  }

  /**
   * Check if this is a forbidden error (403)
   */
  get isForbiddenError(): boolean {
    return this.statusCode === 403
  }

  /**
   * Check if this is a payment required error (402).
   * Indicates the trial has ended and the user must pick a plan.
   */
  get isPaymentRequiredError(): boolean {
    return this.statusCode === 402
  }

  /**
   * Check if this is a not found error (404)
   */
  get isNotFoundError(): boolean {
    return this.statusCode === 404
  }

  /**
   * Check if this is a server error (5xx)
   */
  get isServerError(): boolean {
    return this.statusCode >= 500 && this.statusCode < 600
  }

  /**
   * Get field-level errors for form handling.
   * Maps validation errors to field names with messages.
   *
   * @returns Record of field names to error messages
   */
  getFieldErrors(): Record<string, string> {
    if (!this.errors) return {}

    return this.errors.reduce(
      (acc, error) => {
        // Get the last element of loc as the field name
        const field = String(error.loc[error.loc.length - 1])
        acc[field] = error.msg
        return acc
      },
      {} as Record<string, string>
    )
  }

  /**
   * Get a user-friendly error message.
   * Provides appropriate messages based on error type.
   */
  getUserMessage(): string {
    if (this.isAuthError) {
      return 'Your session has expired. Please log in again.'
    }
    if (this.isPaymentRequiredError) {
      return 'Your trial has ended. Pick a plan to keep going.'
    }
    if (this.isForbiddenError) {
      return "You don't have permission to perform this action."
    }
    if (this.isNotFoundError) {
      return 'The requested resource was not found.'
    }
    if (this.isServerError) {
      return 'An unexpected error occurred. Please try again later.'
    }
    if (this.isValidationError) {
      const firstError = this.errors?.[0]
      if (firstError) {
        return `Validation failed: ${firstError.msg}`
      }
    }
    return this.message
  }

  /**
   * Create an ApiError from a Response object
   */
  static async fromResponse(response: Response): Promise<ApiError> {
    let message = `Request failed with status ${response.status}`
    let errors: ValidationErrorDetail[] | undefined

    try {
      // Clone the response in case the body was already consumed
      const clonedResponse = response.clone()
      const body = await clonedResponse.json()
      if (body.detail) {
        if (typeof body.detail === 'string') {
          message = body.detail
        } else if (Array.isArray(body.detail)) {
          errors = body.detail
          message = 'Validation failed'
        }
      } else if (body.message) {
        message = body.message
      }
    } catch {
      // Ignore JSON parse errors, use default message
    }

    return new ApiError(message, response.status, errors)
  }

  /**
   * Create an ApiError from an unknown error
   */
  static fromUnknown(error: unknown): ApiError {
    if (error instanceof ApiError) {
      return error
    }
    if (error instanceof Error) {
      return new ApiError(error.message, 0, undefined, error)
    }
    // Recognise the backend JSON envelope: { status_code, message?, detail? }
    if (isErrorEnvelope(error)) {
      const envelope = error as Record<string, unknown>
      const statusCode = envelope['status_code'] as number
      const rawDetail = envelope['detail']
      const rawMessage = envelope['message']
      let message: string
      let errors: ValidationErrorDetail[] | undefined

      if (typeof rawDetail === 'string') {
        message = rawDetail
      } else if (Array.isArray(rawDetail)) {
        errors = rawDetail as ValidationErrorDetail[]
        message =
          typeof rawMessage === 'string' ? rawMessage : 'Validation failed'
      } else {
        // rawDetail is neither a string nor an array here (both handled above),
        // so fall back to the envelope message or a generic label.
        message = typeof rawMessage === 'string' ? rawMessage : 'Request failed'
      }

      return new ApiError(message, statusCode, errors, error)
    }
    return new ApiError(String(error), 0, undefined, error)
  }
}

/**
 * Type guard for the backend JSON error envelope: { status_code: number, ... }.
 *
 * The API returns this shape on 4xx/5xx. `@hey-api/client-fetch` parses and
 * consumes the response body, then hands this parsed object to the client error
 * interceptor, which uses this guard to decide whether to map it via
 * `ApiError.fromUnknown` (preserving status + detail) instead of re-reading the
 * already-consumed Response.
 */
export function isErrorEnvelope(
  error: unknown
): error is Record<string, unknown> & { status_code: number } {
  return (
    error !== null &&
    typeof error === 'object' &&
    'status_code' in error &&
    typeof (error as Record<string, unknown>)['status_code'] === 'number'
  )
}

/**
 * Type guard to check if an error is an ApiError
 */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/**
 * Get a user-friendly message from any error
 */
export function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return error.getUserMessage()
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'An unexpected error occurred'
}
