/**
 * PoolAllocationsDialog Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PoolAllocationsDialog } from './PoolAllocationsDialog'
import * as hooks from '@/api/hooks'
import type { ExpensePoolWithChildren } from '@/api/client'

const mockSourcePool: ExpensePoolWithChildren = {
  id: 'pool-src',
  property_id: 'prop-123',
  name: 'Common Area',
  pool_type: 'operating',
  is_gross_up_applicable: false,
  gross_up_target: null,
  description: null,
  parent_pool_id: null,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  children: [],
}

const mockTargetPool: ExpensePoolWithChildren = {
  id: 'pool-tgt',
  property_id: 'prop-123',
  name: 'Utilities',
  pool_type: 'operating',
  is_gross_up_applicable: false,
  gross_up_target: null,
  description: null,
  parent_pool_id: null,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  children: [],
}

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

describe('PoolAllocationsDialog', () => {
  beforeEach(() => {
    vi.spyOn(hooks, 'usePoolAllocations').mockReturnValue({
      data: { data: [], count: 0, has_more: false },
      isLoading: false,
      isError: false,
      error: null,
      isPaused: false,
      refetch: vi.fn(),
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

  it('renders without crashing given empty data', () => {
    renderWithProviders(
      <PoolAllocationsDialog
        open={true}
        onOpenChange={vi.fn()}
        propertyId="prop-123"
        sourcePool={mockSourcePool}
        pools={[mockSourcePool, mockTargetPool]}
      />
    )
    expect(screen.getByText('Split Allocations')).toBeInTheDocument()
    expect(
      screen.getByText(/No split allocations configured/i)
    ).toBeInTheDocument()
  })
})

describe('PoolAllocationsDialog - offline / paused', () => {
  it('shows offline notice and Try again when query is paused, hides misleading empty copy', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()
    vi.spyOn(hooks, 'usePoolAllocations').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      isPaused: true,
      refetch,
    } as never)
    vi.spyOn(hooks, 'useCreatePoolAllocation').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(hooks, 'useDeletePoolAllocation').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)

    renderWithProviders(
      <PoolAllocationsDialog
        open={true}
        onOpenChange={vi.fn()}
        propertyId="prop-123"
        sourcePool={mockSourcePool}
        pools={[mockSourcePool, mockTargetPool]}
      />
    )

    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    const tryAgainBtn = screen.getByRole('button', { name: /try again/i })
    expect(tryAgainBtn).toBeInTheDocument()
    await user.click(tryAgainBtn)
    expect(refetch).toHaveBeenCalled()
    expect(
      screen.queryByText(/No split allocations configured/i)
    ).not.toBeInTheDocument()
  })
})
