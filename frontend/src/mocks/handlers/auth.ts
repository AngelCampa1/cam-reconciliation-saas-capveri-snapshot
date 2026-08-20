/**
 * MSW handlers for authentication endpoints
 *
 * Provides mock responses for the backend auth proxy with rate limiting.
 */
import { http, HttpResponse } from 'msw'

// Match any origin for the auth endpoints (handles both relative and absolute URLs)
const LOGIN_PATH = '*/api/v1/auth/login'
const LOGOUT_PATH = '*/api/v1/auth/logout'
const REFRESH_PATH = '*/api/v1/auth/refresh'
const WELCOME_PATH = '*/api/v1/auth/welcome'

// Track login attempts for rate limiting simulation
let loginAttempts: { email: string; timestamp: number }[] = []
const MAX_ATTEMPTS = 5
const RATE_LIMIT_WINDOW = 15 * 60 * 1000 // 15 minutes

/**
 * Reset auth state - call between tests
 */
export function resetAuthState(): void {
  loginAttempts = []
}

/**
 * Get remaining attempts for an email
 */
function getRemainingAttempts(email: string): number {
  const now = Date.now()
  const recentAttempts = loginAttempts.filter(
    (a) => a.email === email && now - a.timestamp < RATE_LIMIT_WINDOW
  )
  return Math.max(0, MAX_ATTEMPTS - recentAttempts.length)
}

/**
 * Record a login attempt
 */
function recordAttempt(email: string): void {
  loginAttempts.push({ email, timestamp: Date.now() })
}

export const authHandlers = [
  // POST /api/v1/auth/login - Login endpoint
  http.post(LOGIN_PATH, async ({ request }) => {
    const body = (await request.json()) as {
      email: string
      password: string
      remember_me?: boolean
    }

    const remaining = getRemainingAttempts(body.email)

    // Check rate limit
    if (remaining === 0) {
      const retryAfter = new Date(Date.now() + RATE_LIMIT_WINDOW).toISOString()
      return HttpResponse.json(
        { detail: 'Too many login attempts. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter,
          },
        }
      )
    }

    // Mock invalid credentials
    if (body.password === 'wrongpassword') {
      recordAttempt(body.email)
      const newRemaining = getRemainingAttempts(body.email)
      return HttpResponse.json(
        { detail: 'Invalid email or password' },
        {
          status: 401,
          headers: {
            'X-RateLimit-Remaining': String(newRemaining),
          },
        }
      )
    }

    // Mock success response
    return HttpResponse.json({
      access_token: 'mock-access-token-' + crypto.randomUUID(),
      refresh_token: 'mock-refresh-token-' + crypto.randomUUID(),
      token_type: 'bearer',
      expires_in: 3600,
      user: {
        id: 'mock-user-id',
        email: body.email,
        aud: 'authenticated',
        role: 'authenticated',
        email_confirmed_at: new Date().toISOString(),
        user_metadata: {
          full_name: 'Test User',
        },
        app_metadata: {
          provider: 'email',
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    })
  }),

  // POST /api/v1/auth/logout - Logout endpoint
  http.post(LOGOUT_PATH, () => {
    return new HttpResponse(null, { status: 204 })
  }),

  // POST /api/v1/auth/refresh - Token refresh endpoint
  http.post(REFRESH_PATH, async ({ request }) => {
    const body = (await request.json()) as { refresh_token: string }

    if (!body.refresh_token) {
      return HttpResponse.json(
        { detail: 'Refresh token is required' },
        { status: 400 }
      )
    }

    return HttpResponse.json({
      access_token: 'mock-refreshed-access-token-' + crypto.randomUUID(),
      refresh_token: 'mock-refreshed-refresh-token-' + crypto.randomUUID(),
      token_type: 'bearer',
      expires_in: 3600,
    })
  }),

  // POST /api/v1/auth/welcome - Trigger welcome email after signup
  http.post(WELCOME_PATH, () => {
    return HttpResponse.json({
      success: true,
      message: 'Welcome email queued successfully',
    })
  }),
]
