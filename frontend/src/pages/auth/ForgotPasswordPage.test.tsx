/**
 * Tests for ForgotPasswordPage component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

// Mock analytics
const { mockTrackEvent } = vi.hoisted(() => ({ mockTrackEvent: vi.fn() }))
vi.mock('../../lib/analytics', () => ({
  trackEvent: mockTrackEvent,
}))

// Mock Supabase (must be before other imports that use it)
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      resetPasswordForEmail: vi.fn(),
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

// Mock useAuth hook
vi.mock('../../hooks/useAuth')

import { ForgotPasswordPage } from './ForgotPasswordPage'
import { useAuth } from '../../hooks/useAuth'

// Wrapper with Router
const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('ForgotPasswordPage', () => {
  const mockResetPassword = vi.fn()
  const defaultAuthState = {
    user: null,
    session: null,
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    resetPassword: mockResetPassword,
    logout: vi.fn(),
    getSession: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue(defaultAuthState)
  })

  describe('SEO', () => {
    it('renders page-specific SEO title (Bug #3)', () => {
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })
      expect(document.title).toBe('Reset Password | CapVeri')
    })
  })

  describe('Form Rendering', () => {
    it('renders password reset form with email field', () => {
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      expect(
        screen.getByRole('heading', { name: /reset your password/i })
      ).toBeInTheDocument()
      expect(screen.getByLabelText('Email address')).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /send reset instructions/i })
      ).toBeInTheDocument()
    })

    it('renders back to login link', () => {
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      const backLinks = screen.getAllByText(/back to login/i)
      expect(backLinks.length).toBeGreaterThan(0)
      expect(backLinks[0]).toHaveAttribute('href', '/auth/login')
    })

    it('supports a tenant login return path', () => {
      render(<ForgotPasswordPage loginPath="/tenant/login" />, {
        wrapper: RouterWrapper,
      })

      const backLinks = screen.getAllByText(/back to login/i)
      expect(backLinks[0]).toHaveAttribute('href', '/tenant/login')
    })

    it('email field is accessible for keyboard navigation', () => {
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText('Email address')
      expect(emailInput).toBeInTheDocument()
      expect(emailInput).toHaveAttribute('type', 'email')
    })
  })

  describe('Form Validation', () => {
    it('validates email format', async () => {
      const user = userEvent.setup()
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText('Email address')
      const submitButton = screen.getByRole('button', {
        name: /send reset instructions/i,
      })

      await user.type(emailInput, 'invalid-email')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeInTheDocument()
      })

      expect(mockResetPassword).not.toHaveBeenCalled()
    })

    it('accepts valid email', async () => {
      const user = userEvent.setup()
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText('Email address')
      const submitButton = screen.getByRole('button', {
        name: /send reset instructions/i,
      })

      await user.type(emailInput, 'test@example.com')
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockResetPassword).toHaveBeenCalledWith('test@example.com')
      })
    })
  })

  describe('Loading State', () => {
    it('shows loading spinner during submission', () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthState,
        isLoading: true,
      })

      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      const submitButton = screen.getByRole('button', { name: /sending/i })
      expect(submitButton).toBeDisabled()
    })

    it('disables email field during loading', () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthState,
        isLoading: true,
      })

      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      expect(screen.getByLabelText('Email address')).toBeDisabled()
    })
  })

  describe('Analytics', () => {
    it('fires password_reset_requested on successful submit', async () => {
      const user = userEvent.setup()
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      await user.type(
        screen.getByLabelText('Email address'),
        'test@example.com'
      )
      await user.click(
        screen.getByRole('button', { name: /send reset instructions/i })
      )

      await waitFor(() => {
        expect(mockTrackEvent).toHaveBeenCalledWith('password_reset_requested')
      })
    })
  })

  describe('Success Screen', () => {
    it('shows success screen after submission', async () => {
      const user = userEvent.setup()
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText('Email address')
      const submitButton = screen.getByRole('button', {
        name: /send reset instructions/i,
      })

      await user.type(emailInput, 'test@example.com')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/check your email/i)).toBeInTheDocument()
      })
    })

    it('displays submitted email in success message', async () => {
      const user = userEvent.setup()
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText('Email address')
      const submitButton = screen.getByRole('button', {
        name: /send reset instructions/i,
      })

      await user.type(emailInput, 'user@example.com')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/user@example.com/i)).toBeInTheDocument()
      })
    })

    it('shows instructions to check email and spam folder', async () => {
      const user = userEvent.setup()
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText('Email address')
      const submitButton = screen.getByRole('button', {
        name: /send reset instructions/i,
      })

      await user.type(emailInput, 'test@example.com')
      await user.click(submitButton)

      await waitFor(() => {
        expect(
          screen.getByText(/check your inbox and spam folder/i)
        ).toBeInTheDocument()
      })
    })

    it('shows back to login link in success screen', async () => {
      const user = userEvent.setup()
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText('Email address')
      const submitButton = screen.getByRole('button', {
        name: /send reset instructions/i,
      })

      await user.type(emailInput, 'test@example.com')
      await user.click(submitButton)

      await waitFor(() => {
        const backLink = screen.getByText(/back to login/i)
        expect(backLink).toBeInTheDocument()
        expect(backLink).toHaveAttribute('href', '/auth/login')
      })
    })
  })

  describe('Retry Functionality', () => {
    it('shows retry link in success screen', async () => {
      const user = userEvent.setup()
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText('Email address')
      const submitButton = screen.getByRole('button', {
        name: /send reset instructions/i,
      })

      await user.type(emailInput, 'test@example.com')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/try a different email/i)).toBeInTheDocument()
      })
    })

    it('returns to form when retry is clicked', async () => {
      const user = userEvent.setup()
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText('Email address')
      const submitButton = screen.getByRole('button', {
        name: /send reset instructions/i,
      })

      await user.type(emailInput, 'test@example.com')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/check your email/i)).toBeInTheDocument()
      })

      const retryButton = screen.getByText(/try a different email/i)
      await user.click(retryButton)

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /reset your password/i })
        ).toBeInTheDocument()
        expect(screen.getByLabelText('Email address')).toBeInTheDocument()
      })
    })

    it('clears email field when retry is clicked', async () => {
      const user = userEvent.setup()
      render(<ForgotPasswordPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText('Email address')
      const submitButton = screen.getByRole('button', {
        name: /send reset instructions/i,
      })

      await user.type(emailInput, 'test@example.com')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/check your email/i)).toBeInTheDocument()
      })

      const retryButton = screen.getByText(/try a different email/i)
      await user.click(retryButton)

      await waitFor(() => {
        const newEmailInput = screen.getByLabelText('Email address')
        expect(newEmailInput).toHaveValue('')
      })
    })
  })
})
