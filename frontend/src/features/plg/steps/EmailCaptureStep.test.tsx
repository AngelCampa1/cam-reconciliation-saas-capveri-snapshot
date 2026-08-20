/**
 * Tests for EmailCaptureStep (TDD, written before implementation).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { type ReactNode } from 'react'

// Mock useOnboarding
const mockNextStep = vi.fn()
const mockSetStepData = vi.fn()
const mockState = { data: { leakage: 5000, propertyName: 'Tower A' } }

vi.mock('../OnboardFlowContext', () => ({
  useOnboarding: () => ({
    nextStep: mockNextStep,
    setStepData: mockSetStepData,
    state: mockState,
  }),
}))

// Mock fetch for plg-signup
const mockFetch = vi.fn()

import { EmailCaptureStep } from './EmailCaptureStep'

const Wrapper = ({ children }: { children: ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('EmailCaptureStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, message: 'Check your email' }),
    })
  })

  it('submits email to plg-signup endpoint and advances to next step', async () => {
    const user = userEvent.setup()
    render(<EmailCaptureStep />, { wrapper: Wrapper })

    await user.type(screen.getByLabelText(/first name/i), 'Alex')
    await user.type(screen.getByLabelText(/work email/i), 'alex@example.com')

    await user.click(
      screen.getByRole('button', { name: /save my reconciliation/i })
    )

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/leads/plg-signup'),
        expect.objectContaining({ method: 'POST' })
      )
    })

    await waitFor(() => {
      expect(mockNextStep).toHaveBeenCalled()
    })
  })

  it('shows validation error when email is empty', async () => {
    const user = userEvent.setup()
    render(<EmailCaptureStep />, { wrapper: Wrapper })

    await user.type(screen.getByLabelText(/first name/i), 'Alex')
    // Don't fill email

    await user.click(
      screen.getByRole('button', { name: /save my reconciliation/i })
    )

    await waitFor(() => {
      expect(screen.getByText(/email is required/i)).toBeInTheDocument()
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockNextStep).not.toHaveBeenCalled()
  })

  it('shows validation error for invalid email format', async () => {
    const user = userEvent.setup()
    render(<EmailCaptureStep />, { wrapper: Wrapper })

    await user.type(screen.getByLabelText(/work email/i), 'notanemail')
    await user.click(
      screen.getByRole('button', { name: /save my reconciliation/i })
    )

    await waitFor(() => {
      expect(screen.getByText(/valid email/i)).toBeInTheDocument()
    })

    expect(mockFetch).not.toHaveBeenCalled()
    expect(mockNextStep).not.toHaveBeenCalled()
  })

  it('shows error and does not advance when API returns error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 422 })

    const user = userEvent.setup()
    render(<EmailCaptureStep />, { wrapper: Wrapper })

    await user.type(screen.getByLabelText(/work email/i), 'alex@example.com')
    await user.click(
      screen.getByRole('button', { name: /save my reconciliation/i })
    )

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    })

    expect(mockNextStep).not.toHaveBeenCalled()
  })

  it('disables submit button while request is in flight', async () => {
    // Make fetch hang so we can observe the disabled state
    let resolve: (val: unknown) => void = () => {}
    mockFetch.mockReturnValue(
      new Promise((r) => {
        resolve = r
      })
    )

    const user = userEvent.setup()
    render(<EmailCaptureStep />, { wrapper: Wrapper })

    await user.type(screen.getByLabelText(/first name/i), 'Alex')
    await user.type(screen.getByLabelText(/work email/i), 'alex@example.com')

    const submitBtn = screen.getByRole('button', {
      name: /save my reconciliation/i,
    })
    await user.click(submitBtn)

    // While request is in flight, button should be disabled
    expect(submitBtn).toBeDisabled()

    // Cleanup: resolve the pending promise inside act so state updates settle cleanly
    await act(async () => {
      resolve({
        ok: true,
        json: async () => ({ success: true }),
      })
    })
  })
})
