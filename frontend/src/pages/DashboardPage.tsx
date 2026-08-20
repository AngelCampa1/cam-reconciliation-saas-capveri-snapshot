/**
 * Dashboard Page
 *
 * Main dashboard for authenticated users showing statement checks,
 * quick actions, and items needing attention.
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { PageHeader, PageContainer } from '@/components/layout'
import { getSession } from '@/api/client'
import { useSubscription } from '@/hooks/use-subscription'
import {
  WelcomeCard,
  GettingStartedChecklist,
  QuickActionsCard,
  ReconciliationStatusCard,
  WelcomeTourOverlay,
  type ChecklistItem,
  type ReconciliationStatusItem,
} from '@/components/dashboard'
import {
  getDashboardHeroContent,
  resolveDashboardTier,
} from '@/components/dashboard/dashboard-tier'
import { SkeletonCard } from '@/components/ui/skeleton'
import { TaxProtestDeadlineCard } from '@/components/dashboard/TaxProtestDeadlineCard'
import { trackEvent } from '@/lib/analytics'
import { formatMoneyWhole } from '@/lib/money'
import { resolveApiUrl } from '@/api/url'
import { ErrorState } from '@/components/ErrorState'
import { getSampleResultSeenStorageKey } from '@/features/plg/steps/sampleResult'
import { useAuth } from '@/hooks/useAuth'

const ONBOARDING_STORAGE_KEY = 'capveri_onboarding'
const TOUR_STORAGE_KEY = 'capveri_tour'
const ACTIVATION_FIRED_KEY = 'capveri_activation_fired'

interface OnboardingState {
  completed: boolean
  skipped: boolean
  dismissed: boolean
}

interface PropertySummaryAPI {
  id: string
  name: string
  unit_count: number
  last_reconciliation: string | null
}

interface DashboardSummary {
  property_count: number
  unit_count: number
  lease_count: number
  gl_entry_count: number
  pending_reconciliations: number
  pending_verifications: number
  total_recovery_finalized: string
  recent_properties: PropertySummaryAPI[]
}

/**
 * Custom hook to fetch dashboard summary data
 */
