import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FreeAuditUpgradeModal } from './FreeAuditUpgradeModal'
import { trackEvent } from '@/lib/analytics'

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

const mockTrackEvent = vi.mocked(trackEvent)

const defaultProps = {
  open: true,
  potentialRecovery: null,
  onClose: vi.fn(),
  onSubscribe: vi.fn(),
}

describe('FreeAuditUpgradeModal', () => {
  beforeEach(() => {
    mockTrackEvent.mockClear()
  })
  it('renders the upgrade modal when open', () => {
    render(<FreeAuditUpgradeModal {...defaultProps} />)
    expect(
      screen.getByText('Your free reconciliation is ready')
    ).toBeInTheDocument()
  })

  it('announces the dialog with its visible heading as the accessible name', () => {
    render(<FreeAuditUpgradeModal {...defaultProps} />)
    // The screen-reader-announced name must match the on-screen heading, not a
    // separate sr-only title that diverges from what sighted users read.
    expect(
      screen.getByRole('dialog', { name: 'Your free reconciliation is ready' })
    ).toBeInTheDocument()
  })

  it('shows recovery amount when potentialRecovery is positive', () => {
    render(
      <FreeAuditUpgradeModal {...defaultProps} potentialRecovery={21250} />
    )

    expect(screen.getByText(/\$21,250/)).toBeInTheDocument()
    expect(screen.getByText(/to fix before you send/i)).toBeInTheDocument()
  })

  it('frames the offer as the Reconcile package', () => {
    render(<FreeAuditUpgradeModal {...defaultProps} />)

    expect(
      screen.getByText(/30-day free trial on Reconcile/i)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', {
        name: /start free trial - reconcile from \$998\/yr/i,
      })
    ).toBeInTheDocument()
  })

  it('calls onSubscribe when the primary button is clicked', () => {
    const onSubscribe = vi.fn()
    render(
      <FreeAuditUpgradeModal {...defaultProps} onSubscribe={onSubscribe} />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /start free trial - reconcile from \$998\/yr/i,
      })
    )

    expect(onSubscribe).toHaveBeenCalledOnce()
  })

  it('calls onClose when "View results first" is clicked', () => {
    const onClose = vi.fn()
    render(<FreeAuditUpgradeModal {...defaultProps} onClose={onClose} />)

    fireEvent.click(screen.getByText('View results first'))

    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not render when open is false', () => {
    render(<FreeAuditUpgradeModal {...defaultProps} open={false} />)
    expect(
      screen.queryByText('Your free reconciliation is ready')
    ).not.toBeInTheDocument()
  })

  it('fires upgrade_modal_shown when opened, with recovery amount and surface', () => {
    render(
      <FreeAuditUpgradeModal {...defaultProps} potentialRecovery={21250} />
    )

    expect(mockTrackEvent).toHaveBeenCalledWith('upgrade_modal_shown', {
      recovery_amount: 21250,
      surface: 'free_audit_modal',
    })
  })

  it('reports recovery_amount 0 when there is no recovery', () => {
    render(<FreeAuditUpgradeModal {...defaultProps} potentialRecovery={null} />)

    expect(mockTrackEvent).toHaveBeenCalledWith('upgrade_modal_shown', {
      recovery_amount: 0,
      surface: 'free_audit_modal',
    })
  })

  it('does not fire upgrade_modal_shown while closed', () => {
    render(<FreeAuditUpgradeModal {...defaultProps} open={false} />)

    expect(mockTrackEvent).not.toHaveBeenCalled()
  })

  it('fires upgrade_modal_cta_clicked before calling onSubscribe', () => {
    const onSubscribe = vi.fn()
    render(
      <FreeAuditUpgradeModal
        {...defaultProps}
        potentialRecovery={21250}
        onSubscribe={onSubscribe}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /start free trial - reconcile from \$998\/yr/i,
      })
    )

    expect(mockTrackEvent).toHaveBeenCalledWith('upgrade_modal_cta_clicked', {
      recovery_amount: 21250,
      surface: 'free_audit_modal',
    })
    expect(onSubscribe).toHaveBeenCalledOnce()
  })
})
