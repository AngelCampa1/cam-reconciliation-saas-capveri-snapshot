/**
 * Billing Dashboard Page
 */
import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import {
  CreditCard,
  FileText,
  TrendingUp,
  Users,
  Building,
  AlertTriangle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ErrorState'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  getSubscriptionStatusVariant,
  formatSubscriptionStatus,
} from '@/lib/subscription-status'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useSubscription } from '@/hooks/use-subscription'
import { useOrganizationUsage } from '@/hooks/use-organization-usage'
import { useStripePortal } from '@/hooks/use-stripe-portal'
import { useFeatureUsage } from '@/hooks/use-feature-usage'
import { PageContainer } from '@/components/layout'
import { trackEvent } from '@/lib/analytics'
import { PageHeader } from '@/components/layout/PageHeader'
import { BillingWarningBanner } from '@/components/billing/BillingWarningBanner'
import { CancelSubscriptionWizard } from '@/components/billing/CancelSubscriptionWizard'
import { PlanComparison } from '@/components/billing/PlanComparison'
import { ConfirmPlanDialog } from '@/components/billing/ConfirmPlanDialog'
import { supabase } from '@/lib/supabase'
import { authenticatedFetch } from '@/api/authFetch'
import { ApiError, isApiError } from '@/api/errors'
import {
  apiClient,
  resumeSubscriptionApiV1BillingSubscriptionResumePost,
} from '@/api/client'
import { toast } from '@/components/ui/sonner'
import { captureHttpFailure, captureUnexpectedError } from '@/lib/sentry'
import { TIERS, type TierId } from '@/config/plans'
import {
  LAUNCH_OFFER_CODE,
  shouldApplyLaunchOffer,
} from '@/config/launch-offer'
import { publicKnowledge } from '@/generated/public-knowledge'

