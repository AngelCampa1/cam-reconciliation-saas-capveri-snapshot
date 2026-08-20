/**
 * Finalize modal component for locking reconciliation snapshots.
 *
 * Shows confirmation dialog with summary before finalizing.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { pluralizeWithCount } from '@/lib/pluralize'
import { formatMoney } from '@/lib/money'

export interface SnapshotSummary {
  period: string
  tenantCount: number
  totalBillable: number
}

export interface FinalizeModalProps {
  isOpen: boolean
  onClose: () => void
  snapshot: SnapshotSummary
  onConfirm: () => void
}

/**
 * Finalize modal with confirmation and summary.
 *
 * Features:
 * - Warning that action is irreversible
 * - Summary of period, tenant count, and total billable
 * - Cancel and Finalize buttons
 * - Closes on cancel or confirm
 */
export function FinalizeModal({
  isOpen,
  onClose,
  snapshot,
  onConfirm,
}: FinalizeModalProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Finalize Reconciliation?</AlertDialogTitle>
          <AlertDialogDescription>
            Finalizing locks all reconciliation data for {snapshot.period}. You
            will not be able to edit or delete any entries after this point.
            This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4 px-4 bg-muted/30 rounded-lg">
          <p className="font-semibold mb-2">Summary:</p>
          <ul className="list-disc ml-4 space-y-1">
            <li>{pluralizeWithCount(snapshot.tenantCount, 'tenant')}</li>
            <li>
              Total billable:{' '}
              <span className="font-mono tabular-nums">
                {formatMoney(snapshot.totalBillable)}
              </span>
            </li>
          </ul>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            data-testid="alert-dialog-action"
            onClick={onConfirm}
          >
            Finalize
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
