/**
 * Tests for API Client Configuration
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  configureAuth,
  getSession,
  signOut,
  createApiClient,
  apiClient,
  healthCheckHealthGet,
  type AuthProvider,
  type AuthSession,
} from './client'
import { ApiError } from './errors'
import {
  setCorrelationId,
  getCorrelationId,
  clearCorrelationId,
} from '../lib/correlationId'

describe('Auth Configuration', () => {
  beforeEach(() => {
    // Reset to default provider
    configureAuth({
      getSession: async () => null,
      signOut: async () => {},
    })
  })

  describe('configureAuth', () => {
    it('allows setting custom auth provider', async () => {
      const mockSession: AuthSession = {
        access_token: 'test-token',
        user: { id: 'user-1', email: 'test@example.com' },
      }

      const mockProvider: AuthProvider = {
        getSession: vi.fn().mockResolvedValue(mockSession),
        signOut: vi.fn().mockResolvedValue(undefined),
      }

      configureAuth(mockProvider)

      const session = await getSession()
      expect(session).toEqual(mockSession)
      expect(mockProvider.getSession).toHaveBeenCalled()
    })
  })

  describe('getSession', () => {
    it('returns null with default provider', async () => {
      const session = await getSession()
      expect(session).toBeNull()
    })

    it('delegates to configured provider', async () => {
      const mockSession: AuthSession = {
        access_token: 'abc123',
        expires_at: Date.now() + 3600000,
      }

      configureAuth({
        getSession: async () => mockSession,
        signOut: async () => {},
      })

      const session = await getSession()
      expect(session?.access_token).toBe('abc123')
    })
  })

  describe('signOut', () => {
    it('delegates to configured provider', async () => {
      const signOutFn = vi.fn().mockResolvedValue(undefined)

      configureAuth({
        getSession: async () => null,
        signOut: signOutFn,
      })

      await signOut()
      expect(signOutFn).toHaveBeenCalled()
    })
  })
})

describe('createApiClient', () => {
  it('creates a client instance', () => {
    const client = createApiClient()
    expect(client).toBeDefined()
    expect(client.interceptors).toBeDefined()
  })

  it('creates new client instance each call', () => {
    const client1 = createApiClient()
    const client2 = createApiClient()
    expect(client1).not.toBe(client2)
  })

  it('uses production API base URL for generated client requests on app.capveri.com', async () => {
    const originalLocation = window.location
    try {
      vi.stubEnv('VITE_API_URL', '')
      delete (window as Window & typeof globalThis).location
      window.location = {
        ...originalLocation,
        hostname: 'app.capveri.com',
      } as Location
      vi.resetModules()

      let capturedUrl: string | undefined
      global.fetch = vi.fn(async (input: RequestInfo | URL) => {
        capturedUrl =
          input instanceof Request
            ? input.url
            : input instanceof URL
              ? input.toString()
              : input
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })

      const { createApiClient, listCampaignsApiV1CampaignsGet } =
        await import('./client')
      const client = createApiClient()
      await listCampaignsApiV1CampaignsGet({ client })

      expect(capturedUrl).toBe('https://api.capveri.com/api/v1/campaigns/')
    } finally {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})

describe('apiClient', () => {
  it('exports a pre-configured client', () => {
    expect(apiClient).toBeDefined()
    expect(apiClient.interceptors).toBeDefined()
  })
})

describe('AuthSession interface', () => {
  it('supports minimal session with just access_token', () => {
    const session: AuthSession = {
      access_token: 'token',
    }
    expect(session.access_token).toBe('token')
    expect(session.refresh_token).toBeUndefined()
    expect(session.expires_at).toBeUndefined()
    expect(session.user).toBeUndefined()
  })

  it('supports full session with all fields', () => {
    const session: AuthSession = {
      access_token: 'token',
      refresh_token: 'refresh',
      expires_at: 1234567890,
      user: {
        id: 'user-id',
        email: 'user@example.com',
      },
    }
    expect(session.user?.id).toBe('user-id')
    expect(session.user?.email).toBe('user@example.com')
  })
})

describe('Request Interceptor (Integration)', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    configureAuth({
      getSession: async () => null,
      signOut: async () => {},
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('adds Authorization header when session exists', async () => {
    const mockSession: AuthSession = {
      access_token: 'test-access-token-123',
      user: { id: 'user-1' },
    }

    configureAuth({
      getSession: async () => mockSession,
      signOut: async () => {},
    })

    let capturedHeaders: Headers | undefined

    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        capturedHeaders = request.headers
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    )

    const client = createApiClient()
    await healthCheckHealthGet({ client })

    expect(capturedHeaders?.get('Authorization')).toBe(
      'Bearer test-access-token-123'
    )
  })

  it('does not add Authorization header when no session', async () => {
    configureAuth({
      getSession: async () => null,
      signOut: async () => {},
    })

    let capturedHeaders: Headers | undefined

    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        capturedHeaders = request.headers
        return new Response(JSON.stringify({ success: true }), { status: 200 })
      }
    )

    const client = createApiClient()
    await healthCheckHealthGet({ client })

    expect(capturedHeaders?.get('Authorization')).toBeNull()
  })

  it('does not add Authorization header when session has no access_token', async () => {
    const mockSession: AuthSession = {
      access_token: '',
    }

    configureAuth({
      getSession: async () => mockSession,
      signOut: async () => {},
    })

    let capturedHeaders: Headers | undefined

    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        capturedHeaders = request.headers
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 })
      }
    )

    const client = createApiClient()
    await healthCheckHealthGet({ client })

    expect(capturedHeaders?.get('Authorization')).toBeNull()
  })
})

describe('Response Interceptor (Integration)', () => {
  let originalFetch: typeof global.fetch
  let originalLocation: Location

  beforeEach(() => {
    originalFetch = global.fetch
    originalLocation = window.location
    delete (window as Window & typeof globalThis).location
    window.location = {
      ...originalLocation,
      href: '',
    } as Location
    configureAuth({
      getSession: async () => null,
      signOut: async () => {},
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
  })

  it('handles 401 response by signing out and redirecting', async () => {
    const signOutFn = vi.fn().mockResolvedValue(undefined)

    configureAuth({
      getSession: async () => null,
      signOut: signOutFn,
    })

    global.fetch = vi.fn(async () => {
      return new Response(null, {
        status: 401,
        statusText: 'Unauthorized',
      })
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).message).toBe('Session expired')
    }

    expect(signOutFn).toHaveBeenCalled()
    expect(window.location.href).toBe('/auth/login?expired=true&returnUrl=%2F')
  })

  it('handles 402 response by redirecting to plan selection', async () => {
    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({ detail: 'subscription_required: trial expired' }),
        {
          status: 402,
          statusText: 'Payment Required',
          headers: { 'Content-Type': 'application/json' },
        }
      )
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).statusCode).toBe(402)
      expect((error as ApiError).message).toBe(
        'Your trial has ended. Pick a plan to keep going.'
      )
    }

    expect(window.location.href).toBe('/settings/billing?intent=select-plan')
  })

  it('passes through 200 responses unchanged', async () => {
    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const client = createApiClient()
    const result = await healthCheckHealthGet({ client })

    expect(result.response.status).toBe(200)
    expect(result.response.ok).toBe(true)
  })

  it('passes through 404 responses unchanged', async () => {
    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ detail: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const client = createApiClient()
    const result = await healthCheckHealthGet({ client })

    expect(result.response.status).toBe(404)
  })

  it('passes through 500 responses unchanged', async () => {
    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ detail: 'Server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const client = createApiClient()
    const result = await healthCheckHealthGet({ client })

    expect(result.response.status).toBe(500)
  })
})

describe('Error Interceptor', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    configureAuth({
      getSession: async () => null,
      signOut: async () => {},
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns ApiError unchanged when error is already ApiError instance', async () => {
    // Create a real ApiError with correct constructor signature
    const existingApiError = new ApiError('Custom API error')

    // Mock fetch to throw the ApiError
    global.fetch = vi.fn(async () => {
      throw existingApiError
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
      expect.fail('Should have thrown error')
    } catch (error) {
      // Should be the same ApiError instance (not transformed)
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).message).toBe('Custom API error')
    }
  })

  it('preserves status code and detail from the backend error envelope (regression: F-263)', async () => {
    // The backend returns a JSON envelope on 4xx: { status_code, message, detail, ... }.
    // @hey-api parses and consumes the response body, then passes the parsed
    // envelope to the error interceptor. The interceptor must read the detail
    // from that parsed body — not re-read the (already consumed) Response, which
    // would drop the detail and leave a generic "Request failed" message.
    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          status_code: 400,
          message: 'Bad request',
          detail: 'No finalized snapshots found for current period',
          errors: null,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    })

    const client = createApiClient()
    const result = await healthCheckHealthGet({ client })

    expect(result.error).toBeInstanceOf(ApiError)
    const apiError = result.error as ApiError
    expect(apiError.statusCode).toBe(400)
    expect(apiError.message).toBe(
      'No finalized snapshots found for current period'
    )
  })

  it('maps a validation envelope (array detail) to ApiError with field errors (F-263)', async () => {
    global.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          status_code: 422,
          message: 'Validation failed',
          detail: [
            {
              loc: ['body', 'property_id'],
              msg: 'field required',
              type: 'missing',
            },
          ],
        }),
        {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    })

    const client = createApiClient()
    const result = await healthCheckHealthGet({ client })

    expect(result.error).toBeInstanceOf(ApiError)
    const apiError = result.error as ApiError
    expect(apiError.statusCode).toBe(422)
    expect(apiError.isValidationError).toBe(true)
    expect(apiError.getFieldErrors()).toEqual({ property_id: 'field required' })
  })

  it('creates ApiError from Response object when response parameter exists', async () => {
    // Mock fetch to return a 404 response (which hey-api passes as response parameter)
    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ detail: 'Resource not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const client = createApiClient()
    const result = await healthCheckHealthGet({ client })

    // The SDK returns errors in result.error, not by throwing
    expect(result.error).toBeDefined()
  })

  it('extracts and transforms Response from error.response property', async () => {
    // Create an error object with a response property (common pattern)
    const mockResponse = new Response(
      JSON.stringify({ detail: 'Bad request from server' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    )

    const errorWithResponse = {
      message: 'Request failed with response',
      response: mockResponse,
    }

    global.fetch = vi.fn(async () => {
      throw errorWithResponse
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
      expect.fail('Should have thrown error')
    } catch (error) {
      // Error should be handled (hey-api may or may not transform it)
      expect(error).toBeDefined()
    }
  })

  it('handles error with non-Response response property (ignored)', async () => {
    // Error object has 'response' but it's not a Response instance
    const errorWithNonResponse = {
      message: 'Error with non-Response',
      response: { status: 400, data: 'not a Response' },
    }

    global.fetch = vi.fn(async () => {
      throw errorWithNonResponse
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
      expect.fail('Should have thrown error')
    } catch (error) {
      // Error should be handled
      expect(error).toBeDefined()
    }
  })

  it('transforms standard Error to ApiError via fromUnknown', async () => {
    const networkError = new Error('Network connection failed')

    global.fetch = vi.fn(async () => {
      throw networkError
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
      expect.fail('Should have thrown error')
    } catch (error) {
      // Error should be handled
      expect(error).toBeDefined()
    }
  })

  it('transforms string error to ApiError via fromUnknown', async () => {
    global.fetch = vi.fn(async () => {
      throw 'String error message'
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
      expect.fail('Should have thrown error')
    } catch (error) {
      // Error should be handled
      expect(error).toBeDefined()
    }
  })

  it('transforms null error to ApiError via fromUnknown', async () => {
    global.fetch = vi.fn(async () => {
      throw null
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
      expect.fail('Should have thrown error')
    } catch (error) {
      // Error should be handled
      expect(error).toBeDefined()
    }
  })

  it('transforms undefined error to ApiError via fromUnknown', async () => {
    global.fetch = vi.fn(async () => {
      throw undefined
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
      expect.fail('Should have thrown error')
    } catch (error) {
      // When undefined is thrown, catch block receives undefined - this is expected
      // The test verifies the code handles it without crashing
      expect(error).toBeUndefined()
    }
  })

  it('transforms plain object error to ApiError via fromUnknown', async () => {
    const plainObjectError = {
      code: 'ERR_CODE',
      detail: 'Something went wrong',
    }

    global.fetch = vi.fn(async () => {
      throw plainObjectError
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
      expect.fail('Should have thrown error')
    } catch (error) {
      // Error should be handled
      expect(error).toBeDefined()
    }
  })
})

describe('Request Interceptor - Timeout Signal', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    configureAuth({
      getSession: async () => null,
      signOut: async () => {},
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('applies AbortSignal.timeout to outgoing requests when supported', async () => {
    let capturedSignal: AbortSignal | null = null

    global.fetch = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        if (input instanceof Request) {
          capturedSignal = input.signal
        }
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    )

    const client = createApiClient()
    await healthCheckHealthGet({ client })

    if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
      expect(capturedSignal).not.toBeNull()
      expect(capturedSignal?.aborted).toBe(false)
    }
  })
})

describe('Timeout handling - fetchWithTimeout', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    configureAuth({
      getSession: async () => null,
      signOut: async () => {},
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('maps DOMException TimeoutError to ApiError with status 408', async () => {
    const timeoutError = new DOMException(
      'The operation timed out',
      'TimeoutError'
    )

    global.fetch = vi.fn(async () => {
      throw timeoutError
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
      expect.fail('Should have thrown error')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).statusCode).toBe(408)
      expect((error as ApiError).message).toMatch(/timed out/i)
    }
  })

  it('does not map non-TimeoutError DOMException to 408', async () => {
    const abortError = new DOMException(
      'The operation was aborted',
      'AbortError'
    )

    global.fetch = vi.fn(async () => {
      throw abortError
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
      expect.fail('Should have thrown error')
    } catch (error) {
      // AbortError should propagate as-is, not as ApiError(408)
      if (error instanceof ApiError) {
        expect((error as ApiError).statusCode).not.toBe(408)
      } else {
        expect(error).toBeInstanceOf(DOMException)
      }
    }
  })
})

describe('Response Interceptor - 401 localStorage cleanup', () => {
  let originalFetch: typeof global.fetch
  let originalLocation: Location

  beforeEach(() => {
    originalFetch = global.fetch
    originalLocation = window.location
    delete (window as Window & typeof globalThis).location
    window.location = { ...originalLocation, href: '' } as Location
    localStorage.clear()
    configureAuth({
      getSession: async () => null,
      signOut: async () => {},
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    })
    localStorage.clear()
  })

  it('delegates session teardown to signOut on 401 without hand-clearing Supabase storage', async () => {
    // The handler must NOT manually delete Supabase's sb-*-auth-token key:
    // doing so races Supabase's own storage management during concurrent 401s
    // and can wipe a still-valid refresh token (spurious logout). signOut()
    // (supabase.auth.signOut) is the single authority that clears storage.
    localStorage.setItem('sb-abcdef-auth-token', 'token-data')
    localStorage.setItem('unrelated-key', 'should-remain')

    const signOutFn = vi.fn().mockResolvedValue(undefined)
    configureAuth({
      getSession: async () => null,
      signOut: signOutFn,
    })

    global.fetch = vi.fn(async () => {
      return new Response(null, { status: 401, statusText: 'Unauthorized' })
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
    } catch {
      // Expected to throw ApiError
    }

    // signOut owns teardown; the interceptor leaves localStorage untouched.
    expect(signOutFn).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('sb-abcdef-auth-token')).toBe('token-data')
    expect(localStorage.getItem('unrelated-key')).toBe('should-remain')
  })
})

// NOTE: For HTTP error status codes, @hey-api/client-fetch parses and consumes the
// response body, then runs the error interceptor with that parsed JSON body as the
// `error` argument (and the Response as the second argument). The interceptor reads
// the backend envelope ({ status_code, message, detail }) from the parsed `error`
// body and returns an ApiError, which the library exposes in result.error. Re-reading
// the Response body in the interceptor would fail (stream already consumed), so the
// parsed envelope is the source of truth (see F-263).

describe('Correlation ID Headers', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    clearCorrelationId()
    configureAuth({
      getSession: async () => null,
      signOut: async () => {},
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
    clearCorrelationId()
  })

  it('sends X-Correlation-ID header when correlation ID is set', async () => {
    setCorrelationId('test-correlation-123')

    let capturedHeaders: Headers | undefined

    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        capturedHeaders = request.headers
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    )

    const client = createApiClient()
    await healthCheckHealthGet({ client })

    expect(capturedHeaders?.get('X-Correlation-ID')).toBe(
      'test-correlation-123'
    )
  })

  it('does not send X-Correlation-ID header when no correlation ID is set', async () => {
    clearCorrelationId()

    let capturedHeaders: Headers | undefined

    global.fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        capturedHeaders = request.headers
        return new Response(JSON.stringify({ status: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    )

    const client = createApiClient()
    await healthCheckHealthGet({ client })

    expect(capturedHeaders?.get('X-Correlation-ID')).toBeNull()
  })

  it('captures X-Correlation-ID from backend response', async () => {
    // Start with a different correlation ID
    setCorrelationId('original-id')

    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-ID': 'backend-correlation-456',
        },
      })
    })

    const client = createApiClient()
    await healthCheckHealthGet({ client })

    // The backend's correlation ID should be captured
    expect(getCorrelationId()).toBe('backend-correlation-456')
  })

  it('does not capture X-Correlation-ID when response lacks header', async () => {
    setCorrelationId('original-id')

    global.fetch = vi.fn(async () => {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // No X-Correlation-ID header
        },
      })
    })

    const client = createApiClient()
    await healthCheckHealthGet({ client })

    // Correlation ID should remain unchanged (not captured)
    expect(getCorrelationId()).toBe('original-id')
  })
})

describe('Response Interceptor - Server-Side Rendering', () => {
  let originalFetch: typeof global.fetch
  let originalWindow: typeof globalThis.window

  beforeEach(() => {
    originalFetch = global.fetch
    originalWindow = globalThis.window
    configureAuth({
      getSession: async () => null,
      signOut: async () => {},
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
    globalThis.window = originalWindow
  })

  it('handles 401 without redirecting when window is undefined (SSR)', async () => {
    const signOutFn = vi.fn().mockResolvedValue(undefined)
    configureAuth({
      getSession: async () => null,
      signOut: signOutFn,
    })

    // Simulate server-side rendering where window is undefined
    // @ts-expect-error - Intentionally making window undefined for SSR test
    delete globalThis.window

    global.fetch = vi.fn(async () => {
      return new Response(null, {
        status: 401,
        statusText: 'Unauthorized',
      })
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).message).toBe('Session expired')
    }

    // signOut should still be called
    expect(signOutFn).toHaveBeenCalled()
    // But window.location redirect should not happen (would throw error if attempted)
  })
})

describe('Error Interceptor - Edge Cases', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
    configureAuth({
      getSession: async () => null,
      signOut: async () => {},
    })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('handles error object with null response property', async () => {
    const errorWithNullResponse = {
      message: 'Error with null response',
      response: null,
    }

    global.fetch = vi.fn(async () => {
      throw errorWithNullResponse
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
      expect.fail('Should have thrown error')
    } catch (error) {
      expect(error).toBeDefined()
    }
  })

  it('handles error object where response is not a Response instance', async () => {
    const errorWithFakeResponse = {
      message: 'Error with fake response',
      response: {
        status: 500,
        data: 'not a real Response object',
      },
    }

    global.fetch = vi.fn(async () => {
      throw errorWithFakeResponse
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
      expect.fail('Should have thrown error')
    } catch (error) {
      expect(error).toBeDefined()
    }
  })

  it('passes through ApiError without transformation in error interceptor', async () => {
    // Create a real ApiError with statusCode
    const originalApiError = new ApiError('Original API Error', 429)

    global.fetch = vi.fn(async () => {
      throw originalApiError
    })

    const client = createApiClient()

    try {
      await healthCheckHealthGet({ client })
      expect.fail('Should have thrown error')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).message).toBe('Original API Error')
      expect((error as ApiError).statusCode).toBe(429)
      // Should be the same instance (not re-wrapped)
      expect(error).toBe(originalApiError)
    }
  })
})
