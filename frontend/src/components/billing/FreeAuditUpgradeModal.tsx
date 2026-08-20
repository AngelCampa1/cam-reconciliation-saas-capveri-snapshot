/**
 * FreeAuditUpgradeModal
 *
 * Shown after a free audit job completes when the org has no active subscription.
 */
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Sparkles, ArrowRight } from 'lucide-react'
import {
  LAUNCH_OFFER,
  formatLaunchOfferPrice,
  getLaunchOfferPrice,
  isLaunchOfferLive,
} from '@/config/launch-offer'
import { TRIAL_COPY } from '@/lib/domains'
import { formatMoneyWhole } from '@/lib/money'
import { trackEvent } from '@/lib/analytics'
import { useEffect } from 'react'

const UPGRADE_SURFACE = 'free_audit_modal'

export interface FreeAuditUpgradeModalProps {
  open: boolean
  potentialRecovery: number | null
  onClose: () => void
  onSubscribe: () => void
}

const reconcileLaunchAnnual = getLaunchOfferPrice('reconcile')

export function FreeAuditUpgradeModal({
  open,
  potentialRecovery,
  onClose,
  onSubscribe,
}: FreeAuditUpgradeModalProps) {
  const hasRecovery = potentialRecovery !== null && potentialRecovery > 0

  // Fire the paywall-funnel "shown" event once each time the modal opens.
  useEffect(() => {
    if (!open) return
    trackEvent('upgrade_modal_shown', {
      recovery_amount: potentialRecovery ?? 0,
      surface: UPGRADE_SURFACE,
    })
  }, [open, potentialRecovery])

  const handleSubscribe = () => {
    trackEvent('upgrade_modal_cta_clicked', {
      recovery_amount: potentialRecovery ?? 0,
      surface: UPGRADE_SURFACE,
    })
    onSubscribe()
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md text-center">
        <DialogDescription className="sr-only">
          Upgrade to run reconciliations across your portfolio.
        </DialogDescription>

        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          {hasRecovery ? (
            <AlertTriangle className="h-8 w-8 text-primary" />
          ) : (
            <Sparkles className="h-8 w-8 text-primary" />
          )}
        </div>

        {/* The visible heading IS the dialog's accessible name (Radix links
            aria-labelledby to DialogTitle), so screen readers announce exactly
            what's on screen instead of a separate sr-only title. */}
        <DialogTitle className="text-center text-xl font-bold">
          Your free reconciliation is ready
        </DialogTitle>

        <div className="mb-6 mt-3">
          {hasRecovery ? (
            <p className="text-muted-foreground">
              Your check caught{' '}
              <strong className="text-lg text-foreground font-mono tabular-nums">
                {formatMoneyWhole(potentialRecovery!)}
              </strong>{' '}
              to fix before you send.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Your reconciliation balances. Every charge matches the lease.
            </p>
          )}
          <p className="mt-3 text-muted-foreground">
            Subscribe to run checks across your portfolio and unlock full
            reports. Start with a {TRIAL_COPY} on Reconcile. Use{' '}
            {LAUNCH_OFFER.code} for {LAUNCH_OFFER.terms}
            {isLaunchOfferLive() && LAUNCH_OFFER.endsAtDisplay
              ? ` Offer ends ${LAUNCH_OFFER.endsAtDisplay}.`
              : ''}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button onClick={handleSubscribe} className="w-full">
            Start Free Trial - Reconcile from $
            {formatLaunchOfferPrice(reconcileLaunchAnnual ?? 0)}/yr
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={onClose} className="w-full">
            View results first
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
