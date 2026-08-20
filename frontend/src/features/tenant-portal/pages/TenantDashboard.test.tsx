/**
 * Tests for TenantDashboard component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { TenantDashboard } from './TenantDashboard'

// Mock the SDK
vi.mock('@/api/generated/sdk.gen', () => ({
  getTenantDashboardApiV1TenantDashboardGet: vi.fn(),
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

import { getTenantDashboardApiV1TenantDashboardGet } from '@/api/generated/sdk.gen'
import { trackEvent } from '@/lib/analytics'

const mockGetDashboard = vi.mocked(getTenantDashboardApiV1TenantDashboardGet)
type DashboardApiResult = Awaited<
  ReturnType<typeof getTenantDashboardApiV1TenantDashboardGet>
>

function dashboardResult(
  data: unknown,
  error: unknown = null
): DashboardApiResult {
  return { data, error } as unknown as DashboardApiResult
}

const mockDashboardData = {
  leases: [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      property: {
        id: '123e4567-e89b-12d3-a456-426614174001',
        name: 'Westfield Mall',
        address: '123 Main St, San Francisco, CA 94102',
      },
      unit: {
        id: '123e4567-e89b-12d3-a456-426614174002',
        unit_number: 'Suite 205',
        rentable_sqft: '2500.00',
      },
      start_date: '2023-01-01',
      end_date: '2025-12-31',
      pro_rata_share: '0.05',
      base_year: 2023,
    },
  ],
  statements: [
    {
      id: '123e4567-e89b-12d3-a456-426614174003',
      property_name: 'Westfield Mall',
      period_start: '2024-01-01',
      period_end: '2024-12-31',
      tenant_share: '12500.00',
      status: 'pending' as const,
      pdf_url: '/api/v1/statements/example.pdf',
      created_at: '2024-12-15',
    },
  ],
  unread_notifications: 3,
}

describe('TenantDashboard', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    })
    vi.clearAllMocks()
  })

  // Helper function to create test wrapper with Router and QueryClient
  const createWrapper = () => {
    const TestWrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
    return TestWrapper
  }

  it('shows skeleton sections while loading', () => {
    mockGetDashboard.mockImplementation(() => new Promise(() => {}))

    render(<TenantDashboard />, { wrapper: createWrapper() })

    // Should show structured skeletons, NOT a full-screen spinner
    expect(document.querySelector('.animate-spin')).not.toBeInTheDocument()
    const skeletons = screen.getAllByTestId('skeleton-card')
    expect(skeletons.length).toBeGreaterThanOrEqual(3)
  })

  it('renders dashboard with leases and statements', async () => {
    mockGetDashboard.mockResolvedValueOnce(dashboardResult(mockDashboardData))

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/tenant dashboard/i)).toBeInTheDocument()
    })

    const westfieldElements = screen.getAllByText(/westfield mall/i)
    expect(westfieldElements.length).toBeGreaterThan(0)
    expect(screen.getByText(/suite 205/i)).toBeInTheDocument()
  })

  it('tracks tenant dashboard viewed with safe aggregate counts', async () => {
    const dataWithStatusCounts = {
      ...mockDashboardData,
      leases: [
        mockDashboardData.leases[0],
        {
          ...mockDashboardData.leases[0],
          id: '123e4567-e89b-12d3-a456-426614174010',
        },
      ],
      statements: [
        {
          ...mockDashboardData.statements[0],
          id: 'statement-pending',
          status: 'pending' as const,
        },
        {
          ...mockDashboardData.statements[0],
          id: 'statement-paid',
          status: 'paid' as const,
        },
        {
          ...mockDashboardData.statements[0],
          id: 'statement-disputed',
          status: 'disputed' as const,
        },
        {
          ...mockDashboardData.statements[0],
          id: 'statement-overdue',
          status: 'overdue' as const,
        },
      ],
      unread_notifications: 3,
    }

    mockGetDashboard.mockResolvedValueOnce(
      dashboardResult(dataWithStatusCounts)
    )

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(trackEvent).toHaveBeenCalledWith('tenant_dashboard_viewed', {
        lease_count: 2,
        lease_count_bucket: '1-10',
        statement_count: 4,
        statement_count_bucket: '1-10',
        unread_notification_count: 3,
        unread_notification_count_bucket: '1-10',
        pending_statement_count: 1,
        paid_statement_count: 1,
        disputed_statement_count: 1,
        overdue_statement_count: 1,
      })
    })
  })

  it('displays notification badge when unread notifications exist', async () => {
    mockGetDashboard.mockResolvedValueOnce(dashboardResult(mockDashboardData))

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  it('displays statement with status badge', async () => {
    mockGetDashboard.mockResolvedValueOnce(dashboardResult(mockDashboardData))

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument()
    })

    expect(screen.getByText('$12,500.00')).toBeInTheDocument()
    // The statement period renders as humanized calendar dates, not the raw
    // ISO strings, and without a timezone off-by-one.
    expect(screen.getByText(/Jan 1, 2024 – Dec 31, 2024/)).toBeInTheDocument()
    expect(
      screen.queryByText(/2024-01-01 - 2024-12-31/)
    ).not.toBeInTheDocument()
  })

  it('shows empty state when no statements available', async () => {
    const dataWithNoStatements = {
      ...mockDashboardData,
      statements: [],
    }

    mockGetDashboard.mockResolvedValueOnce(
      dashboardResult(dataWithNoStatements)
    )

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/no statements yet/i)).toBeInTheDocument()
    })
  })

  it('shows error message on fetch failure', async () => {
    mockGetDashboard.mockResolvedValueOnce(
      dashboardResult(null, 'Server error')
    )

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByText(/dashboard data is unavailable right now\./i)
      ).toBeInTheDocument()
    })
  })

  it('displays lease details with correct pro-rata percentage', async () => {
    mockGetDashboard.mockResolvedValueOnce(dashboardResult(mockDashboardData))

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('5.00%')).toBeInTheDocument()
    })
  })

  it('renders when no leases exist (empty leases)', async () => {
    const dataWithNoLeases = {
      ...mockDashboardData,
      leases: [],
    }

    mockGetDashboard.mockResolvedValueOnce(dashboardResult(dataWithNoLeases))

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/your leases/i)).toBeInTheDocument()
    })

    // Should not show any lease cards
    expect(screen.queryByText('Suite 205')).not.toBeInTheDocument()
  })

  it('displays lease without base year when base_year is undefined', async () => {
    const dataWithoutBaseYear = {
      ...mockDashboardData,
      leases: [
        {
          ...mockDashboardData.leases[0],
          base_year: undefined,
        },
      ],
    }

    mockGetDashboard.mockResolvedValueOnce(dashboardResult(dataWithoutBaseYear))

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      const westfieldElements = screen.getAllByText(/westfield mall/i)
      expect(westfieldElements.length).toBeGreaterThan(0)
    })

    // Base Year should not be displayed
    expect(screen.queryByText('Base Year')).not.toBeInTheDocument()
  })

  it('displays statements with different status badges', async () => {
    const dataWithMultipleStatuses = {
      ...mockDashboardData,
      statements: [
        {
          ...mockDashboardData.statements[0],
          id: '1',
          status: 'pending' as const,
        },
        {
          ...mockDashboardData.statements[0],
          id: '2',
          status: 'paid' as const,
        },
        {
          ...mockDashboardData.statements[0],
          id: '3',
          status: 'disputed' as const,
        },
        {
          ...mockDashboardData.statements[0],
          id: '4',
          status: 'overdue' as const,
        },
      ],
    }

    mockGetDashboard.mockResolvedValueOnce(
      dashboardResult(dataWithMultipleStatuses)
    )

    render(<TenantDashboard />, { wrapper: createWrapper() })

    // Badge labels are humanized (title case), not the raw lowercase enum.
    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Paid')).toBeInTheDocument()
      expect(screen.getByText('Disputed')).toBeInTheDocument()
      expect(screen.getByText('Overdue')).toBeInTheDocument()
    })
    // The raw lowercase enum must not leak to the tenant.
    expect(screen.queryByText('pending')).not.toBeInTheDocument()
  })

  it('offers a new dispute for a non-disputed statement', async () => {
    const dataWithPendingStatement = {
      ...mockDashboardData,
      statements: [
        {
          ...mockDashboardData.statements[0],
          status: 'pending' as const,
        },
      ],
    }

    mockGetDashboard.mockResolvedValueOnce(
      dashboardResult(dataWithPendingStatement)
    )

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /^dispute statement for/i })
      ).toBeInTheDocument()
    })
    expect(
      screen.queryByRole('button', { name: /^view dispute for/i })
    ).not.toBeInTheDocument()
  })

  it('links to existing dispute for an already-disputed statement', async () => {
    const dataWithDisputedStatement = {
      ...mockDashboardData,
      statements: [
        {
          ...mockDashboardData.statements[0],
          status: 'disputed' as const,
        },
      ],
    }

    mockGetDashboard.mockResolvedValueOnce(
      dashboardResult(dataWithDisputedStatement)
    )

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /^view dispute for/i })
      ).toBeInTheDocument()
    })
    // No duplicate "new dispute" entry point for an already-disputed statement
    expect(
      screen.queryByRole('button', { name: /^dispute statement for/i })
    ).not.toBeInTheDocument()
  })

  it('displays PDF download link when pdf_url is provided', async () => {
    mockGetDashboard.mockResolvedValueOnce(dashboardResult(mockDashboardData))

    const { container } = render(<TenantDashboard />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      const westfieldElements = screen.getAllByText(/westfield mall/i)
      expect(westfieldElements.length).toBeGreaterThan(0)
    })

    // Check for download link with correct href
    const downloadLink = container.querySelector(
      'a[href="/api/v1/statements/example.pdf"]'
    )
    expect(downloadLink).toBeInTheDocument()
  })

  it('hides PDF download button when pdf_url is not provided', async () => {
    const dataWithoutPDF = {
      ...mockDashboardData,
      statements: [
        {
          ...mockDashboardData.statements[0],
          pdf_url: undefined,
        },
      ],
    }

    mockGetDashboard.mockResolvedValueOnce(dashboardResult(dataWithoutPDF))

    const { container } = render(<TenantDashboard />, {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      const westfieldElements = screen.getAllByText(/westfield mall/i)
      expect(westfieldElements.length).toBeGreaterThan(0)
    })

    // Download button should not be rendered
    const downloadLink = container.querySelector(
      'a[href*="/api/v1/statements/"]'
    )
    expect(downloadLink).not.toBeInTheDocument()
  })

  it('hides notification badge when unread_notifications is 0', async () => {
    const dataWithNoNotifications = {
      ...mockDashboardData,
      unread_notifications: 0,
    }

    mockGetDashboard.mockResolvedValueOnce(
      dashboardResult(dataWithNoNotifications)
    )

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText(/tenant dashboard/i)).toBeInTheDocument()
    })

    // Badge with number should not be visible
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByText('3')).not.toBeInTheDocument()
  })

  it('formats tenant share amounts with currency formatting', async () => {
    const dataWithLargeAmount = {
      ...mockDashboardData,
      statements: [
        {
          ...mockDashboardData.statements[0],
          tenant_share: '1234567.89',
        },
      ],
    }

    mockGetDashboard.mockResolvedValueOnce(dashboardResult(dataWithLargeAmount))

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('$1,234,567.89')).toBeInTheDocument()
    })
  })

  it('handles API error response correctly', async () => {
    mockGetDashboard.mockResolvedValueOnce(
      dashboardResult(null, 'Unauthorized')
    )

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByText(/dashboard data is unavailable right now\./i)
      ).toBeInTheDocument()
    })
  })

  it('shows fallback when query returns malformed empty data', async () => {
    mockGetDashboard.mockResolvedValueOnce(dashboardResult(null))

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByText(/dashboard data is unavailable right now\./i)
      ).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /try again/i })).toBeVisible()
  })

  it('shows fallback when query returns structurally invalid dashboard data', async () => {
    mockGetDashboard.mockResolvedValueOnce(
      dashboardResult({
        leases: [],
        unread_notifications: 1,
      })
    )

    render(<TenantDashboard />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(
        screen.getByText(/dashboard data is unavailable right now\./i)
      ).toBeInTheDocument()
    })
  })
})
