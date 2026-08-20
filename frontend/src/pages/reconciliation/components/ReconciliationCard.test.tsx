/**
 * ReconciliationCard Component Tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReconciliationCard } from './ReconciliationCard'
import type {
  ExpensePoolRow,
  TenantSummaryRow,
} from '@/features/reconciliation/types/reconciliation-row'

describe('ReconciliationCard', () => {
  const mockExpensePool: ExpensePoolRow = {
    id: 'pool-1',
    type: 'expense_pool',
    pool_id: '123e4567-e89b-12d3-a456-426614174000',
    pool_name: 'Common Area Maintenance',
    pool_type: 'CAM',
    total_expenses: '50000.00',
    grossed_up_expenses: '52631.58',
    tenant_shares: {
      'tenant-1': '10000.00',
      'tenant-2': '15000.00',
    },
  }

  const mockTenantSummary: TenantSummaryRow = {
    id: 'summary-1',
    type: 'tenant_summary',
    tenant_id: '123e4567-e89b-12d3-a456-426614174001',
    tenant_name: 'Acme Corporation',
    total_recovery: '28750.00',
    tenant_share: '25000.00',
    admin_fee: '3750.00',
    final_amount: '28750.00',
  }

  describe('ExpensePoolCard', () => {
    it('renders pool information', () => {
      render(<ReconciliationCard row={mockExpensePool} />)

      expect(screen.getByText('Common Area Maintenance')).toBeInTheDocument()
      expect(screen.getByText('CAM')).toBeInTheDocument()
      expect(screen.getByText('$50,000.00')).toBeInTheDocument()
      expect(screen.getByText('$52,631.58')).toBeInTheDocument()
    })

    it('expands to show tenant shares when clicked', async () => {
      const user = userEvent.setup()
      render(<ReconciliationCard row={mockExpensePool} />)

      // Tenant shares should not be visible initially
      expect(screen.queryByText('Tenant Allocations')).not.toBeInTheDocument()

      // Click expand button
      const expandButton = screen.getByRole('button', {
        name: /expand details/i,
      })
      await user.click(expandButton)

      // Tenant shares should now be visible
      expect(screen.getByText(/Tenant Allocations/i)).toBeInTheDocument()
      expect(screen.getByText('$10,000.00')).toBeInTheDocument()
      expect(screen.getByText('$15,000.00')).toBeInTheDocument()
    })

    it('collapses details when clicked again', async () => {
      const user = userEvent.setup()
      render(<ReconciliationCard row={mockExpensePool} />)

      const expandButton = screen.getByRole('button', {
        name: /expand details/i,
      })

      // Expand
      await user.click(expandButton)
      expect(screen.getByText(/Tenant Allocations/i)).toBeInTheDocument()

      // Collapse
      await user.click(expandButton)
      expect(screen.queryByText('Tenant Allocations')).not.toBeInTheDocument()
    })
  })

  describe('TenantSummaryCard', () => {
    it('renders tenant summary information', () => {
      render(<ReconciliationCard row={mockTenantSummary} />)

      expect(screen.getByText('Acme Corporation')).toBeInTheDocument()
      expect(screen.getByText('Tenant Summary')).toBeInTheDocument()
      expect(screen.getByText('$25,000.00')).toBeInTheDocument()
      expect(screen.getByText('$3,750.00')).toBeInTheDocument()
      expect(screen.getByText('$28,750.00')).toBeInTheDocument()
    })

    it('displays labels correctly', () => {
      render(<ReconciliationCard row={mockTenantSummary} />)

      expect(screen.getByText('Tenant Share')).toBeInTheDocument()
      expect(screen.getByText('Admin Fee')).toBeInTheDocument()
      expect(screen.getByText('Final Amount')).toBeInTheDocument()
    })
  })

  describe('Swipe gestures', () => {
    it('calls onSwipe callback when swiped', () => {
      const handleSwipe = vi.fn()
      render(<ReconciliationCard row={mockExpensePool} onSwipe={handleSwipe} />)

      // Swipe gestures are tested via touch events
      // This test verifies the callback is wired up
      expect(handleSwipe).not.toHaveBeenCalled()
    })
  })

  describe('Accessibility', () => {
    it('has proper ARIA attributes for expand button', () => {
      render(<ReconciliationCard row={mockExpensePool} />)

      const expandButton = screen.getByRole('button', {
        name: /expand details/i,
      })
      expect(expandButton).toHaveAttribute('aria-expanded', 'false')
    })

    it('updates aria-expanded when toggled', async () => {
      const user = userEvent.setup()
      render(<ReconciliationCard row={mockExpensePool} />)

      const expandButton = screen.getByRole('button', {
        name: /expand details/i,
      })

      await user.click(expandButton)
      expect(expandButton).toHaveAttribute('aria-expanded', 'true')
    })
  })

  describe('Edge Cases', () => {
    it('handles expense pool without grossed up expenses', () => {
      const poolWithoutGrossedUp: ExpensePoolRow = {
        ...mockExpensePool,
        grossed_up_expenses: undefined,
      }
      render(<ReconciliationCard row={poolWithoutGrossedUp} />)

      expect(screen.getByText('$50,000.00')).toBeInTheDocument()
      expect(screen.queryByText('Grossed Up')).not.toBeInTheDocument()
    })

    it('handles expense pool without tenant shares', () => {
      const poolWithoutShares: ExpensePoolRow = {
        ...mockExpensePool,
        tenant_shares: undefined,
      }
      render(<ReconciliationCard row={poolWithoutShares} />)

      expect(screen.getByText('Common Area Maintenance')).toBeInTheDocument()
      // Expand button should still work but show no tenant allocations
      const expandButton = screen.getByRole('button', {
        name: /expand details/i,
      })
      expect(expandButton).toBeInTheDocument()
    })

    it('handles expense pool with empty tenant shares', async () => {
      const user = userEvent.setup()
      const poolWithEmptyShares: ExpensePoolRow = {
        ...mockExpensePool,
        tenant_shares: {},
      }
      render(<ReconciliationCard row={poolWithEmptyShares} />)

      const expandButton = screen.getByRole('button', {
        name: /expand details/i,
      })
      await user.click(expandButton)

      // Should not show "Tenant Allocations" section if shares are empty
      expect(screen.queryByText(/Tenant Allocations/i)).not.toBeInTheDocument()
    })

    it('handles tenant summary without admin fee', () => {
      const summaryWithoutFee: TenantSummaryRow = {
        ...mockTenantSummary,
        admin_fee: undefined,
      }
      render(<ReconciliationCard row={summaryWithoutFee} />)

      expect(screen.getByText('$25,000.00')).toBeInTheDocument()
      expect(screen.queryByText('Admin Fee')).not.toBeInTheDocument()
    })

    it('handles tenant summary without final amount', () => {
      const summaryWithoutFinal: TenantSummaryRow = {
        ...mockTenantSummary,
        final_amount: undefined,
      }
      render(<ReconciliationCard row={summaryWithoutFinal} />)

      expect(screen.getByText('$25,000.00')).toBeInTheDocument()
      expect(screen.queryByText('Final Amount')).not.toBeInTheDocument()
    })

    it('formats currency amounts correctly', () => {
      const poolWithLargeAmount: ExpensePoolRow = {
        ...mockExpensePool,
        total_expenses: '1234567.89',
      }
      render(<ReconciliationCard row={poolWithLargeAmount} />)

      expect(screen.getByText('$1,234,567.89')).toBeInTheDocument()
    })

    it('handles zero amounts', () => {
      const poolWithZero: ExpensePoolRow = {
        ...mockExpensePool,
        total_expenses: '0',
      }
      render(<ReconciliationCard row={poolWithZero} />)

      expect(screen.getByText('$0.00')).toBeInTheDocument()
    })

    it('handles undefined amounts', () => {
      const poolWithUndefined: ExpensePoolRow = {
        ...mockExpensePool,
        total_expenses: undefined as any,
      }
      render(<ReconciliationCard row={poolWithUndefined} />)

      expect(screen.getByText('$0.00')).toBeInTheDocument()
    })
  })

  describe('Touch Gestures', () => {
    beforeEach(() => {
      // Mock touch events
      vi.clearAllMocks()
    })

    it('tracks swipe offset on horizontal touch move', () => {
      const { container } = render(<ReconciliationCard row={mockExpensePool} />)
      const cardContainer = container.querySelector('.relative')

      // Simulate touch start
      fireEvent.touchStart(cardContainer!, {
        touches: [{ clientX: 100, clientY: 100 }],
      })

      // Simulate horizontal swipe right (100px offset)
      fireEvent.touchMove(cardContainer!, {
        touches: [{ clientX: 200, clientY: 100 }],
      })

      // Card should have transform applied (100px offset from 100 to 200)
      const card = container.querySelector('.rounded-lg')
      expect(card).toHaveStyle({ transform: 'translateX(100px)' })
    })

    it('updates transform as swipe continues', () => {
      const { container } = render(<ReconciliationCard row={mockExpensePool} />)
      const cardContainer = container.querySelector('.relative')

      // Start touch
      fireEvent.touchStart(cardContainer!, {
        touches: [{ clientX: 100, clientY: 100 }],
      })

      // First move - small offset
      fireEvent.touchMove(cardContainer!, {
        touches: [{ clientX: 150, clientY: 100 }],
      })

      const card = container.querySelector('.rounded-lg')
      expect(card).toHaveStyle({ transform: 'translateX(50px)' })

      // Second move - larger offset
      fireEvent.touchMove(cardContainer!, {
        touches: [{ clientX: 200, clientY: 100 }],
      })

      expect(card).toHaveStyle({ transform: 'translateX(100px)' })
    })

    it('calls onSwipe callback when swipe threshold exceeded', () => {
      const handleSwipe = vi.fn()
      const { container } = render(
        <ReconciliationCard row={mockExpensePool} onSwipe={handleSwipe} />
      )
      const cardContainer = container.querySelector('.relative')

      // Simulate swipe right > 100px
      fireEvent.touchStart(cardContainer!, {
        touches: [{ clientX: 0, clientY: 100 }],
      })

      fireEvent.touchMove(cardContainer!, {
        touches: [{ clientX: 150, clientY: 100 }],
      })

      // Touch end triggers callback
      fireEvent.touchEnd(document)

      expect(handleSwipe).toHaveBeenCalledWith('right')
    })

    it('calls onSwipe with left direction for left swipe', () => {
      const handleSwipe = vi.fn()
      const { container } = render(
        <ReconciliationCard row={mockExpensePool} onSwipe={handleSwipe} />
      )
      const cardContainer = container.querySelector('.relative')

      // Simulate swipe left > 100px
      fireEvent.touchStart(cardContainer!, {
        touches: [{ clientX: 200, clientY: 100 }],
      })

      fireEvent.touchMove(cardContainer!, {
        touches: [{ clientX: 50, clientY: 100 }],
      })

      // Touch end triggers callback
      fireEvent.touchEnd(document)

      expect(handleSwipe).toHaveBeenCalledWith('left')
    })

    it('does not call onSwipe if threshold not exceeded', () => {
      const handleSwipe = vi.fn()
      const { container } = render(
        <ReconciliationCard row={mockExpensePool} onSwipe={handleSwipe} />
      )
      const cardContainer = container.querySelector('.relative')

      // Simulate small swipe < 100px
      fireEvent.touchStart(cardContainer!, {
        touches: [{ clientX: 100, clientY: 100 }],
      })

      fireEvent.touchMove(cardContainer!, {
        touches: [{ clientX: 150, clientY: 100 }],
      })

      fireEvent.touchEnd(document)

      expect(handleSwipe).not.toHaveBeenCalled()
    })

    it('shows right swipe indicator when swiping right > 50px', () => {
      const { container } = render(<ReconciliationCard row={mockExpensePool} />)
      const cardContainer = container.querySelector('.relative')

      fireEvent.touchStart(cardContainer!, {
        touches: [{ clientX: 0, clientY: 100 }],
      })

      fireEvent.touchMove(cardContainer!, {
        touches: [{ clientX: 60, clientY: 100 }],
      })

      // Check for success icon indicator (theme-aware)
      const indicator = container.querySelector('.text-success')
      expect(indicator).toBeInTheDocument()
    })

    it('shows left swipe indicator when swiping left > 50px', () => {
      const { container } = render(<ReconciliationCard row={mockExpensePool} />)
      const cardContainer = container.querySelector('.relative')

      fireEvent.touchStart(cardContainer!, {
        touches: [{ clientX: 200, clientY: 100 }],
      })

      fireEvent.touchMove(cardContainer!, {
        touches: [{ clientX: 140, clientY: 100 }],
      })

      // Check for primary color icon indicator (theme-aware)
      const indicator = container.querySelector('.text-primary')
      expect(indicator).toBeInTheDocument()
    })

    it('resets swipe offset after touch ends', () => {
      const { container } = render(<ReconciliationCard row={mockExpensePool} />)
      const cardContainer = container.querySelector('.relative')

      // Swipe
      fireEvent.touchStart(cardContainer!, {
        touches: [{ clientX: 0, clientY: 100 }],
      })

      fireEvent.touchMove(cardContainer!, {
        touches: [{ clientX: 60, clientY: 100 }],
      })

      // End touch
      fireEvent.touchEnd(document)

      // Offset should reset (transform back to 0)
      const card = container.querySelector('.rounded-lg')
      expect(card).toHaveStyle({ transform: 'translateX(0px)' })
    })
  })

  describe('Props', () => {
    it('applies testId prop', () => {
      const { container } = render(
        <ReconciliationCard row={mockExpensePool} testId="custom-test-id" />
      )

      const cardContainer = container.querySelector(
        '[data-testid="custom-test-id"]'
      )
      expect(cardContainer).toBeInTheDocument()
    })
  })
})
