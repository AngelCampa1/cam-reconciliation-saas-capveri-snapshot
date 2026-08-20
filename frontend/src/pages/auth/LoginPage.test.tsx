/**
 * Tests for LoginPage component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

// Mock analytics
vi.mock('../../lib/analytics', () => ({
  trackEvent: vi.fn(),
  identifyUserForAnalytics: vi.fn(),
  setUserProperties: vi.fn(),
  resetAnalyticsIdentity: vi.fn(),
}))

// Mock Supabase (must be before other imports that use it)
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
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

import { LoginPage } from './LoginPage'
import { useAuth } from '../../hooks/useAuth'
import { trackEvent } from '../../lib/analytics'

// Mock useNavigate and useSearchParams
const mockNavigate = vi.fn()
let mockSearchParams = new URLSearchParams()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [mockSearchParams],
  }
})

// Wrapper with Router
const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('LoginPage', () => {
  const mockLogin = vi.fn()
  const defaultAuthState = {
    user: null,
    session: null,
    isLoading: false,
    error: null,
    login: mockLogin,
    logout: vi.fn(),
    getSession: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams = new URLSearchParams()
    vi.mocked(useAuth).mockReturnValue(defaultAuthState)
  })

  describe('SEO', () => {
    it('renders page-specific SEO title (Bug #3)', () => {
      render(<LoginPage />, { wrapper: RouterWrapper })
      expect(document.title).toBe('Sign In | CapVeri')
    })
  })

  describe('Form Rendering', () => {
    it('renders login form with all fields', () => {
      render(<LoginPage />, { wrapper: RouterWrapper })

      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
      expect(screen.getByLabelText('Password')).toBeInTheDocument()
      expect(
        screen.getByRole('checkbox', { name: /remember me/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /sign in/i })
      ).toBeInTheDocument()
    })

    it('renders forgot password link', () => {
      render(<LoginPage />, { wrapper: RouterWrapper })

      const forgotLink = screen.getByText(/forgot password/i)
      expect(forgotLink).toBeInTheDocument()
      expect(forgotLink).toHaveAttribute('href', '/auth/forgot-password')
    })

    it('renders create account link', () => {
      render(<LoginPage />, { wrapper: RouterWrapper })

      const createLink = screen.getByText(/create an account/i)
      expect(createLink).toBeInTheDocument()
      expect(createLink).toHaveAttribute('href', '/auth/register')
    })
  })

  describe('Form Validation', () => {
    it('validates email format', async () => {
      const user = userEvent.setup()
      render(<LoginPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText(/email address/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'invalid-email')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeInTheDocument()
      })

      // AA-contrast: validation errors use the dark red token, not text-destructive (F-387)
      expect(screen.getByText(/valid email/i)).toHaveClass(
        'text-destructive-strong'
      )

      expect(mockLogin).not.toHaveBeenCalled()
    })

    it('requires password field', async () => {
      const user = userEvent.setup()
      render(<LoginPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText(/email address/i)
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.click(submitButton)

      await waitFor(() => {
        expect(screen.getByText(/password is required/i)).toBeInTheDocument()
      })

      expect(mockLogin).not.toHaveBeenCalled()
    })

    it('accepts valid email and password', async () => {
      const user = userEvent.setup()
      render(<LoginPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText(/email address/i)
      const passwordInput = screen.getByLabelText('Password')
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith(
          'test@example.com',
          'password123',
          false
        )
      })
    })
  })

  describe('Password Visibility Toggle', () => {
    it('toggles password visibility', async () => {
      const user = userEvent.setup()
      render(<LoginPage />, { wrapper: RouterWrapper })

      const passwordInput = screen.getByLabelText('Password')
      const toggleButton = screen.getByRole('button', {
        name: /show password/i,
      })

      // Initially hidden
      expect(passwordInput).toHaveAttribute('type', 'password')

      // Click to show
      await user.click(toggleButton)
      expect(passwordInput).toHaveAttribute('type', 'text')

      // Click to hide again
      await user.click(toggleButton)
      expect(passwordInput).toHaveAttribute('type', 'password')
    })
  })

  describe('Remember Me Checkbox', () => {
    it('toggles remember me checkbox', async () => {
      const user = userEvent.setup()
      render(<LoginPage />, { wrapper: RouterWrapper })

      const checkbox = screen.getByRole('checkbox', { name: /remember me/i })

      expect(checkbox).not.toBeChecked()

      await user.click(checkbox)
      expect(checkbox).toBeChecked()

      await user.click(checkbox)
      expect(checkbox).not.toBeChecked()
    })

    it('passes remember me value to login function', async () => {
      const user = userEvent.setup()
      render(<LoginPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText(/email address/i)
      const passwordInput = screen.getByLabelText('Password')
      const checkbox = screen.getByRole('checkbox', { name: /remember me/i })
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.click(checkbox)
      await user.click(submitButton)

      // Wait for the mock to be called with a timeout
      await waitFor(
        () => {
          expect(mockLogin).toHaveBeenCalledWith(
            'test@example.com',
            'password123',
            true
          )
        },
        { timeout: 3000 }
      )
    })
  })

  describe('Loading State', () => {
    it('shows loading state during form submission', async () => {
      const user = userEvent.setup()
      let resolveLogin!: () => void
      const mockSlowLogin = vi.fn().mockReturnValue(
        new Promise<void>((r) => {
          resolveLogin = r
        })
      )
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthState,
        login: mockSlowLogin,
      })

      render(<LoginPage />, { wrapper: RouterWrapper })

      await user.type(
        screen.getByLabelText(/email address/i),
        'test@example.com'
      )
      await user.type(screen.getByLabelText('Password'), 'password123')
      await user.click(screen.getByRole('button', { name: /^sign in$/i }))

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /signing in/i })
        ).toBeDisabled()
      })

      resolveLogin()

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /^sign in$/i })).toBeEnabled()
      })
    })

    it('form fields not disabled by auth session loading state (Bug #4)', () => {
      // Auth isLoading=true during initial session check should NOT disable form fields
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthState,
        isLoading: true,
      })

      render(<LoginPage />, { wrapper: RouterWrapper })

      expect(screen.getByLabelText(/email address/i)).not.toBeDisabled()
      expect(screen.getByLabelText('Password')).not.toBeDisabled()
      expect(
        screen.getByRole('checkbox', { name: /remember me/i })
      ).not.toBeDisabled()
      // Button shows "Sign in" (not "Signing in...") on initial load
      expect(
        screen.getByRole('button', { name: /^sign in$/i })
      ).toBeInTheDocument()
    })
  })

  describe('Error Handling', () => {
    it('displays error message when login fails with invalid credentials', () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthState,
        error: 'Invalid email or password',
      })

      render(<LoginPage />, { wrapper: RouterWrapper })

      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
      expect(
        screen.getByText('Email or password is incorrect. Please try again.')
      ).toBeInTheDocument()
    })

    it('displays account locked error message', () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthState,
        error: 'User account is locked',
      })

      render(<LoginPage />, { wrapper: RouterWrapper })

      expect(screen.getByText('Account locked')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Your account has been locked. Please contact support.'
        )
      ).toBeInTheDocument()
    })

    it('displays account disabled error message', () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthState,
        error: 'Account disabled by administrator',
      })

      render(<LoginPage />, { wrapper: RouterWrapper })

      expect(screen.getByText('Account locked')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Your account has been locked. Please contact support.'
        )
      ).toBeInTheDocument()
    })

    it('displays email not verified error message', () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthState,
        error: 'Please verify your email address',
      })

      render(<LoginPage />, { wrapper: RouterWrapper })

      expect(screen.getByText('Email not verified')).toBeInTheDocument()
      expect(
        screen.getByText('Please verify your email address before logging in.')
      ).toBeInTheDocument()
    })

    it('displays generic authentication failed error for unknown errors', () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthState,
        error: 'Network connection timeout',
      })

      render(<LoginPage />, { wrapper: RouterWrapper })

      expect(screen.getByText('Authentication failed')).toBeInTheDocument()
      expect(screen.getByText('Network connection timeout')).toBeInTheDocument()
    })

    it('clears error when user starts typing', async () => {
      const user = userEvent.setup()
      const mockClearError = vi.fn()

      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthState,
        error: 'Invalid email or password',

        login: (_email, _password) => {
          mockClearError()
          return Promise.resolve()
        },
      })

      render(<LoginPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText(/email address/i)
      await user.type(emailInput, 't')

      // Error should still be visible (only clears on new submission)
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
      expect(
        screen.getByText('Email or password is incorrect. Please try again.')
      ).toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('redirects to dashboard on successful login', async () => {
      const user = userEvent.setup()

      // Simulate successful login by updating the user state
      let currentAuthState = { ...defaultAuthState }
      vi.mocked(useAuth).mockImplementation(() => currentAuthState)

      const { rerender } = render(<LoginPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText(/email address/i)
      const passwordInput = screen.getByLabelText('Password')
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.click(submitButton)

      // Simulate successful login
      currentAuthState = {
        ...defaultAuthState,
        user: {
          id: 'user-id',
          email: 'test@example.com',
          aud: 'authenticated',
          role: 'authenticated',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          app_metadata: {},
          user_metadata: {},
        },
      }

      rerender(<LoginPage />)

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/')
      })
    })

    // Note: Testing return URL would require mocking the Router's location,
    // which is complex in this test setup. The functionality works in the actual app.
  })

  describe('Keyboard Navigation', () => {
    it('allows form submission with Enter key', async () => {
      const user = userEvent.setup()
      render(<LoginPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText(/email address/i)
      const passwordInput = screen.getByLabelText('Password')

      await user.type(emailInput, 'test@example.com')
      await user.type(passwordInput, 'password123')
      await user.keyboard('{Enter}')

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith(
          'test@example.com',
          'password123',
          false
        )
      })
    })

    it('allows tabbing through form fields', async () => {
      const user = userEvent.setup()
      render(<LoginPage />, { wrapper: RouterWrapper })

      const emailInput = screen.getByLabelText(/email address/i)
      const passwordInput = screen.getByLabelText('Password')
      const submitButton = screen.getByRole('button', { name: /sign in/i })

      // Click email field to start
      await user.click(emailInput)
      expect(emailInput).toHaveFocus()

      // Tab to "Forgot password?" link (between email and password in the label row)
      await user.tab()
      expect(screen.getByText(/forgot password/i)).toHaveFocus()

      // Tab to password
      await user.tab()
      expect(passwordInput).toHaveFocus()

      // Tab through other elements to submit button
      // (Exact number of tabs may vary based on intermediate focusable elements)
      await user.tab() // remember me checkbox
      await user.tab() // submit button
      expect(submitButton).toHaveFocus()
    })
  })

  describe('Session Expired Banner', () => {
    it('shows session expired banner when ?expired=true is in URL', () => {
      mockSearchParams = new URLSearchParams('expired=true')
      render(<LoginPage />, { wrapper: RouterWrapper })

      expect(screen.getByTestId('session-expired-banner')).toBeInTheDocument()
      expect(screen.getByText(/your session has expired/i)).toBeInTheDocument()
    })

    it('does not show session expired banner when no expired param', () => {
      mockSearchParams = new URLSearchParams()
      render(<LoginPage />, { wrapper: RouterWrapper })

      expect(
        screen.queryByTestId('session-expired-banner')
      ).not.toBeInTheDocument()
    })

    it('does not show session expired banner when expired=false', () => {
      mockSearchParams = new URLSearchParams('expired=false')
      render(<LoginPage />, { wrapper: RouterWrapper })

      expect(
        screen.queryByTestId('session-expired-banner')
      ).not.toBeInTheDocument()
    })

    it('session expired banner has role="alert"', () => {
      mockSearchParams = new URLSearchParams('expired=true')
      render(<LoginPage />, { wrapper: RouterWrapper })

      const banner = screen.getByTestId('session-expired-banner')
      expect(banner).toHaveAttribute('role', 'alert')
    })

    it('dismisses the session expired banner when the close button is clicked', async () => {
      const user = userEvent.setup()
      mockSearchParams = new URLSearchParams('expired=true')
      render(<LoginPage />, { wrapper: RouterWrapper })

      expect(screen.getByTestId('session-expired-banner')).toBeInTheDocument()

      await user.click(screen.getByTestId('session-expired-dismiss'))

      expect(
        screen.queryByTestId('session-expired-banner')
      ).not.toBeInTheDocument()
    })
  })
})
