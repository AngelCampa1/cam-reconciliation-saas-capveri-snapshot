/**
 * Tests for useAnonSession hook (TDD — written before implementation).
 *
 * Validates anonymous Supabase session bootstrap for PLG onboarding.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Use vi.hoisted so mock functions are available when vi.mock factories run
const { mockSignInAnonymously, mockGetSession } = vi.hoisted(() => ({
  mockSignInAnonymously: vi.fn(),
  mockGetSession: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      signInAnonymously: mockSignInAnonymously,
    },
  },
}))

vi.mock('@/lib/analytics', () => ({
  groupOrganizationForAnalytics: vi.fn(),
}))

// Mock fetch for /api/v1/onboard/init
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import after mocks are in place
import { useAnonSession } from './useAnonSession'

const ANON_USER_ID = 'anon-user-uuid-1234'
const ORG_ID = 'org-uuid-5678'

function makeAnonSession() {
  return {
    data: {
      session: {
        access_token: 'anon-jwt-token',
        user: { id: ANON_USER_ID, is_anonymous: true, email: null },
      },
    },
    error: null,
  }
}

function makeRealSession() {
  return {
    data: {
      session: {
        access_token: 'real-jwt-token',
        user: {
          id: 'real-user-id',
          is_anonymous: false,
          email: 'user@example.com',
        },
      },
    },
    error: null,
  }
}

function makeNoSession() {
  return { data: { session: null }, error: null }
}

function makeInitResponse() {
  return {
    ok: true,
    json: async () => ({
      organization_id: ORG_ID,
      user_id: ANON_USER_ID,
      already_existed: false,
    }),
  }
}

describe('useAnonSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue(makeInitResponse())
    // Ensure global fetch always points to our mock (in case of env resets)
    globalThis.fetch = mockFetch
  })

  it('renders as ready after signInAnonymously and init succeed', async () => {
    mockGetSession.mockResolvedValueOnce(makeNoSession())
    mockSignInAnonymously.mockResolvedValueOnce({
      data: { session: makeAnonSession().data.session },
      error: null,
    })

    const { result } = renderHook(() => useAnonSession())

    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
    })

    expect(result.current.userId).toBe(ANON_USER_ID)
    expect(result.current.organizationId).toBe(ORG_ID)
    expect(result.current.error).toBeNull()
    expect(mockSignInAnonymously).toHaveBeenCalledOnce()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/onboard/init'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('reuses existing anon session without calling signInAnonymously again', async () => {
    mockGetSession.mockResolvedValueOnce(makeAnonSession())

    const { result } = renderHook(() => useAnonSession())

    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
    })

    expect(mockSignInAnonymously).not.toHaveBeenCalled()
    expect(result.current.userId).toBe(ANON_USER_ID)
  })

  it('signals redirect when session is non-anonymous', async () => {
    mockGetSession.mockResolvedValueOnce(makeRealSession())

    const { result } = renderHook(() => useAnonSession())

    await waitFor(() => {
      expect(result.current.shouldRedirectToDashboard).toBe(true)
    })

    expect(mockSignInAnonymously).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('SSO mode: non-anonymous user proceeds to init, does not redirect, becomes ready', async () => {
    mockGetSession.mockResolvedValueOnce(makeRealSession())

    const { result } = renderHook(() => useAnonSession(true))

    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
    })

    expect(result.current.shouldRedirectToDashboard).toBe(false)
    expect(mockSignInAnonymously).not.toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/onboard/init'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer real-jwt-token',
        }),
      })
    )
    expect(result.current.userId).toBe('real-user-id')
    expect(result.current.organizationId).toBe(ORG_ID)
  })

  it('SSO mode false: non-anonymous user still signals redirect (regression)', async () => {
    mockGetSession.mockResolvedValueOnce(makeRealSession())

    const { result } = renderHook(() => useAnonSession(false))

    await waitFor(() => {
      expect(result.current.shouldRedirectToDashboard).toBe(true)
    })

    expect(mockSignInAnonymously).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('sample preview: non-anonymous user becomes ready without redirect or init', async () => {
    mockGetSession.mockResolvedValueOnce(makeRealSession())

    const { result } = renderHook(() => useAnonSession(false, true))

    await waitFor(() => {
      expect(result.current.isReady).toBe(true)
    })

    // Read-only sample for a logged-in user: no dashboard bounce, no onboard
    // init call, storage scoped to their real user id.
    expect(result.current.shouldRedirectToDashboard).toBe(false)
    expect(result.current.userId).toBe('real-user-id')
    expect(mockSignInAnonymously).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('exposes error when signInAnonymously fails', async () => {
    mockGetSession.mockResolvedValueOnce(makeNoSession())
    mockSignInAnonymously.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Sign-in disabled' },
    })

    const { result } = renderHook(() => useAnonSession())

    await waitFor(() => {
      expect(result.current.error).toBeTruthy()
    })

    expect(result.current.isReady).toBe(false)
  })
})
