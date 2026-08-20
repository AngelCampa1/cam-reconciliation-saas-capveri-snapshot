/**
 * Subscription Checkout Dialog
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FEATURES,
  TRIAL_DAYS,
  getAnnualTotal,
  getFeaturesForTier,
} from '@/config/plans'
import {
  LAUNCH_OFFER,
  LAUNCH_OFFER_CODE,
  formatLaunchOfferPrice,
  getLaunchOfferPrice,
  isLaunchOfferLive,
} from '@/config/launch-offer'
import { toast } from '@/components/ui/sonner'
import { supabase } from '@/lib/supabase'
import { resolveApiUrl } from '@/api/url'
import { trackEvent } from '@/lib/analytics'

interface CheckoutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
  successUrl?: string
}

export function CheckoutDialog({
  open,
  onOpenChange,
  onSuccess,
  successUrl,
}: CheckoutDialogProps) {
  const navigate = useNavigate()
  const [unitCount, setUnitCount] = useState(25)
  const [buildingCount, setBuildingCount] = useState(1)
  const [loading, setLoading] = useState(false)

  const activeBand = 'reconcile'
  const annualTotal = getAnnualTotal(activeBand, unitCount)
  const launchAnnualTotal = getLaunchOfferPrice(activeBand, unitCount)
  const normalizeCount = (rawValue: string) => {
    const parsed = Number(rawValue || '1')
    const safeValue = Number.isFinite(parsed) ? Math.trunc(parsed) : 1
    return Math.max(safeValue, 1)
  }
  const tierFeatures = useMemo(() => {
    const featureKeys = getFeaturesForTier(activeBand)
    return FEATURES.filter((feature) => featureKeys.includes(feature.key))
  }, [])

  const redirectPausedTrialToBilling = (message?: string) => {
    toast.error('Billing required to resume access', {
      description:
        message ||
        'Your trial is paused. Add a payment method in billing settings to resume your workspace.',
    })
    onOpenChange(false)
    navigate('/settings/billing')
  }

  const handleCheckout = async () => {
    setLoading(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        toast.error('Authentication required', {
          description: 'Please log in to continue with checkout.',
        })
        return
      }

      const res = await fetch(resolveApiUrl('/api/v1/billing/trial/start'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          plan_id: activeBand,
          billing_period: 'annual',
          unit_count: unitCount,
          building_count: buildingCount,
          launch_offer_code: LAUNCH_OFFER_CODE,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        if (res.status === 409) {
          redirectPausedTrialToBilling(error.detail)
          setLoading(false)
          return
        }
        throw new Error(error.detail || 'Failed to create checkout session')
      }

      await res.json()

      trackEvent('trial_started', {
        plan: activeBand,
        billing_period: 'annual',
        unit_count: unitCount,
        building_count: buildingCount,
      })

      if (onSuccess) {
        onSuccess()
      }

      navigate(successUrl || '/dashboard')
    } catch (error) {
      toast.error('Trial start failed', {
        description:
          error instanceof Error
            ? error.message
            : 'Please try again or contact support.',
      })
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start Your Free Trial</DialogTitle>
          <DialogDescription>
            {TRIAL_DAYS}-day free trial with no credit card required. Plans
            start at $4,990/year for up to 25 rentable units.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium">Rentable units</span>
              <Input
                type="number"
                min={1}
                value={unitCount}
                onChange={(event) =>
                  setUnitCount(normalizeCount(event.target.value))
                }
                className="w-full"
              />
            </label>

            <label className="space-y-2">
              <span className="text-sm font-medium">Buildings</span>
              <Input
                type="number"
                min={1}
                value={buildingCount}
                onChange={(event) =>
                  setBuildingCount(normalizeCount(event.target.value))
                }
                className="w-full"
              />
            </label>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 shadow-sm">
            <div className="flex justify-between">
              <span>Annual subscription</span>
              {annualTotal == null ? (
                <span className="font-semibold">Published unit pricing</span>
              ) : (
                <span className="font-semibold font-mono tabular-nums">
                  {launchAnnualTotal != null ? (
                    <>
                      ${formatLaunchOfferPrice(launchAnnualTotal)}/year{' '}
                      <span className="text-muted-foreground line-through">
                        ${formatLaunchOfferPrice(annualTotal)}
                      </span>
                    </>
                  ) : (
                    `$${formatLaunchOfferPrice(annualTotal)}/year`
                  )}
                </span>
              )}
            </div>
            {launchAnnualTotal != null && (
              <>
                <p className="mt-1 text-right text-xs font-medium text-primary">
                  Limited time offer: {LAUNCH_OFFER.terms} Use code{' '}
                  {LAUNCH_OFFER.code}.
                  {isLaunchOfferLive() && LAUNCH_OFFER.endsAtDisplay
                    ? ` Offer ends ${LAUNCH_OFFER.endsAtDisplay}.`
                    : ''}
                </p>
                <p className="mt-0.5 text-right text-xs text-muted-foreground">
                  Then $
                  {annualTotal != null
                    ? formatLaunchOfferPrice(annualTotal)
                    : ''}
                  /yr after the first year.
                </p>
              </>
            )}
            <div className="mt-2 flex justify-between text-sm text-muted-foreground">
              <span>Due today</span>
              <span className="font-mono tabular-nums">$0.00</span>
            </div>
            <div className="border-t pt-2">
              <p className="text-sm text-muted-foreground">
                {TRIAL_DAYS}-day free trial
                {launchAnnualTotal != null
                  ? `, then $${formatLaunchOfferPrice(launchAnnualTotal)}/year`
                  : ''}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add annual billing before the trial ends to keep access.
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-3">
            <p className="mb-2 text-sm font-medium">Included in self-serve:</p>
            <ul className="space-y-1">
              {tierFeatures.slice(0, 5).map((feature) => (
                <li
                  key={feature.key}
                  className="flex items-center gap-2 text-sm"
                >
                  <Check className="h-3 w-3 flex-shrink-0 text-success" />
                  <span>{feature.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handleCheckout}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting trial...
              </>
            ) : (
              'Start Free Trial'
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            No credit card required to start.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
