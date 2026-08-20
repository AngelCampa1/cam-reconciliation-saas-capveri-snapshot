/**
 * Tests for InvoiceSummary Component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InvoiceSummary } from './InvoiceSummary'

// Mock hooks
vi.mock('@/hooks/use-invoices', () => ({
  useInvoiceSummary: vi.fn(),
}))

import { useInvoiceSummary } from '@/hooks/use-invoices'

describe('InvoiceSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('displays total paid and invoice counts', () => {
    vi.mocked(useInvoiceSummary).mockReturnValue({
      data: {
        total_invoices: 10,
        paid_invoices: 8,
        open_invoices: 2,
        total_paid: 1234.56,
        currency: 'usd',
      },
      isLoading: false,
    } as ReturnType<typeof useInvoiceSummary>)

    render(<InvoiceSummary />)

    expect(screen.getByText('Total Paid')).toBeInTheDocument()
    expect(screen.getByText(/\$1,234.56/)).toBeInTheDocument()
    expect(screen.getByText('Invoices')).toBeInTheDocument()
    expect(screen.getByText('8 paid / 10 total')).toBeInTheDocument()
  })

  it('renders skeleton cards while loading', () => {
    vi.mocked(useInvoiceSummary).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useInvoiceSummary>)

    render(<InvoiceSummary />)

    const skeletons = screen.getAllByTestId('skeleton-card')
    expect(skeletons).toHaveLength(2)
  })

  it('renders skeleton cards when no data available', () => {
    vi.mocked(useInvoiceSummary).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useInvoiceSummary>)

    render(<InvoiceSummary />)

    const skeletons = screen.getAllByTestId('skeleton-card')
    expect(skeletons).toHaveLength(2)
  })

  it('shows a retryable error (not a stuck skeleton) when the summary fails to load', async () => {
    const refetch = vi.fn()
    vi.mocked(useInvoiceSummary).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof useInvoiceSummary>)

    render(<InvoiceSummary />)

    expect(
      screen.getByText(/couldn't load your invoice summary/i)
    ).toBeInTheDocument()
    expect(screen.queryAllByTestId('skeleton-card')).toHaveLength(0)

    await userEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('formats different currencies correctly', () => {
    vi.mocked(useInvoiceSummary).mockReturnValue({
      data: {
        total_invoices: 5,
        paid_invoices: 5,
        open_invoices: 0,
        total_paid: 999.99,
        currency: 'eur',
      },
      isLoading: false,
    } as ReturnType<typeof useInvoiceSummary>)

    render(<InvoiceSummary />)

    expect(screen.getByText(/€999.99/)).toBeInTheDocument()
  })
})
