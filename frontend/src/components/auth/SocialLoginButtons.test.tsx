import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SocialLoginButtons } from './SocialLoginButtons'
import { toast } from 'sonner'

// Create hoisted mock function
const mockSignInWithOAuth = vi.hoisted(() => vi.fn())

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: mockSignInWithOAuth,
    },
  },
}))

// Mock toast from sonner
vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

describe('SocialLoginButtons', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    mockSignInWithOAuth.mockResolvedValue({ error: null })
  })

  it('renders only the Google button', () => {
    render(<SocialLoginButtons />)

    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /apple/i })
    ).not.toBeInTheDocument()
  })

  it('shows loading state when Google button is clicked', async () => {
    const user = userEvent.setup()
    render(<SocialLoginButtons />)

    const googleButton = screen.getByRole('button', { name: /google/i })
    await user.click(googleButton)

    // Loading spinner should appear
    await waitFor(() => {
      expect(googleButton).toBeDisabled()
    })
  })

  it('calls signInWithOAuth with correct Google parameters', async () => {
    const user = userEvent.setup()
    render(<SocialLoginButtons />)

    const googleButton = screen.getByRole('button', { name: /google/i })
    await user.click(googleButton)

    await waitFor(() => {
      expect(mockSignInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: {
          redirectTo: expect.stringContaining('/auth/callback'),
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })
    })
  })

  it('stores returnUrl in sessionStorage when provided', async () => {
    const user = userEvent.setup()
    const returnUrl = '/dashboard'
    render(<SocialLoginButtons returnUrl={returnUrl} />)

    const googleButton = screen.getByRole('button', { name: /google/i })
    await user.click(googleButton)

    await waitFor(() => {
      expect(sessionStorage.getItem('returnUrl')).toBe(returnUrl)
    })
  })

  it('includes returnUrl as query param in redirectTo URL', async () => {
    const user = userEvent.setup()
    render(<SocialLoginButtons returnUrl="/onboarding" />)

    const googleButton = screen.getByRole('button', { name: /google/i })
    await user.click(googleButton)

    await waitFor(() => {
      const callArgs = mockSignInWithOAuth.mock.calls[0][0]
      const redirectUrl = new URL(callArgs.options.redirectTo)
      expect(redirectUrl.searchParams.get('returnUrl')).toBe('/onboarding')
    })
  })

  it('includes both returnUrl and invite token in redirectTo URL', async () => {
    const user = userEvent.setup()
    render(<SocialLoginButtons returnUrl="/onboarding" inviteToken="abc123" />)

    const googleButton = screen.getByRole('button', { name: /google/i })
    await user.click(googleButton)

    await waitFor(() => {
      const callArgs = mockSignInWithOAuth.mock.calls[0][0]
      const redirectUrl = new URL(callArgs.options.redirectTo)
      expect(redirectUrl.searchParams.get('returnUrl')).toBe('/onboarding')
      expect(redirectUrl.searchParams.get('invite')).toBe('abc123')
    })
  })

  it('includes invite token in redirectTo URL when provided', async () => {
    const user = userEvent.setup()
    const inviteToken = 'test-invite-token'
    render(<SocialLoginButtons inviteToken={inviteToken} />)

    const googleButton = screen.getByRole('button', { name: /google/i })
    await user.click(googleButton)

    await waitFor(() => {
      const callArgs = mockSignInWithOAuth.mock.calls[0][0]
      expect(callArgs.options.redirectTo).toContain('invite=test-invite-token')
    })
  })

  it('shows error toast on OAuth failure', async () => {
    const user = userEvent.setup()
    const error = new Error('OAuth failed')
    mockSignInWithOAuth.mockResolvedValue({ error })

    render(<SocialLoginButtons />)

    const googleButton = screen.getByRole('button', { name: /google/i })
    await user.click(googleButton)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Sign in failed', {
        description: 'Could not sign in with google. Please try again.',
      })
    })
  })

  it('disables the Google button while loading', async () => {
    const user = userEvent.setup()
    render(<SocialLoginButtons />)

    const googleButton = screen.getByRole('button', { name: /google/i })

    await user.click(googleButton)

    await waitFor(() => {
      expect(googleButton).toBeDisabled()
    })
  })
})
