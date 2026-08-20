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
import type { LeaseRecoveryProfile } from '@/types/lease-recovery-profile'
import type { EditAction } from '@/api/client'

interface ApprovalDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  profile: LeaseRecoveryProfile
  originalProfile: LeaseRecoveryProfile
  editHistory: EditAction[]
  onConfirm: () => Promise<void>
  isSubmitting: boolean
}

const FIELD_LABELS: Record<string, string> = {
  base_year: 'Base Year',
  base_year_amount: 'Base Year Amount',
  gross_up_base_year: 'Gross-Up Base Year',
  pro_rata_share: 'Pro-Rata Share',
  cap_type: 'Cap Type',
  cap_rate: 'Cap Rate',
  admin_fee_percentage: 'Admin Fee',
}

export function ApprovalDialog({
  open,
  onOpenChange,
  profile,
  originalProfile,
  editHistory,
  onConfirm,
  isSubmitting,
}: ApprovalDialogProps) {
  // Find all changed fields by comparing current to original
  const changedFields = Object.entries(profile).filter(([key, value]) => {
    const originalValue = originalProfile[key as keyof LeaseRecoveryProfile]
    // Handle array comparison for excluded_pools
    if (Array.isArray(value) && Array.isArray(originalValue)) {
      return JSON.stringify(value) !== JSON.stringify(originalValue)
    }
    return value !== originalValue
  })

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) {
      return 'N/A'
    }
    if (Array.isArray(value)) {
      return value.length > 0 ? value.join(', ') : 'None'
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No'
    }
    return String(value)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md" data-testid="approval-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Approve & Commit Extraction</AlertDialogTitle>
          <AlertDialogDescription>
            This saves the reviewed lease terms.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {changedFields.length > 0 && (
          <div className="my-4" data-testid="changes-summary">
            <h4 className="text-sm font-medium mb-2">
              Changes Made ({editHistory.length})
            </h4>
            <ul
              className="text-sm space-y-1 max-h-40 overflow-auto"
              data-testid="changed-fields-list"
            >
              {changedFields.map(([field, value]) => {
                const originalValue =
                  originalProfile[field as keyof LeaseRecoveryProfile]
                const label = FIELD_LABELS[field] || field

                return (
                  <li
                    key={field}
                    className="flex justify-between gap-2"
                    data-testid={`change-${field}`}
                  >
                    <span
                      className="text-muted-foreground truncate"
                      title={label}
                    >
                      {label}:
                    </span>
                    <span className="font-mono text-xs">
                      {formatValue(originalValue)} → {formatValue(value)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {changedFields.length === 0 && (
          <p
            className="text-sm text-muted-foreground my-4"
            data-testid="no-changes-message"
          >
            No changes made. The original extraction will be saved.
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={isSubmitting}
            data-testid="cancel-button"
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isSubmitting}
            data-testid="confirm-button"
          >
            {isSubmitting ? 'Approving...' : 'Approve & Commit'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
