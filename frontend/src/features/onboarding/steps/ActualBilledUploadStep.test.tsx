import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ActualBilledUploadStep } from './ActualBilledUploadStep'

vi.mock('../OnboardingContext', () => ({
  useOnboarding: vi.fn(),
}))

vi.mock('@/api/client', () => ({
  getSession: vi.fn().mockResolvedValue({ access_token: 'test-token' }),
}))

const mockNextStep = vi.fn()
const mockSetStepData = vi.fn()
const mockUseOnboarding = vi.mocked(
  await import('../OnboardingContext')
).useOnboarding

describe('ActualBilledUploadStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
    mockUseOnboarding.mockReturnValue({
      nextStep: mockNextStep,
      setStepData: mockSetStepData,
      state: {
        data: { propertyId: 'prop-123', glDataYear: 2024 },
        currentStep: 5,
        totalSteps: 7,
      },
      canGoNext: true,
      canGoPrev: true,
      isFirstStep: false,
      isLastStep: false,
      prevStep: vi.fn(),
      goToStep: vi.fn(),
      skipOnboarding: vi.fn(),
      completeOnboarding: vi.fn(),
    } satisfies ReturnType<typeof mockUseOnboarding>)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders security trust panel', () => {
    render(<ActualBilledUploadStep />)
    expect(
      screen.getByText(/your financial data is protected/i)
    ).toBeInTheDocument()
  })

  it('triggers reconciliation after manual billed entry', async () => {
    const user = userEvent.setup()
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ total_billed: 1000 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'job-1' }),
      } as Response)

    render(<ActualBilledUploadStep />)

    await user.click(screen.getByRole('tab', { name: /type the total/i }))
    await user.type(
      screen.getByLabelText(/how much did you charge last year/i),
      '1000'
    )
    await user.click(screen.getByRole('button', { name: /see my results/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/reconciliation/calculate'),
        expect.objectContaining({ method: 'POST' })
      )
    })
    expect(mockSetStepData).toHaveBeenCalledWith('reconciliationJobId', 'job-1')
  })

  it('shows lease error when reconciliation returns no_active_leases_for_period', async () => {
    const user = userEvent.setup()
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ total_billed: 1000 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'no_active_leases_for_period' }),
      } as Response)

    render(<ActualBilledUploadStep />)

    await user.click(screen.getByRole('tab', { name: /type the total/i }))
    await user.type(
      screen.getByLabelText(/how much did you charge last year/i),
      '1000'
    )
    await user.click(screen.getByRole('button', { name: /see my results/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/could not find any tenants for this year/i)
      ).toBeInTheDocument()
    })
    expect(mockNextStep).not.toHaveBeenCalled()
  })

  it('advertises CSV and XLSX billing upload support', () => {
    render(<ActualBilledUploadStep />)

    const input = document.querySelector(
      '#billing-file-upload'
    ) as HTMLInputElement

    expect(input.getAttribute('accept')).toContain('.csv')
    expect(input.getAttribute('accept')).toContain('.xlsx')
    expect(
      screen.getByText(
        /upload a csv or xlsx with tenant names and amounts charged/i
      )
    ).toBeInTheDocument()
  })

  it('does not let users skip the billed amount needed for comparison', () => {
    render(<ActualBilledUploadStep />)

    expect(
      screen.queryByRole('button', { name: /skip for now/i })
    ).not.toBeInTheDocument()
  })

  it('shows a friendly source label after a CSV upload', async () => {
    const user = userEvent.setup()
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        source_type: 'csv_import',
        row_count: 2,
        total_billed: 2500,
        warnings: ['Skipped row 4: amount was not a number'],
      }),
    } as Response)

    render(<ActualBilledUploadStep />)

    const input = document.querySelector(
      '#billing-file-upload'
    ) as HTMLInputElement
    const csvFile = new File(
      ['Tenant Name,Amount Charged\nAcme Retail,1200\nBeta Foods,1300'],
      'billed.csv',
      { type: 'text/csv' }
    )

    fireEvent.change(input, { target: { files: [csvFile] } })
    await user.click(screen.getByRole('button', { name: /use this file/i }))

    expect(await screen.findByText('From:')).toBeInTheDocument()
    expect(screen.getByText('your spreadsheet')).toBeInTheDocument()
    expect(screen.queryByText('csv_import')).not.toBeInTheDocument()
    expect(screen.getByText('Some rows need a look.')).toBeInTheDocument()
    expect(
      screen.getByText('Skipped row 4: amount was not a number')
    ).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/reconciliation/calculate'),
      expect.anything()
    )
  })

  it('pauses when uploaded billed rows need lease review', async () => {
    const user = userEvent.setup()
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          source_type: 'csv_import',
          row_count: 1,
          total_billed: 2500,
          matched_row_count: 0,
          unmatched_row_count: 1,
          items: [
            {
              id: 'billed-row-1',
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
              id: 'old-lease',
              tenant_name: 'Old Tenant',
              start_date: '2023-01-01',
              end_date: '2023-12-31',
            },
          ],
          has_more: true,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: 'lease-1',
              tenant_name: 'Acme Retail',
              start_date: '2024-01-01',
              end_date: '2024-12-31',
            },
          ],
          has_more: false,
        }),
      } as Response)

    render(<ActualBilledUploadStep />)

    const input = document.querySelector(
      '#billing-file-upload'
    ) as HTMLInputElement
    const csvFile = new File(
      ['Tenant Name,Amount Charged\nUnknown Tenant,2500'],
      'billed.csv',
      { type: 'text/csv' }
    )

    fireEvent.change(input, { target: { files: [csvFile] } })
    await user.click(screen.getByRole('button', { name: /use this file/i }))

    expect(
      await screen.findByText(
        'Row 1 needs review. Unknown Tenant did not match a lease.'
      )
    ).toBeInTheDocument()
    expect(screen.getByText('Match these rows to tenants')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/reconciliation/calculate'),
      expect.anything()
    )
    expect(
      screen.getByRole('button', { name: /see my results/i })
    ).toBeDisabled()
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/leases?'),
      expect.anything()
    )
    expect(screen.queryByText('Old Tenant')).not.toBeInTheDocument()
  })

  it('saves selected billed-row matches before showing results', async () => {
    const user = userEvent.setup()
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          source_type: 'csv_import',
          row_count: 1,
          total_billed: 2500,
          matched_row_count: 0,
          unmatched_row_count: 1,
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
              start_date: '2024-01-01',
              end_date: '2024-12-31',
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
        json: async () => ({ job_id: 'job-1' }),
      } as Response)

    render(<ActualBilledUploadStep />)

    const input = document.querySelector(
      '#billing-file-upload'
    ) as HTMLInputElement
    const csvFile = new File(
      ['Tenant Name,Amount Charged\nUnknown Tenant,2500'],
      'billed.csv',
      { type: 'text/csv' }
    )

    fireEvent.change(input, { target: { files: [csvFile] } })
    await user.click(screen.getByRole('button', { name: /use this file/i }))

    await user.click(await screen.findByRole('combobox'))
    await user.click(await screen.findByRole('option', { name: 'Acme Retail' }))
    await user.click(screen.getByRole('button', { name: /see my results/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/reconciliation/calculate'),
        expect.objectContaining({ method: 'POST' })
      )
    })
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/api/v1/actual-billed/matches'),
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          property_id: 'prop-123',
          period_start: '2024-01-01',
          period_end: '2024-12-31',
          matches: [
            {
              actual_billed_id: '66666666-6666-4666-8666-666666666660',
              lease_id: '55555555-5555-4555-8555-555555555555',
            },
          ],
        }),
      })
    )
    expect(mockSetStepData).toHaveBeenCalledWith('reconciliationJobId', 'job-1')
  })

  it('lets users type the right total after skipped upload rows', async () => {
    const user = userEvent.setup()
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          source_type: 'csv_import',
          row_count: 2,
          total_billed: 2500,
          warnings: ['Skipped row 4: tenant was blank'],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: 'Billing data deleted successfully' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ total_billed: 2900 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'job-1' }),
      } as Response)

    render(<ActualBilledUploadStep />)

    const input = document.querySelector(
      '#billing-file-upload'
    ) as HTMLInputElement
    const csvFile = new File(
      ['Tenant Name,Amount Charged\nAcme Retail,2500\n,400'],
      'billed.csv',
      { type: 'text/csv' }
    )

    fireEvent.change(input, { target: { files: [csvFile] } })
    await user.click(screen.getByRole('button', { name: /use this file/i }))

    await screen.findByText('Skipped row 4: tenant was blank')
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/reconciliation/calculate'),
      expect.anything()
    )
    await user.click(
      screen.getByRole('button', { name: /start with the right total/i })
    )

    const totalInput = screen.getByLabelText(
      /how much did you charge last year/i
    )
    expect(totalInput).toHaveValue(2500)

    await user.clear(totalInput)
    await user.type(totalInput, '2900')
    await user.click(screen.getByRole('button', { name: /see my results/i }))

    await waitFor(() => {
      expect(mockSetStepData).toHaveBeenCalledWith(
        'reconciliationJobId',
        'job-1'
      )
    })
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/api/v1/actual-billed/prop-123?'),
      expect.objectContaining({ method: 'DELETE' })
    )
    expect(global.fetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('/api/v1/actual-billed/manual'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"total_billed":2900'),
      })
    )
    expect(global.fetch).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('/api/v1/reconciliation/calculate'),
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('submits XLSX billing uploads to the backend', async () => {
    const user = userEvent.setup()
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          source_type: 'csv_import',
          row_count: 1,
          total_billed: 1200,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ job_id: 'job-1' }),
      } as Response)

    render(<ActualBilledUploadStep />)

    const input = document.querySelector(
      '#billing-file-upload'
    ) as HTMLInputElement
    const excelFile = new File(['xlsx bytes'], 'billed.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })

    fireEvent.change(input, { target: { files: [excelFile] } })

    await user.click(screen.getByRole('button', { name: /use this file/i }))

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/actual-billed/upload'),
      expect.objectContaining({
        method: 'POST',
      })
    )
    const uploadOptions = vi.mocked(global.fetch).mock.calls[0]?.[1]
    expect(uploadOptions).toBeDefined()
    expect(uploadOptions?.body).toBeInstanceOf(FormData)
  })
})
