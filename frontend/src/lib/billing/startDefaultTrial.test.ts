/**
 * Tests for startDefaultTrial — the shared resilient trial auto-start helper.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authenticatedFetch = vi.fn()
const toastError = vi.fn()
const loggerWarn = vi.fn()
const { mockCapturedHttpFailures, mockCapturedUnexpectedErrors } = vi.hoisted(
  () => ({
    mockCapturedHttpFailures: vi.fn(),
    mockCapturedUnexpectedErrors: vi.fn(),
  })
)

vi.mock('@/api/authFetch', () => ({
  authenticatedFetch: (...args: unknown[]) => authenticatedFetch(...args),
}))
vi.mock('@/components/ui/sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}))
vi.mock('@/lib/logger', () => ({
  logger: { warn: (...args: unknown[]) => loggerWarn(...args) },
}))
vi.mock('@/lib/sentry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sentry')>()
  return {
    ...actual,
    captureUnexpectedError: (error: unknown, context: unknown) => {
      if (actual.shouldReportError(error)) {
        mockCapturedUnexpectedErrors(error, context)
      }
    },
    captureHttpFailure: (context: unknown) => {
      mockCapturedHttpFailures(context)
    },
  }
})

import { startDefaultTrial, TRIAL_FALLBACK_MESSAGE } from './startDefaultTrial'
import { ApiError } from '@/api/errors'

describe('startDefaultTrial', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true and posts to the start-default endpoint on success', async () => {
    authenticatedFetch.mockResolvedValue(new Response('{}', { status: 200 }))

    const result = await startDefaultTrial()

    expect(result).toBe(true)
    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/v1/billing/trial/start-default',
      { method: 'POST' }
    )
    expect(toastError).not.toHaveBeenCalled()
    expect(mockCapturedUnexpectedErrors).not.toHaveBeenCalled()
  })

  it('surfaces the backend detail on a non-ok response', async () => {
    authenticatedFetch.mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Subscription is paused' }), {
        status: 409,
      })
    )

    const result = await startDefaultTrial()

    expect(result).toBe(false)
    expect(toastError).toHaveBeenCalledWith('Subscription is paused')
    expect(loggerWarn).toHaveBeenCalled()
    expect(mockCapturedHttpFailures).not.toHaveBeenCalled()
    expect(mockCapturedUnexpectedErrors).not.toHaveBeenCalled()
  })

  it('falls back to the default message and reports a server response safely', async () => {
    authenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ detail: 'sql leaked tenant@example.com' }),
        {
          status: 500,
        }
      )
    )

    const result = await startDefaultTrial()

    expect(result).toBe(false)
    expect(toastError).toHaveBeenCalledWith(TRIAL_FALLBACK_MESSAGE)
    expect(mockCapturedHttpFailures).toHaveBeenCalledWith({
      operation: 'start-default-trial',
      surface: 'billing',
      path: '/api/v1/billing/trial/start-default',
      statusCode: 500,
    })
    expect(mockCapturedUnexpectedErrors).not.toHaveBeenCalled()
  })

  it('shows the fallback toast when a non-auth error is thrown', async () => {
    authenticatedFetch.mockRejectedValue(new Error('network down'))

    const result = await startDefaultTrial()

    expect(result).toBe(false)
    expect(toastError).toHaveBeenCalledWith(TRIAL_FALLBACK_MESSAGE)
    expect(loggerWarn).toHaveBeenCalled()
    expect(mockCapturedUnexpectedErrors).toHaveBeenCalledWith(
      expect.any(Error),
      {
        operation: 'start-default-trial',
        surface: 'billing',
        path: '/api/v1/billing/trial/start-default',
      }
    )
  })

  it('suppresses the toast when an auth error is thrown (redirect already underway)', async () => {
    authenticatedFetch.mockRejectedValue(new ApiError('Session expired', 401))

    const result = await startDefaultTrial()

    expect(result).toBe(false)
    expect(toastError).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalled()
    expect(mockCapturedUnexpectedErrors).not.toHaveBeenCalled()
  })
})
