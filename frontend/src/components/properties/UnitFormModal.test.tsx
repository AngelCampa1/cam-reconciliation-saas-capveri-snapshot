/**
 * UnitFormModal Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UnitFormModal } from './UnitFormModal'
import * as hooks from '@/api/hooks'
import type { Unit } from '@/api/client'

const mockUnit: Unit = {
  id: 'unit-1',
  property_id: 'prop-123',
  unit_number: '101',
  rentable_sqft: '1000',
  usable_sqft: '900',
  is_active: true,
  organization_id: 'org-123',
  created_at: '2024-01-15T10:00:00Z',
  updated_at: '2024-01-15T10:00:00Z',
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

describe('UnitFormModal', () => {
  const mockOnOpenChange = vi.fn()

  beforeEach(() => {
    mockOnOpenChange.mockClear()
    vi.spyOn(hooks, 'useCreateUnit').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
    vi.spyOn(hooks, 'useUpdateUnit').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never)
  })

  it('renders create mode', () => {
    renderWithProviders(
      <UnitFormModal
        propertyId="prop-123"
        unit={null}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'Add Unit' })
    ).toBeInTheDocument()
  })

  it('renders edit mode', () => {
    renderWithProviders(
      <UnitFormModal
        propertyId="prop-123"
        unit={mockUnit}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )
    expect(
      screen.getByRole('heading', { name: 'Edit Unit' })
    ).toBeInTheDocument()
  })

  it('validates required fields', async () => {
    const user = userEvent.setup()
    renderWithProviders(
      <UnitFormModal
        propertyId="prop-123"
        unit={null}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )
    await user.click(screen.getByRole('button', { name: /Add Unit/i }))
    await waitFor(() => {
      expect(screen.getByText(/Unit number is required/i)).toBeInTheDocument()
    })
  })

  it('calls create mutation', async () => {
    const user = userEvent.setup()
    const mockMutate = vi.fn()
    vi.spyOn(hooks, 'useCreateUnit').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never)
    renderWithProviders(
      <UnitFormModal
        propertyId="prop-123"
        unit={null}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )
    await user.type(screen.getByTestId('unit-number-input'), '105')
    await user.type(screen.getByTestId('rentable-sqft-input'), '1200')
    await user.click(screen.getByRole('button', { name: /Add Unit/i }))
    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalled()
    })
  })

  it('shows loading state', () => {
    vi.spyOn(hooks, 'useCreateUnit').mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    } as never)
    renderWithProviders(
      <UnitFormModal
        propertyId="prop-123"
        unit={null}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )
    expect(screen.getByRole('button', { name: /Creating/i })).toBeDisabled()
  })

  it('calls update mutation in edit mode', async () => {
    const user = userEvent.setup()
    const mockMutate = vi.fn()
    vi.spyOn(hooks, 'useUpdateUnit').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never)
    renderWithProviders(
      <UnitFormModal
        propertyId="prop-123"
        unit={mockUnit}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    const unitInput = screen.getByTestId('unit-number-input')
    await user.clear(unitInput)
    await user.type(unitInput, '102')
    await user.click(screen.getByRole('button', { name: /Update Unit/i }))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalled()
    })
  })

  it('does not submit again while a save is already in flight', async () => {
    const mockMutate = vi.fn()
    vi.spyOn(hooks, 'useUpdateUnit').mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    } as never)
    renderWithProviders(
      <UnitFormModal
        propertyId="prop-123"
        unit={mockUnit}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    // Wait for the edit-mode form.reset to populate the fields, so the submit
    // below passes schema validation and actually reaches onSubmit (and the
    // guard) — otherwise validation, not the guard, would block the mutation.
    await waitFor(() => {
      expect(
        (screen.getByTestId('unit-number-input') as HTMLInputElement).value
      ).toBe('101')
    })

    // Fire a submit directly on the form to simulate the keyboard-Enter race the
    // disabled button cannot catch.
    const formEl = screen.getByTestId('unit-number-input').closest('form')
    expect(formEl).not.toBeNull()
    fireEvent.submit(formEl as HTMLFormElement)

    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mockMutate).not.toHaveBeenCalled()
  })

  it('populates form with unit data in edit mode', () => {
    renderWithProviders(
      <UnitFormModal
        propertyId="prop-123"
        unit={mockUnit}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    const unitInput = screen.getByTestId(
      'unit-number-input'
    ) as HTMLInputElement
    const rentableInput = screen.getByTestId(
      'rentable-sqft-input'
    ) as HTMLInputElement

    expect(unitInput.value).toBe('101')
    expect(rentableInput.value).toBe('1000')
  })

  it('defaults usable sqft to rentable sqft when not provided', async () => {
    const user = userEvent.setup()
    const mockMutate = vi.fn()
    vi.spyOn(hooks, 'useCreateUnit').mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as never)
    renderWithProviders(
      <UnitFormModal
        propertyId="prop-123"
        unit={null}
        open={true}
        onOpenChange={mockOnOpenChange}
      />
    )

    await user.type(screen.getByTestId('unit-number-input'), '201')
    await user.type(screen.getByTestId('rentable-sqft-input'), '1500')
    // Usable sqft left empty
    await user.click(screen.getByRole('button', { name: /Add Unit/i }))

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          unit_number: '201',
          rentable_sqft: '1500',
          usable_sqft: '1500', // Defaulted to rentable
        })
      )
    })
  })
})
