/**
 * AuthCallback Tests
 *
 * Verifies SSO new-user detection and sample-first onboarding redirects.
 */
import { render, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

// vi.hoisted ensures mock fns are defined before the vi.mock factory runs
const { mockGetSession, mockRefreshSession, mockAuthFetch } = vi.hoisted(
  () => ({
    mockGetSession: vi.fn(),
    mockRefreshSession: vi.fn(),
    mockAuthFetch: vi.fn(),
  })
)

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mockGetSession },
  },
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ refreshSession: mockRefreshSession }),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock('@/api/authFetch', () => ({
  authenticatedFetch: mockAuthFetch,
}))

vi.mock('@/components/ui/spinner', () => ({
  Spinner: ({ className }: { className?: string }) => (
    <div data-testid="spinner" className={className} />
  ),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode
    onClick?: () => void
  }) => <button onClick={onClick}>{children}</button>,
}))

import { AuthCallback } from '../AuthCallback'

function makeSession(createdAtOffset: number, provider = 'google') {
  return {
    user: {
      id: 'user-123',
      created_at: new Date(Date.now() + createdAtOffset).toISOString(),
      app_metadata: { provider },
      is_anonymous: false,
    },
    access_token: 'token-123',
  }
}

function renderCallback(searchQuery = '') {
  render(
    <MemoryRouter initialEntries={[`/auth/callback${searchQuery}`]}>
      <AuthCallback />
    </MemoryRouter>
  )
}

describe('AuthCallback — SSO new-user detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRefreshSession.mockResolvedValue(undefined)
    sessionStorage.clear()
  })

  it('redirects new SSO user (created <120s ago) to sample-first onboarding', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: makeSession(-30_000) }, // 30s ago
      error: null,
    })

    renderCallback()

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/onboard?demo=1&source=first-login',
        { replace: true }
      )
    )
  })

  it('redirects new SSO user to sample-first onboarding regardless of returnUrl', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: makeSession(-30_000) },
      error: null,
    })

    renderCallback(
      '?returnUrl=%2Fcheckout%3Ftier%3Dportfolio%26units%3D120%26buildings%3D12%26billing%3Dannual'
    )

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/onboard?demo=1&source=first-login',
        { replace: true }
      )
    )
  })

  it('redirects existing user (created >120s ago) to the default root route', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: makeSession(-200_000) }, // 200s ago
      error: null,
    })

    renderCallback()

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    )
  })

  it('new user with invite token goes to the default root route, not /onboard', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: makeSession(-30_000) },
      error: null,
    })
    mockAuthFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })

    renderCallback('?invite=abc123')

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    )
    expect(mockNavigate).not.toHaveBeenCalledWith('/onboard', expect.anything())
  })
})
