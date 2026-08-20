/**
 * BillingWarningBanner - Warns about subscription issues such as
 * property count overages or no active subscription.
 */
import { AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export interface BillingWarningBannerProps {
  /** Current billable rentable unit count in organization */
  unitCount?: number
  /** Number of rentable units covered in current subscription */
  coveredUnitCount?: number
  /** Optional: Custom className for styling */
  className?: string
}

/**
 * Warning banner for billing issues.
 *
 * Shows "Unit Limit Exceeded" when billable units exceed covered units.
 */
export function BillingWarningBanner({
  unitCount,
  coveredUnitCount,
  className,
}: BillingWarningBannerProps) {
  if (
    unitCount === undefined ||
    coveredUnitCount === undefined ||
    unitCount <= coveredUnitCount
  ) {
    return null
  }

  const overage = unitCount - coveredUnitCount

  return (
    <Alert variant="destructive" className={className}>
      <AlertCircle className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>Rentable Unit Limit Exceeded</AlertTitle>
      <AlertDescription className="mt-2 flex items-center justify-between gap-4">
        <div>
          <p className="mb-1">
            You are tracking <strong>{unitCount}</strong>{' '}
            {unitCount === 1 ? 'rentable unit' : 'rentable units'} but your
            current subscription covers <strong>{coveredUnitCount}</strong>.
          </p>
          <p className="text-sm opacity-90">
            Update billing to cover {overage} additional{' '}
            {overage === 1 ? 'rentable unit' : 'rentable units'} and avoid
            service disruption.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to="/settings/billing">Update Billing</Link>
        </Button>
      </AlertDescription>
    </Alert>
  )
}