export function BillingPage() {
  const {
    data: subscription,
    isLoading: subLoading,
    isError: subError,
    refetch,
  } = useSubscription()
  const {
    data: usage,
    isLoading: usageLoading,
    isError: usageError,
    refetch: refetchUsage,
  } = useOrganizationUsage()
  const { data: featureUsage } = useFeatureUsage()
  const stripePortal = useStripePortal()
  const [searchParams] = useSearchParams()
  const urlRequestsPlanSelection = searchParams.get('intent') === 'select-plan'
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [billingSetupLoading, setBillingSetupLoading] = useState(false)
  const [showPlanPicker, setShowPlanPicker] = useState(urlRequestsPlanSelection)
  const [pendingTier, setPendingTier] = useState<TierId | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [isResuming, setIsResuming] = useState(false)
  const requestedUnitCount = getRequestedUnitCount(searchParams)
  const selectedUnitCount =
    requestedUnitCount ??
    (subscription ? getCoveredUnitCount(subscription) : 25)

  // Resume a canceled/paused subscription. Guards against double-submit and
  // surfaces the backend error detail when the resume fails.
  const handleResumeSubscription = async () => {
    if (isResuming) return
    setIsResuming(true)
    try {
      const result = await resumeSubscriptionApiV1BillingSubscriptionResumePost(
        {
          client: apiClient,
        }
      )
      if (result.error) {
        const detail = (result.error as { detail?: unknown } | undefined)
          ?.detail
        toast.error(
          typeof detail === 'string' ? detail : 'Failed to resume subscription'
        )
        return
      }
      toast.success('Subscription resumed successfully')
      await refetch()
    } finally {
      setIsResuming(false)
    }
  }

  const needsCheckoutSetup =
    !!subscription &&
    !subscription.stripe_subscription_id &&
    (subscription.status === 'trialing' || subscription.status === 'paused')
  const canResumeSubscription =
    !!subscription &&
    (subscription.cancel_at_period_end ||
      (subscription.status === 'paused' &&
        !!subscription.stripe_subscription_id))

  const isTrialingWithoutStripe =
    !!subscription &&
    subscription.status === 'trialing' &&
    !subscription.stripe_subscription_id
  const canUseCheckoutPlanPicker =
    !subLoading && (!subscription || needsCheckoutSetup)
  const shouldRenderPlanPicker =
    canUseCheckoutPlanPicker && (isTrialingWithoutStripe || showPlanPicker)

  const handleChangePlan = () => {
    if (isTrialingWithoutStripe) {
      setShowPlanPicker(true)
    } else {
      const returnUrl = `${window.location.origin}/settings/billing`
      stripePortal.mutate(returnUrl)
    }
  }

  const handleSelectPlan = (tierId: TierId) => {
    setPendingTier(tierId)
    setConfirmDialogOpen(true)
  }

  const handleConfirmPlan = async () => {
    if (!pendingTier) return
    setBillingSetupLoading(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) {
        toast.error('Authentication required', {
          description: 'Please log in again before adding billing.',
        })
        setBillingSetupLoading(false)
        return
      }
      const res = await authenticatedFetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: pendingTier,
          billing_period: getCheckoutBillingPeriod(),
          unit_count: selectedUnitCount,
          building_count: Math.max(subscription?.building_count ?? 1, 1),
          success_url: `${window.location.origin}/checkout/success`,
          cancel_url: `${window.location.origin}/settings/billing`,
          ...getCheckoutOfferFields(searchParams),
        }),
      })
      if (!res.ok) {
        if (res.status >= 500) {
          captureHttpFailure({
            operation: 'open-checkout',
            surface: 'billing',
            path: '/api/v1/billing/checkout',
            statusCode: res.status,
          })
        }
        throw await checkoutResponseToApiError(res, 'Failed to open checkout')
      }
      const checkout = await res.json()
      if (!checkout.checkout_url) throw new Error('No checkout URL returned')
      trackEvent('checkout_started', {
        plan: pendingTier,
        billing_period: getCheckoutBillingPeriod(),
      })
      window.location.href = checkout.checkout_url
    } catch (error) {
      if (!isApiError(error)) {
        captureUnexpectedError(error, {
          operation: 'open-checkout',
          surface: 'billing',
          path: '/api/v1/billing/checkout',
        })
      }
      toast.error('Billing setup failed', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      })
      setBillingSetupLoading(false)
    }
  }

  const handleCompleteBillingSetup = async () => {
    if (!subscription) return

    setBillingSetupLoading(true)

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        toast.error('Authentication required', {
          description: 'Please log in again before adding billing.',
        })
        setBillingSetupLoading(false)
        return
      }

      const res = await authenticatedFetch('/api/v1/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_id: getCheckoutTier(),
          billing_period: getCheckoutBillingPeriod(),
          unit_count: selectedUnitCount,
          building_count: Math.max(subscription.building_count || 1, 1),
          success_url: `${window.location.origin}/checkout/success`,
          cancel_url: `${window.location.origin}/settings/billing`,
          ...getCheckoutOfferFields(searchParams),
        }),
      })

      if (!res.ok) {
        if (res.status >= 500) {
          captureHttpFailure({
            operation: 'open-checkout',
            surface: 'billing',
            path: '/api/v1/billing/checkout',
            statusCode: res.status,
          })
        }
        throw await checkoutResponseToApiError(res, 'Failed to open checkout')
      }

      const checkout = await res.json()
      if (!checkout.checkout_url) {
        throw new Error('Checkout did not return a redirect URL')
      }
      trackEvent('checkout_started', {
        plan: getCheckoutTier(),
        billing_period: getCheckoutBillingPeriod(),
      })
      window.location.href = checkout.checkout_url
    } catch (error) {
      if (!isApiError(error)) {
        captureUnexpectedError(error, {
          operation: 'open-checkout',
          surface: 'billing',
          path: '/api/v1/billing/checkout',
        })
      }
      toast.error('Billing setup failed', {
        description:
          error instanceof Error
            ? error.message
            : 'Please try again or contact support.',
      })
      setBillingSetupLoading(false)
    }
  }

  // F-133: fail-open. Show inline error instead of escalating to the
  // global ErrorBoundary and white-screening the entire app.
  if (subError) {
    return (
      <PageContainer className="space-y-8">
        <PageHeader
          title="Billing & Subscription"
          description="View your plan, usage, and past invoices."
          breadcrumbs={[
            { label: 'Home', href: '/' },
            { label: 'Billing & Subscription' },
          ]}
        />
        <ErrorState
          title="Couldn't load billing"
          description="This might be a temporary problem."
          action={{ onClick: () => refetch() }}
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer className="space-y-8">
      <PageHeader
        title="Billing & Subscription"
        description="Manage your subscription, payment methods, and billing history."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Billing' }]}
      />

      {subscription && usage && (
        <BillingWarningBanner
          unitCount={usage.unitsUsed}
          coveredUnitCount={getCoveredUnitCount(subscription)}
        />
      )}

      {shouldRenderPlanPicker && (
        <Card className="shadow-sm">
          <CardHeader
            variant="muted"
            className="cursor-pointer rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            onClick={() => setShowPlanPicker((v) => !v)}
            role="button"
            tabIndex={0}
            aria-expanded={showPlanPicker}
            aria-controls="plan-picker-content"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setShowPlanPicker((v) => !v)
              }
            }}
          >
            <div className="flex items-center justify-between">
              <CardTitle as="h2" className="text-base">
                Choose your plan
              </CardTitle>
              {showPlanPicker ? (
                <ChevronUp
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
              ) : (
                <ChevronDown
                  className="h-4 w-4 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
            </div>
            {isTrialingWithoutStripe && !showPlanPicker && (
              <p className="text-sm text-muted-foreground mt-1">
                Your trial gives you full access. Pick a plan when you're ready.
                No rush.
              </p>
            )}
          </CardHeader>
          {showPlanPicker && (
            <CardContent className="pt-4" id="plan-picker-content">
              <PlanComparison
                currentTierId={
                  (subscription?.tier ?? subscription?.plan) as TierId | null
                }
                onSelectPlan={handleSelectPlan}
                unitCount={selectedUnitCount}
              />
            </CardContent>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader variant="muted">
            <CardTitle as="h2" className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
              Current Plan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : subscription ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <span className="text-lg md:text-xl lg:text-2xl font-bold">
                    {getPlanDisplayName(subscription.plan)}
                  </span>
                  <StatusBadge status={subscription.status} />
                  {subscription.cancel_at_period_end && (
                    <Badge variant="destructive">Canceling</Badge>
                  )}
                </div>

                {getPlanTagline(subscription.plan) && (
                  <p className="text-sm text-muted-foreground">
                    {getPlanTagline(subscription.plan)}
                  </p>
                )}

                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pricing model</span>
                    <span className="font-medium">
                      {getPricingModelLabel(subscription.pricing_model)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Rentable units on your plan
                    </span>
                    <span className="font-medium">
                      {getCoveredUnitCount(subscription)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Buildings on your plan
                    </span>
                    <span className="font-medium">
                      {subscription.building_count}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Current period
                    </span>
                    <span>
                      {format(
                        new Date(subscription.current_period_start),
                        'MMM d'
                      )}{' '}
                      -{' '}
                      {format(
                        new Date(subscription.current_period_end),
                        'MMM d, yyyy'
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {subscription.status === 'trialing'
                        ? 'Trial ends'
                        : 'Next invoice'}
                    </span>
                    <span>
                      {subscription.cancel_at_period_end
                        ? 'No upcoming invoice'
                        : format(
                            new Date(subscription.current_period_end),
                            'MMM d, yyyy'
                          )}
                    </span>
                  </div>
                  {subscription.status === 'trialing' && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Billing reminder
                      </span>
                      <span>
                        Add billing before{' '}
                        {format(
                          new Date(subscription.current_period_end),
                          'MMM d, yyyy'
                        )}{' '}
                        to keep access
                      </span>
                    </div>
                  )}
                </div>

                {subscription.cancel_at_period_end && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 rounded-md bg-warning/10 p-3 text-warning-foreground"
                  >
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">
                      Your subscription will end on{' '}
                      {format(
                        new Date(subscription.current_period_end),
                        'MMMM d, yyyy'
                      )}
                    </span>
                  </div>
                )}

                {subscription.status === 'paused' && (
                  <div
                    role="alert"
                    className="rounded-md bg-destructive/10 p-3 text-sm text-destructive-strong"
                  >
                    {subscription.stripe_subscription_id
                      ? 'Your trial ended without a payment method, so access is paused. Add billing, then resume your subscription to restore access.'
                      : 'Your trial ended without billing, so access is paused. Add billing to restore access.'}
                  </div>
                )}
              </div>
            ) : (
              <div className="py-4 text-center">
                <p className="mb-4 text-muted-foreground">
                  No active subscription
                </p>
                <Button asChild>
                  <Link to="/pricing">View Plans</Link>
                </Button>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            {subscription && (
              <>
                <Button
                  variant="outline"
                  onClick={
                    needsCheckoutSetup
                      ? () => void handleCompleteBillingSetup()
                      : handleChangePlan
                  }
                  disabled={stripePortal.isPending || billingSetupLoading}
                >
                  {stripePortal.isPending || billingSetupLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {billingSetupLoading
                        ? 'Opening checkout...'
                        : 'Redirecting...'}
                    </>
                  ) : needsCheckoutSetup || subscription.status === 'paused' ? (
                    'Add Billing'
                  ) : (
                    'Change Plan'
                  )}
                </Button>
                {canResumeSubscription ? (
                  <Button
                    variant="outline"
                    onClick={() => void handleResumeSubscription()}
                    disabled={isResuming}
                  >
                    {isResuming ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Resuming...
                      </>
                    ) : subscription.status === 'paused' ? (
                      'Resume Access'
                    ) : (
                      'Resume Subscription'
                    )}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    onClick={() => setCancelDialogOpen(true)}
                  >
                    Cancel Subscription
                  </Button>
                )}
              </>
            )}
          </CardFooter>
        </Card>

        <Card className="shadow-sm">
          <CardHeader variant="muted">
            <CardTitle as="h2" className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" aria-hidden="true" />
              Payment Method
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {subscription?.status === 'paused' &&
              subscription.stripe_subscription_id
                ? 'Add a payment method first, then use Resume Access to reactivate the subscription.'
                : subscription?.status === 'paused'
                  ? 'Add billing to restore access to your workspace.'
                  : 'To update your card, click Change Plan to open the billing portal.'}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-sm">
          <CardHeader variant="muted">
            <CardTitle as="h2">Usage This Period</CardTitle>
            <CardDescription>
              Current usage relative to your subscription limits
            </CardDescription>
          </CardHeader>
          <CardContent>
            {usageLoading || subLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : usage && subscription ? (
              <div className="space-y-6">
                <UsageBar
                  icon={<Building className="h-4 w-4" />}
                  label="Rentable Units"
                  current={usage.unitsUsed}
                  max={getCoveredUnitCount(subscription)}
                  overLimitMessage="You are tracking more rentable units than your subscription covers. Update billing to keep the full portfolio covered."
                />
                <BuildingCountBar
                  current={usage.propertiesUsed}
                  max={usage.propertiesLimit}
                />
                <UsageBar
                  icon={<Users className="h-4 w-4" />}
                  label="Team Members"
                  current={usage.usersUsed}
                  max={-1}
                />
              </div>
            ) : usageError ? (
              <div
                data-testid="usage-load-error"
                role="alert"
                className="flex flex-col items-center gap-3 py-6 text-center"
              >
                <AlertCircle className="h-7 w-7 text-destructive-strong" />
                <p className="text-sm text-destructive-strong">
                  We couldn&apos;t load your usage this period.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void refetchUsage()}
                >
                  Try again
                </Button>
              </div>
            ) : null}
          </CardContent>
          {usage &&
            subscription &&
            usage.unitsUsed > getCoveredUnitCount(subscription) && (
              <CardFooter>
                <Button asChild>
                  <Link to="/settings/billing">Update Billing</Link>
                </Button>
              </CardFooter>
            )}
        </Card>

        <Card className="shadow-sm">
          <CardHeader variant="muted">
            <CardTitle as="h2" className="flex items-center gap-2">
              <FileText className="h-5 w-5" aria-hidden="true" />
              Billing History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              View and download past invoices
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/settings/billing/invoices">View Invoices</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>

      <CancelSubscriptionWizard
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onSuccess={() => {
          refetch()
        }}
      />

      {pendingTier && (
        <ConfirmPlanDialog
          open={confirmDialogOpen}
          onOpenChange={(open) => {
            setConfirmDialogOpen(open)
            if (!open) setPendingTier(null)
          }}
          targetTierId={pendingTier}
          currentTierId={subscription?.tier ?? subscription?.plan}
          usedFeatures={featureUsage?.used_features ?? []}
          onConfirm={() => void handleConfirmPlan()}
          isLoading={billingSetupLoading}
        />
      )}
    </PageContainer>
  )
}

function StatusBadge({ status }: { status: string }) {
  // Shares the subscription-status SSOT (lib/subscription-status) with
  // OrganizationPage so the same status reads identically (color + casing)
  // across the Settings area.
  return (
    <Badge variant={getSubscriptionStatusVariant(status)}>
      {formatSubscriptionStatus(status)}
    </Badge>
  )
}

function getPlanDisplayName(plan: string): string {
  const displayNames: Record<string, string> = {
    reconcile: 'Reconcile',
    essentials: 'Reconcile',
    control: 'Reconcile',
    defend: 'Reconcile',
    growth: 'Reconcile',
    growth_v2: 'Reconcile',
    portfolio: 'Reconcile',
    professional: 'Reconcile',
    enterprise: 'Custom terms',
    credit_pack: 'Credit Pack',
  }

  return (
    displayNames[plan] ||
    plan
      .split('_')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' ')
  )
}

function getPricingModelLabel(pricingModel?: string | null): string {
  if (pricingModel === 'per_unit') return 'Package'
  if (pricingModel === 'credit_pack') return 'Credit pack'
  return 'Per building'
}

const PLAN_TO_TIER_ID: Record<string, TierId> = {
  reconcile: 'reconcile',
  essentials: 'reconcile',
  control: 'reconcile',
  defend: 'reconcile',
  growth: 'reconcile',
  growth_v2: 'reconcile',
  portfolio: 'reconcile',
  professional: 'reconcile',
}

function getPlanTagline(plan: string): string | null {
  const tierId = PLAN_TO_TIER_ID[plan]
  if (!tierId) return null
  return TIERS.find((tier) => tier.id === tierId)?.tagline ?? null
}

function getCoveredUnitCount(subscription: {
  pricing_model?: string | null
  unit_count?: number | null
  building_count: number
}) {
  return subscription.pricing_model === 'per_unit'
    ? (subscription.unit_count ?? 0)
    : subscription.building_count
}

function getRequestedUnitCount(searchParams: URLSearchParams): number | null {
  const rawUnits = searchParams.get('units')
  if (rawUnits == null) return null
  const parsedUnits = Number(rawUnits)
  if (!Number.isFinite(parsedUnits)) return null
  const unitCount = Math.trunc(parsedUnits)
  return unitCount > 0 ? unitCount : null
}

function getCheckoutTier(): 'reconcile' {
  return 'reconcile'
}

function getCheckoutBillingPeriod(): 'annual' {
  return 'annual'
}

function getCheckoutOfferFields(searchParams: URLSearchParams): {
  launch_offer_code?: typeof LAUNCH_OFFER_CODE
  offer_token?: string
} {
  const offer = searchParams.get('offer')
  const offerToken = searchParams.get('offer_token')
  const fields: {
    launch_offer_code?: typeof LAUNCH_OFFER_CODE
    offer_token?: string
  } = {}

  if (offerToken) {
    fields.offer_token = offerToken
    return fields
  }

  if (shouldApplyLaunchOffer(offer)) {
    fields.launch_offer_code = LAUNCH_OFFER_CODE
  }

  return fields
}

async function checkoutResponseToApiError(
  res: Response,
  fallbackMessage: string
): Promise<ApiError> {
  const error = await ApiError.fromResponse(res)
  return res.status >= 500 ||
    error.message === `Request failed with status ${res.status}`
    ? new ApiError(fallbackMessage, res.status, undefined, error)
    : error
}

function BuildingCountBar({ current, max }: { current: number; max: number }) {
  const isUnlimited = max === -1
  const percentage = isUnlimited ? 0 : Math.min((current / max) * 100, 100)
  const isOverLimit = !isUnlimited && current > max
  const isNearLimit = percentage >= 80 && !isOverLimit

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Building className="h-4 w-4" />
          <span>Buildings</span>
        </div>
        <span
          className={
            isOverLimit
              ? 'font-medium text-destructive-strong'
              : isNearLimit
                ? 'font-medium text-warning-foreground'
                : ''
          }
        >
          {current} / {isUnlimited ? 'Unlimited' : max}
        </span>
      </div>
      {!isUnlimited && (
        <Progress
          value={percentage}
          label="Buildings usage"
          className={
            isOverLimit
              ? '[&>div]:bg-destructive'
              : isNearLimit
                ? '[&>div]:bg-warning'
                : ''
          }
        />
      )}
      {!isUnlimited && current >= max && (
        <p className="text-xs text-destructive-strong">
          Above {max} buildings, email us at{' '}
          {publicKnowledge.contacts.byId.founder.email} to talk through options.
        </p>
      )}
    </div>
  )
}

function UsageBar({
  icon,
  label,
  current,
  max,
  overLimitMessage,
}: {
  icon: ReactNode
  label: string
  current: number
  max: number
  overLimitMessage?: string
}) {
  const percentage = max === -1 ? 0 : Math.min((current / max) * 100, 100)
  const isOverLimit = max !== -1 && current > max
  const isNearLimit = percentage >= 80
  const isUnlimited = max === -1

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {icon}
          <span>{label}</span>
        </div>
        <span
          className={
            isOverLimit
              ? 'font-medium text-destructive-strong'
              : isNearLimit && !isUnlimited
                ? 'font-medium text-warning-foreground'
                : ''
          }
        >
          {current} / {isUnlimited ? 'Unlimited' : max}
        </span>
      </div>
      {!isUnlimited && (
        <Progress
          value={percentage}
          aria-label={`${label} usage`}
          className={
            isOverLimit
              ? '[&>div]:bg-destructive'
              : isNearLimit
                ? '[&>div]:bg-warning'
                : ''
          }
        />
      )}
      {isOverLimit && overLimitMessage && (
        <p className="text-xs text-destructive-strong">{overLimitMessage}</p>
      )}
    </div>
  )
}
