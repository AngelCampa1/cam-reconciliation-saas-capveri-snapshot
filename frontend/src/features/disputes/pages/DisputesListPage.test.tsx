/**
 * DisputesListPage Tests
 *
 * Tests for the landlord dispute list page.
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DisputesListPage } from './DisputesListPage'
import * as hooks from '@/api/hooks'
import type { DisputeSummaryDTO } from '@/api/hooks'

// Mock the useNavigate hook
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/lib/analytics', () => ({
  getCountBucket: (value: number | string | null | undefined) => {
    const numericValue =
      typeof value === 'string' ? Number.parseInt(value, 10) : value
    if (numericValue === 0) return '0'
    if (typeof numericValue === 'number' && numericValue <= 10) return '1-10'
    return 'unknown'
  },
  trackEvent: vi.fn(),
}))

import { trackEvent } from '@/lib/analytics'

const mockDisputes: DisputeSummaryDTO[] = [
  {
    id: 'dispute-1',
    category: 'calculation_error',
    status: 'open',
    description: 'Charges seem incorrect',
    created_at: '2024-01-15T10:00:00Z',
    statement_id: 'stmt-1',
  },
  {
    id: 'dispute-2',
    category: 'missing_credit',
    status: 'under_review',
    description: 'Missing payment credit',
    created_at: '2024-01-10T10:00:00Z',
    statement_id: 'stmt-2',
  },
  {
    id: 'dispute-3',
    category: 'billing_question',
    status: 'resolved',
    description: 'Question about bill',
    created_at: '2024-01-05T10:00:00Z',
    statement_id: 'stmt-3',
  },
]

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('DisputesListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows skeleton cards while loading instead of spinner', () => {
    vi.spyOn(hooks, 'useDisputes').mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as ReturnType<typeof hooks.useDisputes>)

    renderWithProviders(<DisputesListPage />)

    expect(screen.queryByText(/loading disputes/i)).not.toBeInTheDocument()
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument()
    const skeletons = screen.getAllByTestId('skeleton-card')
    expect(skeletons.length).toBeGreaterThanOrEqual(3)
  })

  it('renders dispute list when data is loaded', async () => {
    vi.spyOn(hooks, 'useDisputes').mockReturnValue({
      data: mockDisputes,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDisputes>)

    renderWithProviders(<DisputesListPage />)

    expect(screen.getByText('Charges seem incorrect')).toBeInTheDocument()
    expect(screen.getByText('Missing payment credit')).toBeInTheDocument()
    expect(screen.getByText('Question about bill')).toBeInTheDocument()
    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith('landlord_disputes_viewed', {
        status_filter: 'all',
        total_count: 3,
        total_count_bucket: '1-10',
        page_size: 3,
        page_size_bucket: '1-10',
        needs_response_count: 1,
        needs_response_count_bucket: '1-10',
        open_count: 1,
        under_review_count: 1,
        resolved_count: 1,
        rejected_count: 0,
        closed_count: 0,
      })
    })
  })

  it('renders empty state when no disputes', () => {
    vi.spyOn(hooks, 'useDisputes').mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDisputes>)

    renderWithProviders(<DisputesListPage />)

    expect(screen.getByText(/no disputes yet/i)).toBeInTheDocument()
    expect(
      screen.getByText(/when a tenant questions a charge/i)
    ).toBeInTheDocument()
  })

  it('navigates to dispute detail on click', async () => {
    const user = userEvent.setup()
    vi.spyOn(hooks, 'useDisputes').mockReturnValue({
      data: mockDisputes,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDisputes>)

    renderWithProviders(<DisputesListPage />)

    const disputeCard = screen
      .getByText('Charges seem incorrect')
      .closest('div[role="button"]')
    expect(disputeCard).toBeInTheDocument()
    await user.click(disputeCard!)

    expect(mockNavigate).toHaveBeenCalledWith('/disputes/dispute-1')
  })

  it('displays status badges with correct styling', () => {
    vi.spyOn(hooks, 'useDisputes').mockReturnValue({
      data: mockDisputes,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDisputes>)

    renderWithProviders(<DisputesListPage />)

    // Check that status badges are rendered
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Under Review')).toBeInTheDocument()
    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.getByText('Needs response')).toBeInTheDocument()
  })

  it('shows list counters and full statement IDs for scanning', () => {
    vi.spyOn(hooks, 'useDisputes').mockReturnValue({
      data: mockDisputes,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDisputes>)

    renderWithProviders(<DisputesListPage />)

    expect(screen.getByText('3 total')).toBeInTheDocument()
    expect(screen.getByText(/1 needs response/i)).toBeInTheDocument()
    // Raw statement UUID must not be shown on dispute cards (F-183)
    expect(screen.queryByText(/Statement:/i)).not.toBeInTheDocument()
  })

  it('uses singular "needs response" when exactly 1 dispute needs response (F-194)', () => {
    // mockDisputes has 1 needs-response dispute (dispute-1: status 'open')
    vi.spyOn(hooks, 'useDisputes').mockReturnValue({
      data: mockDisputes,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDisputes>)

    renderWithProviders(<DisputesListPage />)

    expect(screen.getByText(/1 needs response/i)).toBeInTheDocument()
    expect(screen.queryByText(/1 need response/i)).not.toBeInTheDocument()
  })

  it('uses plural "need response" when 0 disputes need response (F-194)', () => {
    vi.spyOn(hooks, 'useDisputes').mockReturnValue({
      data: [
        {
          id: 'dispute-x',
          category: 'billing_question',
          status: 'resolved',
          description: 'All resolved',
          created_at: '2024-01-01T00:00:00Z',
          statement_id: 'stmt-x',
        },
      ],
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDisputes>)

    renderWithProviders(<DisputesListPage />)

    expect(screen.getByText(/0 need response/i)).toBeInTheDocument()
  })

  it('uses plural "need response" when 2+ disputes need response (F-194)', () => {
    vi.spyOn(hooks, 'useDisputes').mockReturnValue({
      data: [
        {
          id: 'dispute-a',
          category: 'calculation_error',
          status: 'open',
          description: 'First open',
          created_at: '2024-01-01T00:00:00Z',
          statement_id: 'stmt-a',
        },
        {
          id: 'dispute-b',
          category: 'missing_credit',
          status: 'open',
          description: 'Second open',
          created_at: '2024-01-02T00:00:00Z',
          statement_id: 'stmt-b',
        },
      ],
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDisputes>)

    renderWithProviders(<DisputesListPage />)

    expect(screen.getByText(/2 need response/i)).toBeInTheDocument()
  })

  it('shows an offline notice (not the empty state) when the disputes fetch is paused', () => {
    vi.spyOn(hooks, 'useDisputes').mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isPaused: true,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof hooks.useDisputes>)

    renderWithProviders(<DisputesListPage />)

    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(screen.queryByTestId('disputes-empty')).toBeNull()
  })

  it('filters disputes by status', async () => {
    const user = userEvent.setup()
    const useDisputesMock = vi.spyOn(hooks, 'useDisputes').mockReturnValue({
      data: mockDisputes,
      isLoading: false,
      error: null,
    } as ReturnType<typeof hooks.useDisputes>)

    renderWithProviders(<DisputesListPage />)

    // Click on status filter
    const filterSelect = screen.getByRole('combobox', {
      name: /filter by status/i,
    })
    await user.click(filterSelect)

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /open/i })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('option', { name: /open/i }))

    // Verify hook was called with filter (check that the first argument contains the status)
    await waitFor(() => {
      const lastCall =
        useDisputesMock.mock.calls[useDisputesMock.mock.calls.length - 1]
      expect(lastCall[0]).toEqual(expect.objectContaining({ status: 'open' }))
    })
  })
})
