import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock @sentry/react before importing our module
vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'BrowserTracing' })),
  replayIntegration: vi.fn(() => ({ name: 'Replay' })),
}))

// Mock correlationId module
vi.mock('./correlationId', () => ({
  getCorrelationId: vi.fn(),
}))

import * as Sentry from '@sentry/react'
import { getCorrelationId } from './correlationId'
import {
  _scrubObject,
  _scrubString,
  captureException,
  captureHttpFailure,
  captureUnexpectedError,
  initSentry,
  shouldReportError,
} from './sentry'

const mockGetCorrelationId = vi.mocked(getCorrelationId)
const mockSentryInit = vi.mocked(Sentry.init)
const mockSentryCaptureException = vi.mocked(Sentry.captureException)

beforeEach(() => {
  vi.clearAllMocks()
  mockGetCorrelationId.mockReturnValue(null)
})

// ── scrubString ───────────────────────────────────────────────────────────────

describe('scrubString', () => {
  it('scrubs email addresses', () => {
    const result = _scrubString('contact user@example.com please')
    expect(result).not.toContain('user@example.com')
    expect(result).toContain('[email]')
  })

  it('scrubs JWT tokens', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9' +
      '.eyJzdWIiOiJ1c2VyLTEyMyIsImV4cCI6OTk5OTk5OX0' +
      '.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const result = _scrubString(jwt)
    expect(result).not.toContain('eyJhbGciOi')
    expect(result).toContain('[token]')
  })

  it('scrubs IPv4 addresses', () => {
    const result = _scrubString('request from 10.0.0.1 blocked')
    expect(result).not.toContain('10.0.0.1')
    expect(result).toContain('[ip]')
  })

  it('passes non-sensitive strings through unchanged', () => {
    const value = 'tenant_id=abc123 status=active'
    expect(_scrubString(value)).toBe(value)
  })
})

// ── scrubObject ───────────────────────────────────────────────────────────────

describe('scrubObject', () => {
  it('redacts password key', () => {
    const result = _scrubObject({ password: 'hunter2' })
    expect(result['password']).toBe('[redacted]')
  })

  it('redacts token key', () => {
    const result = _scrubObject({ token: 'abc123' })
    expect(result['token']).toBe('[redacted]')
  })

  it('redacts authorization key (case-insensitive)', () => {
    const result = _scrubObject({ Authorization: 'Bearer secret' })
    expect(result['Authorization']).toBe('[redacted]')
  })

  it('scrubs email in string value', () => {
    const result = _scrubObject({ message: 'sent to jane@test.com' })
    expect(result['message']).not.toContain('jane@test.com')
    expect(result['message'] as string).toContain('[email]')
  })

  it('recursively scrubs nested objects', () => {
    const result = _scrubObject({
      outer: { password: 'secret', username: 'bob' },
    })
    const outer = result['outer'] as Record<string, unknown>
    expect(outer['password']).toBe('[redacted]')
    expect(outer['username']).toBe('bob')
  })

  it('scrubs PII in list string elements', () => {
    const result = _scrubObject({
      errors: ['failed for user@example.com', 'ok'],
    })
    const errors = result['errors'] as string[]
    expect(errors[0]).not.toContain('user@example.com')
    expect(errors[0]).toContain('[email]')
    expect(errors[1]).toBe('ok')
  })
})

// ── beforeSend (tested via exported internal) ─────────────────────────────────
// We test beforeSend indirectly through the module: we call initSentry with a
// mock DSN and then inspect the before_send argument passed to Sentry.init.

describe('beforeSend', () => {
  const DSN = 'https://abc123@o0.ingest.sentry.io/0'

  function getBeforeSend() {
    vi.stubEnv('VITE_SENTRY_DSN', DSN)
    initSentry()
    const callArg = mockSentryInit.mock.calls[0]?.[0] as
      | { beforeSend?: (...args: unknown[]) => unknown }
      | undefined
    vi.unstubAllEnvs()
    return callArg?.beforeSend
  }

  it('attaches correlation_id tag when present', () => {
    mockGetCorrelationId.mockReturnValue('corr-abc-123')
    const beforeSend = getBeforeSend()
    expect(beforeSend).toBeDefined()
    const event = { tags: {} as Record<string, string> }
    const result = beforeSend!(event, {})
    expect(result?.tags?.correlation_id).toBe('corr-abc-123')
  })

  it('does not add correlation_id tag when null', () => {
    mockGetCorrelationId.mockReturnValue(null)
    const beforeSend = getBeforeSend()
    const event = { tags: {} as Record<string, string> }
    const result = beforeSend!(event, {})
    expect(result?.tags?.correlation_id).toBeUndefined()
  })

  it('scrubs request headers', () => {
    const beforeSend = getBeforeSend()
    const event = {
      request: {
        headers: {
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        },
      },
    }
    const result = beforeSend!(event, {})
    expect(result?.request?.headers?.Authorization).toBe('[redacted]')
    expect(result?.request?.headers?.['Content-Type']).toBe('application/json')
  })

  it('deletes request.env', () => {
    const beforeSend = getBeforeSend()
    const event = {
      request: {
        env: { SERVER_NAME: 'my-server' },
      },
    }
    const result = beforeSend!(event, {})
    expect(result?.request?.env).toBeUndefined()
  })

  it('scrubs extra context', () => {
    const beforeSend = getBeforeSend()
    const event = {
      extra: { token: 'super-secret', tenant_id: 't-abc' },
    }
    const result = beforeSend!(event, {})
    expect(result?.extra?.token).toBe('[redacted]')
    expect(result?.extra?.tenant_id).toBe('t-abc')
  })

  it('scrubs raw exception messages', () => {
    const beforeSend = getBeforeSend()
    const event = {
      exception: {
        values: [
          {
            value:
              'Failed for jane@example.com with token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
          },
        ],
      },
    }
    const result = beforeSend!(event, {})
    const value = result?.exception?.values?.[0]?.value
    expect(value).not.toContain('jane@example.com')
    expect(value).not.toContain('eyJhbGciOi')
    expect(value).toContain('[email]')
    expect(value).toContain('[token]')
  })

  it('returns the event (not null)', () => {
    const beforeSend = getBeforeSend()
    const result = beforeSend!({}, {})
    expect(result).not.toBeNull()
  })
})

