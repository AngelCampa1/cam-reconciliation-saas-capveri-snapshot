/**
 * Calculate button component for triggering reconciliation calculations.
 *
 * Triggers the reconciliation calculation via API and refreshes the grid
 * with results. Shows loading state and confirmation dialogs.
 */

import { useState, useEffect, useRef } from 'react'
import { AlertCircle, Calculator, Loader2 } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
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
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import {
  useCalculateReconciliation,
  useCalculationJobStatus,
} from '@/api/hooks'
import { trackEvent } from '@/lib/analytics'
import type { CalculationJobCreate } from '@/api/generated/types.gen'

export interface UnmappedPool {
  id: string
  name: string
}

export interface CalculateButtonProps {
  propertyId: string
  periodStart: string
  periodEnd: string
  hasDraftData?: boolean
  onCalculateSuccess?: (tenantCount: number) => void
  onCalculateError?: (error: Error) => void
  /** Called when a free audit completes; receives the potential recovery total (or null) */
  onFreeAuditComplete?: (recoveryTotal: number | null) => void
  disabled?: boolean
  /** List of expense pools without GL mappings */
  unmappedPools?: UnmappedPool[]
  /** Callback when user chooses to fix mappings instead of proceeding */
  onFixMappings?: () => void
}

/**
 * Calculate button with API integration and loading state.
 *
 * Features:
 * - Triggers reconciliation calculation API
 * - Job polling with 5-minute timeout
 * - Loading spinner during calculation
 * - Success toast with summary
 * - Error toast on failure
 * - Confirmation dialog if overwriting existing draft
 * - Automatic grid refresh on success
 */
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/**
 * Format an ISO date string ("YYYY-MM-DD") as a friendly date ("Jan 1, 2025").
 *
 * Parses the date parts directly to avoid timezone shifts from `new Date()`.
 * Falls back to the original string if it is not a plain ISO date.
 */
function formatPeriodDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) {
    return iso
  }
  const [, year, month, day] = match
  const monthName = MONTH_NAMES[Number(month) - 1]
  if (!monthName) {
    return iso
  }
  return `${monthName} ${Number(day)}, ${year}`
}

