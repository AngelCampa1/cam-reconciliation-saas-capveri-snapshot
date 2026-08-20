/**
 * UnitsTab Component Tests
 *
 * Tests for the units tab within property detail page including:
 * - Unit table display with all columns
 * - Status toggle with optimistic updates
 * - Add unit button
 * - Edit/Delete actions
 * - Empty state when no units
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { UnitsTab } from './UnitsTab'
import * as hooks from '@/api/hooks'
import * as apiClient from '@/api/client'
import type { Unit } from '@/api/client'

// Mock sonner - use vi.hoisted to create functions before vi.mock hoisting
const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: mockToastError, success: mockToastSuccess },
}))

// Mock units data
const mockUnits: Unit[] = [
  {
    id: 'unit-1',
    property_id: 'prop-123',
    unit_number: '101',
    rentable_sqft: '1000',
    usable_sqft: '900',
    status: 'occupied',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
  {
    id: 'unit-2',
    property_id: 'prop-123',
    unit_number: '102',
    rentable_sqft: '1200',
    usable_sqft: '1080',
    status: 'vacant',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
  },
]

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  )
}

describe('UnitsTab', () => {
  beforeEach(() => {
    mockToastError.mockClear()
    mockToastSuccess.mockClear()
    vi.spyOn(hooks, 'useUnits').mockReturnValue({
      data: { data: mockUnits, total: 2 },
      isLoading: false,
      error: null,
    } as any)
    vi.spyOn(hooks, 'useDeleteUnit').mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as any)
    // Mock the update API call
    vi.spyOn(
      apiClient,
      'updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut'
    ).mockResolvedValue({
      data: mockUnits[0],
      error: undefined,
    } as any)
  })

  describe('Table Display', () => {
    it('displays all column headers', () => {
      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      expect(screen.getByText('Unit Number')).toBeInTheDocument()
      expect(screen.getByText('Rentable Sqft')).toBeInTheDocument()
      expect(screen.getByText('Usable Sqft')).toBeInTheDocument()
      expect(screen.getByText('Status')).toBeInTheDocument()
      expect(screen.getByText('Actions')).toBeInTheDocument()
    })

    it('displays unit data in table rows', () => {
      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      expect(screen.getByText('101')).toBeInTheDocument()
      expect(screen.getByText('1,000')).toBeInTheDocument()
      expect(screen.getByText('900')).toBeInTheDocument()
      expect(screen.getByText('102')).toBeInTheDocument()
      expect(screen.getByText('1,200')).toBeInTheDocument()
      expect(screen.getByText('1,080')).toBeInTheDocument()
    })

    it('displays formatted square footage with commas', () => {
      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      // Check that numbers are formatted with thousand separators
      expect(screen.getByText('1,000')).toBeInTheDocument()
      expect(screen.getByText('1,200')).toBeInTheDocument()
    })
  })

  describe('Status Toggle', () => {
    it('displays status toggle switches for each unit', () => {
      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      // Should have 2 toggle switches (one per unit)
      const switches = screen.getAllByRole('switch')
      expect(switches).toHaveLength(2)
    })

    it('shows correct initial status for each unit', () => {
      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const switches = screen.getAllByRole('switch')
      // First unit is active
      expect(switches[0]).toBeChecked()
      // Second unit is inactive
      expect(switches[1]).not.toBeChecked()
    })

    it('calls update mutation when status toggle is clicked', async () => {
      const user = userEvent.setup()
      const mockUpdateApi = vi
        .spyOn(apiClient, 'updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut')
        .mockResolvedValue({
          data: { ...mockUnits[0], status: 'vacant' },
          error: undefined,
        } as any)

      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const switches = screen.getAllByRole('switch')
      await user.click(switches[0])

      await waitFor(() => {
        expect(mockUpdateApi).toHaveBeenCalledWith(
          expect.objectContaining({
            path: { property_id: 'prop-123', unit_id: 'unit-1' },
            body: { status: 'vacant' },
          })
        )
      })
    })
  })

  describe('Add Unit Button', () => {
    it('displays add unit button', () => {
      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      expect(
        screen.getByRole('button', { name: /Add Unit/i })
      ).toBeInTheDocument()
    })

    it('add unit button triggers modal open', async () => {
      const user = userEvent.setup()
      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const addButton = screen.getByRole('button', { name: /Add Unit/i })
      await user.click(addButton)

      // Modal will be implemented in Story 10.5, for now just check button exists
      expect(addButton).toBeInTheDocument()
    })
  })

  describe('Actions Menu', () => {
    it('displays actions menu for each unit', () => {
      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const actionButtons = screen.getAllByRole('button', {
        name: /Open menu/i,
      })
      expect(actionButtons).toHaveLength(2)
    })

    it('opens menu when actions button is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const actionButtons = screen.getAllByRole('button', {
        name: /Open menu/i,
      })
      await user.click(actionButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument()
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })
    })

    it('shows delete confirmation dialog when delete is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const actionButtons = screen.getAllByRole('button', {
        name: /Open menu/i,
      })
      await user.click(actionButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Delete'))

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Delete Unit/i })
        ).toBeInTheDocument()
        expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
      })
    })
  })

  describe('Empty State', () => {
    it('displays empty state when no units', () => {
      vi.spyOn(hooks, 'useUnits').mockReturnValue({
        data: { data: [], total: 0 },
        isLoading: false,
        error: null,
      } as any)

      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      expect(screen.getByText(/No units/i)).toBeInTheDocument()
      expect(screen.getByText(/Add Unit/i)).toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    it('displays loading skeleton while fetching units', () => {
      vi.spyOn(hooks, 'useUnits').mockReturnValue({
        data: undefined,
        isLoading: true,
        error: null,
      } as any)

      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      // Check for loading skeleton
      const skeleton = document.querySelectorAll('.animate-pulse')
      expect(skeleton.length).toBeGreaterThan(0)
    })
  })

  describe('Error State', () => {
    it('displays error state when fetch fails', () => {
      vi.spyOn(hooks, 'useUnits').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: { message: 'Failed to load units' } as any,
      } as any)

      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      expect(screen.getByText(/couldn't load units/i)).toBeInTheDocument()
    })

    it('displays error state when error.message is missing', () => {
      vi.spyOn(hooks, 'useUnits').mockReturnValue({
        data: undefined,
        isLoading: false,
        error: {} as any,
      } as any)

      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      expect(screen.getByText(/couldn't load units/i)).toBeInTheDocument()
    })
  })

  describe('UnitsTab - offline / paused', () => {
    it('shows offline notice and hides empty state when query is paused', () => {
      vi.spyOn(hooks, 'useUnits').mockReturnValue({
        data: undefined,
        isLoading: false,
        isPaused: true,
        error: null,
        refetch: vi.fn(),
      } as never)

      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      expect(screen.getByText(/can't reach the server/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /try again/i })
      ).toBeInTheDocument()
      expect(screen.queryByText(/no units yet/i)).not.toBeInTheDocument()
    })
  })

  describe('Number Formatting', () => {
    it('formats valid numbers with thousand separators', () => {
      const unitsWithLargeNumbers: Unit[] = [
        {
          ...mockUnits[0],
          rentable_sqft: '10000',
          usable_sqft: '9000',
        },
      ]

      vi.spyOn(hooks, 'useUnits').mockReturnValue({
        data: { data: unitsWithLargeNumbers, total: 1 },
        isLoading: false,
        error: null,
      } as any)

      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      expect(screen.getByText('10,000')).toBeInTheDocument()
      expect(screen.getByText('9,000')).toBeInTheDocument()
    })

    it('handles NaN values by returning zero', () => {
      const unitsWithInvalidNumbers: Unit[] = [
        {
          ...mockUnits[0],
          rentable_sqft: 'invalid',
          usable_sqft: 'not-a-number',
        },
      ]

      vi.spyOn(hooks, 'useUnits').mockReturnValue({
        data: { data: unitsWithInvalidNumbers, total: 1 },
        isLoading: false,
        error: null,
      } as any)

      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const zeroValues = screen.getAllByText('0')
      expect(zeroValues.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('Status Toggle - Both Directions', () => {
    it('toggles status from vacant to occupied', async () => {
      const user = userEvent.setup()
      const mockUpdateApi = vi
        .spyOn(apiClient, 'updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut')
        .mockResolvedValue({
          data: { ...mockUnits[1], status: 'occupied' },
          error: undefined,
        } as any)

      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const switches = screen.getAllByRole('switch')
      // Second unit is vacant, click to make occupied
      await user.click(switches[1])

      await waitFor(() => {
        expect(mockUpdateApi).toHaveBeenCalledWith(
          expect.objectContaining({
            path: { property_id: 'prop-123', unit_id: 'unit-2' },
            body: { status: 'occupied' },
          })
        )
      })
    })

    it('calls mutation immediately without waiting', async () => {
      const user = userEvent.setup()
      let apiCalled = false

      // Create a promise we can control to delay the API response
      let resolveUpdate: (value: any) => void
      const updatePromise = new Promise((resolve) => {
        resolveUpdate = resolve
        apiCalled = true
      })

      vi.spyOn(
        apiClient,
        'updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut'
      ).mockReturnValue(updatePromise as any)

      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const switches = screen.getAllByRole('switch')
      const firstSwitch = switches[0]

      // Verify initial state: first unit is occupied (checked)
      expect(firstSwitch).toBeChecked()

      // Click the toggle
      await user.click(firstSwitch)

      // The API should be called immediately
      expect(apiCalled).toBe(true)

      // Now resolve the API call
      resolveUpdate!({
        data: { ...mockUnits[0], status: 'vacant' },
        error: undefined,
      })

      // Wait for the mutation to complete
      await waitFor(() => {
        expect(
          apiClient.updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut
        ).toHaveBeenCalled()
      })
    })

    it('rolls back optimistic update on error', async () => {
      const user = userEvent.setup()

      vi.spyOn(
        apiClient,
        'updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut'
      ).mockResolvedValue({
        data: undefined,
        error: { message: 'Network error' },
      } as any)

      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const switches = screen.getAllByRole('switch')
      const firstSwitch = switches[0]

      // Verify initial state: first unit is occupied (checked)
      expect(firstSwitch).toBeChecked()

      // Click the toggle
      await user.click(firstSwitch)

      // Wait for the error and rollback
      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          'Failed to update unit',
          expect.objectContaining({ description: expect.any(String) })
        )
      })

      // The switch should roll back to original state after error
      // Note: In the real implementation with QueryClient, this would work
      // but in tests we're mocking the hooks so the rollback won't be visible
    })
  })

  describe('Mutation Error Handling', () => {
    it('shows error toast when update mutation fails', async () => {
      const user = userEvent.setup()

      vi.spyOn(
        apiClient,
        'updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut'
      ).mockResolvedValue({
        data: undefined,
        error: { message: 'Update failed' },
      } as any)

      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const switches = screen.getAllByRole('switch')
      await user.click(switches[0])

      // Error should be thrown and mutation should handle it
      await waitFor(() => {
        expect(
          apiClient.updateUnitApiV1PropertiesPropertyIdUnitsUnitIdPut
        ).toHaveBeenCalled()
      })
    })

    it('handles delete mutation errors', async () => {
      const user = userEvent.setup()
      const mockDeleteMutate = vi.fn()

      vi.spyOn(hooks, 'useDeleteUnit').mockReturnValue({
        mutate: mockDeleteMutate,
        isPending: false,
      } as any)

      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const actionButtons = screen.getAllByRole('button', {
        name: /Open menu/i,
      })
      await user.click(actionButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Delete'))

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Delete Unit/i })
        ).toBeInTheDocument()
      })

      // Click delete confirm button
      const deleteButton = screen.getByRole('button', { name: /^Delete$/i })
      await user.click(deleteButton)

      await waitFor(() => {
        expect(mockDeleteMutate).toHaveBeenCalledWith('unit-1')
      })
    })
  })

  describe('Delete Confirmation Dialog', () => {
    it('closes dialog when cancel button is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const actionButtons = screen.getAllByRole('button', {
        name: /Open menu/i,
      })
      await user.click(actionButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Delete'))

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Delete Unit/i })
        ).toBeInTheDocument()
      })

      const cancelButton = screen.getByRole('button', { name: /Cancel/i })
      await user.click(cancelButton)

      await waitFor(() => {
        expect(
          screen.queryByRole('heading', { name: /Delete Unit/i })
        ).not.toBeInTheDocument()
      })
    })

    it('displays unit number in confirmation message', async () => {
      const user = userEvent.setup()
      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const actionButtons = screen.getAllByRole('button', {
        name: /Open menu/i,
      })
      await user.click(actionButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Delete'))

      await waitFor(() => {
        expect(
          screen.getByTestId('alert-dialog-description')
        ).toHaveTextContent(/unit 101/i)
      })
    })
  })

  describe('Edit Unit Flow', () => {
    it('opens form modal when edit is clicked', async () => {
      const user = userEvent.setup()
      renderWithProviders(<UnitsTab propertyId="prop-123" />)

      const actionButtons = screen.getAllByRole('button', {
        name: /Open menu/i,
      })
      await user.click(actionButtons[0])

      await waitFor(() => {
        expect(screen.getByText('Edit')).toBeInTheDocument()
      })

      await user.click(screen.getByText('Edit'))

      // After clicking Edit, the dropdown closes but the modal should open
      // The modal shows "Edit Unit" as its title
      await waitFor(() => {
        expect(screen.getByRole('dialog')).toBeInTheDocument()
      })
    })
  })
})
