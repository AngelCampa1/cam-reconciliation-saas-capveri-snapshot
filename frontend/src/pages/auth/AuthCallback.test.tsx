/**
 * Tests for AuthCallback component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '../../mocks/server'

// Mock modules
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      signOut: vi.fn(),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      })),
    },
  },
}))

vi.mock('../../hooks/useAuth', () => ({
  useAuth: vi.fn(() => ({
    refreshSession: vi.fn(),
    user: null,
    session: null,
    isLoading: false,
    error: null,
    isAuthenticated: false,
    login: vi.fn(),
    register: vi.fn(),
    resetPassword: vi.fn(),
    logout: vi.fn(),
    getSession: vi.fn(),
  })),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: vi.fn(),
    useSearchParams: vi.fn(),
  }
})

vi.mock('../../lib/analytics', () => ({
  trackEvent: vi.fn(),
  setUserProperties: vi.fn(),
}))

import { AuthCallback } from './AuthCallback'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { trackEvent } from '../../lib/analytics'
import { configureAuth } from '@/api/client'

// Wrapper with Router
const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('AuthCallback', () => {
  let mockNavigate: ReturnType<typeof vi.fn>
  let mockSearchParams: URLSearchParams
  let mockRefreshSession: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Setup navigation mock
    mockNavigate = vi.fn()
    vi.mocked(useNavigate).mockReturnValue(mockNavigate)

    // Setup search params mock
    mockSearchParams = new URLSearchParams()
    vi.mocked(useSearchParams).mockReturnValue([mockSearchParams, vi.fn()])

    // Setup auth hook mock
    mockRefreshSession = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      refreshSession: mockRefreshSession,
      user: null,
      session: null,
      isLoading: false,
      error: null,
      isAuthenticated: false,
      login: vi.fn(),
      register: vi.fn(),
      resetPassword: vi.fn(),
      logout: vi.fn(),
      getSession: vi.fn(),
    })

    configureAuth({
      getSession: async () => ({ access_token: 'test-token' }),
      signOut: async () => {},
    })
    server.use(
      http.post('*/api/v1/auth/legal-acceptance/current', () =>
        HttpResponse.json({ ok: true })
      )
    )

    // Clear session storage
    sessionStorage.clear()
  })

  it('should show loading state initially', () => {
    vi.mocked(supabase.auth.getSession).mockImplementation(
      () => new Promise(() => {})
    )

    render(<AuthCallback />, { wrapper: RouterWrapper })

    expect(screen.getByText('Completing sign in...')).toBeInTheDocument()
  })

  it('should redirect to the role-gated root after successful OAuth callback', async () => {
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
      access_token: 'test-token',
    }

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockRefreshSession).toHaveBeenCalled()
      // Default lands on '/', which waits for the role and routes party-correct.
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('should redirect to return URL from sessionStorage', async () => {
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
      access_token: 'test-token',
    }

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    sessionStorage.setItem('returnUrl', '/properties')

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/properties', {
        replace: true,
      })
      expect(sessionStorage.getItem('returnUrl')).toBeNull()
    })
  })

  it('should redirect to returnUrl from search params (priority over sessionStorage)', async () => {
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
      access_token: 'test-token',
    }

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    // Both search param and sessionStorage set — search param should win
    mockSearchParams.set('returnUrl', '/onboarding')
    sessionStorage.setItem('returnUrl', '/dashboard')

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/onboarding', {
        replace: true,
      })
      // sessionStorage should be cleaned up regardless
      expect(sessionStorage.getItem('returnUrl')).toBeNull()
    })
  })

  it('should redirect to returnUrl from search params when no sessionStorage', async () => {
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
      access_token: 'test-token',
    }

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    mockSearchParams.set('returnUrl', '/onboarding')

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/onboarding', {
        replace: true,
      })
    })
  })

  it('should reject absolute URLs in returnUrl to prevent open redirect', async () => {
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
      access_token: 'test-token',
    }

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    mockSearchParams.set('returnUrl', 'https://evil.com')

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', {
        replace: true,
      })
    })
  })

  it('should handle OAuth error from URL parameters', async () => {
    mockSearchParams.set('error_description', 'User cancelled login')

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(screen.getByText('User cancelled login')).toBeInTheDocument()
      expect(screen.getByText('Authentication Error')).toBeInTheDocument()
    })
  })

  it('should show error when session is not established', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    })

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(
        screen.getByText('No session established. Please try signing in again.')
      ).toBeInTheDocument()
    })
  })

  it('should show error button when error occurs', async () => {
    const user = userEvent.setup()
    mockSearchParams.set('error_description', 'Authentication failed')

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(screen.getByText('Authentication Error')).toBeInTheDocument()
    })

    const loginButton = screen.getByRole('button', { name: /return to login/i })
    await user.click(loginButton)

    expect(mockNavigate).toHaveBeenCalledWith('/auth/login')
  })

  it('should call refreshSession after successful authentication', async () => {
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
      access_token: 'test-token',
    }

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockRefreshSession).toHaveBeenCalledTimes(1)
    })
  })

  it('should handle Supabase auth error', async () => {
    const mockError = new Error('Failed to establish session')
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: mockError as any,
    })

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(screen.getByText('Authentication Error')).toBeInTheDocument()
      expect(
        screen.getByText('Failed to establish session')
      ).toBeInTheDocument()
    })
  })

  it('should process invitation token when present', async () => {
    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
      access_token: 'test-token',
    }

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    mockSearchParams.set('invite', 'test-invite-token')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Invitation accepted' }),
    })
    global.fetch = mockFetch

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/team/invitations/accept'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            token: 'test-invite-token',
            user_id: 'test-user-id',
          }),
        })
      )
      const headers = new Headers(mockFetch.mock.calls[0][1].headers)
      expect(headers.get('Content-Type')).toBe('application/json')
      expect(headers.get('Authorization')).toBe('Bearer test-token')
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
  })

  it('should handle invitation processing failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const mockSession = {
      user: { id: 'test-user-id', email: 'test@example.com' },
      access_token: 'test-token',
    }

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    mockSearchParams.set('invite', 'invalid-token')

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      text: async () => 'Invalid invitation token',
    })
    global.fetch = mockFetch

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('WARN:'),
        expect.objectContaining({
          error: 'Invalid invitation token',
        })
      )
      // Should still navigate despite invitation failure
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })

    consoleSpy.mockRestore()
  })

  it('should fire sign_up event and route to sample-first onboarding for fresh SSO signups', async () => {
    const mockSession = {
      user: {
        id: 'new-sso-user',
        email: 'jane@acme.com',
        created_at: new Date(Date.now() - 5_000).toISOString(),
        app_metadata: { provider: 'google' },
      },
      access_token: 'test-token',
    }

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith('sign_up', { method: 'google' })
      expect(mockNavigate).toHaveBeenCalledWith(
        '/onboard?demo=1&source=first-login',
        { replace: true }
      )
    })
  })

  it('does not fire sign_up event for returning SSO users (account older than 120s)', async () => {
    const mockSession = {
      user: {
        id: 'returning-sso-user',
        email: 'jane@acme.com',
        created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        app_metadata: { provider: 'google' },
      },
      access_token: 'test-token',
    }

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    })

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true })
    })
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('should show Try Again button and reload page on click', async () => {
    const user = userEvent.setup()
    const mockReload = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { reload: mockReload },
      writable: true,
    })

    mockSearchParams.set('error_description', 'Connection timeout')

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(screen.getByText('Authentication Error')).toBeInTheDocument()
    })

    const tryAgainButton = screen.getByRole('button', { name: /try again/i })
    await user.click(tryAgainButton)

    expect(mockReload).toHaveBeenCalled()
  })

  it('should use error code with getErrorMessage when no error_description', async () => {
    mockSearchParams.set('error', 'access_denied')

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(screen.getByText('Authentication Error')).toBeInTheDocument()
      expect(
        screen.getByText('You cancelled the sign in. Please try again.')
      ).toBeInTheDocument()
    })
  })

  it('should handle unknown error codes', async () => {
    mockSearchParams.set('error', 'some_unknown_error')

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(screen.getByText('Authentication Error')).toBeInTheDocument()
      expect(
        screen.getByText('Authentication failed. Please try signing in again.')
      ).toBeInTheDocument()
    })
  })

  it('should handle server_error code', async () => {
    mockSearchParams.set('error', 'server_error')

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(
        screen.getByText('Something went wrong on our end. Please try again.')
      ).toBeInTheDocument()
    })
  })

  it('should handle invalid_request error code', async () => {
    mockSearchParams.set('error', 'invalid_request')

    render(<AuthCallback />, { wrapper: RouterWrapper })

    await waitFor(() => {
      expect(
        screen.getByText('Invalid authentication request. Please try again.')
      ).toBeInTheDocument()
    })
  })
})
