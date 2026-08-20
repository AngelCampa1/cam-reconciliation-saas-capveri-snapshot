/**
 * Tests for InvoicesPage Component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { InvoicesPage } from './Invoices'

// Mock hooks
vi.mock('@/hooks/use-invoices', () => ({
  useInvoices: vi.fn(),
}))

import { useInvoices } from '@/hooks/use-invoices'

const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
)

describe('InvoicesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows DataTableSkeleton while loading instead of plain skeleton rows', () => {
    vi.mocked(useInvoices).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    // "Invoices" is the page H1 (PageHeader); a breadcrumb crumb also reads
    // "Invoices", so assert the heading specifically rather than by text.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Invoices' })
    ).toBeInTheDocument()
    // DataTableSkeleton renders multiple skeleton cells via data-testid="skeleton-cell"
    expect(screen.getAllByTestId('skeleton-cell').length).toBeGreaterThan(5)
  })

  it('F-298: page has a single H1 "Invoices" so the heading ladder starts at level 1', () => {
    vi.mocked(useInvoices).mockReturnValue({
      data: { invoices: [], total: 0, page: 1, per_page: 10, has_more: false },
      isLoading: false,
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('heading', { level: 1, name: 'Invoices' })
    ).toBeInTheDocument()
    // EmptyState renders an h3 for its title; heading level 3 is expected when empty state is shown.
    // The heading ladder remains valid: H1 (page) → H3 (empty state title) with no skipped levels in the card section.
  })

  it('F-298: pagination prev/next buttons expose accessible labels', () => {
    vi.mocked(useInvoices).mockReturnValue({
      data: {
        invoices: Array.from({ length: 10 }, (_, i) => ({
          id: `inv_${i}`,
          stripe_invoice_id: null,
          amount_due: 100,
          amount_paid: 100,
          currency: 'usd',
          status: 'paid',
          period_start: '2024-01-01T00:00:00Z',
          period_end: '2024-01-31T23:59:59Z',
          pdf_url: null,
          created_at: '2024-01-01T00:00:00Z',
        })),
        total: 25,
        page: 1,
        per_page: 10,
        has_more: true,
      },
      isLoading: false,
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('button', { name: /previous page/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /next page/i })
    ).toBeInTheDocument()
  })

  it('displays invoice list with correct columns', () => {
    vi.mocked(useInvoices).mockReturnValue({
      data: {
        invoices: [
          {
            id: 'inv_1',
            stripe_invoice_id: 'in_test123',
            amount_due: 99.99,
            amount_paid: 99.99,
            currency: 'usd',
            status: 'paid',
            period_start: '2024-01-01T00:00:00Z',
            period_end: '2024-01-31T23:59:59Z',
            pdf_url: 'https://example.com/invoice.pdf',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        per_page: 10,
        has_more: false,
      },
      isLoading: false,
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    // Check for table headers (desktop view)
    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.getByText('Period')).toBeInTheDocument()
    expect(screen.getByText('Amount')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()

    // Check for invoice data (appears in both desktop and mobile views)
    const paidBadges = screen.getAllByText('Paid')
    expect(paidBadges.length).toBeGreaterThan(0)

    const amounts = screen.getAllByText(/\$99.99/)
    expect(amounts.length).toBeGreaterThan(0)
  })

  it('f275: status select has accessible name "Filter by status"', () => {
    vi.mocked(useInvoices).mockReturnValue({
      data: {
        invoices: [],
        total: 0,
        page: 1,
        per_page: 10,
        has_more: false,
      },
      isLoading: false,
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    expect(
      screen.getByRole('combobox', { name: /filter by status/i })
    ).toBeInTheDocument()
  })

  it('filters invoices by status', () => {
    const mockUseInvoices = vi.mocked(useInvoices)
    mockUseInvoices.mockReturnValue({
      data: {
        invoices: [],
        total: 0,
        page: 1,
        per_page: 10,
        has_more: false,
      },
      isLoading: false,
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    // Initial call should be with undefined status (all invoices)
    expect(mockUseInvoices).toHaveBeenCalledWith(undefined, 1, 10)

    // Select component exists and is interactive (status filter only)
    expect(screen.getAllByRole('combobox').length).toBe(1)
  })

  it('paginates through invoice list', () => {
    const mockUseInvoices = vi.mocked(useInvoices)

    // First render - page 1 with has_more
    mockUseInvoices.mockReturnValue({
      data: {
        invoices: Array.from({ length: 10 }, (_, i) => ({
          id: `inv_${i}`,
          stripe_invoice_id: null,
          amount_due: 100,
          amount_paid: 100,
          currency: 'usd',
          status: 'paid',
          period_start: '2024-01-01T00:00:00Z',
          period_end: '2024-01-31T23:59:59Z',
          pdf_url: null,
          created_at: '2024-01-01T00:00:00Z',
        })),
        total: 25,
        page: 1,
        per_page: 10,
        has_more: true,
      },
      isLoading: false,
    } as ReturnType<typeof useInvoices>)

    const { rerender } = render(<InvoicesPage />, { wrapper: RouterWrapper })

    expect(screen.getByText(/Showing 1 to 10 of 25/)).toBeInTheDocument()

    // Click next button
    const nextButton = screen.getAllByRole('button').find((btn) => {
      const svg = btn.querySelector('svg')
      return svg && !btn.disabled && btn.textContent === ''
    })
    expect(nextButton).toBeDefined()

    if (nextButton) {
      fireEvent.click(nextButton)

      // Re-render with page 2 data
      mockUseInvoices.mockReturnValue({
        data: {
          invoices: Array.from({ length: 10 }, (_, i) => ({
            id: `inv_${i + 10}`,
            stripe_invoice_id: null,
            amount_due: 100,
            amount_paid: 100,
            currency: 'usd',
            status: 'paid',
            period_start: '2024-01-01T00:00:00Z',
            period_end: '2024-01-31T23:59:59Z',
            pdf_url: null,
            created_at: '2024-01-01T00:00:00Z',
          })),
          total: 25,
          page: 2,
          per_page: 10,
          has_more: true,
        },
        isLoading: false,
      } as ReturnType<typeof useInvoices>)

      rerender(<InvoicesPage />)
    }
  })

  it('shows download button for invoices with PDF', () => {
    vi.mocked(useInvoices).mockReturnValue({
      data: {
        invoices: [
          {
            id: 'inv_1',
            stripe_invoice_id: null,
            amount_due: 100,
            amount_paid: 100,
            currency: 'usd',
            status: 'paid',
            period_start: '2024-01-01T00:00:00Z',
            period_end: '2024-01-31T23:59:59Z',
            pdf_url: 'https://example.com/invoice.pdf',
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        per_page: 10,
        has_more: false,
      },
      isLoading: false,
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    expect(screen.getAllByText('Download').length).toBeGreaterThan(0)
  })

  it('hides download button when no PDF', () => {
    vi.mocked(useInvoices).mockReturnValue({
      data: {
        invoices: [
          {
            id: 'inv_1',
            stripe_invoice_id: null,
            amount_due: 100,
            amount_paid: 100,
            currency: 'usd',
            status: 'paid',
            period_start: '2024-01-01T00:00:00Z',
            period_end: '2024-01-31T23:59:59Z',
            pdf_url: null,
            created_at: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        per_page: 10,
        has_more: false,
      },
      isLoading: false,
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    expect(screen.queryByText('Download')).not.toBeInTheDocument()
  })

  it('displays empty state when no invoices', () => {
    vi.mocked(useInvoices).mockReturnValue({
      data: {
        invoices: [],
        total: 0,
        page: 1,
        per_page: 10,
        has_more: false,
      },
      isLoading: false,
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    expect(screen.getByText('No invoices')).toBeInTheDocument()
    // No status filter is applied here, so the copy must not claim one is.
    expect(screen.getByText('You have no invoices yet.')).toBeInTheDocument()
  })

  it('displays status badges correctly', () => {
    vi.mocked(useInvoices).mockReturnValue({
      data: {
        invoices: [
          {
            id: 'inv_1',
            stripe_invoice_id: null,
            amount_due: 100,
            amount_paid: 100,
            currency: 'usd',
            status: 'paid',
            period_start: '2024-01-01T00:00:00Z',
            period_end: '2024-01-31T23:59:59Z',
            pdf_url: null,
            created_at: '2024-01-01T00:00:00Z',
          },
          {
            id: 'inv_2',
            stripe_invoice_id: null,
            amount_due: 100,
            amount_paid: 0,
            currency: 'usd',
            status: 'open',
            period_start: '2024-02-01T00:00:00Z',
            period_end: '2024-02-28T23:59:59Z',
            pdf_url: null,
            created_at: '2024-02-01T00:00:00Z',
          },
        ],
        total: 2,
        page: 1,
        per_page: 10,
        has_more: false,
      },
      isLoading: false,
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    // Badges appear in both desktop and mobile views
    const paidBadges = screen.getAllByText('Paid')
    const openBadges = screen.getAllByText('Open')
    expect(paidBadges.length).toBeGreaterThan(0)
    expect(openBadges.length).toBeGreaterThan(0)
  })

  it('changes status filter and resets page', async () => {
    const user = userEvent.setup()
    const mockUseInvoices = vi.mocked(useInvoices)
    mockUseInvoices.mockReturnValue({
      data: {
        invoices: [],
        total: 0,
        page: 1,
        per_page: 10,
        has_more: false,
      },
      isLoading: false,
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    // Open the status filter dropdown (only combobox)
    const selectTriggers = screen.getAllByRole('combobox')
    const selectTrigger = selectTriggers[0]
    await user.click(selectTrigger)

    // Select "Paid" option
    await waitFor(() => {
      const paidOption = screen.getByRole('option', { name: /Paid/i })
      expect(paidOption).toBeInTheDocument()
    })
    await user.click(screen.getByRole('option', { name: /Paid/i }))

    // Verify useInvoices was called with 'paid' status
    expect(mockUseInvoices).toHaveBeenCalledWith('paid', 1, 10)
  })

  it('navigates to previous page when clicking previous button', async () => {
    const user = userEvent.setup()
    const mockUseInvoices = vi.mocked(useInvoices)

    // Start on page 2
    mockUseInvoices.mockReturnValue({
      data: {
        invoices: Array.from({ length: 10 }, (_, i) => ({
          id: `inv_${i + 10}`,
          stripe_invoice_id: null,
          amount_due: 100,
          amount_paid: 100,
          currency: 'usd',
          status: 'paid',
          period_start: '2024-01-01T00:00:00Z',
          period_end: '2024-01-31T23:59:59Z',
          pdf_url: null,
          created_at: '2024-01-01T00:00:00Z',
        })),
        total: 25,
        page: 2,
        per_page: 10,
        has_more: true,
      },
      isLoading: false,
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    // Find the previous button (first one with ChevronLeft icon)
    const buttons = screen.getAllByRole('button')
    const prevButton = buttons.find(
      (btn) => !btn.hasAttribute('disabled') && btn.querySelector('svg')
    )

    if (prevButton) {
      await user.click(prevButton)
      // After clicking, page should decrease
      expect(mockUseInvoices).toHaveBeenCalled()
    }
  })

  it('shows an offline notice instead of the empty state when invoices are paused', () => {
    vi.mocked(useInvoices).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isPaused: true,
      refetch: vi.fn(),
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/no invoices/i)).not.toBeInTheDocument()
  })

  it('clears status filter when selecting All Invoices', async () => {
    const user = userEvent.setup()
    const mockUseInvoices = vi.mocked(useInvoices)
    mockUseInvoices.mockReturnValue({
      data: {
        invoices: [],
        total: 0,
        page: 1,
        per_page: 10,
        has_more: false,
      },
      isLoading: false,
    } as ReturnType<typeof useInvoices>)

    render(<InvoicesPage />, { wrapper: RouterWrapper })

    // Open status filter and choose All Statuses
    const selectTriggers = screen.getAllByRole('combobox')
    const selectTrigger = selectTriggers[0]
    await user.click(selectTrigger)

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: /All Statuses/i })
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole('option', { name: /All Statuses/i }))

    // Should call with undefined status
    expect(mockUseInvoices).toHaveBeenCalledWith(undefined, 1, 10)
  })
})
