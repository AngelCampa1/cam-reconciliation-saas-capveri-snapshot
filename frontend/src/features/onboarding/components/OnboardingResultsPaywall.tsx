import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TRIAL_DAYS } from '@/config/plans'
import { formatMoney } from '@/lib/money'
import { trackEvent } from '@/lib/analytics'

const UPGRADE_SURFACE = 'onboarding_results'

interface OnboardingResultsPaywallProps {
  hasLeakage: boolean
  hasOverbilling: boolean
  absoluteVariance: number
}

export function OnboardingResultsPaywall({
  hasLeakage,
  hasOverbilling,
  absoluteVariance,
}: OnboardingResultsPaywallProps) {
  // Fire the paywall-funnel "shown" event once when the paywall mounts.
  useEffect(() => {
    trackEvent('upgrade_modal_shown', {
      recovery_amount: absoluteVariance,
      surface: UPGRADE_SURFACE,
    })
  }, [absoluteVariance])

  return (
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardContent className="pt-6">
        <h3 className="font-semibold text-lg mb-2">
          {absoluteVariance > 0 ? (
            <>
              Unlock Your{' '}
              <span className="font-mono tabular-nums">
                {formatMoney(absoluteVariance)}
              </span>{' '}
              Statement Check Report
            </>
          ) : (
            'Unlock Your Full Statement Check Report'
          )}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          {hasLeakage ? (
            <>
              This check caught{' '}
              <span className="font-mono tabular-nums">
                {formatMoney(absoluteVariance)}
              </span>{' '}
              in under-bills. Subscribe to review the line-by-line draft. Then
              download reports.
            </>
          ) : hasOverbilling ? (
            <>
              This check caught{' '}
              <span className="font-mono tabular-nums">
                {formatMoney(absoluteVariance)}
              </span>{' '}
              in over-bills. Subscribe to review the line-by-line draft. Then
              download reports.
            </>
          ) : (
            'Subscribe to download your full statement check report and share it with tenants.'
          )}
        </p>

        <Button className="w-full" asChild>
          <Link
            to="/pricing"
            onClick={() =>
              trackEvent('upgrade_modal_cta_clicked', {
                recovery_amount: absoluteVariance,
                surface: UPGRADE_SURFACE,
              })
            }
          >
            Start Free Trial ({TRIAL_DAYS} days free)
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
