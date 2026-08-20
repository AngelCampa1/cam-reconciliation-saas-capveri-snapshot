/**
 * Tests for CalculateButton component.
 *
 * Validates calculate button functionality, loading states, and toasts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CalculateButton } from './CalculateButton'
import { toast } from 'sonner'

// Mock API hooks
const mockCalculateMutate = vi.fn()
const mockUseCalculateReconciliation = vi.fn()
const mockUseCalculationJobStatus = vi.fn()

vi.mock('@/api/hooks', () => ({
  useCalculateReconciliation: (options?: any) =>
    mockUseCalculateReconciliation(options),
  useCalculationJobStatus: (jobId: string | null, options?: any) =>
    mockUseCalculationJobStatus(jobId, options),
}))

// Mock toast from sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Test wrapper with QueryClientProvider
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('CalculateButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Note: Removed vi.useFakeTimers() because it breaks the polling hook

    // Default mock setup
    mockUseCalculateReconciliation.mockImplementation((options) => {
      return {
        mutate: mockCalculateMutate.mockImplementation(() => {
          // Immediately call onSuccess with mock job response
          options?.onSuccess?.({ job_id: 'job-123', status: 'pending' })
        }),
        isPending: false,
      }
    })

    mockUseCalculationJobStatus.mockReturnValue({
      data: undefined,
      isLoading: false,
    })
  })

  it('renders calculate button with icon', () => {
    render(
      <CalculateButton
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      { wrapper: createWrapper() }
    )

    expect(screen.getByText('Run reconciliation')).toBeInTheDocument()
  })

  it('triggers calculation with correct parameters when clicked', async () => {
    const user = userEvent.setup()

    render(
      <CalculateButton
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
        hasDraftData={false}
      />,
      { wrapper: createWrapper() }
    )

    const button = screen.getByText('Run reconciliation')
    await user.click(button)

    expect(mockCalculateMutate).toHaveBeenCalledWith({
      property_id: 'prop-1',
      period_start: '2024-01-01',
      period_end: '2024-12-31',
      force_recalculate: false,
    })
  })

  it('calls success callback when job completes', async () => {
    const user = userEvent.setup()
    const onCalculateSuccess = vi.fn()

    mockUseCalculationJobStatus.mockReturnValue({
      data: {
        status: 'completed',
        total_leases: 10,
      },
      isLoading: false,
    })

    render(
      <CalculateButton
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
        onCalculateSuccess={onCalculateSuccess}
      />,
      { wrapper: createWrapper() }
    )

    const button = screen.getByText('Run reconciliation')
    await user.click(button)

    await waitFor(() => {
      expect(onCalculateSuccess).toHaveBeenCalledWith(10)
    })
  })

  it('shows confirmation dialog when hasDraftData is true', async () => {
    const user = userEvent.setup()

    render(
      <CalculateButton
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
        hasDraftData={true}
      />,
      { wrapper: createWrapper() }
    )

    const button = screen.getByText('Run reconciliation')
    await user.click(button)

    expect(screen.getByText('Overwrite Existing Draft?')).toBeInTheDocument()
    expect(
      screen.getByText(
        /This will overwrite the existing draft reconciliation data/
      )
    ).toBeInTheDocument()
  })

  it('does not show confirmation dialog when hasDraftData is false', async () => {
    const user = userEvent.setup()

    render(
      <CalculateButton
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
        hasDraftData={false}
      />,
      { wrapper: createWrapper() }
    )

    const button = screen.getByText('Run reconciliation')
    await user.click(button)

    expect(
      screen.queryByText('Overwrite Existing Draft?')
    ).not.toBeInTheDocument()
  })

  it('triggers calculation when user confirms dialog', async () => {
    const user = userEvent.setup()
    const onCalculateSuccess = vi.fn()

    // Mock job status to return completed
    mockUseCalculationJobStatus.mockReturnValue({
      data: {
        status: 'completed',
        total_leases: 15,
      },
      isLoading: false,
    })

    render(
      <CalculateButton
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
        hasDraftData={true}
        onCalculateSuccess={onCalculateSuccess}
      />,
      { wrapper: createWrapper() }
    )

    const button = screen.getByText('Run reconciliation')
    await user.click(button)

    // Wait for dialog to appear before clicking Overwrite
    const overwriteButton = await screen.findByText('Overwrite')
    await user.click(overwriteButton)

    await waitFor(
      () => {
        expect(onCalculateSuccess).toHaveBeenCalledWith(15)
      },
      { timeout: 3000 }
    )
  })

  it('cancels calculation when user cancels confirmation', async () => {
    const user = userEvent.setup()
    const onCalculateSuccess = vi.fn()

    render(
      <CalculateButton
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
        hasDraftData={true}
        onCalculateSuccess={onCalculateSuccess}
      />,
      { wrapper: createWrapper() }
    )

    const button = screen.getByText('Run reconciliation')
    await user.click(button)

    const cancelButton = screen.getByText('Cancel')
    await user.click(cancelButton)

    // Wait a bit to ensure calculation doesn't start
    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(onCalculateSuccess).not.toHaveBeenCalled()
  })

  it('displays period dates in confirmation dialog', async () => {
    const user = userEvent.setup()

    render(
      <CalculateButton
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
        hasDraftData={true}
      />,
      { wrapper: createWrapper() }
    )

    const button = screen.getByText('Run reconciliation')
    await user.click(button)

    expect(screen.getByText(/Jan 1, 2024 to Dec 31, 2024/)).toBeInTheDocument()
  })

  it('is disabled when disabled prop is true', () => {
    render(
      <CalculateButton
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
        disabled={true}
      />,
      { wrapper: createWrapper() }
    )

    const button = screen.getByRole('button', { name: 'Run reconciliation' })
    expect(button).toBeDisabled()
  })

  it('calls onCalculateSuccess callback with tenant count', async () => {
    const user = userEvent.setup()
    const onCalculateSuccess = vi.fn()

    // Mock job status to return completed
    mockUseCalculationJobStatus.mockReturnValue({
      data: {
        status: 'completed',
        total_leases: 15,
      },
      isLoading: false,
    })

    render(
      <CalculateButton
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
        onCalculateSuccess={onCalculateSuccess}
      />,
      { wrapper: createWrapper() }
    )

    const button = screen.getByText('Run reconciliation')
    await user.click(button)

    await waitFor(
      () => {
        expect(onCalculateSuccess).toHaveBeenCalledWith(15)
      },
      { timeout: 2000 }
    )
  })

  // Pre-flight validation tests
  describe('pre-flight validation', () => {
    it('shows warning dialog when unmapped pools exist', async () => {
      const user = userEvent.setup()

      render(
        <CalculateButton
          propertyId="prop-1"
          periodStart="2024-01-01"
          periodEnd="2024-12-31"
          unmappedPools={[
            { id: 'pool-1', name: 'CAM' },
            { id: 'pool-2', name: 'Insurance' },
          ]}
        />,
        { wrapper: createWrapper() }
      )

      const button = screen.getByText('Run reconciliation')
      await user.click(button)

      expect(
        screen.getByText(/Missing GL Account Mappings/i)
      ).toBeInTheDocument()
      expect(screen.getByText(/CAM/)).toBeInTheDocument()
      expect(screen.getByText(/Insurance/)).toBeInTheDocument()
    })

    it('allows user to proceed anyway after warning', async () => {
      const user = userEvent.setup()

      mockUseCalculationJobStatus.mockReturnValue({
        data: { status: 'completed', total_leases: 5 },
        isLoading: false,
      })

      render(
        <CalculateButton
          propertyId="prop-1"
          periodStart="2024-01-01"
          periodEnd="2024-12-31"
          unmappedPools={[{ id: 'pool-1', name: 'CAM' }]}
        />,
        { wrapper: createWrapper() }
      )

      const button = screen.getByText('Run reconciliation')
      await user.click(button)

      // Click "Run without these pools"
      const proceedButton = await screen.findByText('Run without these pools')
      await user.click(proceedButton)

      await waitFor(() => {
        expect(mockCalculateMutate).toHaveBeenCalled()
      })
    })

    it('allows user to cancel and fix mappings', async () => {
      const user = userEvent.setup()
      const onFixMappings = vi.fn()

      render(
        <CalculateButton
          propertyId="prop-1"
          periodStart="2024-01-01"
          periodEnd="2024-12-31"
          unmappedPools={[{ id: 'pool-1', name: 'CAM' }]}
          onFixMappings={onFixMappings}
        />,
        { wrapper: createWrapper() }
      )

      const button = screen.getByText('Run reconciliation')
      await user.click(button)

      // Click "Fix Mappings"
      const fixButton = await screen.findByText('Fix Mappings')
      await user.click(fixButton)

      expect(onFixMappings).toHaveBeenCalled()
      expect(mockCalculateMutate).not.toHaveBeenCalled()
    })

    it('proceeds directly when all pools have mappings', async () => {
      const user = userEvent.setup()

      mockUseCalculationJobStatus.mockReturnValue({
        data: { status: 'completed', total_leases: 5 },
        isLoading: false,
      })

      render(
        <CalculateButton
          propertyId="prop-1"
          periodStart="2024-01-01"
          periodEnd="2024-12-31"
          unmappedPools={[]} // No unmapped pools
        />,
        { wrapper: createWrapper() }
      )

      const button = screen.getByText('Run reconciliation')
      await user.click(button)

      // Should NOT show warning dialog
      expect(
        screen.queryByText(/Missing GL Account Mappings/i)
      ).not.toBeInTheDocument()

      // Should proceed directly to calculation
      await waitFor(() => {
        expect(mockCalculateMutate).toHaveBeenCalled()
      })
    })
  })

  it('re-enables button after successful calculation', async () => {
    const user = userEvent.setup()

    mockUseCalculationJobStatus.mockImplementation((jobId) => {
      return {
        data: jobId
          ? {
              status: 'completed',
              total_leases: 15,
            }
          : undefined,
        isLoading: false,
      }
    })

    render(
      <CalculateButton
        propertyId="prop-1"
        periodStart="2024-01-01"
        periodEnd="2024-12-31"
      />,
      { wrapper: createWrapper() }
    )

    const button = screen.getByText('Run reconciliation')
    await user.click(button)

    await waitFor(
      () => {
        expect(
          screen.getByRole('button', { name: 'Run reconciliation' })
        ).toBeEnabled()
      },
      { timeout: 3000 }
    )
  })
})
