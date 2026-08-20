/**
 * Tests for RegisterPage component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock Supabase (must be before other imports that use it)
vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
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

// Mock authenticatedFetch so the fire-and-forget trial start call doesn't throw in tests
vi.mock('../../api/authFetch', () => ({
  authenticatedFetch: vi
    .fn()
    .mockResolvedValue(new Response('{}', { status: 200 })),
}))

import { RegisterPage } from './RegisterPage'
import { useAuth } from '../../hooks/useAuth'

// Wrapper with Router
const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('RegisterPage', () => {
  const mockRegister = vi.fn().mockResolvedValue(true)
  const defaultAuthState = {
    user: null,
    session: null,
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: mockRegister,
    logout: vi.fn(),
    getSession: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    vi.mocked(useAuth).mockReturnValue(defaultAuthState)
  })

  describe('SEO', () => {
    it('renders page-specific SEO title', () => {
      render(<RegisterPage />, { wrapper: RouterWrapper })
      expect(document.title).toBe('Create Account | CapVeri')
    })
  })

  describe('Terms Checkbox Accessibility', () => {
    it('terms checkbox has aria-labelledby pointing to label id', () => {
      render(<RegisterPage />, { wrapper: RouterWrapper })

      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).toHaveAttribute('aria-labelledby', 'accept-terms-label')
    })

    it('label element has correct id for aria association', () => {
      render(<RegisterPage />, { wrapper: RouterWrapper })

      const label = document.getElementById('accept-terms-label')
      expect(label).not.toBeNull()
      expect(label?.textContent).toMatch(/i accept the/i)
    })

    it('clicking label text checks the checkbox', async () => {
      const user = userEvent.setup()
      render(<RegisterPage />, { wrapper: RouterWrapper })

      const checkbox = screen.getByRole('checkbox')
      expect(checkbox).not.toBeChecked()

      const label = document.getElementById('accept-terms-label')!
      await user.click(label)

      expect(checkbox).toBeChecked()
    })
  })

  describe('Form Rendering', () => {
    it('renders only email + password fields (no org name, no confirm password)', () => {
      render(<RegisterPage />, { wrapper: RouterWrapper })

      expect(screen.getByLabelText('Work Email')).toBeInTheDocument()
      expect(screen.getByLabelText(/^Password$/)).toBeInTheDocument()
      expect(
        screen.queryByLabelText('Organization Name')
      ).not.toBeInTheDocument()
      expect(
        screen.queryByLabelText('Confirm Password')
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /create account/i })
      ).toBeInTheDocument()
    })

    it('renders terms of service checkbox', () => {
      render(<RegisterPage />, { wrapper: RouterWrapper })

      const termsLinks = screen.getAllByRole('link', {
        name: /terms of service/i,
      })
      expect(
        termsLinks.some((link) => link.getAttribute('href') === '/terms')
      ).toBe(true)
      expect(screen.getByText(/privacy policy/i)).toBeInTheDocument()
    })

    it('renders sign in link', () => {
      render(<RegisterPage />, { wrapper: RouterWrapper })

      const signInLink = screen.getByText(/sign in/i)
      expect(signInLink).toBeInTheDocument()
      expect(signInLink).toHaveAttribute('href', '/auth/login')
    })
  })

  it('submits with only email + password and routes to the sample-first onboarding page', async () => {
    const user = userEvent.setup()
    render(<RegisterPage />, { wrapper: RouterWrapper })

    await user.type(screen.getByLabelText('Work Email'), 'owner@example.com')
    await user.type(screen.getByLabelText(/^Password$/), 'StrongPass1')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        'owner@example.com',
        'StrongPass1'
      )
    })
    expect(mockNavigate).toHaveBeenCalledWith(
      '/onboard?demo=1&source=first-login'
    )
  })

  it('routes to the sample-first onboarding page regardless of returnUrl after registration', async () => {
    const user = userEvent.setup()
    window.history.pushState(
      {},
      '',
      '/auth/register?returnUrl=%2Fcheckout%3Ftier%3Dportfolio%26units%3D120%26buildings%3D12%26billing%3Dannual'
    )

    render(<RegisterPage />, { wrapper: RouterWrapper })

    await user.type(screen.getByLabelText('Work Email'), 'owner@example.com')
    await user.type(screen.getByLabelText(/^Password$/), 'StrongPass1')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/onboard?demo=1&source=first-login'
      )
    })
  })

  describe('Form Validation', () => {
    it('validates email format', async () => {
      const user = userEvent.setup()
      render(<RegisterPage />, { wrapper: RouterWrapper })

      await user.type(screen.getByLabelText('Work Email'), 'invalid-email')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(screen.getByText(/valid email/i)).toBeInTheDocument()
      })
      expect(mockRegister).not.toHaveBeenCalled()
    })

    it('validates password minimum length', async () => {
      const user = userEvent.setup()
      render(<RegisterPage />, { wrapper: RouterWrapper })

      await user.type(screen.getByLabelText(/^Password$/), 'short')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/must be at least 8 characters/i)
        ).toBeInTheDocument()
      })
      expect(mockRegister).not.toHaveBeenCalled()
    })

    it('validates password has at least one uppercase letter', async () => {
      const user = userEvent.setup()
      render(<RegisterPage />, { wrapper: RouterWrapper })

      await user.type(screen.getByLabelText(/^Password$/), 'lowercase123')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/must contain at least one uppercase letter/i)
        ).toBeInTheDocument()
      })
      expect(mockRegister).not.toHaveBeenCalled()
    })

    it('validates password has at least one lowercase letter', async () => {
      const user = userEvent.setup()
      render(<RegisterPage />, { wrapper: RouterWrapper })

      await user.type(screen.getByLabelText(/^Password$/), 'UPPERCASE123')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/must contain at least one lowercase letter/i)
        ).toBeInTheDocument()
      })
      expect(mockRegister).not.toHaveBeenCalled()
    })

    it('validates password has at least one number', async () => {
      const user = userEvent.setup()
      render(<RegisterPage />, { wrapper: RouterWrapper })

      await user.type(screen.getByLabelText(/^Password$/), 'NoNumbers')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/must contain at least one number/i)
        ).toBeInTheDocument()
      })
      expect(mockRegister).not.toHaveBeenCalled()
    })

    it('requires terms acceptance', async () => {
      const user = userEvent.setup()
      render(<RegisterPage />, { wrapper: RouterWrapper })

      await user.type(screen.getByLabelText('Work Email'), 'test@example.com')
      await user.type(screen.getByLabelText(/^Password$/), 'Test1234')
      await user.click(screen.getByRole('button', { name: /create account/i }))

      await waitFor(() => {
        expect(
          screen.getByText(/must accept the terms of service/i)
        ).toBeInTheDocument()
      })
      expect(mockRegister).not.toHaveBeenCalled()
    })
  })

  describe('Password Visibility Toggle', () => {
    it('toggles password visibility', async () => {
      const user = userEvent.setup()
      render(<RegisterPage />, { wrapper: RouterWrapper })

      const passwordInput = screen.getByLabelText(/^Password$/)
      const toggleButton = screen.getByRole('button', {
        name: /show password/i,
      })

      expect(passwordInput).toHaveAttribute('type', 'password')

      await user.click(toggleButton)
      expect(passwordInput).toHaveAttribute('type', 'text')

      await user.click(toggleButton)
      expect(passwordInput).toHaveAttribute('type', 'password')
    })
  })

  describe('Password Strength Indicator', () => {
    it('shows password requirements when password field is focused', async () => {
      const user = userEvent.setup()
      render(<RegisterPage />, { wrapper: RouterWrapper })

      await user.click(screen.getByLabelText(/^Password$/))

      expect(screen.getByText(/at least 8 characters/i)).toBeVisible()
    })

    it('shows password strength indicator when typing', async () => {
      const user = userEvent.setup()
      render(<RegisterPage />, { wrapper: RouterWrapper })

      await user.type(screen.getByLabelText(/^Password$/), 'test')

      await waitFor(() => {
        expect(screen.getByText(/password strength/i)).toBeInTheDocument()
      })
    })
  })

  describe('Loading State', () => {
    it('shows loading spinner and disables fields during submission', () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthState,
        isLoading: true,
      })

      render(<RegisterPage />, { wrapper: RouterWrapper })

      expect(
        screen.getByRole('button', { name: /creating account/i })
      ).toBeDisabled()
      expect(screen.getByLabelText('Work Email')).toBeDisabled()
      expect(screen.getByLabelText(/^Password$/)).toBeDisabled()
      expect(screen.getByRole('checkbox')).toBeDisabled()
    })
  })

  describe('Error Handling', () => {
    it('displays error message when registration fails', () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthState,
        error: 'Email already in use',
      })

      render(<RegisterPage />, { wrapper: RouterWrapper })

      expect(screen.getByText('Email already in use')).toBeInTheDocument()
    })
  })

  describe('Navigation', () => {
    it('redirects already-logged-in users to /dashboard', async () => {
      vi.mocked(useAuth).mockReturnValue({
        ...defaultAuthState,
        user: { id: 'user-123', email: 'test@example.com' } as any,
      })

      render(<RegisterPage />, { wrapper: RouterWrapper })

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/dashboard')
      })
    })
  })
})
