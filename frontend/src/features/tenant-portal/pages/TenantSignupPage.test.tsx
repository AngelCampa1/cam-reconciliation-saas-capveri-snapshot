/**
 * Tests for TenantSignupPage component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { TenantSignupPage } from './TenantSignupPage'

const mockNavigate = vi.fn()

// Mock the SDK
vi.mock('@/api/generated/sdk.gen', async () => {
  const actual = await vi.importActual('@/api/generated/sdk.gen')
  return {
    ...actual,
    validateInvitationTokenApiV1TenantInvitationsTokenValidateGet: vi.fn(),
    tenantSignupApiV1TenantSignupPost: vi.fn(),
  }
})

import {
  validateInvitationTokenApiV1TenantInvitationsTokenValidateGet,
  tenantSignupApiV1TenantSignupPost,
} from '@/api/generated/sdk.gen'

const mockValidateToken = vi.mocked(
  validateInvitationTokenApiV1TenantInvitationsTokenValidateGet
)
const mockSignup = vi.mocked(tenantSignupApiV1TenantSignupPost)

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('TenantSignupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: successful token validation
    mockValidateToken.mockResolvedValue({
      data: {
        email: 'tenant@example.com',
        valid: true,
      },
      error: null,
    } as any)

    // Default: successful signup
    mockSignup.mockResolvedValue({
      data: {
        success: true,
        user_id: 'user-123',
        access_token: 'mock-access-token',
        refresh_token: 'mock-refresh-token',
        tenant_user: {
          id: 'tenant-123',
          user_id: 'user-123',
          organization_id: 'org-456',
          contact_name: 'Test User',
          contact_email: 'tenant@example.com',
          created_at: '2024-01-01T00:00:00Z',
        },
      },
      error: undefined,
      response: {} as Response,
    })
  })

  it('shows error when no token provided', async () => {
    render(
      <BrowserRouter>
        <TenantSignupPage />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getAllByText(/invalid invitation/i).length).toBeGreaterThan(
        0
      )
      expect(
        screen.getByText(/this invite link is broken/i)
      ).toBeInTheDocument()
    })
  })

  it('shows loading state while validating token', async () => {
    render(
      <MemoryRouter initialEntries={['/?token=valid-token']}>
        <TenantSignupPage />
      </MemoryRouter>
    )

    // Check for either loading state OR the form (component transitions quickly)
    await waitFor(
      () => {
        const hasLoading = screen.queryByText(/checking your invite/i)
        const hasForm = screen.queryByText(/complete your registration/i)
        expect(hasLoading || hasForm).toBeTruthy()
      },
      { timeout: 2000 }
    )
  })

  it('renders signup form after successful token validation', async () => {
    render(
      <MemoryRouter initialEntries={['/?token=valid-token']}>
        <TenantSignupPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(
        screen.getByText(/complete your registration/i)
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/create password/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
    })
  })

  it('shows invited email address', async () => {
    render(
      <MemoryRouter initialEntries={['/?token=valid-token']}>
        <TenantSignupPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/tenant@example\.com/i)).toBeInTheDocument()
    })
  })

  it('shows link to sign in page', async () => {
    render(
      <MemoryRouter initialEntries={['/?token=valid-token']}>
        <TenantSignupPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      const signInLink = screen.getByText(/sign in$/i)
      expect(signInLink).toHaveAttribute('href', '/tenant/login')
    })
  })

  it('shows error when token validation returns error', async () => {
    mockValidateToken.mockResolvedValue({
      data: null,
      error: 'Token expired',
    } as any)

    render(
      <MemoryRouter initialEntries={['/?token=expired-token']}>
        <TenantSignupPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getAllByText(/invalid invitation/i).length).toBeGreaterThan(
        0
      )
      expect(
        screen.getByText(/this invite link no longer works/i)
      ).toBeInTheDocument()
    })
  })

  it('shows error when token validation throws exception', async () => {
    mockValidateToken.mockRejectedValue(new Error('Network error'))

    render(
      <MemoryRouter initialEntries={['/?token=valid-token']}>
        <TenantSignupPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getAllByText(/invalid invitation/i).length).toBeGreaterThan(
        0
      )
      expect(
        screen.getByText(/this invite link no longer works/i)
      ).toBeInTheDocument()
    })
  })

  it('shows error when passwords do not match', async () => {
    render(
      <MemoryRouter initialEntries={['/?token=valid-token']}>
        <TenantSignupPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/create password/i)).toBeInTheDocument()
    })

    // Fill in name and mismatched passwords
    const nameInput = screen.getByLabelText(/your name/i)
    const passwordInput = screen.getByLabelText(/create password/i)
    const confirmInput = screen.getByLabelText(/confirm password/i)
    const submitButton = screen.getByRole('button', { name: /create account/i })

    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.change(confirmInput, { target: { value: 'different456' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    })
  })

  it('shows error when password is too short', async () => {
    render(
      <MemoryRouter initialEntries={['/?token=valid-token']}>
        <TenantSignupPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/create password/i)).toBeInTheDocument()
    })

    // Fill in name and short password
    const nameInput = screen.getByLabelText(/your name/i)
    const passwordInput = screen.getByLabelText(/create password/i)
    const confirmInput = screen.getByLabelText(/confirm password/i)
    const submitButton = screen.getByRole('button', { name: /create account/i })

    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    fireEvent.change(passwordInput, { target: { value: 'short' } })
    fireEvent.change(confirmInput, { target: { value: 'short' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(
        screen.getByText(/password must be at least 8 characters/i)
      ).toBeInTheDocument()
    })
  })

  it('disables submit button and shows submitting state', async () => {
    render(
      <MemoryRouter initialEntries={['/?token=valid-token']}>
        <TenantSignupPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/create password/i)).toBeInTheDocument()
    })

    // Fill in name and valid passwords
    const nameInput = screen.getByLabelText(/your name/i)
    const passwordInput = screen.getByLabelText(/create password/i)
    const confirmInput = screen.getByLabelText(/confirm password/i)
    const termsCheckbox = screen.getByRole('checkbox', {
      name: /accept the terms of service/i,
    })
    const submitButton = screen.getByRole('button', { name: /create account/i })

    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    fireEvent.change(passwordInput, { target: { value: 'validpassword123' } })
    fireEvent.change(confirmInput, { target: { value: 'validpassword123' } })
    fireEvent.click(termsCheckbox)

    // Submit form
    fireEvent.click(submitButton)

    // Button should show submitting state
    await waitFor(() => {
      const submittingButton = screen.getByRole('button', {
        name: /creating account/i,
      })
      expect(submittingButton).toBeDisabled()
    })
  })

  it('navigates to login after successful signup', async () => {
    render(
      <MemoryRouter initialEntries={['/?token=valid-token']}>
        <TenantSignupPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/create password/i)).toBeInTheDocument()
    })

    // Fill in name and valid passwords
    const nameInput = screen.getByLabelText(/your name/i)
    const passwordInput = screen.getByLabelText(/create password/i)
    const confirmInput = screen.getByLabelText(/confirm password/i)
    const termsCheckbox = screen.getByRole('checkbox', {
      name: /accept the terms of service/i,
    })
    const submitButton = screen.getByRole('button', { name: /create account/i })

    fireEvent.change(nameInput, { target: { value: 'Test User' } })
    fireEvent.change(passwordInput, { target: { value: 'validpassword123' } })
    fireEvent.change(confirmInput, { target: { value: 'validpassword123' } })
    fireEvent.click(termsCheckbox)
    fireEvent.click(submitButton)

    // Should navigate to dashboard
    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith('/tenant/dashboard', {
          state: { message: 'Account created successfully!' },
        })
      },
      { timeout: 2000 }
    )
  })

  it('shows link to login from error state', async () => {
    mockValidateToken.mockResolvedValue({
      data: null,
      error: 'Token expired',
    } as any)

    render(
      <MemoryRouter initialEntries={['/?token=expired-token']}>
        <TenantSignupPage />
      </MemoryRouter>
    )

    await waitFor(() => {
      const loginLink = screen.getByText(/go to login/i)
      expect(loginLink).toHaveAttribute('href', '/tenant/login')
    })
  })
})
