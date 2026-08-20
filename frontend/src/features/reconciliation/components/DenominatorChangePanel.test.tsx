/**
 * Tests for DenominatorChangePanel component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

import { DenominatorChangePanel } from './DenominatorChangePanel'

// Mock the API hooks
const mockMutate = vi.fn()
const mockExportMutate = vi.fn()

let mockReportData: ReturnType<typeof makeReport> | undefined
let mockIsPending = false
let mockIsError = false
let mockError: { statusCode: number; message: string } | undefined
const mockToastError = vi.fn()

function makeReport(overrides?: {
  changes?: number
  impacts?: number
  rsf_delta?: number
}) {
  return {
    property_id: 'prop-1',
    property_name: 'Oakwood Plaza',
    prior_period: '2023-01-01 to 2023-12-31',
    current_period: '2024-01-01 to 2024-12-31',
    prior_total_rsf: 100000,
    current_total_rsf: 105000,
    rsf_delta: overrides?.rsf_delta ?? 5000,
    rsf_delta_percent: 5.0,
    changes: Array.from({ length: overrides?.changes ?? 1 }, (_, i) => ({
      change_type: 'rsf_remeasurement',
      description: `Building re-measured (change ${i + 1})`,
      prior_value: '100,000 RSF',
      current_value: '105,000 RSF',
      impact_description: '5% increase',
    })),
    tenant_impacts: Array.from({ length: overrides?.impacts ?? 0 }, (_, i) => ({
      lease_id: `lease-${i}`,
      tenant_name: `Tenant ${String.fromCharCode(65 + i)}`,
      prior_pro_rata_share: 0.1,
      current_pro_rata_share: 0.12,
      share_delta_pct_points: 2.0,
      prior_estimated_recovery: 50000,
      current_estimated_recovery: 60000,
      recovery_delta: 10000,
      contributing_changes: ['rsf_remeasurement'],
    })),
    summary: 'Total rentable SF increased by 5,000 SF (5.00%).',
    generated_at: '2024-01-15T12:00:00Z',
    comparison_available: true,
    missing_period: null as 'current' | 'prior' | null,
  }
}

// An otherwise-empty report the backend returns (HTTP 200) when there is no
// finalized snapshot to compare against. comparison_available is false.
function makeUnavailableReport(missing_period: 'current' | 'prior') {
  return {
    ...makeReport({ changes: 0 }),
    prior_total_rsf: 0,
    current_total_rsf: 0,
    rsf_delta: 0,
    rsf_delta_percent: 0,
    changes: [],
    tenant_impacts: [],
    comparison_available: false,
    missing_period,
  }
}

vi.mock('@/api/hooks', () => ({
  useDenominatorChangeReport: (opts?: {
    onError?: (err: { statusCode: number; message: string }) => void
  }) => ({
    mutate: (...args: unknown[]) => {
      mockMutate(...args)
      if (mockError) opts?.onError?.(mockError)
    },
    data: mockReportData,
    isPending: mockIsPending,
    isError: mockIsError,
    error: mockError,
  }),
  useExportDenominatorChangePdf: (opts?: {
    onSuccess?: () => void
    onError?: () => void
  }) => ({
    mutate: (...args: unknown[]) => {
      mockExportMutate(...args)
    },
    isPending: false,
    isError: false,
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}))

function renderPanel(
  props?: Partial<React.ComponentProps<typeof DenominatorChangePanel>>
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <DenominatorChangePanel propertyId="prop-1" year={2024} {...props} />
    </QueryClientProvider>
  )
}

describe('DenominatorChangePanel', () => {
  beforeEach(() => {
    mockReportData = undefined
    mockIsPending = false
    mockIsError = false
    mockError = undefined
    mockMutate.mockClear()
    mockExportMutate.mockClear()
    mockToastError.mockClear()
  })

  it('renders toggle button', () => {
    renderPanel()
    expect(screen.getByTestId('denominator-change-toggle')).toBeInTheDocument()
    expect(screen.getByText('Denominator Changes')).toBeInTheDocument()
  })

  it('exposes the toggle as a disclosure with aria-expanded state', () => {
    renderPanel()
    const toggle = screen.getByTestId('denominator-change-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'denominator-change-panel')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByTestId('denominator-change-panel')).toHaveAttribute(
      'id',
      'denominator-change-panel'
    )
  })

  it('expands panel on click and calls API', () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('denominator-change-toggle'))

    expect(screen.getByTestId('denominator-change-panel')).toBeInTheDocument()
    expect(mockMutate).toHaveBeenCalledWith({
      property_id: 'prop-1',
      current_period_start: '2024-01-01',
      current_period_end: '2024-12-31',
      prior_period_start: '2023-01-01',
      prior_period_end: '2023-12-31',
    })
  })

  it('shows summary stats when report loads', () => {
    mockReportData = makeReport({ changes: 1, impacts: 2 })
    renderPanel()
    fireEvent.click(screen.getByTestId('denominator-change-toggle'))

    expect(screen.getByText('+5,000 SF')).toBeInTheDocument()
    expect(screen.getByText('+5.00%')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument() // changes count
    expect(screen.getByText('2')).toBeInTheDocument() // tenants impacted
  })

  it('renders changes list with badges', () => {
    mockReportData = makeReport({ changes: 1 })
    renderPanel()
    fireEvent.click(screen.getByTestId('denominator-change-toggle'))

    expect(screen.getByTestId('change-item-0')).toBeInTheDocument()
    expect(screen.getByText('RSF Re-measurement')).toBeInTheDocument()
    expect(
      screen.getByText('Building re-measured (change 1)')
    ).toBeInTheDocument()
  })

  it('renders per-tenant impact table', () => {
    mockReportData = makeReport({ changes: 1, impacts: 2 })
    renderPanel()
    fireEvent.click(screen.getByTestId('denominator-change-toggle'))

    expect(screen.getByTestId('tenant-impact-table')).toBeInTheDocument()
    expect(screen.getByText('Tenant A')).toBeInTheDocument()
    expect(screen.getByText('Tenant B')).toBeInTheDocument()
  })

  it('shows empty state when no changes detected', () => {
    mockReportData = makeReport({ changes: 0 })
    renderPanel()
    fireEvent.click(screen.getByTestId('denominator-change-toggle'))

    expect(screen.getByTestId('no-changes-message')).toBeInTheDocument()
    expect(
      screen.getByText('No denominator changes detected between periods.')
    ).toBeInTheDocument()
  })

  it('shows export PDF button when report loaded', () => {
    mockReportData = makeReport()
    renderPanel()
    fireEvent.click(screen.getByTestId('denominator-change-toggle'))

    const exportBtn = screen.getByTestId('export-denominator-pdf-button')
    expect(exportBtn).toBeInTheDocument()

    fireEvent.click(exportBtn)
    expect(mockExportMutate).toHaveBeenCalled()
  })

  it('shows loading state', () => {
    mockIsPending = true
    renderPanel()
    fireEvent.click(screen.getByTestId('denominator-change-toggle'))

    expect(screen.getByTestId('denominator-change-loading')).toBeInTheDocument()
  })

  it('shows error state for a real fetch failure', () => {
    mockIsError = true
    mockError = { statusCode: 500, message: 'Internal server error' }
    renderPanel()
    fireEvent.click(screen.getByTestId('denominator-change-toggle'))

    expect(screen.getByTestId('denominator-change-error')).toBeInTheDocument()
    expect(
      screen.queryByTestId('denominator-change-empty')
    ).not.toBeInTheDocument()
    // A genuine failure should still surface a toast.
    expect(mockToastError).toHaveBeenCalledWith(
      'Failed to load denominator change report'
    )
  })

  it('shows prior-year guidance when the prior snapshot is missing (F-039/F-293)', () => {
    // Backend returns HTTP 200 with comparison_available=false, not a 4xx.
    mockReportData = makeUnavailableReport('prior')
    renderPanel()
    fireEvent.click(screen.getByTestId('denominator-change-toggle'))

    // Missing prior-year data is guidance, not an error.
    expect(screen.getByTestId('denominator-change-empty')).toBeInTheDocument()
    expect(screen.getByText('No 2023 snapshot to compare')).toBeInTheDocument()
    expect(
      screen.queryByTestId('denominator-change-error')
    ).not.toBeInTheDocument()
    // The report content / export button must NOT render for the empty case.
    expect(
      screen.queryByTestId('denominator-change-content')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('export-denominator-pdf-button')
    ).not.toBeInTheDocument()
    // Must NOT raise an error toast for the missing-data case.
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it('points the user at the current year when the current snapshot is missing (F-219/F-293)', () => {
    mockReportData = makeUnavailableReport('current')
    renderPanel()
    fireEvent.click(screen.getByTestId('denominator-change-toggle'))

    // The current-period case must guide the user to finalize THIS year,
    // not the prior year.
    expect(screen.getByTestId('denominator-change-empty')).toBeInTheDocument()
    expect(
      screen.getByText('No 2024 snapshot to compare yet')
    ).toBeInTheDocument()
    expect(
      screen.queryByText('No 2023 snapshot to compare')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('denominator-change-error')
    ).not.toBeInTheDocument()
    expect(mockToastError).not.toHaveBeenCalled()
  })
})
