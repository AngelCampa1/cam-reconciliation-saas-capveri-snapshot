import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LeakageResultStep } from './LeakageResultStep'

vi.mock('../OnboardingContext', () => ({
  useOnboarding: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  apiClient: {},
  getSession: vi.fn().mockResolvedValue({ access_token: 'test-token' }),
}))

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

vi.mock('@/hooks/use-free-audit-status', () => ({
  useFreeAuditStatus: vi.fn(),
}))

const mockUseOnboarding = vi.mocked(
  await import('../OnboardingContext')
).useOnboarding
const mockUseFreeAuditStatus = vi.mocked(
  await import('@/hooks/use-free-audit-status')
).useFreeAuditStatus

function renderWithRouter() {
  return render(
    <MemoryRouter>
      <LeakageResultStep />
    </MemoryRouter>
  )
}

describe('LeakageResultStep', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  const advancePollCycles = async (cycles: number) => {
    for (let i = 0; i < cycles; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(5000)
        await Promise.resolve()
        await Promise.resolve()
      })
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    fetchSpy = vi.spyOn(globalThis, 'fetch')
    mockUseFreeAuditStatus.mockReturnValue({
      data: {
        has_subscription: true,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof mockUseFreeAuditStatus>)

    mockUseOnboarding.mockReturnValue({
      nextStep: vi.fn(),
      setStepData: vi.fn(),
      prevStep: vi.fn(),
      goToStep: vi.fn(),
      skipOnboarding: vi.fn(),
      completeOnboarding: vi.fn(),
      canGoNext: true,
      canGoPrev: true,
      isFirstStep: false,
      isLastStep: false,
      state: {
        currentStep: 6,
        totalSteps: 6,
        completed: false,
        skipped: false,
        data: { propertyId: 'prop-123' },
      },
    } as ReturnType<typeof mockUseOnboarding>)
  })

  afterEach(() => {
    fetchSpy.mockRestore()
    vi.useRealTimers()
  })

  it('shows processing state and polls until reconciliation data is ready', async () => {
    fetchSpy
      // GL date range fetch (consumed by the useEffect)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          has_reconciliation_data: false,
          has_gl_data: true,
          has_billing_data: true,
          leakage: 0,
          leakage_pct: 0,
          capveri_calculated: 0,
          actual_billed: 0,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          has_reconciliation_data: false,
          has_gl_data: true,
          has_billing_data: true,
          leakage: 0,
          leakage_pct: 0,
          capveri_calculated: 0,
          actual_billed: 0,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          has_reconciliation_data: true,
          has_gl_data: true,
          has_billing_data: true,
          leakage: 34200,
          leakage_pct: 12.5,
          capveri_calculated: 274200,
          actual_billed: 240000,
        }),
      } as Response)

    renderWithRouter()

    expect(screen.getByText(/analyzing your cam data/i)).toBeInTheDocument()

    await advancePollCycles(1)
    expect(screen.getByText(/analyzing your cam data/i)).toBeInTheDocument()

    await advancePollCycles(2)

    expect(
      screen.getByText(/under-bills in this reconciliation:/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/34,200/)).toHaveClass('text-primary')
    expect(
      screen.queryByText(/analyzing your cam data/i)
    ).not.toBeInTheDocument()
  })

  it('clears loading state when poll returns null (API failure path)', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'))

    renderWithRouter()

    expect(screen.getByText(/analyzing your cam data/i)).toBeInTheDocument()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    // Spinner must clear — user cannot be stuck on loading indefinitely
    expect(
      screen.queryByText(/analyzing your cam data/i)
    ).not.toBeInTheDocument()
  })

  it('shows timeout fallback with reconciliation draft copy after 90 seconds', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        has_reconciliation_data: false,
        has_gl_data: true,
        has_billing_data: true,
        leakage: 0,
        leakage_pct: 0,
        capveri_calculated: 0,
        actual_billed: 0,
      }),
    } as Response)

    renderWithRouter()

    await advancePollCycles(19)

    // Updated copy — reconciliation draft ready for review
    expect(
      screen.getByText(/your reconciliation draft is ready for review/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/review reconciliation/i)).toBeInTheDocument()

    // Old alarming copy must be gone
    expect(
      screen.queryByText(/something took longer than expected/i)
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/refresh the page/i)).not.toBeInTheDocument()
  })

  it('timeout state button label is Continue, not Continue to Dashboard', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        has_reconciliation_data: false,
        has_gl_data: true,
        has_billing_data: true,
        leakage: 0,
        leakage_pct: 0,
        capveri_calculated: 0,
        actual_billed: 0,
      }),
    } as Response)

    renderWithRouter()

    await advancePollCycles(19)

    const continueBtn = screen.getByRole('button', { name: /^continue$/i })
    expect(continueBtn).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /continue to dashboard/i })
    ).not.toBeInTheDocument()
  })

  it('renders reconciliation heading and over-bill detail when leakage is negative', async () => {
    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          has_reconciliation_data: true,
          has_gl_data: true,
          has_billing_data: true,
          leakage: -71000,
          leakage_pct: -22.3,
          capveri_calculated: 247000,
          actual_billed: 318000,
        }),
      } as Response)

    renderWithRouter()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(
      screen.getByText(/your draft reconciliation is ready/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/over-bills in this reconciliation:/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/71,000/)).toHaveClass('text-primary')
    expect(screen.getByText(/22\.3%/)).toBeInTheDocument()
  })

  it('shows inline upload state immediately when required data is missing', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        has_reconciliation_data: false,
        has_gl_data: false,
        has_billing_data: false,
        leakage: 0,
        leakage_pct: 0,
        capveri_calculated: 0,
        actual_billed: 0,
      }),
    } as Response)

    renderWithRouter()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText(/one more step!/i)).toBeInTheDocument()
    expect(
      screen.queryByText(/analyzing your cam data/i)
    ).not.toBeInTheDocument()
  })

  it('pauses inline billed upload when rows need match review', async () => {
    vi.useRealTimers()
    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          has_reconciliation_data: false,
          has_gl_data: true,
          has_billing_data: false,
          leakage: 0,
          leakage_pct: 0,
          capveri_calculated: 0,
          actual_billed: 0,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total_billed: 2500,
          items: [
            {
              id: '66666666-6666-4666-8666-666666666660',
              tenant_name: 'Unknown Tenant',
              billed_amount: '1600',
              suite: null,
              lease_id: null,
              match_status: 'needs_review',
            },
          ],
          warnings: [
            'Row 2 needs review. Unknown Tenant did not match a lease.',
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              tenant_name: 'Acme Retail',
              start_date: '2025-01-01',
              end_date: '2025-12-31',
            },
          ],
          has_more: false,
        }),
      } as Response)

    renderWithRouter()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const input = document.querySelector(
      '#billing-file-upload-partial'
    ) as HTMLInputElement
    const csvFile = new File(
      ['Tenant Name,Amount Charged\nAcme Retail,900\nUnknown Tenant,1600'],
      'billed.csv',
      { type: 'text/csv' }
    )

    await act(async () => {
      fireEvent.change(input, { target: { files: [csvFile] } })
      fireEvent.click(screen.getByRole('button', { name: /^upload$/i }))
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(
      screen.getByText(
        'Row 2 needs review. Unknown Tenant did not match a lease.'
      )
    ).toBeInTheDocument()
    expect(
      await screen.findByText(/match these rows to tenants/i)
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Billing data saved successfully')
    ).not.toBeInTheDocument()
    expect(
      fetchSpy.mock.calls.filter(([url]) => String(url).includes('/leakage/'))
    ).toHaveLength(1)
  })

  it('saves inline billed row matches before refreshing leakage', async () => {
    vi.useRealTimers()
    const user = userEvent.setup()
    fetchSpy
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          has_reconciliation_data: false,
          has_gl_data: true,
          has_billing_data: false,
          leakage: 0,
          leakage_pct: 0,
          capveri_calculated: 0,
          actual_billed: 0,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          total_billed: 2500,
          items: [
            {
              id: '66666666-6666-4666-8666-666666666660',
              tenant_name: 'Unknown Tenant',
              billed_amount: '2500',
              suite: null,
              lease_id: null,
              match_status: 'needs_review',
            },
          ],
          warnings: [
            'Row 1 needs review. Unknown Tenant did not match a lease.',
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              tenant_name: 'Acme Retail',
              start_date: '2025-01-01',
              end_date: '2025-12-31',
            },
          ],
          has_more: false,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, updated_count: 1 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          has_reconciliation_data: true,
          has_gl_data: true,
          has_billing_data: true,
          leakage: 34200,
          leakage_pct: 12.5,
          capveri_calculated: 274200,
          actual_billed: 240000,
        }),
      } as Response)

    renderWithRouter()

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    const input = document.querySelector(
      '#billing-file-upload-partial'
    ) as HTMLInputElement
    const csvFile = new File(
      ['Tenant Name,Amount Charged\nUnknown Tenant,2500'],
      'billed.csv',
      { type: 'text/csv' }
    )

    await act(async () => {
      fireEvent.change(input, { target: { files: [csvFile] } })
    })
    await user.click(screen.getByRole('button', { name: /^upload$/i }))

    await user.click(await screen.findByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Acme Retail' }))
    await user.click(
      screen.getByRole('button', { name: /run reconciliation/i })
    )

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/actual-billed/matches'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          property_id: 'prop-123',
          period_start: '2025-01-01',
          period_end: '2025-12-31',
          matches: [
            {
              actual_billed_id: '66666666-6666-4666-8666-666666666660',
              lease_id: '55555555-5555-4555-8555-555555555555',
            },
          ],
        }),
      })
    )
    expect(
      await screen.findByText(/under-bills in this reconciliation:/i)
    ).toBeInTheDocument()
  })
})