export function CalculateButton({
  propertyId,
  periodStart,
  periodEnd,
  hasDraftData = false,
  onCalculateSuccess,
  onCalculateError,
  onFreeAuditComplete,
  disabled = false,
  unmappedPools = [],
  onFixMappings,
}: CalculateButtonProps) {
  const queryClient = useQueryClient()
  const [isCalculating, setIsCalculating] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showMappingWarningDialog, setShowMappingWarningDialog] =
    useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Mutation to start calculation
  const calculateMutation = useCalculateReconciliation({
    onSuccess: (response) => {
      setJobId(response.job_id)
      setIsCalculating(true)

      // Set 5-minute timeout for job
      timeoutRef.current = setTimeout(
        () => {
          setIsCalculating(false)
          setJobId(null)
          toast.error('Calculation timeout', {
            description: 'Calculation took too long. Please try again.',
          })
          onCalculateError?.(new Error('Calculation timeout'))
        },
        5 * 60 * 1000
      )
    },
    onError: (error) => {
      setIsCalculating(false)
      toast.error('Calculation failed', {
        description: error.message || 'Failed to start calculation',
      })
      onCalculateError?.(error)
    },
  })

  // Poll job status
  const { data: jobStatus } = useCalculationJobStatus(jobId, {
    enabled: !!jobId && isCalculating,
    // Hook already implements refetchInterval for pending/running states
  })

  // Handle job completion
  useEffect(() => {
    if (!jobStatus) return

    if (jobStatus.status === 'completed') {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      // Update state when async job completes
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsCalculating(false)
      setJobId(null)

      const tenantCount = jobStatus.total_leases || 0
      trackEvent('reconciliation_calculation_completed', {
        property_id: propertyId,
        period_start: periodStart,
        period_end: periodEnd,
        tenant_count: tenantCount,
      })

      toast.success('Calculation complete', {
        description: `Calculated reconciliation for ${tenantCount} tenants`,
      })

      // Invalidate reconciliation queries to refresh data
      queryClient.invalidateQueries({
        queryKey: ['reconciliation', 'snapshots'],
      })

      onCalculateSuccess?.(tenantCount)

      // Notify parent if this was a free audit completion (potential_recovery_total present)
      if (onFreeAuditComplete) {
        const recoveryTotal =
          (
            jobStatus as typeof jobStatus & {
              potential_recovery_total?: number | null
            }
          ).potential_recovery_total ?? null
        onFreeAuditComplete(
          recoveryTotal !== null ? Number(recoveryTotal) : null
        )
      }
    } else if (jobStatus.status === 'failed') {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      setIsCalculating(false)
      setJobId(null)

      const errorMessage = jobStatus.error_message || 'Calculation failed'

      toast.error('Calculation failed', {
        description: errorMessage,
      })

      onCalculateError?.(new Error(errorMessage))
    }
  }, [
    jobStatus,
    onCalculateSuccess,
    onCalculateError,
    onFreeAuditComplete,
    periodEnd,
    periodStart,
    propertyId,
    queryClient,
  ])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const executeCalculation = () => {
    trackEvent('reconciliation_calculation_started', {
      property_id: propertyId,
      period_start: periodStart,
      period_end: periodEnd,
      force_recalculate: hasDraftData,
      unmapped_pool_count: unmappedPools.length,
    })
    const requestData: CalculationJobCreate = {
      property_id: propertyId,
      period_start: periodStart,
      period_end: periodEnd,
      force_recalculate: hasDraftData,
    }

    calculateMutation.mutate(requestData)
  }

  const handleCalculate = () => {
    // First check for unmapped pools
    if (unmappedPools.length > 0) {
      setShowMappingWarningDialog(true)
      return
    }

    // Then check for existing draft
    if (hasDraftData) {
      setShowConfirmDialog(true)
    } else {
      executeCalculation()
    }
  }

  const handleConfirmOverwrite = () => {
    setShowConfirmDialog(false)
    executeCalculation()
  }

  const handleProceedWithWarning = () => {
    setShowMappingWarningDialog(false)
    // After dismissing mapping warning, check for draft overwrite
    if (hasDraftData) {
      setShowConfirmDialog(true)
    } else {
      executeCalculation()
    }
  }

  const handleFixMappings = () => {
    setShowMappingWarningDialog(false)
    onFixMappings?.()
  }

  return (
    <>
      <Button
        onClick={handleCalculate}
        disabled={disabled || isCalculating}
        className="gap-2"
        data-testid="calculate-button"
        aria-label={
          isCalculating ? 'Running reconciliation' : 'Run reconciliation'
        }
      >
        <span className="flex items-center gap-2 transition-all duration-fast">
          {isCalculating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="sm:hidden">Running…</span>
              <span className="hidden sm:inline">
                Running reconciliation...
              </span>
            </>
          ) : (
            <>
              <Calculator className="h-4 w-4" />
              <span className="sm:hidden">Run</span>
              <span className="hidden sm:inline">Run reconciliation</span>
            </>
          )}
        </span>
      </Button>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite Existing Draft?</AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite the existing draft reconciliation data for{' '}
              {formatPeriodDate(periodStart)} to {formatPeriodDate(periodEnd)}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmOverwrite}
              className={buttonVariants({ variant: 'destructive' })}
            >
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showMappingWarningDialog}
        onOpenChange={setShowMappingWarningDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              Missing GL Account Mappings
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {unmappedPools.length} expense pool
                  {unmappedPools.length === 1 ? ' has' : 's have'} no GL account
                  mappings. We won&apos;t bill these expenses to your tenants.
                </p>
                <p className="text-sm">
                  <strong>Unmapped pools:</strong>{' '}
                  {unmappedPools.map((p) => p.name).join(', ')}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {onFixMappings && (
              <AlertDialogCancel onClick={handleFixMappings}>
                Fix Mappings
              </AlertDialogCancel>
            )}
            <AlertDialogAction onClick={handleProceedWithWarning}>
              Run without these pools
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
