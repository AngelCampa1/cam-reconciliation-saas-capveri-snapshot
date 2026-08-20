/**
 * TermVersionTimeline Tests
 *
 * Tests for the lease term version timeline component:
 * - Loading state
 * - Empty state
 * - Rendering versions with correct data
 * - Current badge on latest version
 * - Delete confirmation dialog
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { TermVersionTimeline } from './TermVersionTimeline'

// Mock the hooks
const mockVersions = vi.fn()
const mockDeleteMutate = vi.fn()

vi.mock('@/api/hooks', () => ({
  useLeaseTermVersions: (...args: unknown[]) => mockVersions(...args),
  useDeleteTermVersion: () => ({
    mutate: mockDeleteMutate,
    isPending: false,
  }),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    )
  }
}

describe('TermVersionTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading state', () => {
    mockVersions.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    })

    render(<TermVersionTimeline leaseId="lease-1" />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByText('Amendment History')).toBeInTheDocument()
    // Loading skeletons
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(2)
  })

  it('shows empty state when no versions', () => {
    mockVersions.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    })

    render(<TermVersionTimeline leaseId="lease-1" />, {
      wrapper: createWrapper(),
    })

    expect(screen.getByTestId('no-versions')).toBeInTheDocument()
    expect(screen.getByText(/no versions yet/i)).toBeInTheDocument()
  })

  it('renders versions with correct data', () => {
    mockVersions.mockReturnValue({
      data: [
        {
          id: 'v2',
          version_number: 2,
          effective_date: '2025-07-01',
          pro_rata_share: '0.08000000',
          cap_type: 'non_cumulative',
          amendment_reason: 'Expansion',
          created_at: '2025-06-15T00:00:00Z',
        },
        {
          id: 'v1',
          version_number: 1,
          effective_date: '2025-01-01',
          pro_rata_share: '0.05000000',
          cap_type: 'none',
          amendment_reason: 'Initial terms',
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<TermVersionTimeline leaseId="lease-1" />, {
      wrapper: createWrapper(),
    })

    const nodes = screen.getAllByTestId('version-node')
    expect(nodes).toHaveLength(2)

    // First node (v2) should have "Current" badge
    expect(within(nodes[0]).getByTestId('current-badge')).toBeInTheDocument()
    expect(within(nodes[0]).getByText('v2')).toBeInTheDocument()
    expect(within(nodes[0]).getByText(/8\.00%/)).toBeInTheDocument()
    expect(within(nodes[0]).getByText('Expansion')).toBeInTheDocument()

    // Second node (v1) should NOT have "Current" badge
    expect(
      within(nodes[1]).queryByTestId('current-badge')
    ).not.toBeInTheDocument()
    expect(within(nodes[1]).getByText('v1')).toBeInTheDocument()
    expect(within(nodes[1]).getByText(/5\.00%/)).toBeInTheDocument()

    // Effective dates must render as the entered calendar day (no UTC off-by-one)
    // '2025-07-01' → "Jul 1, 2025" not "Jun 30, 2025"
    expect(within(nodes[0]).getByText(/Jul\s+1,?\s*2025/)).toBeInTheDocument()
    // '2025-01-01' → "Jan 1, 2025" not "Dec 31, 2024"
    expect(within(nodes[1]).getByText(/Jan\s+1,?\s*2025/)).toBeInTheDocument()
  })

  it('shows error state', () => {
    mockVersions.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Network error' },
    })

    render(<TermVersionTimeline leaseId="lease-1" />, {
      wrapper: createWrapper(),
    })

    expect(
      screen.getByText(/couldn't load lease versions/i)
    ).toBeInTheDocument()
  })

  it('shows New Amendment button when callback provided', () => {
    const onCreateAmendment = vi.fn()
    mockVersions.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    })

    render(
      <TermVersionTimeline
        leaseId="lease-1"
        onCreateAmendment={onCreateAmendment}
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByTestId('new-amendment-btn')).toBeInTheDocument()
  })

  it('shows offline error state and no misleading empty copy when paused', () => {
    mockVersions.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      isPaused: true,
      refetch: vi.fn(),
    })
    render(<TermVersionTimeline leaseId="lease-1" />, {
      wrapper: createWrapper(),
    })
    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(screen.queryByText(/no versions/i)).not.toBeInTheDocument()
  })

  it('opens delete confirmation dialog', async () => {
    const user = userEvent.setup()
    mockVersions.mockReturnValue({
      data: [
        {
          id: 'v1',
          version_number: 1,
          effective_date: '2025-01-01',
          pro_rata_share: '0.05000000',
          cap_type: 'none',
          amendment_reason: null,
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
      isLoading: false,
      error: null,
    })

    render(<TermVersionTimeline leaseId="lease-1" />, {
      wrapper: createWrapper(),
    })

    await user.click(screen.getByTestId('delete-version-btn'))

    expect(screen.getByText('Delete Term Version')).toBeInTheDocument()
  })
})