// ── initSentry ────────────────────────────────────────────────────────────────

describe('initSentry', () => {
  it('does nothing when VITE_SENTRY_DSN is empty', () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    initSentry()
    expect(mockSentryInit).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('passes beforeSend hook to Sentry.init', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@o0.ingest.sentry.io/1')
    initSentry()
    const arg = mockSentryInit.mock.calls[0]?.[0] as Record<string, unknown>
    expect(typeof arg.beforeSend).toBe('function')
    vi.unstubAllEnvs()
  })

  it('calls Sentry.init with the correct DSN', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@o0.ingest.sentry.io/1')
    initSentry()
    expect(mockSentryInit).toHaveBeenCalledOnce()
    const arg = mockSentryInit.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.dsn).toBe('https://abc@o0.ingest.sentry.io/1')
    vi.unstubAllEnvs()
  })

  it('sets sendDefaultPii to false', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@o0.ingest.sentry.io/1')
    initSentry()
    const arg = mockSentryInit.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.sendDefaultPii).toBe(false)
    vi.unstubAllEnvs()
  })

  it('sets tracesSampleRate to 0.1', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@o0.ingest.sentry.io/1')
    initSentry()
    const arg = mockSentryInit.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.tracesSampleRate).toBe(0.1)
    vi.unstubAllEnvs()
  })

  it('sets replaysOnErrorSampleRate to 1.0', () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@o0.ingest.sentry.io/1')
    initSentry()
    const arg = mockSentryInit.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arg.replaysOnErrorSampleRate).toBe(1.0)
    vi.unstubAllEnvs()
  })
})

// ── captureException ──────────────────────────────────────────────────────────

describe('captureException', () => {
  it('calls Sentry.captureException', () => {
    const err = new Error('test error')
    captureException(err)
    expect(mockSentryCaptureException).toHaveBeenCalledOnce()
    expect(mockSentryCaptureException).toHaveBeenCalledWith(
      err,
      expect.any(Object)
    )
  })

  it('attaches context tag when provided', () => {
    const err = new Error('ctx error')
    captureException(err, 'my-context')
    const callArg = mockSentryCaptureException.mock.calls[0]?.[1] as {
      tags?: Record<string, string>
    }
    expect(callArg?.tags?.context).toBe('my-context')
  })

  it('attaches correlation_id tag when set', () => {
    mockGetCorrelationId.mockReturnValue('corr-xyz-789')
    captureException(new Error('err'))
    const callArg = mockSentryCaptureException.mock.calls[0]?.[1] as {
      tags?: Record<string, string>
    }
    expect(callArg?.tags?.correlation_id).toBe('corr-xyz-789')
  })

  it('does not throw when Sentry is not initialised', () => {
    // captureException is always safe; Sentry is a no-op when not init'd
    expect(() => captureException(new Error('safe'))).not.toThrow()
  })
})

describe('reporting policy', () => {
  it('does not report expected client ApiError status codes', async () => {
    const { ApiError } = await import('@/api/errors')

    for (const statusCode of [400, 401, 403, 404, 409, 422, 429]) {
      expect(shouldReportError(new ApiError('expected', statusCode))).toBe(
        false
      )
    }
  })

  it('reports server and network ApiError failures', async () => {
    const { ApiError } = await import('@/api/errors')

    expect(shouldReportError(new ApiError('server failed', 500))).toBe(true)
    expect(shouldReportError(new ApiError('network failed', 0))).toBe(true)
  })

  it('reports non-ApiError exceptions', () => {
    expect(shouldReportError(new Error('render failed'))).toBe(true)
  })

  it('does not report known expected auth errors thrown as plain Error', () => {
    expect(shouldReportError(new Error('Authentication required'))).toBe(false)
  })

  it('captureUnexpectedError reports only unexpected errors', async () => {
    const { ApiError } = await import('@/api/errors')

    captureUnexpectedError(new ApiError('invalid input', 422), {
      operation: 'save-form',
    })
    expect(mockSentryCaptureException).not.toHaveBeenCalled()

    const error = new ApiError('server failed', 500)
    captureUnexpectedError(error, { operation: 'save-form' })
    expect(mockSentryCaptureException).toHaveBeenCalledOnce()
  })

  it('captureHttpFailure reports a generic status message without backend detail', () => {
    captureHttpFailure({
      operation: 'checkout',
      surface: 'billing',
      path: '/api/v1/billing/checkout',
      statusCode: 500,
    })

    expect(mockSentryCaptureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'HTTP request failed with status 500',
      }),
      expect.objectContaining({
        tags: expect.objectContaining({
          operation: 'checkout',
          path: '/api/v1/billing/checkout',
          status_code: '500',
          surface: 'billing',
        }),
      })
    )
  })
})
