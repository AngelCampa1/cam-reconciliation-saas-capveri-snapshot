/**
 * Tests for TenantDisputesPage component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import {
  QueryClient,
  QueryClientProvider,
  onlineManager,
} from '@tanstack/react-query'
import { TenantDisputesPage } from './TenantDisputesPage'
import { apiClient } from '@/api/client'

// Mock API client
vi.mock('@/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

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

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

type ApiClientGetResult = Awaited<ReturnType<typeof apiClient.get>>

function apiGetResult(
  data: unknown,
  error: unknown = null
): ApiClientGetResult {
  return { data, error } as unknown as ApiClientGetResult
}

const mockDisputes = [
  {
    id: '123e4567-e89b-12d3-a456-426614174000',
    created_at: '2024-12-15T10:00:00Z',
    statement_id: 'stmt-2024-001',
    status: 'OPEN' as const,
    category: 'calculation_error',
    description: 'Incorrect CAM charges for HVAC',
  },
  {
    id: '123e4567-e89b-12d3-a456-426614174001',
    created_at: '2024-11-20T15:30:00Z',
    statement_id: 'stmt-2024-002',
    status: 'UNDER_REVIEW' as const,
    category: 'base_year_issue',
    description: 'Missing base year adjustment',
  },
  {
    id: '123e4567-e89b-12d3-a456-426614174002',
    created_at: '2024-10-05T08:15:00Z',
    statement_id: 'stmt-2024-003',
    status: 'RESOLVED' as const,
    category: 'billing_question',
    description: 'Duplicate utility charges',
  },
  {
    id: '123e4567-e89b-12d3-a456-426614174003',
    created_at: '2024-09-12T12:45:00Z',
    statement_id: 'stmt-2024-004',
    status: 'REJECTED' as const,
    category: 'calculation_error',
    description: 'Pro-rata share calculation error',
  },
]

describe('TenantDisputesPage', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  afterEach(() => {
    // The onlineManager is a global singleton; restore it so a paused-state
    // test can't leak "offline" into unrelated suites.
    onlineManager.setOnline(true)
  })

  const renderPage = () => {
    return render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <TenantDisputesPage />
        </QueryClientProvider>
      </MemoryRouter>
    )
  }

  // Render States
  it('shows skeleton cards while loading', () => {
    vi.mocked(apiClient.get).mockImplementation(
      () => new Promise(() => {}) as unknown as ReturnType<typeof apiClient.get>
    )

    renderPage()

    expect(screen.queryByText(/loading disputes/i)).not.toBeInTheDocument()
    const skeletons = screen.getAllByTestId('skeleton-card')
    expect(skeletons.length).toBeGreaterThanOrEqual(3)
  })

  it('shows empty state when no disputes exist', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(apiGetResult([]))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/no disputes yet/i)).toBeInTheDocument()
    })

    // Both the header action and the empty-state CTA say "Go to Dashboard"
    expect(
      screen.getAllByRole('button', { name: /go to dashboard/i }).length
    ).toBeGreaterThan(0)

    // Verify help text is shown
    expect(
      screen.getByText(/to start one, open a statement/i)
    ).toBeInTheDocument()
  })

  it('renders disputes list with correct data', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(apiGetResult(mockDisputes))

    renderPage()

    await waitFor(() => {
      expect(
        screen.getByText(/incorrect cam charges for hvac/i)
      ).toBeInTheDocument()
    })

    expect(
      screen.getByText(/missing base year adjustment/i)
    ).toBeInTheDocument()
    expect(screen.getByText(/duplicate utility charges/i)).toBeInTheDocument()
    expect(
      screen.getByText(/pro-rata share calculation error/i)
    ).toBeInTheDocument()
  })

  it('does not leak the raw statement UUID onto the dispute card', async () => {
    // A raw DB id means nothing to a tenant and reads as leaked internal
    // plumbing on a customer-facing screen (matches the landlord-side fix).
    vi.mocked(apiClient.get).mockResolvedValue(apiGetResult(mockDisputes))

    renderPage()

    await waitFor(() => {
      expect(
        screen.getByText(/incorrect cam charges for hvac/i)
      ).toBeInTheDocument()
    })

    expect(screen.queryByText(/statement id/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/stmt-2024-001/)).not.toBeInTheDocument()
  })

  it('tracks tenant disputes viewed with safe status counts', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      apiGetResult([
        ...mockDisputes,
        {
          id: '123e4567-e89b-12d3-a456-426614174004',
          created_at: '2024-08-12T12:45:00Z',
          statement_id: 'stmt-2024-005',
          status: 'CLOSED' as const,
          category: 'missing_credit',
          description: 'Closed dispute description',
        },
      ])
    )

    renderPage()

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith('tenant_disputes_viewed', {
        status_filter: 'all',
        total_count: 5,
        total_count_bucket: '1-10',
        needs_response_count: 1,
        needs_response_count_bucket: '1-10',
        open_count: 1,
        under_review_count: 1,
        resolved_count: 1,
        rejected_count: 1,
        closed_count: 1,
      })
    })
  })

  // Status Badges
  it('displays correct badge variant for each status', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(apiGetResult(mockDisputes))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Open')).toBeInTheDocument()
    })

    expect(screen.getByText('Under Review')).toBeInTheDocument()
    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.getByText('Rejected')).toBeInTheDocument()
    expect(screen.getAllByText('Needs response')).toHaveLength(1)
  })

  // Navigation
  it('navigates to dispute detail when dispute is clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(apiGetResult(mockDisputes))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(
        screen.getByText(/incorrect cam charges for hvac/i)
      ).toBeInTheDocument()
    })

    const firstDispute = screen.getByText(/incorrect cam charges for hvac/i)
    await user.click(firstDispute)

    expect(mockNavigate).toHaveBeenCalledWith(
      '/tenant/disputes/123e4567-e89b-12d3-a456-426614174000'
    )
  })

  it('navigates to dashboard when "Go to Dashboard" button clicked', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(apiGetResult(mockDisputes))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/dispute history/i)).toBeInTheDocument()
    })

    // With disputes present, the only "Go to Dashboard" button is the header action
    const newDisputeButton = screen.getByRole('button', {
      name: /go to dashboard/i,
    })
    await user.click(newDisputeButton)

    // Header action redirects to dashboard to select a statement
    expect(mockNavigate).toHaveBeenCalledWith('/tenant/dashboard')
  })

  it('shows statement selection helper and at-a-glance counters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(apiGetResult(mockDisputes))

    renderPage()

    await waitFor(() => {
      expect(
        screen.getByText(/incorrect cam charges for hvac/i)
      ).toBeInTheDocument()
    })

    expect(
      screen.getByText(/start a dispute from a statement/i)
    ).toBeInTheDocument()
    expect(
      screen.getByText((_, node) => node?.textContent === '4 total')
    ).toBeInTheDocument()
    expect(
      screen.getByText((_, node) => node?.textContent === '1 need response')
    ).toBeInTheDocument()
  })

  // Data Formatting
  it('formats dispute creation dates correctly', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(apiGetResult(mockDisputes))

    renderPage()

    // Wait for disputes to load
    await waitFor(() => {
      expect(
        screen.getByText(/incorrect cam charges for hvac/i)
      ).toBeInTheDocument()
    })

    // Check that dates are formatted (not raw ISO strings)
    const dateElements = screen.getAllByText(/created:/i)
    expect(dateElements.length).toBeGreaterThan(0)

    // Verify date format (should be locale date string, not ISO)
    const firstDateText = dateElements[0].textContent || ''
    expect(firstDateText).not.toContain('T')
    expect(firstDateText).not.toContain('Z')
  })

  // F-223: keyboard a11y — Enter key navigates same as click
  it('navigates to dispute detail on Enter keydown (F-223)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(apiGetResult(mockDisputes))

    const user = userEvent.setup()
    renderPage()

    await waitFor(() => {
      expect(
        screen.getByText(/incorrect cam charges for hvac/i)
      ).toBeInTheDocument()
    })

    const disputeRow = screen
      .getByText(/incorrect cam charges for hvac/i)
      .closest('[role="button"]')
    expect(disputeRow).toBeInTheDocument()
    disputeRow!.focus()
    await user.keyboard('{Enter}')

    expect(mockNavigate).toHaveBeenCalledWith(
      '/tenant/disputes/123e4567-e89b-12d3-a456-426614174000'
    )
  })

  // F-224: human label instead of raw enum key
  it('renders human-readable category label not raw enum (F-224)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(apiGetResult(mockDisputes))

    renderPage()

    await waitFor(() => {
      // Two disputes have calculation_error category, so getAllByText is correct
      expect(screen.getAllByText('Calculation Error').length).toBeGreaterThan(0)
    })

    expect(screen.queryByText('calculation_error')).not.toBeInTheDocument()
  })

  // F-225: chip spans use rounded-full
  it('metric chip spans use rounded-full class (F-225)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(apiGetResult(mockDisputes))

    renderPage()

    await waitFor(() => {
      expect(
        screen.getByText((_, node) => node?.textContent === '4 total')
      ).toBeInTheDocument()
    })

    const totalChip = screen.getByText(
      (_, node) => node?.textContent === '4 total'
    )
    expect(totalChip).toHaveClass('rounded-full')
  })

  // Offline / paused fetch — React Query's default networkMode:'online'
  // PAUSES (does not error) a fetch that fails with no network, leaving
  // isLoading false and error null. Without an explicit isPaused branch the
  // page would fall through to "No disputes yet" and mislead the tenant into
  // thinking they have zero disputes when the server is simply unreachable.
  it('shows an offline notice (not an empty state) when the fetch is paused', async () => {
    onlineManager.setOnline(false)
    vi.mocked(apiClient.get).mockResolvedValue(apiGetResult([]))

    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    })

    expect(screen.queryByText(/no disputes yet/i)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
  })

  // Error Handling
  it('handles API error gracefully', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(
      apiGetResult(null, 'Server error')
    )

    renderPage()

    // React Query will show loading then handle error
    // Since the component doesn't show explicit error UI, it will remain in loading/empty state
    await waitFor(
      () => {
        expect(screen.queryAllByTestId('skeleton-card')).toHaveLength(0)
      },
      { timeout: 3000 }
    )
  })
})
