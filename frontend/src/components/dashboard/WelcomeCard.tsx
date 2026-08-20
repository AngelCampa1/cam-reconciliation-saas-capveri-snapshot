/**
 * Dashboard hero card component
 *
 * The main hero section of the dashboard showing statement totals to review.
 * Features an animated count-up effect for the big number.
 */
import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ArrowRight, Building2, Clock, DollarSign, Upload } from 'lucide-react'
import type { DashboardTier } from './dashboard-tier'
import { formatMoneyWhole } from '@/lib/money'
import { formatNumber } from '@/lib/number'

export interface WelcomeCardProps {
  /** Dashboard personalization tier */
  tier: DashboardTier
  /** Tier-specific hero title */
  heroTitle: string
  /** Tier-specific hero subtitle */
  heroSubtitle: string
  /** Tier-specific hero CTA label */
  heroCtaLabel: string
  /** Tier-specific hero CTA destination */
  heroCtaHref: string
  /** Property count for summary */
  propertyCount?: number
  /** Pending reconciliation count */
  pendingReconciliations?: number
  /** Total statement exposure identified by the current backend summary */
  statementExposure?: number
  /** Amount billed above the checked statement total */
  overbillExposure?: number
  /** Amount billed below the checked statement total */
  underbillExposure?: number
  /** Cumulative finalized amount from existing reconciliation snapshots */
  totalRecoveryFinalized?: number
  /** Whether the account still needs its first setup steps */
  isSetupFirst?: boolean
  /** Additional CSS classes */
  className?: string
}

/**
 * Animated counter hook - counts up to target value
 */
function useCountUp(target: number, duration = 2000): number {
  // Honor reduced-motion: users who ask for less motion get the final value
  // immediately, with no animated count-up (and no misleading mid-animation
  // partial figures). Read once at mount; this matches the effect's lifetime.
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const [count, setCount] = useState(prefersReducedMotion ? target : 0)
  const startTimeRef = useRef<number | null>(null)
  const animationRef = useRef<number | null>(null)
  const prevTargetRef = useRef(target)

  useEffect(() => {
    // With reduced motion, skip the animation entirely and show the target.
    if (prefersReducedMotion) {
      prevTargetRef.current = target
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCount(target)
      return
    }

    // Reset count when target changes to 0
    if (target === 0 && prevTargetRef.current !== 0) {
      prevTargetRef.current = target

      setCount(0)
      return
    }
    prevTargetRef.current = target

    if (target === 0) {
      return
    }

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp
      }

      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Ease-out cubic for satisfying deceleration
      const eased = 1 - Math.pow(1 - progress, 3)
      setCount(Math.floor(eased * target))

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        setCount(target)
      }
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [target, duration, prefersReducedMotion])

  return count
}

export function WelcomeCard({
  tier,
  heroTitle,
  heroSubtitle,
  heroCtaLabel,
  heroCtaHref,
  propertyCount = 0,
  pendingReconciliations = 0,
  statementExposure = 0,
  overbillExposure = 0,
  underbillExposure = 0,
  totalRecoveryFinalized = 0,
  isSetupFirst = false,
  className,
}: WelcomeCardProps) {
  const animatedHero = useCountUp(statementExposure)
  const displayedHeroValue = isSetupFirst ? 0 : animatedHero
  const eyebrow = isSetupFirst ? 'Catch CAM billing mistakes' : heroTitle
  const title = isSetupFirst
    ? 'We check the statement before you send it.'
    : heroSubtitle
  const showExposureSplit =
    !isSetupFirst &&
    statementExposure > 0 &&
    (overbillExposure > 0 || underbillExposure > 0)

  return (
    <div className={cn('space-y-4', className)}>
      {/* Hero card: shows setup guidance or statement totals to review */}
      <Card className="overflow-hidden shadow-elevation-2">
        <CardContent className="py-8 sm:py-10">
          <div className="mx-auto max-w-3xl text-center">
            {/* The eyebrow is the hero section's real label, so it carries the
                <h2>; the dollar figure below is a data value, not a heading, and
                was previously marked up as the <h2> (made screen readers
                announce "$8,950" as a section). */}
            <h2 className="break-words text-sm font-medium uppercase tracking-wider text-muted-foreground">
              {eyebrow}
            </h2>
            <p className="mt-2 break-words text-3xl font-bold font-mono tabular-nums tracking-tight text-primary sm:text-5xl lg:text-6xl">
              {formatMoneyWhole(displayedHeroValue)}
            </p>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {title}
            </p>
            {showExposureSplit ? (
              <div className="mx-auto mt-4 grid max-w-md grid-cols-1 gap-2 text-left sm:grid-cols-2">
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Over-bill total
                  </div>
                  <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {formatMoneyWhole(overbillExposure)}
                  </div>
                </div>
                <div className="rounded-lg border bg-muted/30 px-3 py-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Under-bill total
                  </div>
                  <div className="font-mono text-sm font-semibold tabular-nums text-foreground">
                    {formatMoneyWhole(underbillExposure)}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex justify-center">
              <Button
                asChild
                size="lg"
                className="min-h-11 max-w-full gap-2 whitespace-normal rounded-full text-center font-semibold"
              >
                <Link to={heroCtaHref}>
                  {tier === 'free' ? (
                    <Upload className="h-4 w-4" aria-hidden="true" />
                  ) : null}
                  <span className="min-w-0 break-words">{heroCtaLabel}</span>
                  {tier !== 'free' ? (
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  ) : null}
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Properties Card */}
        <Card className="border-l-4 border-l-primary shadow-elevation-1 transition-all duration-fast hover:shadow-elevation-2">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Building2
                  className="h-5 w-5 text-primary"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <div className="break-words text-2xl font-bold tabular-nums">
                  {formatNumber(propertyCount)}
                </div>
                <div className="text-sm text-muted-foreground">Properties</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pending Card */}
        <Card className="border-l-4 border-l-warning shadow-elevation-1 transition-all duration-fast hover:shadow-elevation-2">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/10">
                <Clock
                  className="h-5 w-5 text-warning-foreground"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <div className="break-words text-2xl font-bold tabular-nums text-warning-foreground">
                  {formatNumber(pendingReconciliations)}
                </div>
                <div className="text-sm text-muted-foreground">
                  Need Attention
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Finalized Amount Card */}
        <Card className="border-l-4 border-l-success shadow-elevation-1 transition-all duration-fast hover:shadow-elevation-2">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success/10">
                <DollarSign
                  className="h-5 w-5 text-success-strong"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <div className="break-words text-2xl font-bold font-mono tabular-nums text-success-strong">
                  {formatMoneyWhole(totalRecoveryFinalized)}
                </div>
                <div className="text-sm text-muted-foreground">
                  Finalized billing exposure
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
