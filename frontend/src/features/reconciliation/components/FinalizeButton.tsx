/**
 * Finalize button component for locking reconciliation snapshots.
 *
 * Triggers the finalization workflow with confirmation modal.
 * Uses batch finalize to lock ALL snapshots for a property/period at once.
 */

import { useState } from 'react'
import { Lock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FinalizeModal, type SnapshotSummary } from './FinalizeModal'
import { toast } from 'sonner'
import { useFinalizeSnapshots } from '@/api/hooks'
import { getAmountBucket, trackEvent } from '@/lib/analytics'

export interface FinalizeButtonProps {
  hasDraftData: boolean
  snapshot: SnapshotSummary
  /** @deprecated Use propertyId, periodStart, periodEnd instead */
  snapshotId?: string
  propertyId?: string
  periodStart?: string
  periodEnd?: string
  onFinalizeSuccess?: () => void
  onFinalizeError?: (error: Error) => void
  disabled?: boolean
}

/**
 * Finalize button with confirmation modal and API integration.
 *
 * Features:
 * - Disabled when no draft data exists
 * - Opens confirmation modal before finalizing
 * - Shows loading state during finalization
 * - Success/error toast notifications
 * - Callback on successful finalization
 * - Uses batch finalize to lock all snapshots for the property/period
 */
export function FinalizeButton({
  hasDraftData,
  snapshot,
  propertyId,
  periodStart,
  periodEnd,
  onFinalizeSuccess,
  onFinalizeError,
  disabled = false,
}: FinalizeButtonProps) {
  const [showConfirmModal, setShowConfirmModal] = useState(false)

  // Mutation to finalize all snapshots for property/period
  const finalizeMutation = useFinalizeSnapshots({
    onSuccess: (data) => {
      const successCount = data.results?.filter((r) => r.success)?.length || 0
      trackEvent('reconciliation_finalized', {
        property_id: propertyId,
        period_start: periodStart,
        period_end: periodEnd,
        snapshot_count: successCount,
        tenant_count: snapshot.tenantCount,
        total_billable_bucket: getAmountBucket(snapshot.totalBillable),
      })
      toast.success('Reconciliation finalized', {
        description: `Successfully locked ${successCount} snapshot(s) for ${snapshot.period}`,
      })
      onFinalizeSuccess?.()
    },
    onError: (error) => {
      toast.error('Finalization failed', {
        description: error.message || 'Unknown error occurred',
      })
      onFinalizeError?.(error)
    },
  })

  const handleFinalize = () => {
    setShowConfirmModal(true)
  }

  const executeFinalization = () => {
    // Guard against a double-finalize when the confirm action fires twice before
    // the pending state propagates (rapid Enter/click). Finalization is
    // irreversible, so a second mutate must never reach the backend.
    if (finalizeMutation.isPending) {
      return
    }
    setShowConfirmModal(false)
    if (!propertyId || !periodStart || !periodEnd) {
      toast.error('Finalization failed', {
        description: 'Missing property ID or period information',
      })
      return
    }
    finalizeMutation.mutate({
      property_id: propertyId,
      period_start: periodStart,
      period_end: periodEnd,
    })
  }

  const isFinalizing = finalizeMutation.isPending
  const isDisabled = disabled || !hasDraftData || isFinalizing || !propertyId

  return (
    <>
      <Button
        onClick={handleFinalize}
        disabled={isDisabled}
        className="gap-2"
        variant="default"
        data-testid="finalize-button"
        aria-label={isFinalizing ? 'Finalizing' : 'Finalize'}
      >
        {isFinalizing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Finalizing…</span>
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" />
            <span>Finalize</span>
          </>
        )}
      </Button>

      <FinalizeModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        snapshot={snapshot}
        onConfirm={executeFinalization}
      />
    </>
  )
}
