/**
 * Tests for TenantLoginPage component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { TenantLoginPage } from './TenantLoginPage'
import { UserRole } from '@/types/enums'

// Mock the auth hook
const mockLogin = vi.fn()
const mockLogout = vi.fn()
const mockNavigate = vi.fn()
let mockUserRole: UserRole | null = null

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    login: mockLogin,
    logout: mockLogout,
    user: null,
    userRole: mockUserRole,
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

describe('TenantLoginPage', () => {
  beforeEach(() => {
    mockLogin.mockReset()
    mockLogout.mockReset()
    mockNavigate.mockReset()
    mockUserRole = null
  })

  it('renders login form', () => {
    render(
      <BrowserRouter>
        <TenantLoginPage />
      </BrowserRouter>
    )

    expect(screen.getByText('Tenant Portal')).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('tenant login inputs have name attributes', () => {
    render(
      <BrowserRouter>
        <TenantLoginPage />
      </BrowserRouter>
    )

    expect(screen.getByLabelText(/email/i)).toHaveAttribute('name', 'email')
    expect(screen.getByLabelText(/password/i)).toHaveAttribute(
      'name',
      'password'
    )
  })

  it('shows forgot password link', () => {
    render(
      <BrowserRouter>
        <TenantLoginPage />
      </BrowserRouter>
    )

    const forgotLink = screen.getByText(/forgot password/i)
    expect(forgotLink).toBeInTheDocument()
    expect(forgotLink).toHaveAttribute('href', '/tenant/forgot-password')
  })

  it('shows link to main login', () => {
    render(
      <BrowserRouter>
        <TenantLoginPage />
      </BrowserRouter>
    )

    expect(
      screen.getByText(/landlord or property manager/i)
    ).toBeInTheDocument()
    const loginLink = screen.getByText(/sign in here/i)
    expect(loginLink).toHaveAttribute('href', '/login')
  })

  it('submits form with email and password', async () => {
    mockLogin.mockResolvedValue(UserRole.TENANT)

    render(
      <BrowserRouter>
        <TenantLoginPage />
      </BrowserRouter>
    )

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'tenant@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith(
        'tenant@example.com',
        'password123'
      )
    })
  })

  it('shows loading state during login', async () => {
    mockLogin.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    )

    render(
      <BrowserRouter>
        <TenantLoginPage />
      </BrowserRouter>
    )

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'tenant@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'password123' } })
    fireEvent.click(submitButton)

    expect(screen.getByText(/signing in/i)).toBeInTheDocument()
    expect(submitButton).toBeDisabled()
  })

  it('shows error message on login failure', async () => {
    mockLogin.mockRejectedValue(new Error('Invalid credentials'))

    render(
      <BrowserRouter>
        <TenantLoginPage />
      </BrowserRouter>
    )

    const emailInput = screen.getByLabelText(/email/i)
    const passwordInput = screen.getByLabelText(/password/i)
    const submitButton = screen.getByRole('button', { name: /sign in/i })

    fireEvent.change(emailInput, { target: { value: 'tenant@example.com' } })
    fireEvent.change(passwordInput, { target: { value: 'wrong' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/invalid credentials/i)).toBeInTheDocument()
    })
  })

  it('reenables submit and shows an error when tenant role does not load', async () => {
    mockLogin.mockResolvedValue(null)

    render(
      <BrowserRouter>
        <TenantLoginPage />
      </BrowserRouter>
    )

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'tenant@example.com' },
    })
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/we couldn't sign you in/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled()
    expect(mockLogout).toHaveBeenCalled()
  })
})
