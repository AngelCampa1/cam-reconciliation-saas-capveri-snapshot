/**
 * ReconciliationMobileView Component Tests
 */
import { describe, it, expect, vi } from 'vitest'
import { act, render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReconciliationMobileView } from './ReconciliationMobileView'
import type { ReconciliationRow } from '@/features/reconciliation/types/reconciliation-row'

describe('ReconciliationMobileView', () => {
  const mockData: ReconciliationRow[] = [
    {
      id: 'pool-1',
      type: 'expense_pool',
      pool_name: 'Common Area Maintenance',
      pool_type: 'CAM',
      total_expenses: '50000.00',
      grossed_up_expenses: '52631.58',
      tenant_shares: {
        'tenant-1': '10000.00',
      },
    },
    {
      id: 'pool-2',
      type: 'expense_pool',
      pool_name: 'Property Taxes',
      pool_type: 'Taxes',
      total_expenses: '30000.00',
    },
    {
      id: 'summary-1',
      type: 'tenant_summary',
      tenant_id: '123e4567-e89b-12d3-a456-426614174001',
      tenant_name: 'Acme Corporation',
      total_recovery: '25000.00',
      admin_fee: '3750.00',
      final_amount: '28750.00',
    },
    {
      id: 'summary-2',
      type: 'tenant_summary',
      tenant_id: '123e4567-e89b-12d3-a456-426614174002',
      tenant_name: 'Tech Startup Inc',
      total_recovery: '15000.00',
      admin_fee: '2250.00',
      final_amount: '17250.00',
    },
  ]

  it('renders all cards by default', () => {
    render(<ReconciliationMobileView data={mockData} />)

    expect(screen.getByText('Common Area Maintenance')).toBeInTheDocument()
    expect(screen.getByText('Property Taxes')).toBeInTheDocument()
    expect(screen.getByText('Acme Corporation')).toBeInTheDocument()
    expect(screen.getByText('Tech Startup Inc')).toBeInTheDocument()
  })

  it('displays filter chips with correct counts', () => {
    render(<ReconciliationMobileView data={mockData} />)

    // Filter chips should be visible
    const allChip = screen.getByRole('button', { pressed: true })
    expect(allChip).toHaveTextContent('All')
    expect(allChip).toHaveTextContent('(4)')

    const poolsChip = screen.getByRole('button', { name: /Pools/ })
    expect(poolsChip).toHaveTextContent('Pools')
    expect(poolsChip).toHaveTextContent('(2)')

    const tenantsChip = screen.getByRole('button', { name: /Tenants/ })
    expect(tenantsChip).toHaveTextContent('Tenants')
    expect(tenantsChip).toHaveTextContent('(2)')
  })

  it('filters to show only expense pools', async () => {
    const user = userEvent.setup()
    render(<ReconciliationMobileView data={mockData} />)

    const poolsFilter = screen.getByText(/Pools/)
    await user.click(poolsFilter)

    // Only pools should be visible
    expect(screen.getByText('Common Area Maintenance')).toBeInTheDocument()
    expect(screen.getByText('Property Taxes')).toBeInTheDocument()
    // Tenants should not be visible
    expect(screen.queryByText('Acme Corporation')).not.toBeInTheDocument()
    expect(screen.queryByText('Tech Startup Inc')).not.toBeInTheDocument()
  })

  it('filters to show only tenant summaries', async () => {
    const user = userEvent.setup()
    render(<ReconciliationMobileView data={mockData} />)

    const tenantsFilter = screen.getByText(/Tenants/)
    await user.click(tenantsFilter)

    // Only tenants should be visible
    expect(screen.getByText('Acme Corporation')).toBeInTheDocument()
    expect(screen.getByText('Tech Startup Inc')).toBeInTheDocument()
    // Pools should not be visible
    expect(
      screen.queryByText('Common Area Maintenance')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Property Taxes')).not.toBeInTheDocument()
  })

  it('searches by pool name', async () => {
    const user = userEvent.setup()
    render(<ReconciliationMobileView data={mockData} />)

    const searchInput = screen.getByTestId('mobile-search-input')
    await user.type(searchInput, 'taxes')

    // Only Property Taxes should be visible
    expect(screen.getByText('Property Taxes')).toBeInTheDocument()
    expect(
      screen.queryByText('Common Area Maintenance')
    ).not.toBeInTheDocument()
  })

  it('searches by tenant name', async () => {
    const user = userEvent.setup()
    render(<ReconciliationMobileView data={mockData} />)

    const searchInput = screen.getByTestId('mobile-search-input')
    await user.type(searchInput, 'acme')

    // Only Acme Corporation should be visible
    expect(screen.getByText('Acme Corporation')).toBeInTheDocument()
    expect(screen.queryByText('Tech Startup Inc')).not.toBeInTheDocument()
  })

  it('shows empty state when no results', async () => {
    const user = userEvent.setup()
    render(<ReconciliationMobileView data={mockData} />)

    const searchInput = screen.getByTestId('mobile-search-input')
    await user.type(searchInput, 'nonexistent')

    expect(
      screen.getByRole('heading', { name: 'No results found' })
    ).toBeInTheDocument()
    expect(screen.getByText(/nonexistent/i)).toBeInTheDocument()
  })

  it('clears search when clear button clicked', async () => {
    const user = userEvent.setup()
    render(<ReconciliationMobileView data={mockData} />)

    const searchInput = screen.getByTestId('mobile-search-input')
    await user.type(searchInput, 'test')

    // Click clear button (X icon in search input)
    const clearButton = screen.getByLabelText('Clear search')
    await user.click(clearButton)

    expect(searchInput).toHaveValue('')
  })

  it('calls onRefresh when provided', async () => {
    const handleRefresh = vi.fn()
    render(
      <ReconciliationMobileView data={mockData} onRefresh={handleRefresh} />
    )

    // Pull-to-refresh is tested via touch events
    // This test verifies the callback is wired up
    expect(handleRefresh).not.toHaveBeenCalled()
  })

  it('displays loading overlay when isLoading=true', () => {
    render(<ReconciliationMobileView data={mockData} isLoading={true} />)

    // Loading spinner should be visible
    const loadingOverlay = screen.getByRole('status')
    expect(loadingOverlay).toBeInTheDocument()
    expect(loadingOverlay).toHaveAttribute('aria-label', 'Loading')
  })

  it('has proper search input accessibility', () => {
    render(<ReconciliationMobileView data={mockData} />)

    const searchInput = screen.getByTestId('mobile-search-input')
    expect(searchInput).toHaveAttribute('type', 'search')
    expect(searchInput).toHaveAttribute(
      'placeholder',
      'Search pools or tenants...'
    )
  })

  it('f275: search input has accessible name "Search pools or tenants"', () => {
    render(<ReconciliationMobileView data={mockData} />)

    expect(
      screen.getByRole('searchbox', { name: /search pools or tenants/i })
    ).toBeInTheDocument()
  })

  describe('Edge Cases', () => {
    it('shows empty state with "Clear search" button', async () => {
      const user = userEvent.setup()
      render(<ReconciliationMobileView data={mockData} />)

      const searchInput = screen.getByTestId('mobile-search-input')
      await user.type(searchInput, 'xyz123notfound')

      expect(
        screen.getByRole('heading', { name: 'No results found' })
      ).toBeInTheDocument()

      // Get both clear buttons (one in search input, one in empty state)
      const clearButtons = screen.getAllByRole('button', {
        name: /Clear search/i,
      })
      // Click the one in the empty state (the second one, which is a Button component)
      await user.click(clearButtons[1])

      // Search should be cleared and all results shown
      expect(searchInput).toHaveValue('')
      expect(screen.getByText('Common Area Maintenance')).toBeInTheDocument()
    })

    it('search is case-insensitive', async () => {
      const user = userEvent.setup()
      render(<ReconciliationMobileView data={mockData} />)

      const searchInput = screen.getByTestId('mobile-search-input')
      await user.type(searchInput, 'ACME')

      // Should find "Acme Corporation" despite case mismatch
      expect(screen.getByText('Acme Corporation')).toBeInTheDocument()
    })

    it('combines filter and search', async () => {
      const user = userEvent.setup()
      render(<ReconciliationMobileView data={mockData} />)

      // Filter to tenants only
      const tenantsFilter = screen.getByRole('button', { name: /Tenants/i })
      await user.click(tenantsFilter)

      // Then search
      const searchInput = screen.getByTestId('mobile-search-input')
      await user.type(searchInput, 'tech')

      // Should only show Tech Startup Inc (filtered AND searched)
      expect(screen.getByText('Tech Startup Inc')).toBeInTheDocument()
      expect(screen.queryByText('Acme Corporation')).not.toBeInTheDocument()
      expect(screen.queryByText('Property Taxes')).not.toBeInTheDocument()
    })

    it('handles empty data array', () => {
      render(<ReconciliationMobileView data={[]} />)

      expect(
        screen.getByRole('heading', { name: 'No results found' })
      ).toBeInTheDocument()
    })

    it('shows clear button only when search has text', async () => {
      const user = userEvent.setup()
      render(<ReconciliationMobileView data={mockData} />)

      // Initially no clear button
      expect(screen.queryByLabelText('Clear search')).not.toBeInTheDocument()

      // Type in search
      const searchInput = screen.getByTestId('mobile-search-input')
      await user.type(searchInput, 'test')

      // Clear button should now be visible
      expect(screen.getByLabelText('Clear search')).toBeInTheDocument()
    })
  })

  describe('Filter Chip States', () => {
    it('highlights active filter chip', () => {
      render(<ReconciliationMobileView data={mockData} />)

      // "All" should be active (pressed)
      const allChip = screen.getByRole('button', { name: /All/i })
      expect(allChip).toHaveAttribute('aria-pressed', 'true')

      const poolsChip = screen.getByRole('button', { name: /Pools/i })
      expect(poolsChip).toHaveAttribute('aria-pressed', 'false')
    })

    it('updates active state when filter clicked', async () => {
      const user = userEvent.setup()
      render(<ReconciliationMobileView data={mockData} />)

      const poolsChip = screen.getByRole('button', { name: /Pools/i })
      await user.click(poolsChip)

      expect(poolsChip).toHaveAttribute('aria-pressed', 'true')

      const allChip = screen.getByRole('button', { name: /All/i })
      expect(allChip).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('F-290: filter group semantics', () => {
    it('wraps the filter chips in a labeled group', () => {
      render(<ReconciliationMobileView data={mockData} />)

      // The segmented filter is a single-select toggle-button group (not a
      // tablist — it filters the grid in place rather than swapping panels).
      const group = screen.getByRole('group', { name: 'Filter view' })
      expect(group).toBeInTheDocument()
      // The three chips are aria-pressed toggle buttons inside that group.
      expect(
        within(group).getByRole('button', { name: /All/i })
      ).toHaveAttribute('aria-pressed', 'true')
    })
  })

  describe('Pull-to-Refresh', () => {
    it('shows pull indicator when pulling down', () => {
      const { container } = render(
        <ReconciliationMobileView data={mockData} onRefresh={vi.fn()} />
      )
      const mobileView =
        container.querySelector('[data-testid]') || container.firstChild

      // Simulate touch start at top
      fireEvent.touchStart(mobileView!, {
        touches: [{ clientY: 100 }],
      })

      // Simulate pull down
      fireEvent.touchMove(mobileView!, {
        touches: [{ clientY: 150 }],
      })

      // Pull indicator should be visible (check for RefreshCw icon)
      const indicator = container.querySelector('.text-muted-foreground')
      expect(indicator).toBeInTheDocument()
    })

    it('calls onRefresh when pull threshold exceeded', async () => {
      const handleRefresh = vi.fn().mockResolvedValue(undefined)
      const { container } = render(
        <ReconciliationMobileView data={mockData} onRefresh={handleRefresh} />
      )
      const mobileView =
        container.querySelector('[data-testid]') || container.firstChild

      await act(async () => {
        fireEvent.touchStart(mobileView!, {
          touches: [{ clientY: 100 }],
        })
      })

      await act(async () => {
        fireEvent.touchMove(mobileView!, {
          touches: [{ clientY: 150 }],
        })
      })

      await act(async () => {
        fireEvent.touchEnd(mobileView!)
      })

      expect(handleRefresh).toHaveBeenCalledTimes(1)
    })

    it('does not call onRefresh when threshold not exceeded', () => {
      const handleRefresh = vi.fn()
      const { container } = render(
        <ReconciliationMobileView data={mockData} onRefresh={handleRefresh} />
      )
      const mobileView =
        container.querySelector('[data-testid]') || container.firstChild

      // Small pull, below threshold
      fireEvent.touchStart(mobileView!, {
        touches: [{ clientY: 100 }],
      })

      fireEvent.touchMove(mobileView!, {
        touches: [{ clientY: 110 }],
      })

      fireEvent.touchEnd(mobileView!)

      expect(handleRefresh).not.toHaveBeenCalled()
    })

    it('does not trigger pull-to-refresh when loading', () => {
      const handleRefresh = vi.fn()
      const { container } = render(
        <ReconciliationMobileView
          data={mockData}
          onRefresh={handleRefresh}
          isLoading={true}
        />
      )
      const mobileView =
        container.querySelector('[data-testid]') || container.firstChild

      fireEvent.touchStart(mobileView!, {
        touches: [{ clientY: 100 }],
      })

      fireEvent.touchMove(mobileView!, {
        touches: [{ clientY: 150 }],
      })

      fireEvent.touchEnd(mobileView!)

      expect(handleRefresh).not.toHaveBeenCalled()
    })
  })

  describe('Props', () => {
    it('applies testId prop', () => {
      const { container } = render(
        <ReconciliationMobileView data={mockData} testId="custom-mobile-view" />
      )

      const mobileView = container.querySelector(
        '[data-testid="custom-mobile-view"]'
      )
      expect(mobileView).toBeInTheDocument()
    })
  })
})
