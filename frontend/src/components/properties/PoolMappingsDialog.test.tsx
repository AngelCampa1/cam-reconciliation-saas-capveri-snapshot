/**
 * PoolMappingsDialog Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PoolMappingsDialog } from './PoolMappingsDialog'
import * as hooks from '@/api/hooks'
import type { ExpensePoolWithChildren, PoolMapping } from '@/api/client'

const mockPool: ExpensePoolWithChildren = {
  id: 'pool-1',
  property_id: 'prop-123',
  name: 'Utilities',
  pool_type: 'operating',
  is_gross_up_applicable: true,
  gross_up_target: '0.95',
  description: null,
  parent_pool_id: null,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  children: [],
}

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
    gl_account_pattern: '52??',
    allocation_percentage: '0.5',
    priority: 5,
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

describe('PoolMappingsDialog', () => {
  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    mockOnOpenChange.mockClear()
    vi.spyOn(hooks, 'usePoolMappings').mockReturnValue({
      data: { data: mockMappings, count: 2, has_more: false },
      isLoading: false,
      error: null,
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
  })

  it('renders dialog with pool name', () => {
    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'GL Account Mappings' })
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Manage GL account patterns for "Utilities"/)
    ).toBeInTheDocument()
  })

  it('displays existing mappings', () => {
    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )
    expect(screen.getByText('51*')).toBeInTheDocument()
    expect(screen.getByText('52??')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it('shows empty state when no mappings', () => {
    vi.spyOn(hooks, 'usePoolMappings').mockReturnValue({
      data: { data: [], count: 0, has_more: false },
      isLoading: false,
      error: null,
    } as never)

    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )
    expect(screen.getByText(/No mappings configured/)).toBeInTheDocument()
  })

  it('shows an error state with retry when mappings fail to load', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()
    vi.spyOn(hooks, 'usePoolMappings').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      refetch,
    } as never)

    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    expect(
      screen.getByText(/We could not load the mappings/)
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalled()
  })

  it('shows add form when Add Mapping is clicked', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.click(screen.getByTestId('add-mapping-button'))
    expect(screen.getByTestId('add-mapping-form')).toBeInTheDocument()
    expect(screen.getByTestId('new-pattern-input')).toBeInTheDocument()
  })

  it('calls create mutation when adding new mapping', async () => {
    const user = userEvent.setup()
    const mockMutate = vi.fn()
    vi.spyOn(hooks, 'useCreatePoolMapping').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never)

    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.click(screen.getByTestId('add-mapping-button'))
    await user.type(screen.getByTestId('new-pattern-input'), '53*')
    await user.click(screen.getByTestId('save-new-mapping-button'))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          expense_pool_id: 'pool-1',
          gl_account_pattern: '53*',
        })
      )
    })
  })

  it('renders allocation percentage without float drift (F-428)', () => {
    // 0.07 * 100 in IEEE-754 is 7.000000000000001; the string helper must
    // render a clean "7%".
    vi.spyOn(hooks, 'usePoolMappings').mockReturnValue({
      data: {
        data: [{ ...mockMappings[0], allocation_percentage: '0.07' }],
        count: 1,
        has_more: false,
      },
      isLoading: false,
      isError: false,
    } as never)

    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    expect(screen.getByText('7%')).toBeInTheDocument()
    expect(screen.queryByText(/7\.0000/)).not.toBeInTheDocument()
  })

  it('submits a drift-free decimal allocation string (F-428)', async () => {
    const user = userEvent.setup()
    const mockMutate = vi.fn()
    vi.spyOn(hooks, 'useCreatePoolMapping').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never)

    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.click(screen.getByTestId('add-mapping-button'))
    await user.type(screen.getByTestId('new-pattern-input'), '53*')
    const allocInput = screen.getByTestId('new-allocation-input')
    await user.clear(allocInput)
    await user.type(allocInput, '7')
    await user.click(screen.getByTestId('save-new-mapping-button'))

    await waitFor(() => {
      // parseFloat('7') / 100 would persist 0.07000000000000001; the helper
      // submits the exact decimal string instead.
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ allocation_percentage: '0.07' })
      )
    })
  })

  it('does not add again while a create is already in flight', async () => {
    const user = userEvent.setup()
    const mockMutate = vi.fn()
    vi.spyOn(hooks, 'useCreatePoolMapping').mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    } as never)

    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.click(screen.getByTestId('add-mapping-button'))
    await user.type(screen.getByTestId('new-pattern-input'), '53*')

    // Fire a submit directly on the form to simulate the keyboard-Enter race the
    // disabled save button cannot catch.
    const formEl = screen.getByTestId('add-mapping-form')
    fireEvent.submit(formEl)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('validates GL pattern format', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.click(screen.getByTestId('add-mapping-button'))
    await user.type(screen.getByTestId('new-pattern-input'), 'invalid$pattern')
    await user.click(screen.getByTestId('save-new-mapping-button'))

    await waitFor(() => {
      expect(
        screen.getByText(/Use digits, \*, %, \?, -, or \. only/)
      ).toBeInTheDocument()
    })
  })

  it('shows edit form when edit button is clicked', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.click(screen.getByTestId('edit-mapping-mapping-1'))
    expect(screen.getByTestId('edit-mapping-form')).toBeInTheDocument()
    expect(screen.getByTestId('edit-pattern-input')).toHaveValue('51*')
  })

  it('shows delete confirmation dialog', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.click(screen.getByTestId('delete-mapping-mapping-1'))

    await waitFor(() => {
      expect(screen.getByRole('alertdialog')).toBeInTheDocument()
      expect(
        screen.getByText(/Are you sure you want to delete/)
      ).toBeInTheDocument()
    })
  })

  it('calls delete mutation when confirmed', async () => {
    const user = userEvent.setup()
    const mockMutate = vi.fn()
    vi.spyOn(hooks, 'useDeletePoolMapping').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never)

    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.click(screen.getByTestId('delete-mapping-mapping-1'))
    await user.click(screen.getByTestId('confirm-delete-button'))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith('mapping-1')
    })
  })

  it('cancels add form when cancel button is clicked', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.click(screen.getByTestId('add-mapping-button'))
    expect(screen.getByTestId('add-mapping-form')).toBeInTheDocument()

    await user.click(screen.getByTestId('cancel-new-mapping-button'))
    expect(screen.queryByTestId('add-mapping-form')).not.toBeInTheDocument()
  })
})

describe('PoolMappingsDialog - offline / paused', () => {
  it('shows offline notice and Try again when query is paused, hides misleading empty copy', async () => {
    const user = userEvent.setup()
    const refetch = vi.fn()
    vi.spyOn(hooks, 'usePoolMappings').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      isPaused: true,
      refetch,
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

    renderWithProviders(
      <PoolMappingsDialog
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={vi.fn()}
      />
    )

    expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
    const tryAgainBtn = screen.getByRole('button', { name: /try again/i })
    expect(tryAgainBtn).toBeInTheDocument()
    await user.click(tryAgainBtn)
    expect(refetch).toHaveBeenCalled()
    expect(
      screen.queryByText(/No mappings configured/i)
    ).not.toBeInTheDocument()
  })
})
