/**
 * Tests for FinalizeButton component.
 *
 * Validates finalize button functionality and modal integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { FinalizeButton } from './FinalizeButton'
import { toast } from 'sonner'
import type { SnapshotSummary } from './FinalizeModal'

// Mock API hook
const mockFinalizeMutate = vi.fn()
const mockUseFinalizeSnapshots = vi.fn()

// Shared mutation state object (can be mutated by tests)
const mutationState = {
  isPending: false,
  mutate: vi.fn(),
}

vi.mock('@/api/hooks', () => ({
  useFinalizeSnapshots: (options?: any) => mockUseFinalizeSnapshots(options),
}))

// Mock toast from sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Create wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    )
  }
}

const mockSnapshot: SnapshotSummary = {
  period: '2024-01-01 to 2024-12-31',
  tenantCount: 15,
  totalBillable: 125000.5,
}

describe('FinalizeButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset mutation state
    mutationState.isPending = false

    // Default mock setup - simulate mutation that calls onSuccess
    mockUseFinalizeSnapshots.mockImplementation((options) => {
      mutationState.mutate = vi.fn(
        async (params: {
          property_id: string
          period_start: string
          period_end: string
        }) => {
          mockFinalizeMutate(params)
          // Simulate mutation lifecycle: pending -> success
          mutationState.isPending = true
          // Wait for next tick to allow component to re-render with pending state
          await Promise.resolve()
          // Complete mutation - set isPending false BEFORE calling onSuccess
          // so when onSuccess triggers re-renders, component sees correct state
          mutationState.isPending = false
          await Promise.resolve() // Allow one more tick for state to settle
          // Return results with success count matching the new API format
          options?.onSuccess?.({ results: [{ success: true }] })
        }
      )
      return mutationState
    })
  })

  it('renders finalize button with icon', () => {
    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      {
        wrapper: createWrapper(),
      }
    )

    expect(screen.getByText('Finalize')).toBeInTheDocument()
  })

  it('is disabled when hasDraftData is false', () => {
    render(
      <FinalizeButton
        hasDraftData={false}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      {
        wrapper: createWrapper(),
      }
    )

    const button = screen.getByRole('button', { name: 'Finalize' })
    expect(button).toBeDisabled()
  })

  it('is enabled when hasDraftData is true', () => {
    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      {
        wrapper: createWrapper(),
      }
    )

    const button = screen.getByRole('button', { name: 'Finalize' })
    expect(button).not.toBeDisabled()
  })

  it('is disabled when disabled prop is true', () => {
    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
        disabled={true}
      />,
      { wrapper: createWrapper() }
    )

    const button = screen.getByRole('button', { name: 'Finalize' })
    expect(button).toBeDisabled()
  })

  it('opens confirmation modal when clicked', async () => {
    const user = userEvent.setup()

    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      {
        wrapper: createWrapper(),
      }
    )

    const button = screen.getByText('Finalize')
    await user.click(button)

    expect(screen.getByText('Finalize Reconciliation?')).toBeInTheDocument()
  })

  it('does not open modal when button is disabled', async () => {
    const user = userEvent.setup()

    render(
      <FinalizeButton
        hasDraftData={false}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      {
        wrapper: createWrapper(),
      }
    )

    const button = screen.getByText('Finalize')
    await user.click(button)

    expect(
      screen.queryByText('Finalize Reconciliation?')
    ).not.toBeInTheDocument()
  })

  it('closes modal when cancel is clicked', async () => {
    const user = userEvent.setup()

    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      {
        wrapper: createWrapper(),
      }
    )

    const button = screen.getByText('Finalize')
    await user.click(button)

    const cancelButton = screen.getByText('Cancel')
    await user.click(cancelButton)

    expect(
      screen.queryByText('Finalize Reconciliation?')
    ).not.toBeInTheDocument()
  })

  it('shows loading state during finalization', async () => {
    const user = userEvent.setup()

    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      {
        wrapper: createWrapper(),
      }
    )

    const button = screen.getByText('Finalize')
    await user.click(button)

    const confirmButton = screen.getAllByText('Finalize')[1] // Second instance is in modal
    await user.click(confirmButton)

    expect(screen.getByText('Finalizing…')).toBeInTheDocument()
  })

  it('disables button during finalization', async () => {
    const user = userEvent.setup()

    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      {
        wrapper: createWrapper(),
      }
    )

    const button = screen.getByText('Finalize')
    await user.click(button)

    const confirmButton = screen.getAllByText('Finalize')[1]
    await user.click(confirmButton)

    const finalizingButton = screen.getByRole('button', {
      name: /finalizing/i,
    })
    expect(finalizingButton).toBeDisabled()
  })

  it('shows success toast after finalization completes', async () => {
    const user = userEvent.setup()

    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      {
        wrapper: createWrapper(),
      }
    )

    const button = screen.getByText('Finalize')
    await user.click(button)

    const confirmButton = screen.getAllByText('Finalize')[1]
    await user.click(confirmButton)

    await waitFor(
      () => {
        expect(toast.success).toHaveBeenCalledWith('Reconciliation finalized', {
          description:
            'Successfully locked 1 snapshot(s) for 2024-01-01 to 2024-12-31',
        })
      },
      { timeout: 2000 }
    )
  })

  it('calls onFinalizeSuccess callback after finalization', async () => {
    const user = userEvent.setup()
    const onFinalizeSuccess = vi.fn()

    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
        onFinalizeSuccess={onFinalizeSuccess}
      />,
      { wrapper: createWrapper() }
    )

    const button = screen.getByText('Finalize')
    await user.click(button)

    const confirmButton = screen.getAllByText('Finalize')[1]
    await user.click(confirmButton)

    await waitFor(
      () => {
        expect(onFinalizeSuccess).toHaveBeenCalledTimes(1)
      },
      { timeout: 2000 }
    )
  })

  it('re-enables button after successful finalization', async () => {
    const user = userEvent.setup()

    function FinalizeHarness() {
      const [, rerenderAfterSuccess] = React.useState(0)

      return (
        <FinalizeButton
          hasDraftData={true}
          snapshot={mockSnapshot}
          propertyId="prop-1"
          periodStart="2024-01-01"
          periodEnd="2024-12-31"
          onFinalizeSuccess={() => rerenderAfterSuccess((value) => value + 1)}
        />
      )
    }

    render(<FinalizeHarness />, { wrapper: createWrapper() })

    const button = screen.getByText('Finalize')
    await user.click(button)

    const confirmButton = screen.getAllByText('Finalize')[1]
    await user.click(confirmButton)

    await waitFor(
      () => {
        expect(screen.getByRole('button', { name: 'Finalize' })).toBeEnabled()
      },
      { timeout: 2000 }
    )
  })

  it('does not finalize again when a finalization is already in flight', async () => {
    const user = userEvent.setup()

    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      {
        wrapper: createWrapper(),
      }
    )

    // Open the confirmation modal.
    await user.click(screen.getByText('Finalize'))
    expect(screen.getByText('Finalize Reconciliation?')).toBeInTheDocument()

    // Simulate a finalize already in flight, then confirm. The guard must keep
    // the irreversible mutation from firing a second time.
    mutationState.isPending = true
    await user.click(screen.getByTestId('alert-dialog-action'))

    expect(mockFinalizeMutate).not.toHaveBeenCalled()
  })

  it('does not call onFinalizeSuccess when modal is cancelled', async () => {
    const user = userEvent.setup()
    const onFinalizeSuccess = vi.fn()

    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
        onFinalizeSuccess={onFinalizeSuccess}
      />,
      { wrapper: createWrapper() }
    )

    const button = screen.getByText('Finalize')
    await user.click(button)

    const cancelButton = screen.getByText('Cancel')
    await user.click(cancelButton)

    // Wait a bit to ensure finalization doesn't start
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(onFinalizeSuccess).not.toHaveBeenCalled()
  })

  it('displays snapshot period in modal', async () => {
    const user = userEvent.setup()

    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      {
        wrapper: createWrapper(),
      }
    )

    const button = screen.getByText('Finalize')
    await user.click(button)

    expect(screen.getByText(/2024-01-01 to 2024-12-31/)).toBeInTheDocument()
  })

  it('displays tenant count in modal summary', async () => {
    const user = userEvent.setup()

    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      {
        wrapper: createWrapper(),
      }
    )

    const button = screen.getByText('Finalize')
    await user.click(button)

    expect(screen.getByText('15 tenants')).toBeInTheDocument()
  })

  it('displays total billable in modal summary', async () => {
    const user = userEvent.setup()

    render(
      <FinalizeButton
        hasDraftData={true}
        snapshot={mockSnapshot}
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      {
        wrapper: createWrapper(),
      }
    )

    const button = screen.getByText('Finalize')
    await user.click(button)

    expect(screen.getByText('$125,000.50')).toBeInTheDocument()
  })
})
