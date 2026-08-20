/**
 * ExpensePoolFormModal Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ExpensePoolFormModal } from './ExpensePoolFormModal'
import * as hooks from '@/api/hooks'
import type { ExpensePoolWithChildren } from '@/api/client'

const mockPool: ExpensePoolWithChildren = {
  id: 'pool-1',
  property_id: 'prop-123',
  name: 'Utilities',
  pool_type: 'operating',
  is_gross_up_applicable: true,
  gross_up_target: '0.95',
  description: 'Utility expenses',
  parent_pool_id: null,
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
  children: [],
}

const mockPoolsResponse = {
  data: [mockPool],
  count: 1,
  has_more: false,
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

describe('ExpensePoolFormModal', () => {
  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    mockOnOpenChange.mockClear()
    vi.spyOn(hooks, 'useExpensePools').mockReturnValue({
      data: mockPoolsResponse,
      isLoading: false,
      error: null,
    } as never)
    vi.spyOn(hooks, 'useCreateExpensePool').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(hooks, 'useUpdateExpensePool').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
  })

  it('renders create mode', () => {
    renderWithProviders(
      <ExpensePoolFormModal
        propertyId="prop-123"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'Add Expense Pool' })
    ).toBeInTheDocument()
  })

  it('renders edit mode', () => {
    renderWithProviders(
      <ExpensePoolFormModal
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'Edit Expense Pool' })
    ).toBeInTheDocument()
  })

  it('warns when existing pools fail to load', () => {
    vi.spyOn(hooks, 'useExpensePools').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('boom'),
    } as never)

    renderWithProviders(
      <ExpensePoolFormModal
        propertyId="prop-123"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )
    expect(
      screen.getByText(/couldn't load existing pools/i)
    ).toBeInTheDocument()
  })

  it('validates required fields', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <ExpensePoolFormModal
        propertyId="prop-123"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )
    await user.click(screen.getByRole('button', { name: /Add Pool/i }))
    await waitFor(() => {
      expect(screen.getByText(/Pool name is required/i)).toBeInTheDocument()
    })
  })

  it('calls create mutation with valid data', async () => {
    const user = userEvent.setup()
    const mockMutate = vi.fn()
    vi.spyOn(hooks, 'useCreateExpensePool').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never)

    renderWithProviders(
      <ExpensePoolFormModal
        propertyId="prop-123"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.type(screen.getByTestId('pool-name-input'), 'Janitorial')
    await user.click(screen.getByRole('button', { name: /Add Pool/i }))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Janitorial',
          pool_type: 'operating',
        })
      )
    })
  })

  it('submits a drift-free gross-up decimal string (F-428)', async () => {
    const user = userEvent.setup()
    const mockMutate = vi.fn()
    vi.spyOn(hooks, 'useCreateExpensePool').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never)

    renderWithProviders(
      <ExpensePoolFormModal
        propertyId="prop-123"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.type(screen.getByTestId('pool-name-input'), 'Janitorial')
    await user.click(screen.getByTestId('gross-up-switch'))
    await user.type(screen.getByTestId('gross-up-target-input'), '29')
    await user.click(screen.getByRole('button', { name: /Add Pool/i }))

    await waitFor(() => {
      // parseFloat('29') / 100 would persist 0.28999999999999998; the helper
      // submits the exact decimal string instead.
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ gross_up_target: '0.29' })
      )
    })
  })

  it('shows loading state', () => {
    vi.spyOn(hooks, 'useCreateExpensePool').mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    } as never)

    renderWithProviders(
      <ExpensePoolFormModal
        propertyId="prop-123"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    expect(screen.getByRole('button', { name: /Creating/i })).toBeDisabled()
  })

  it('populates form with pool data in edit mode', () => {
    renderWithProviders(
      <ExpensePoolFormModal
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    const nameInput = screen.getByTestId('pool-name-input') as HTMLInputElement
    expect(nameInput.value).toBe('Utilities')

    // Gross-up switch should be on
    const grossUpSwitch = screen.getByTestId('gross-up-switch')
    expect(grossUpSwitch).toHaveAttribute('data-state', 'checked')

    // Gross-up target should be visible and populated (95%)
    const grossUpTarget = screen.getByTestId(
      'gross-up-target-input'
    ) as HTMLInputElement
    expect(grossUpTarget.value).toBe('95')
  })

  it('shows gross-up target when gross-up is enabled', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <ExpensePoolFormModal
        propertyId="prop-123"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    // Initially gross-up target should not be visible
    expect(
      screen.queryByTestId('gross-up-target-input')
    ).not.toBeInTheDocument()

    // Click the gross-up switch
    await user.click(screen.getByTestId('gross-up-switch'))

    // Now gross-up target should be visible
    await waitFor(() => {
      expect(screen.getByTestId('gross-up-target-input')).toBeInTheDocument()
    })
  })

  it('validates gross-up target when gross-up is enabled', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <ExpensePoolFormModal
        propertyId="prop-123"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.type(screen.getByTestId('pool-name-input'), 'Test Pool')
    await user.click(screen.getByTestId('gross-up-switch'))

    // Try to submit without gross-up target
    await user.click(screen.getByRole('button', { name: /Add Pool/i }))

    await waitFor(() => {
      expect(
        screen.getByText(/Gross-up target is required/i)
      ).toBeInTheDocument()
    })
  })

  it('calls update mutation in edit mode', async () => {
    const user = userEvent.setup()
    const mockMutate = vi.fn()
    vi.spyOn(hooks, 'useUpdateExpensePool').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never)

    renderWithProviders(
      <ExpensePoolFormModal
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    const nameInput = screen.getByTestId('pool-name-input')
    await user.clear(nameInput)
    await user.type(nameInput, 'Updated Utilities')
    await user.click(screen.getByRole('button', { name: /Update Pool/i }))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Updated Utilities',
        })
      )
    })
  })

  it('does not submit again while a save is already in flight', async () => {
    const mockMutate = vi.fn()
    vi.spyOn(hooks, 'useUpdateExpensePool').mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    } as never)
    renderWithProviders(
      <ExpensePoolFormModal
        propertyId="prop-123"
        pool={mockPool}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    // Wait for the edit-mode form.reset to populate the fields, so the submit
    // below passes schema validation and actually reaches onSubmit (and the
    // guard) — otherwise validation, not the guard, would block the mutation.
    await waitFor(() => {
      expect(
        (screen.getByTestId('pool-name-input') as HTMLInputElement).value
      ).toBe('Utilities')
    })

    // Fire a submit directly on the form to simulate the keyboard-Enter race the
    // disabled button cannot catch.
    const formEl = screen.getByTestId('pool-name-input').closest('form')
    expect(formEl).not.toBeNull()
    fireEvent.submit(formEl as HTMLFormElement)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('closes modal when cancel is clicked', async () => {
    const user = userEvent.setup()

    renderWithProviders(
      <ExpensePoolFormModal
        propertyId="prop-123"
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.click(screen.getByRole('button', { name: /Cancel/i }))

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })
})
