/**
 * ExpensePoolsTab Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExpensePoolsTab } from './ExpensePoolsTab'
import * as hooks from '@/api/hooks'
import type { ExpensePoolWithChildren, PoolMapping } from '@/api/client'
import type { PoolAllocation } from '@/types/pool-allocation'

const mockPools: ExpensePoolWithChildren[] = [
  {
    id: 'pool-1',
    property_id: 'prop-123',
    name: 'Operating Expenses',
    pool_type: 'operating',
    is_gross_up_applicable: true,
    gross_up_target: '0.95',
    description: null,
    parent_pool_id: null,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    children: [
      {
        id: 'pool-1-child',
        property_id: 'prop-123',
        name: 'Utilities',
        pool_type: 'operating',
        is_gross_up_applicable: true,
        gross_up_target: '0.95',
        description: null,
        parent_pool_id: 'pool-1',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T10:00:00Z',
        children: [],
      },
    ],
  },
  {
    id: 'pool-2',
    property_id: 'prop-123',
    name: 'Tax Expenses',
    pool_type: 'tax',
    is_gross_up_applicable: false,
    gross_up_target: null,
    description: null,
    parent_pool_id: null,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    children: [],
  },
]

const mockMappings: PoolMapping[] = [
  {
    id: 'mapping-1',
    expense_pool_id: 'pool-1',
    gl_account_pattern: '51*',
    allocation_percentage: '1.0',
    priority: 10,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'mapping-2',
    expense_pool_id: 'pool-1',
    gl_account_pattern: '52*',
    allocation_percentage: '1.0',
    priority: 5,
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
]

const mockAllocations: PoolAllocation[] = [
  {
    id: 'allocation-1',
    source_pool_id: 'pool-1',
    target_pool_id: 'pool-1-child',
    allocation_type: 'percentage',
    allocation_value: '60',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
]

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('ExpensePoolsTab', () => {
  beforeEach(() => {
    vi.spyOn(hooks, 'useExpensePools').mockReturnValue({
      data: { data: mockPools, count: 3, has_more: false },
      isLoading: false,
      error: null,
    } as never)
    vi.spyOn(hooks, 'usePoolMappings').mockReturnValue({
      data: { data: mockMappings, count: 2, has_more: false },
      isLoading: false,
      error: null,
    } as never)
    vi.spyOn(hooks, 'useDeleteExpensePool').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(hooks, 'useCreateExpensePool').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(hooks, 'useUpdateExpensePool').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(hooks, 'useCreatePoolMapping').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(hooks, 'useUpdatePoolMapping').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(hooks, 'useDeletePoolMapping').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(hooks, 'usePoolAllocations').mockReturnValue({
      data: { data: mockAllocations, count: 1, has_more: false },
      isLoading: false,
      error: null,
    } as never)
    vi.spyOn(hooks, 'useCreatePoolAllocation').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(hooks, 'useDeletePoolAllocation').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
  })

  it('renders header and add button', () => {
    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)
    expect(screen.getByText('Expense Pools')).toBeInTheDocument()
    expect(screen.getByTestId('add-pool-button')).toBeInTheDocument()
  })

  it('displays pools in table', () => {
    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)
    expect(screen.getByText('Operating Expenses')).toBeInTheDocument()
    expect(screen.getByText('Tax Expenses')).toBeInTheDocument()
    expect(screen.getByText('Utilities')).toBeInTheDocument()
  })

  it('shows pool type badges', () => {
    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)
    expect(screen.getAllByText('Operating').length).toBeGreaterThan(0)
    expect(screen.getByText('Tax')).toBeInTheDocument()
  })

  it('shows gross-up status badges', () => {
    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)
    expect(screen.getAllByText('Enabled').length).toBeGreaterThan(0)
    expect(screen.getByText('Fixed')).toBeInTheDocument()
  })

  it('renders the gross-up target without float drift (F-428)', () => {
    // 0.29 * 100 in IEEE-754 is 28.999999999999996; the string helper must
    // render a clean "29%", never the drifted decimal.
    vi.spyOn(hooks, 'useExpensePools').mockReturnValue({
      data: {
        data: [
          {
            ...mockPools[0],
            id: 'pool-drift',
            name: 'Drift Pool',
            is_gross_up_applicable: true,
            gross_up_target: '0.29',
          },
        ],
        count: 1,
        has_more: false,
      },
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)
    expect(screen.getByText('29%')).toBeInTheDocument()
    expect(screen.queryByText(/28\.99/)).not.toBeInTheDocument()
  })

  it('shows mapping count', () => {
    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)
    // pool-1 has 2 mappings
    expect(screen.getByTestId('mappings-button-pool-1')).toHaveTextContent('2')
  })

  it('shows allocation count', () => {
    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)
    expect(screen.getByTestId('allocations-button-pool-1')).toHaveTextContent(
      '1'
    )
  })

  it('warns when mapping/allocation counts fail to load', () => {
    vi.spyOn(hooks, 'usePoolMappings').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
    } as never)

    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)
    expect(
      screen.getByText(/couldn't load mapping and split counts/i)
    ).toBeInTheDocument()
  })

  it('shows empty state when no pools', () => {
    vi.spyOn(hooks, 'useExpensePools').mockReturnValue({
      data: { data: [], count: 0, has_more: false },
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)
    expect(screen.getByText(/No expense pools yet/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /add pool/i })
    ).toBeInTheDocument()
  })

  it('opens form modal when add button is clicked', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)
    await user.click(screen.getByTestId('add-pool-button'))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Add Expense Pool' })
      ).toBeInTheDocument()
    })
  })

  it('opens mappings dialog when mappings button is clicked', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)
    await user.click(screen.getByTestId('mappings-button-pool-1'))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'GL Account Mappings' })
      ).toBeInTheDocument()
    })
  })

  it('opens allocations dialog when allocations button is clicked', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)
    await user.click(screen.getByTestId('allocations-button-pool-1'))

    await waitFor(() => {
      expect(
        screen.getByRole('heading', { name: 'Split Allocations' })
      ).toBeInTheDocument()
    })
  })

  it('shows delete confirmation when delete is clicked', async () => {
    const user = userEvent.setup()

    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)

    // Open the dropdown for pool-1
    await user.click(screen.getByTestId('pool-actions-pool-1'))
    await user.click(screen.getByTestId('delete-pool-pool-1'))

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(
        screen.getByText(/Are you sure you want to delete/)
      ).toBeInTheDocument()
    })
  })

  it('shows error state when fetch fails', () => {
    vi.spyOn(hooks, 'useExpensePools').mockReturnValue({
      data: null,
      isLoading: false,
      error: { message: 'Network error' },
    } as never)

    renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)
    expect(screen.getByText("Couldn't load expense pools")).toBeInTheDocument()
  })

  describe('mapping warning styling', () => {
    it('shows warning badge when pool has 0 mappings', () => {
      // pool-2 has no mappings in mockMappings
      renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)

      const button = screen.getByTestId('mappings-button-pool-2')
      expect(button).toHaveTextContent('0')
      // Should have warning styling
      expect(button).toHaveClass('text-warning-foreground')
    })

    it('shows normal styling when pool has 1+ mappings', () => {
      // pool-1 has 2 mappings
      renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)

      const button = screen.getByTestId('mappings-button-pool-1')
      expect(button).toHaveTextContent('2')
      // Should NOT have warning styling
      expect(button).not.toHaveClass('text-warning')
    })

    it('shows alert icon next to 0 mappings count', () => {
      renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)

      const button = screen.getByTestId('mappings-button-pool-2')
      // Should contain an AlertCircle icon (has class lucide-alert-circle)
      expect(button.querySelector('.lucide-circle-alert')).toBeInTheDocument()
    })
  })

  describe('ExpensePoolsTab - offline / paused', () => {
    it('shows offline error state and hides misleading empty copy when query is paused', () => {
      vi.spyOn(hooks, 'useExpensePools').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        isPaused: true,
        refetch: vi.fn(),
      } as never)
      vi.spyOn(hooks, 'usePoolMappings').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        isError: false,
        isPaused: false,
      } as never)
      vi.spyOn(hooks, 'usePoolAllocations').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
        isError: false,
        isPaused: false,
      } as never)

      renderWithProviders(<ExpensePoolsTab propertyId="prop-123" />)

      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()
      expect(
        screen.queryByText(/no expense pools yet/i)
      ).not.toBeInTheDocument()
    })
  })
})