function useDashboard() {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const session = await getSession()
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch(resolveApiUrl('/api/v1/dashboard'), {
        headers,
      })

      if (!response.ok) {
        throw new Error('Failed to fetch dashboard data')
      }

      return response.json()
    },
    staleTime: 30000, // Consider data fresh for 30 seconds
  })
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [showChecklist, setShowChecklist] = useState(() => {
    const storedState = localStorage.getItem(ONBOARDING_STORAGE_KEY)
    if (storedState) {
      try {
        const state: OnboardingState = JSON.parse(storedState)
        return !state.dismissed
      } catch {
        return true
      }
    }
    return true
  })

  const [showTour, setShowTour] = useState(() => {
    try {
      const stored = localStorage.getItem(TOUR_STORAGE_KEY)
      return !stored
    } catch {
      return true
    }
  })

  const handleDismissTour = () => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ skipped: true }))
    } catch {
      // storage unavailable; state-only dismiss is acceptable
    }
    setShowTour(false)
  }

  const {
    data: dashboard,
    isLoading,
    error,
    isPaused,
    refetch,
  } = useDashboard()

  // A paused fetch (React Query networkMode pausing on an unreachable backend)
  // leaves error null and dashboard undefined, so without this the page would
  // fall through to the redirect/empty branches instead of telling the user the
  // server is unreachable. The `!dashboard` guard keeps any stale dashboard
  // rendered rather than hiding it behind an offline screen.
  const isOffline = isPaused && !dashboard
  const { data: subscription } = useSubscription()
  const { user } = useAuth()

  // Fetch comparison summary for statement totals display.
  interface LeakageSummary {
    total_recovery_opportunity: string
    properties_with_leakage: number
    total_underbill_exposure?: string
    total_overbill_exposure?: string
    total_billing_exposure?: string
    properties_with_underbill?: number
    properties_with_overbill?: number
    properties_with_billing_exposure?: number
    has_billing_data: boolean
    draft_recovery?: string
    draft_property_count?: number
  }

  const { data: leakageSummary } = useQuery<LeakageSummary>({
    queryKey: ['leakage-summary'],
    queryFn: async () => {
      const session = await getSession()
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      }

      const response = await fetch(resolveApiUrl('/api/v1/leakage/summary'), {
        headers,
      })

      if (!response.ok) {
        throw new Error('Failed to fetch leakage summary')
      }

      return response.json()
    },
    throwOnError: false,
  })

  // Parse comparison summary into numbers. The legacy recovery field is kept
  // as a fallback for older API responses; new responses separate both sides.
  const underbillExposure = parseFloat(
    leakageSummary?.total_underbill_exposure ??
      leakageSummary?.total_recovery_opportunity ??
      '0'
  )
  const overbillExposure = parseFloat(
    leakageSummary?.total_overbill_exposure ?? '0'
  )
  const legacyRecoveryOpportunity = parseFloat(
    leakageSummary?.total_recovery_opportunity ?? '0'
  )
  const billingExposure = parseFloat(
    leakageSummary?.total_billing_exposure ??
      String(underbillExposure + overbillExposure)
  )
  const draftRecovery = parseFloat(leakageSummary?.draft_recovery ?? '0')
  const draftPropertyCount = leakageSummary?.draft_property_count ?? 0
  const hasBillingData = leakageSummary?.has_billing_data ?? false
  const heroStatementAmount = hasBillingData ? billingExposure : draftRecovery
  const dashboardTier = resolveDashboardTier(subscription)
  const heroContent = getDashboardHeroContent(dashboardTier)
  const hasSetupStarted = (dashboard?.property_count ?? 0) > 0
  const heroTitle =
    heroStatementAmount > 0
      ? hasBillingData
        ? 'Bill amount to check'
        : 'Statement total to check'
      : 'No issues found'
  const heroSubtitle =
    heroStatementAmount > 0
      ? hasBillingData
        ? 'Check over-bills and under-bills before you send.'
        : 'Check statement totals before you send.'
      : 'Check again any time.'
  const dashboardHero = !hasSetupStarted
    ? {
        title: 'Catch CAM billing mistakes',
        subtitle: 'We check the statement before you send it.',
        ctaLabel: 'Add your first building',
        ctaHref: '/properties/new',
      }
    : {
        title: heroTitle,
        subtitle: heroSubtitle,
        ctaLabel:
          heroStatementAmount > 0 ? 'Review drafts' : heroContent.ctaLabel,
        ctaHref:
          heroStatementAmount > 0 ? '/portfolio/pipeline' : heroContent.ctaHref,
      }

  // Determine if user is new based on property count.
  // Used for the welcome tour overlay only. The activation checklist persists
  // through full setup completion regardless.
  const isNewUser = dashboard?.property_count === 0
  const sampleResultSeen = (() => {
    if (!user?.id) return false
    try {
      return (
        localStorage.getItem(getSampleResultSeenStorageKey(user.id)) === '1'
      )
    } catch {
      return false
    }
  })()
  const shouldRedirectToSample = !!dashboard && isNewUser && !sampleResultSeen

  useEffect(() => {
    if (isLoading || error || !dashboard) return
    if (!shouldRedirectToSample) return
    navigate('/onboard?demo=1&source=first-login', { replace: true })
  }, [dashboard, error, isLoading, navigate, shouldRedirectToSample])

  // Fire dashboard_viewed PostHog event once per mount when data is ready
  const dashboardCaptured = useRef(false)
  useEffect(() => {
    if (shouldRedirectToSample) return
    if (!isLoading && dashboard && !dashboardCaptured.current) {
      dashboardCaptured.current = true
      trackEvent('dashboard_viewed', {
        property_count: dashboard.property_count,
        pending_reconciliations: dashboard.pending_reconciliations,
      })
    }
  }, [isLoading, dashboard, shouldRedirectToSample])

  // Build checklist items based on user progress. Items are anchored to
  // outcomes (what the user gets), not UI actions. The sample comes first so a
  // zero-property account starts with a real value moment before setup work.
  const checklistItems: ChecklistItem[] = [
    {
      id: 'sample',
      title: 'See a sample result',
      description:
        'See how CapVeri catches over-bills and under-bills. Fix them before you send.',
      completed: sampleResultSeen,
      // `?demo=1` reaches the sample result for a signed-in user; a bare
      // /onboard bounces logged-in users to checkout.
      href: '/onboard?demo=1',
    },
    {
      id: 'property',
      title: 'Check your own building',
      description: 'Add one building. We check the statement for mistakes.',
      completed: (dashboard?.property_count ?? 0) > 0,
      href: '/properties/new',
    },
    {
      id: 'export',
      title: 'Get your support packet',
      description: 'Save the math and notes. Use them before you send.',
      completed: parseFloat(dashboard?.total_recovery_finalized ?? '0') > 0,
      href: '/reconciliations',
    },
    {
      id: 'more-properties',
      title: 'Add your other buildings',
      description: 'Have more buildings? Add them and check each one.',
      completed: (dashboard?.property_count ?? 0) > 1,
      href: '/properties/new',
    },
  ]

  // Loading and error branches return early below; from the point this code
  // renders, dashboard data is present. The checklist visibility gate is the
  // user's dismissal preference only.
  const allChecklistComplete =
    !!dashboard && checklistItems.every((item) => item.completed)
  const showActivationChecklist = !!dashboard && showChecklist

  // Fire activation_completed once when the user has finished every setup
  // step. Idempotency is per-browser via localStorage; downstream PostHog
  // analysis should still dedupe by distinct_id to handle clearStorage,
  // incognito, or multi-device cases.
  const propertyCountForEvent = dashboard?.property_count
  useEffect(() => {
    if (!allChecklistComplete) return
    try {
      if (localStorage.getItem(ACTIVATION_FIRED_KEY)) return
      localStorage.setItem(ACTIVATION_FIRED_KEY, '1')
    } catch {
      // storage unavailable; fire-and-forget is acceptable
    }
    trackEvent('activation_completed', {
      property_count: propertyCountForEvent ?? 0,
    })
  }, [allChecklistComplete, propertyCountForEvent])

  const handleDismissChecklist = () => {
    const state: OnboardingState = {
      completed: false,
      skipped: false,
      dismissed: true,
    }
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state))
    setShowChecklist(false)
  }

  // Build reconciliation items from properties that need attention
  const needsAttentionItems: ReconciliationStatusItem[] = (
    dashboard?.recent_properties ?? []
  )
    .filter(
      (prop) =>
        !prop.last_reconciliation ||
        prop.last_reconciliation.startsWith('Draft')
    )
    .slice(0, 5)
    .map((prop) => ({
      id: prop.id,
      propertyId: prop.id,
      propertyName: prop.name,
      status: prop.last_reconciliation?.startsWith('Draft')
        ? ('draft' as const)
        : ('needs_calculation' as const),
      tenantName: `${prop.unit_count} unit${prop.unit_count !== 1 ? 's' : ''}`,
    }))

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader
          title="Dashboard"
          description="See what needs review and what to do next."
        />
        <div className="space-y-4">
          {/* Hero skeleton */}
          <SkeletonCard className="h-48" bodyLines={0} />

          {/* Metrics skeleton */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SkeletonCard className="h-24" bodyLines={0} />
            <SkeletonCard className="h-24" bodyLines={0} />
            <SkeletonCard className="h-24" bodyLines={0} />
          </div>

          {/* Actions skeleton */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <SkeletonCard bodyLines={3} />
            <SkeletonCard bodyLines={3} />
          </div>
        </div>
      </PageContainer>
    )
  }

  if (error || isOffline) {
    return (
      <PageContainer>
        <PageHeader
          title="Dashboard"
          description="See what needs review and what to do next."
        />
        <ErrorState
          title="Couldn't load your dashboard"
          offline={isOffline}
          action={{ onClick: () => refetch() }}
        />
      </PageContainer>
    )
  }

  if (shouldRedirectToSample) {
    return (
      <PageContainer>
        <SkeletonCard className="h-48" bodyLines={0} />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Dashboard"
        description="See what needs review and what to do next."
      />

      <div className="space-y-6">
        {/* Hero statement check card + metrics */}
        <WelcomeCard
          tier={dashboardTier}
          heroTitle={dashboardHero.title}
          heroSubtitle={dashboardHero.subtitle}
          heroCtaLabel={dashboardHero.ctaLabel}
          heroCtaHref={dashboardHero.ctaHref}
          propertyCount={dashboard?.property_count ?? 0}
          pendingReconciliations={needsAttentionItems.length}
          statementExposure={heroStatementAmount}
          overbillExposure={hasBillingData ? overbillExposure : 0}
          underbillExposure={hasBillingData ? underbillExposure : 0}
          totalRecoveryFinalized={parseFloat(
            dashboard?.total_recovery_finalized ?? '0'
          )}
          isSetupFirst={!hasSetupStarted}
        />

        {/* Draft exposure banner: complements the hero when the hero is showing
            leakage (billing data present) and there's no leakage to show, but drafts
            still need finalizing. Without billing data the hero already shows the draft
            figure, so this banner stays hidden to avoid surfacing the same number twice. */}
        {draftRecovery > 0 &&
          legacyRecoveryOpportunity === 0 &&
          billingExposure === 0 &&
          hasBillingData && (
            <button
              type="button"
              className="block w-full rounded-lg border border-primary/20 bg-primary/5 p-4 text-left cursor-pointer hover:bg-primary/10 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              onClick={() => navigate('/reconciliations')}
              aria-label="View your checks"
            >
              <span className="block text-sm font-medium text-primary">
                You have {draftPropertyCount} check
                {draftPropertyCount !== 1 ? 's' : ''} almost done, worth{' '}
                {formatMoneyWhole(draftRecovery)}. Finish the check
                {draftPropertyCount !== 1 ? 's' : ''}.
              </span>
            </button>
          )}

        {/* Activation checklist: persists until every step completes or dismissed */}
        {showActivationChecklist && !allChecklistComplete && (
          <GettingStartedChecklist
            items={checklistItems}
            onDismiss={handleDismissChecklist}
          />
        )}

        {/* Tax Protest Deadlines (Jan-Jun only) */}
        <TaxProtestDeadlineCard />

        {/* Quick Actions + Needs Attention */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <QuickActionsCard tier={dashboardTier} />
          <ReconciliationStatusCard items={needsAttentionItems} />
        </div>
      </div>

      {isNewUser && !sampleResultSeen && (
        <WelcomeTourOverlay
          open={showTour}
          onSkip={handleDismissTour}
          onStart={handleDismissTour}
        />
      )}
    </PageContainer>
  )
}
