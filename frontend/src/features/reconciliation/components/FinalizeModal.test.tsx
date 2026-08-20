/**
 * Tests for FinalizeModal component.
 *
 * Validates finalize modal display and confirmation flow.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FinalizeModal, type SnapshotSummary } from './FinalizeModal'

const mockSnapshot: SnapshotSummary = {
  period: '2024-01-01 to 2024-12-31',
  tenantCount: 15,
  totalBillable: 125000.5,
}

describe('FinalizeModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders modal when open', () => {
    render(
      <FinalizeModal
        isOpen={true}
        onClose={vi.fn()}
        snapshot={mockSnapshot}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('Finalize Reconciliation?')).toBeInTheDocument()
  })

  it('does not render modal when closed', () => {
    render(
      <FinalizeModal
        isOpen={false}
        onClose={vi.fn()}
        snapshot={mockSnapshot}
        onConfirm={vi.fn()}
      />
    )

    expect(
      screen.queryByText('Finalize Reconciliation?')
    ).not.toBeInTheDocument()
  })

  it('displays irreversible warning message', () => {
    render(
      <FinalizeModal
        isOpen={true}
        onClose={vi.fn()}
        snapshot={mockSnapshot}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument()
  })

  it('displays period in warning message', () => {
    render(
      <FinalizeModal
        isOpen={true}
        onClose={vi.fn()}
        snapshot={mockSnapshot}
        onConfirm={vi.fn()}
      />
    )

    expect(
      screen.getByText(
        /Finalizing locks all reconciliation data for 2024-01-01 to 2024-12-31/
      )
    ).toBeInTheDocument()
  })

  it('displays summary section', () => {
    render(
      <FinalizeModal
        isOpen={true}
        onClose={vi.fn()}
        snapshot={mockSnapshot}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('Summary:')).toBeInTheDocument()
  })

  it('displays tenant count in summary', () => {
    render(
      <FinalizeModal
        isOpen={true}
        onClose={vi.fn()}
        snapshot={mockSnapshot}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('15 tenants')).toBeInTheDocument()
  })

  it('displays total billable in summary', () => {
    render(
      <FinalizeModal
        isOpen={true}
        onClose={vi.fn()}
        snapshot={mockSnapshot}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('$125,000.50')).toBeInTheDocument()
  })

  it('formats negative total billable correctly', () => {
    const negativeSnapshot: SnapshotSummary = {
      period: '2024-01-01 to 2024-12-31',
      tenantCount: 5,
      totalBillable: -5000.0,
    }

    render(
      <FinalizeModal
        isOpen={true}
        onClose={vi.fn()}
        snapshot={negativeSnapshot}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('-$5,000.00')).toBeInTheDocument()
  })

  it('shows Cancel button', () => {
    render(
      <FinalizeModal
        isOpen={true}
        onClose={vi.fn()}
        snapshot={mockSnapshot}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('shows Finalize button', () => {
    render(
      <FinalizeModal
        isOpen={true}
        onClose={vi.fn()}
        snapshot={mockSnapshot}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('Finalize')).toBeInTheDocument()
  })

  it('calls onClose when Cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <FinalizeModal
        isOpen={true}
        onClose={onClose}
        snapshot={mockSnapshot}
        onConfirm={vi.fn()}
      />
    )

    const cancelButton = screen.getByText('Cancel')
    await user.click(cancelButton)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onConfirm when Finalize button is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <FinalizeModal
        isOpen={true}
        onClose={vi.fn()}
        snapshot={mockSnapshot}
        onConfirm={onConfirm}
      />
    )

    const finalizeButton = screen.getByText('Finalize')
    await user.click(finalizeButton)

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('does not call onConfirm when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()

    render(
      <FinalizeModal
        isOpen={true}
        onClose={vi.fn()}
        snapshot={mockSnapshot}
        onConfirm={onConfirm}
      />
    )

    const cancelButton = screen.getByText('Cancel')
    await user.click(cancelButton)

    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('has data-testid="alert-dialog-action" on the Finalize action button', () => {
    render(
      <FinalizeModal
        isOpen={true}
        onClose={vi.fn()}
        snapshot={mockSnapshot}
        onConfirm={vi.fn()}
      />
    )

    expect(
      document.querySelector('[data-testid="alert-dialog-action"]')
    ).toBeInTheDocument()
  })
})
