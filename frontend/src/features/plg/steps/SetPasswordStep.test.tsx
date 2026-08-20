/**
 * Tests for SetPasswordStep (TDD — written before implementation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { type ReactNode } from 'react'

// Mock useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

// Mock useOnboarding
const mockNextStep = vi.fn()
const mockCompleteOnboarding = vi.fn()
const mockSetStepData = vi.fn()

vi.mock('../OnboardFlowContext', () => ({
  useOnboarding: () => ({
    nextStep: mockNextStep,
    completeOnboarding: mockCompleteOnboarding,
    setStepData: mockSetStepData,
    state: { data: { email: 'alex@example.com' } },
  }),
}))

// Mock supabase updateUser + getSession via hoisted
const { mockUpdateUser, mockGetSession } = vi.hoisted(() => ({
  mockUpdateUser: vi.fn(),
  mockGetSession: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: mockUpdateUser,
      getSession: mockGetSession,
    },
  },
}))

// Mock fetch for upgrade endpoint
const mockFetch = vi.fn()

import { SetPasswordStep } from './SetPasswordStep'

const Wrapper = ({ children }: { children: ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('SetPasswordStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch
    mockUpdateUser.mockResolvedValue({ data: {}, error: null })
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'test-token-abc' } },
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })
  })

  it('calls updateUser then upgrade endpoint then navigates to billing selection', async () => {
    const user = userEvent.setup()
    render(<SetPasswordStep />, { wrapper: Wrapper })

    // Email should be pre-filled (read-only)
    expect(screen.getByDisplayValue('alex@example.com')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^password$/i), 'SuperSecret1!')
    await user.type(screen.getByLabelText(/confirm password/i), 'SuperSecret1!')

    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({
        email: 'alex@example.com',
        password: 'SuperSecret1!',
      })
    })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/onboard/upgrade'),
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token-abc',
          }),
        })
      )
    })

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/settings/billing?intent=select-plan'
      )
    })
  })

  it('shows error when password is shorter than 8 characters', async () => {
    const user = userEvent.setup()
    render(<SetPasswordStep />, { wrapper: Wrapper })

    await user.type(screen.getByLabelText(/^password$/i), 'short')
    await user.type(screen.getByLabelText(/confirm password/i), 'short')

    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
    })

    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('disables submit when passwords do not match', async () => {
    const user = userEvent.setup()
    render(<SetPasswordStep />, { wrapper: Wrapper })

    await user.type(screen.getByLabelText(/^password$/i), 'SuperSecret1!')
    await user.type(
      screen.getByLabelText(/confirm password/i),
      'DifferentPass!'
    )

    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    })

    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('shows error and does not navigate when upgrade endpoint fails', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })

    const user = userEvent.setup()
    render(<SetPasswordStep />, { wrapper: Wrapper })

    await user.type(screen.getByLabelText(/^password$/i), 'SuperSecret1!')
    await user.type(screen.getByLabelText(/confirm password/i), 'SuperSecret1!')

    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/sync failed/i)).toBeInTheDocument()
    })

    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('shows sign-in link when email is already registered', async () => {
    mockUpdateUser.mockResolvedValue({
      data: {},
      error: { message: 'Email address already registered' },
    })

    const user = userEvent.setup()
    render(<SetPasswordStep />, { wrapper: Wrapper })

    await user.type(screen.getByLabelText(/^password$/i), 'SuperSecret1!')
    await user.type(screen.getByLabelText(/confirm password/i), 'SuperSecret1!')

    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(screen.getByText(/already has an account/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
  })
})
