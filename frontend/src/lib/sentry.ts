/**
 * Sentry integration for CapVeri.
 *
 * Privacy-safe (sendDefaultPii: false). PII is scrubbed before any event
 * reaches the Sentry network. When VITE_SENTRY_DSN is empty the module is a
 * no-op --- safe in development and CI.
 */

import * as Sentry from '@sentry/react'

import { ApiError, isApiError } from '@/api/errors'
import { getCorrelationId } from './correlationId'

// ------ PII detection patterns ------------------------------------------------------------------------------------------------------------------------------------------------------------

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const JWT_RE = /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
const IP_RE =
  /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'api_key',
  'authorization',
  'cookie',
])

const EXPECTED_ERROR_MESSAGES = new Set(['Authentication required'])

// ------ PII scrubbing helpers ---------------------------------------------------------------------------------------------------------------------------------------------------------------

/** @internal --- exported for unit testing only */
export function _scrubString(value: string): string {
  return value
    .replace(JWT_RE, '[token]')
    .replace(EMAIL_RE, '[email]')
    .replace(IP_RE, '[ip]')
}

/** @internal --- exported for unit testing only */
export function _scrubObject(
  obj: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '[redacted]'
    } else if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      result[key] = _scrubObject(value as Record<string, unknown>)
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === 'string' ? _scrubString(item) : item
      )
    } else if (typeof value === 'string') {
      result[key] = _scrubString(value)
    } else {
      result[key] = value
    }
  }
  return result
}

function scrubExceptionValues(event: Sentry.ErrorEvent): void {
  const values = event.exception?.values
  if (!Array.isArray(values)) return

  for (const value of values) {
    if (typeof value.value === 'string') {
      value.value = _scrubString(value.value)
    }
  }
}

// ------ Sentry hook ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  // Attach correlation ID tag
  const correlationId = getCorrelationId()
  if (correlationId) {
    event.tags = { ...event.tags, correlation_id: correlationId }
  }

  // Scrub request data
  if (event.request) {
    if (event.request.headers && typeof event.request.headers === 'object') {
      event.request.headers = _scrubObject(
        event.request.headers as Record<string, unknown>
      ) as Record<string, string>
    }
    if (event.request.data && typeof event.request.data === 'object') {
      event.request.data = _scrubObject(
        event.request.data as Record<string, unknown>
      )
    }
    // Remove server environment info (may contain internal hostnames/IPs)
    delete event.request.env
  }

  // Scrub extra context
  if (event.extra && typeof event.extra === 'object') {
    event.extra = _scrubObject(event.extra as Record<string, unknown>)
  }

  scrubExceptionValues(event)

  return event
}

// ------ Public API ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export function initSentry(): void {
  const dsn = import.meta.env['VITE_SENTRY_DSN'] as string | undefined
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    sendDefaultPii: false,
    beforeSend,
  })
}

export function captureException(error: Error, context?: string): void {
  const correlationId = getCorrelationId()
  Sentry.captureException(error, {
    tags: {
      ...(context ? { context } : {}),
      ...(correlationId ? { correlation_id: correlationId } : {}),
    },
  })
}

export interface UnexpectedErrorContext {
  operation: string
  statusCode?: number
  path?: string | undefined
  surface?: string
}

export function shouldReportError(error: unknown): boolean {
  if (isApiError(error)) {
    return error.statusCode === 0 || error.statusCode >= 500
  }
  if (error instanceof Error && EXPECTED_ERROR_MESSAGES.has(error.message)) {
    return false
  }
  return error instanceof Error
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(String(error))
}

export function captureUnexpectedError(
  error: unknown,
  context: UnexpectedErrorContext
): void {
  if (!shouldReportError(error)) return

  const normalizedError = toError(error)
  const correlationId = getCorrelationId()
  const statusCode =
    context.statusCode ??
    (error instanceof ApiError ? error.statusCode : undefined)

  Sentry.captureException(normalizedError, {
    tags: {
      surface: context.surface ?? 'frontend',
      operation: context.operation,
      ...(statusCode !== undefined ? { status_code: String(statusCode) } : {}),
      ...(context.path ? { path: context.path } : {}),
      ...(correlationId ? { correlation_id: correlationId } : {}),
    },
  })
}

export function captureHttpFailure(
  context: UnexpectedErrorContext & {
    operation: string
    path: string
    statusCode: number
  }
): void {
  if (context.statusCode < 500) return

  captureUnexpectedError(
    new ApiError(
      `HTTP request failed with status ${context.statusCode}`,
      context.statusCode
    ),
    context
  )
}
