/**
 * Checkout Page - canonical self-serve plan selection and trial start.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, Check, Loader2 } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  FEATURES,
  getAnnualPrice,
  TRIAL_DAYS,
  TIERS,
  getAnnualTotal,
  getFeaturesForTier,
  type TierId,
} from '@/config/plans'
import {
  LAUNCH_OFFER,
  LAUNCH_OFFER_CODE,
  formatLaunchOfferPrice,
  getLaunchOfferPrice,
  shouldApplyLaunchOffer,
  isLaunchOfferLive,
} from '@/config/launch-offer'
import { toast } from '@/components/ui/sonner'
import { PageContainer } from '@/components/layout'
import { supabase } from '@/lib/supabase'
import { formatNumber } from '@/lib/number'
import { useBillingActivation } from '@/hooks/use-billing-activation'
import { publicKnowledge } from '@/generated/public-knowledge'
import { subscriptionKeys } from '@/hooks/use-subscription'
import { authenticatedFetch } from '@/api/authFetch'
import { trackEvent } from '@/lib/analytics'

const SELF_SERVE_TIERS = TIERS
const DEFAULT_TIER: TierId = 'reconcile'
const SLIDER_MAX_UNITS = 5000

function isSelfServeTier(value: string | null): value is TierId {
  return SELF_SERVE_TIERS.some((tier) => tier.id === value)
}

function normalizeRequestedTier(
  tierParam: string | null,
  planParam: string | null
): TierId {
  const requestedValue = (tierParam || planParam)?.toLowerCase() || null
  if (
    requestedValue === 'professional' ||
    requestedValue === 'portfolio' ||
    requestedValue === 'control' ||
    requestedValue === 'defend' ||
    requestedValue === 'growth' ||
    requestedValue === 'growth_v2'
  ) {
    return DEFAULT_TIER
  }
  return isSelfServeTier(requestedValue) ? requestedValue : DEFAULT_TIER
}

function formatListPrice(tierId: TierId) {
  const total = getAnnualPrice(tierId)
  if (total == null) return 'Custom'
  return `$${formatNumber(total)}/yr`
}

function parseUnitCount(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return null
  return Math.max(Math.trunc(parsed), 1)
}

function formatAnnualPrice(value: number): string {
  return `$${formatNumber(value)}/yr`
}

export function CheckoutPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const initialTier = normalizeRequestedTier(
    searchParams.get('tier'),
    searchParams.get('plan')
  )
  const offer = searchParams.get('offer')
  const offerToken = searchParams.get('offer_token')
  const launchOfferActive = shouldApplyLaunchOffer(offer, offerToken)
  const [selectedTierId, setSelectedTierId] = useState<TierId>(initialTier)
  const [unitCount, setUnitCount] = useState(
    parseUnitCount(searchParams.get('units')) ?? 25
  )
  const [loading, setLoading] = useState(false)
  const initializedFromActivation = useRef(false)
  const {
    data: billingActivation,
    isLoading: billingActivationLoading,
    refetch: refetchBillingActivation,
  } = useBillingActivation()

  const selectedTier = TIERS.find((tier) => tier.id === selectedTierId)
  const includedUnitCount = selectedTier?.includedUnits ?? 25
  const buildingCount = 1
  const currentTotal = getAnnualTotal(selectedTierId, unitCount)
  const currentLaunchTotal = launchOfferActive
    ? getLaunchOfferPrice(selectedTierId, unitCount)
    : null
  const tierFeatures = useMemo(() => {
    const featureKeys = getFeaturesForTier(selectedTierId)
    return FEATURES.filter((feature) => featureKeys.includes(feature.key))
  }, [selectedTierId])
  const billingSuffix = '/yr'

  useEffect(() => {
    const legacyPlan = searchParams.get('plan')
    if (!legacyPlan || searchParams.has('tier')) {
      return
    }

    const normalizedTier = normalizeRequestedTier(null, legacyPlan)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tier', normalizedTier)
    nextParams.delete('plan')
    navigate(`/checkout?${nextParams.toString()}`, { replace: true })
  }, [navigate, searchParams])

  const redirectPausedTrialToBilling = useCallback(
    (message?: string) => {
      toast.error('Billing required to resume access', {
        description:
          message ||
          'Your trial is paused. Add a payment method in billing settings to resume your workspace.',
      })
      navigate('/settings/billing')
    },
    [navigate]
  )

  useEffect(() => {
    if (billingActivationLoading || !billingActivation) {
      return
    }

    if (billingActivation.has_paused_subscription) {
      redirectPausedTrialToBilling()
      return
    }

    if (
      !billingActivation.checkout_required &&
      billingActivation.has_active_access
    ) {
      navigate('/dashboard')
      return
    }

    if (initializedFromActivation.current) {
      return
    }

    const hasUrlSelection =
      searchParams.has('units') ||
      searchParams.has('buildings') ||
      searchParams.has('tier')

    if (!hasUrlSelection && billingActivation.plan_id) {
      if (isSelfServeTier(billingActivation.plan_id)) {
        setSelectedTierId(billingActivation.plan_id)
      }
      if (billingActivation.unit_count) {
        setUnitCount(Math.max(Number(billingActivation.unit_count), 1))
      }
    }

    initializedFromActivation.current = true
  }, [
    billingActivation,
    billingActivationLoading,
    navigate,
    redirectPausedTrialToBilling,
    searchParams,
  ])

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
        navigate('/auth/login')
        return
      }

      const res = await authenticatedFetch('/api/v1/billing/trial/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_id: selectedTierId,
          billing_period: 'annual',
          unit_count: unitCount,
          building_count: buildingCount,
          ...getTrialStartOfferFields(offer, offerToken),
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        if (res.status === 409) {
          const detail =
            typeof error.detail === 'string'
              ? error.detail
              : 'Checkout conflict'
          if (detail.toLowerCase().includes('paused')) {
            redirectPausedTrialToBilling(detail)
          } else {
            toast.error('Checkout selection changed', {
              description: detail,
            })
          }
          setLoading(false)
          return
        }
        throw new Error(error.detail || 'Failed to create checkout session')
      }

      trackEvent('trial_started', {
        plan: selectedTierId,
        billing_period: 'annual',
        unit_count: unitCount,
        building_count: buildingCount,
      })
      void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all })
      void refetchBillingActivation().catch(() => undefined)
      navigate('/dashboard')
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

  if (billingActivationLoading) {
    return (
      <PageContainer className="max-w-3xl py-16">
        <div className="flex items-center justify-center py-24">
          <Spinner size="lg" variant="muted" />
        </div>
      </PageContainer>
    )
  }

  const moneyBackGuarantee =
    publicKnowledge.claims.byId['money-back-guarantee'].wording

  return (
    <PageContainer className="max-w-3xl py-16">
      <Card className="shadow-sm">
        <CardHeader className="rounded-t-lg bg-gradient-to-r from-primary/5 to-primary/10">
          <h1 className="sr-only">Checkout</h1>
          <CardTitle>
            Choose your unit count and start your free trial
          </CardTitle>
          <CardDescription>
            Reconcile is billed yearly. Pick your rentable unit count now.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="h-4 w-4 text-primary" />
              Reconcile
            </div>
            <p className="mt-2 text-2xl font-bold">
              {currentTotal == null
                ? 'Custom'
                : formatAnnualPrice(currentTotal)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Minimum subscription: {formatListPrice(selectedTierId)} for up to{' '}
              {includedUnitCount} rentable units. Extra units are priced from
              your selected count.
            </p>
          </div>

          <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <Label htmlFor="unit-count">Rentable units</Label>
                <p className="text-sm text-muted-foreground">
                  Slide or type the count.
                </p>
              </div>
              <Input
                id="unit-count"
                type="number"
                inputMode="numeric"
                min={1}
                value={unitCount}
                onChange={(event) => {
                  const nextValue = Number(event.target.value || '1')
                  const safeValue = Number.isFinite(nextValue)
                    ? Math.trunc(nextValue)
                    : 1
                  setUnitCount(Math.max(safeValue, 1))
                }}
                className="w-full sm:w-40"
              />
            </div>
            <Slider
              min={1}
              max={SLIDER_MAX_UNITS}
              step={1}
              value={[Math.min(unitCount, SLIDER_MAX_UNITS)]}
              onValueChange={([value]) => setUnitCount(value ?? 1)}
              aria-label="Rentable units"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1</span>
              <span>5,000+</span>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 shadow-sm">
            <div className="flex justify-between">
              <span>Subscription after trial</span>
              <span className="font-semibold font-mono tabular-nums">
                {currentTotal == null ? (
                  'Custom'
                ) : currentLaunchTotal != null ? (
                  <>
                    ${formatLaunchOfferPrice(currentLaunchTotal)}
                    {billingSuffix}{' '}
                    <span className="text-muted-foreground line-through">
                      ${formatNumber(currentTotal)}
                      {billingSuffix}
                    </span>
                  </>
                ) : (
                  `$${formatNumber(currentTotal)}${billingSuffix}`
                )}
              </span>
            </div>
            {currentLaunchTotal != null ? (
              <p className="mt-1 text-right text-xs font-medium text-primary">
                Code {LAUNCH_OFFER.code}: {LAUNCH_OFFER.terms}
                {isLaunchOfferLive() && LAUNCH_OFFER.endsAtDisplay
                  ? ` Offer ends ${LAUNCH_OFFER.endsAtDisplay}.`
                  : ''}
              </p>
            ) : null}
            <div className="mt-2 flex justify-between text-sm text-muted-foreground">
              <span>Due today</span>
              <span className="font-mono tabular-nums">$0.00</span>
            </div>
            <div className="mt-2 border-t pt-2">
              <p className="text-sm font-medium">
                {publicKnowledge.claims.byId['money-back-guarantee'].wording
                  .split('.')[0]
                  ?.replace('Reconcile has a ', '')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {moneyBackGuarantee}
              </p>
            </div>
            <div className="border-t pt-2">
              <p className="text-sm text-muted-foreground">
                {TRIAL_DAYS}-day free trial
                {currentLaunchTotal != null
                  ? `, then $${formatLaunchOfferPrice(currentLaunchTotal)}${billingSuffix}`
                  : currentTotal != null
                    ? `, then $${formatNumber(currentTotal)}${billingSuffix}`
                    : ''}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                No credit card required to start. Add billing before the trial
                ends to keep access.
              </p>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/50 p-4">
            <p className="mb-2 text-sm font-medium">
              Included in {selectedTier?.name ?? 'this package'}:
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {tierFeatures.slice(0, 12).map((feature) => (
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
              'Start 30-Day Trial'
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            No credit card required. Your unit count is saved before trial
            activation so your workspace matches the subscription you selected.
          </p>
        </CardContent>
      </Card>
    </PageContainer>
  )
}

function getTrialStartOfferFields(
  offer: string | null,
  offerToken: string | null
): {
  launch_offer_code?: typeof LAUNCH_OFFER_CODE
} {
  const fields: {
    launch_offer_code?: typeof LAUNCH_OFFER_CODE
  } = {}

  if (offerToken) {
    return fields
  }

  if (shouldApplyLaunchOffer(offer)) {
    fields.launch_offer_code = LAUNCH_OFFER_CODE
  }

  return fields
}
