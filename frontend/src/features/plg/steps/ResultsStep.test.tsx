/**
 * Tests for ResultsStep (PLG Step 5).
 *
 * Verifies the component calls the correct leakage endpoint and
 * handles both the data-available and no-data states.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { type ReactNode } from 'react'

const mockNextStep = vi.fn()
const mockSetStepData = vi.fn()

// Mutable state so individual describe blocks can override data
let mockStateData: Record<string, unknown> = {
  propertyId: 'prop-123',
  glDataYear: 2024,
}

vi.mock('../OnboardFlowContext', () => ({
  useOnboarding: () => ({
    nextStep: mockNextStep,
    setStepData: mockSetStepData,
    state: { data: mockStateData },
  }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'mock-token' } },
      }),
    },
  },
}))

const mockFetch = vi.fn()

import { ResultsStep } from './ResultsStep'

const Wrapper = ({ children }: { children: ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('ResultsStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch
    mockStateData = { propertyId: 'prop-123', glDataYear: 2024 }
  })

  it('fetches leakage from /api/v1/leakage/:id endpoint with correct period', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        leakage: 8500,
        leakage_pct: 18.5,
        capveri_calculated: 46000,
        actual_billed: 37500,
        has_reconciliation_data: true,
        has_gl_data: true,
        has_billing_data: true,
      }),
    })

    render(<ResultsStep />, { wrapper: Wrapper })

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/leakage/prop-123'),
        expect.any(Object)
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('period_start=2024-01-01'),
        expect.any(Object)
      )
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('period_end=2024-12-31'),
        expect.any(Object)
      )
    })
  })

  it('shows leakage amount when reconciliation data available', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        leakage: 8500,
        leakage_pct: 18.5,
        capveri_calculated: 46000,
        actual_billed: 37500,
        has_reconciliation_data: true,
        has_gl_data: true,
        has_billing_data: true,
      }),
    })

    render(<ResultsStep />, { wrapper: Wrapper })

    await screen.findByText('$8,500')
    expect(screen.getByText(/18\.5%/)).toBeInTheDocument()
  })

  it('shows data-uploaded message when reconciliation not yet run', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        leakage: 0,
        leakage_pct: 0,
        capveri_calculated: 0,
        actual_billed: 0,
        has_reconciliation_data: false,
        has_gl_data: true,
        has_billing_data: false,
      }),
    })

    render(<ResultsStep />, { wrapper: Wrapper })

    await screen.findByText(/we got your files/i)
    expect(
      screen.getByRole('button', { name: /continue/i })
    ).toBeInTheDocument()
  })

  it('shows Continue anyway on fetch error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 })

    render(<ResultsStep />, { wrapper: Wrapper })

    await screen.findByRole('button', { name: /continue anyway/i })
  })

  it('retries the leakage fetch and recovers when Try again is clicked', async () => {
    const user = userEvent.setup()
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        leakage: 12345,
        leakage_pct: 5.0,
        capveri_calculated: 0,
        actual_billed: 0,
        has_reconciliation_data: true,
        has_gl_data: true,
        has_billing_data: true,
      }),
    })

    render(<ResultsStep />, { wrapper: Wrapper })

    const retry = await screen.findByRole('button', { name: /try again/i })
    await user.click(retry)

    await screen.findByText('$12,345')
  })

  it('shows the plain heading and absolute value when leakage is negative', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        leakage: -71524,
        leakage_pct: -16.5,
        capveri_calculated: 0,
        actual_billed: 0,
        has_reconciliation_data: true,
        has_gl_data: true,
        has_billing_data: true,
      }),
    })

    render(<ResultsStep />, { wrapper: Wrapper })

    await screen.findByText(/here is what we checked/i)
    expect(
      screen.getByText('We caught over-bills before you sent the statement')
    ).toBeInTheDocument()
    expect(screen.getByText('$71,524')).toBeInTheDocument()
    expect(
      screen.getByText(/amount to fix before sending/i)
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/leaving money on the table/i)
    ).not.toBeInTheDocument()
  })

  it('shows charges-line-up subtitle when leakage is zero', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        leakage: 0,
        leakage_pct: 0,
        capveri_calculated: 10000,
        actual_billed: 10000,
        has_reconciliation_data: true,
        has_gl_data: true,
        has_billing_data: true,
      }),
    })

    render(<ResultsStep />, { wrapper: Wrapper })

    await screen.findByText(/your statement holds up/i)
    expect(screen.getByText(/statement checks passed/i)).toBeInTheDocument()
    expect(
      screen.getByText(/no over-bills or under-bills to fix/i)
    ).toBeInTheDocument()
    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    expect(
      screen.queryByText(/leaving money on the table/i)
    ).not.toBeInTheDocument()
  })

  it('Continue button calls nextStep', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        leakage: 1000,
        leakage_pct: 5,
        capveri_calculated: 20000,
        actual_billed: 19000,
        has_reconciliation_data: true,
        has_gl_data: true,
        has_billing_data: true,
      }),
    })

    const user = userEvent.setup()
    render(<ResultsStep />, { wrapper: Wrapper })

    const btn = await screen.findByRole('button', {
      name: /continue/i,
    })
    await user.click(btn)

    expect(mockNextStep).toHaveBeenCalledOnce()
  })
})
