/**
 * Tests for PoolsPage component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PoolsPage } from './PoolsPage'

// Mock the API hooks
vi.mock('@/api/hooks', () => ({
  useProperties: vi.fn(),
}))

// Mock PoolCopyDialog to avoid complex setup
vi.mock('@/features/pools/components/PoolCopyDialog', () => ({
  PoolCopyDialog: vi.fn(
    ({
      open,
      onOpenChange,
    }: {
      open: boolean
      onOpenChange: (v: boolean) => void
    }) =>
      open ? (
        <div data-testid="pool-copy-dialog">
          <button onClick={() => onOpenChange(false)}>Close Dialog</button>
        </div>
      ) : null
  ),
}))

import * as hooksModule from '@/api/hooks'
import { PoolCopyDialog } from '@/features/pools/components/PoolCopyDialog'

const mockProperties = [
  { id: 'prop-1', name: 'Property 1' },
  { id: 'prop-2', name: 'Property 2' },
]

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    )
  }
}

describe('PoolsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(hooksModule.useProperties).mockReturnValue({
      data: { data: mockProperties, total: 2, skip: 0, limit: 100 },
      isLoading: false,
      isError: false,
      error: null,
    } as any)
  })

  it('renders "Expense Pools" heading', () => {
    render(<PoolsPage />, { wrapper: createWrapper() })
    expect(screen.getByText('Expense Pools')).toBeInTheDocument()
  })

  it('renders "Copy Pools" button', () => {
    render(<PoolsPage />, { wrapper: createWrapper() })
    expect(
      screen.getByRole('button', { name: /copy pools/i })
    ).toBeInTheDocument()
  })

  it('disables "Copy Pools" when fewer than two properties exist', () => {
    vi.mocked(hooksModule.useProperties).mockReturnValue({
      data: {
        data: [{ id: 'prop-1', name: 'Property 1' }],
        total: 1,
        skip: 0,
        limit: 100,
      },
      isLoading: false,
      isError: false,
      error: null,
    } as any)

    render(<PoolsPage />, { wrapper: createWrapper() })

    // Copying requires a distinct source and target, so a single property must
    // not be able to open the copy dialog into a dead end.
    expect(screen.getByRole('button', { name: /copy pools/i })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /copy between properties/i })
    ).toBeDisabled()
  })

  it('renders property launch cards and overview stats', () => {
    render(<PoolsPage />, { wrapper: createWrapper() })

    expect(screen.getByText('Properties Available')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Property 1/i })).toHaveAttribute(
      'href',
      '/properties/prop-1#pools'
    )
  })

  it('shows empty-state launcher when no properties are available', () => {
    vi.mocked(hooksModule.useProperties).mockReturnValue({
      data: { data: [], total: 0, skip: 0, limit: 100 },
      isLoading: false,
      isError: false,
      error: null,
    } as any)

    render(<PoolsPage />, { wrapper: createWrapper() })

    expect(screen.getByText('No properties available')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Add Property/i })
    ).toBeInTheDocument()
  })

  it('shows a retryable error (not the empty state) when properties fail to load', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()
    vi.mocked(hooksModule.useProperties).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as any)

    render(<PoolsPage />, { wrapper: createWrapper() })

    // A load failure must NOT masquerade as "no properties available".
    expect(
      screen.queryByText('No properties available')
    ).not.toBeInTheDocument()
    expect(screen.getByText(/couldn't load properties/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(refetch).toHaveBeenCalled()
  })

  it('clicking "Copy Pools" opens the PoolCopyDialog', async () => {
    const user = userEvent.setup()
    render(<PoolsPage />, { wrapper: createWrapper() })

    expect(screen.queryByTestId('pool-copy-dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /copy pools/i }))

    expect(screen.getByTestId('pool-copy-dialog')).toBeInTheDocument()
  })

  it('PoolCopyDialog closes when onOpenChange(false) is called', async () => {
    const user = userEvent.setup()
    render(<PoolsPage />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: /copy pools/i }))
    expect(screen.getByTestId('pool-copy-dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /close dialog/i }))

    await waitFor(() => {
      expect(screen.queryByTestId('pool-copy-dialog')).not.toBeInTheDocument()
    })
  })

  it('shows all properties without truncation when there are 6 or fewer', () => {
    const sixProps = Array.from({ length: 6 }, (_, i) => ({
      id: `prop-${i}`,
      name: `Property ${i}`,
    }))
    vi.mocked(hooksModule.useProperties).mockReturnValue({
      data: { data: sixProps, total: 6, skip: 0, limit: 100 },
      isLoading: false,
      isError: false,
      error: null,
    } as any)

    render(<PoolsPage />, { wrapper: createWrapper() })

    // All six rendered, no truncation affordance.
    sixProps.forEach((p) => {
      expect(
        screen.getByRole('link', { name: new RegExp(p.name, 'i') })
      ).toBeInTheDocument()
    })
    expect(
      screen.queryByTestId('property-truncation-notice')
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('property-show-all-toggle')
    ).not.toBeInTheDocument()
  })

  it('caps the property list and reveals the rest via "Show all"', async () => {
    const user = userEvent.setup()
    const manyProps = Array.from({ length: 10 }, (_, i) => ({
      id: `prop-${i}`,
      name: `Property ${i}`,
    }))
    vi.mocked(hooksModule.useProperties).mockReturnValue({
      data: { data: manyProps, total: 10, skip: 0, limit: 100 },
      isLoading: false,
      isError: false,
      error: null,
    } as any)

    render(<PoolsPage />, { wrapper: createWrapper() })

    // Initially only the first 6 are shown.
    expect(
      screen.getByRole('link', { name: /Property 0\b/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: /Property 5\b/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /Property 9\b/i })
    ).not.toBeInTheDocument()

    // Count + show-all affordance is present.
    const notice = screen.getByTestId('property-truncation-notice')
    expect(notice).toHaveTextContent('Showing 6 of 10 properties.')
    const toggle = screen.getByTestId('property-show-all-toggle')
    expect(toggle).toHaveTextContent('Show all (10)')

    // Clicking reveals the remaining properties.
    await user.click(toggle)

    expect(
      screen.getByRole('link', { name: /Property 9\b/i })
    ).toBeInTheDocument()
    expect(screen.getByTestId('property-truncation-notice')).toHaveTextContent(
      'Showing all 10 properties.'
    )
    expect(screen.getByTestId('property-show-all-toggle')).toHaveTextContent(
      'Show fewer'
    )

    // And can collapse again.
    await user.click(screen.getByTestId('property-show-all-toggle'))
    expect(
      screen.queryByRole('link', { name: /Property 9\b/i })
    ).not.toBeInTheDocument()
  })

  it('F-296: heading ladder is H1 -> H2 with no skipped level', () => {
    render(<PoolsPage />, { wrapper: createWrapper() })

    // Page title is the sole H1.
    expect(
      screen.getByRole('heading', { level: 1, name: 'Expense Pools' })
    ).toBeInTheDocument()

    // The stat-card title and the launcher section title are both H2 - the
    // direct sections under the page H1, so there is no H1 -> H3 skip.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Properties Available' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 2, name: 'Start from a property' })
    ).toBeInTheDocument()

    // No H3 (or deeper) heading exists to create a skip.
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
  })

  it('shows an offline notice instead of the empty state when properties are paused', () => {
    const refetch = vi.fn()
    vi.mocked(hooksModule.useProperties).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      isPaused: true,
      refetch,
    } as any)

    render(<PoolsPage />, { wrapper: createWrapper() })

    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /try again/i })
    ).toBeInTheDocument()
    expect(
      screen.queryByText(/no properties available/i)
    ).not.toBeInTheDocument()
  })

  it('passes properties from API to the dialog', async () => {
    const user = userEvent.setup()
    render(<PoolsPage />, { wrapper: createWrapper() })

    await user.click(screen.getByRole('button', { name: /copy pools/i }))

    await waitFor(() => {
      expect(vi.mocked(PoolCopyDialog)).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: mockProperties,
        }),
        undefined
      )
    })
  })
})
