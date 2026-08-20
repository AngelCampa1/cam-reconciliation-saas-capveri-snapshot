/**
 * Pricing Teaser Component
 */
import { Check, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatMoneyWhole } from '@/lib/money'
import {
  FEATURES,
  TIERS,
  TRIAL_DAYS,
  getAnnualTotal,
  getFeaturesForTier,
} from '@/config/plans'
import {
  LAUNCH_OFFER,
  formatLaunchOfferPrice,
  getLaunchOfferPrice,
  isLaunchOfferLive,
} from '@/config/launch-offer'
import { publicKnowledge } from '@/generated/public-knowledge'

export interface PricingTeaserProps {
  className?: string
}

export function PricingTeaser({ className }: PricingTeaserProps) {
  const tier = TIERS.find((item) => item.id === 'reconcile')
  const tierId = 'reconcile'
  const featureKeys = getFeaturesForTier(tierId)
  const features = FEATURES.filter((feature) =>
    featureKeys.includes(feature.key)
  )
  const price = getAnnualTotal(tierId, 25)
  const launchPrice = getLaunchOfferPrice(tierId, 25)

  return (
    <section className={cn('bg-muted py-20', className)}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <Badge
            variant="default"
            className="mb-4 bg-primary text-primary-foreground"
          >
            {TRIAL_DAYS}-day free trial
          </Badge>
          <h2 className="mb-4 text-fluid-3xl font-bold tracking-tight text-foreground">
            Price Reconcile by unit count
          </h2>
          <p className="text-fluid-lg text-muted-foreground">
            {publicKnowledge.pricing.display.selfServeSummary}
          </p>
        </div>

        <Card className="mx-auto max-w-3xl shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">
              {tier?.name ?? 'Reconcile'}
            </CardTitle>
            {price != null && launchPrice != null ? (
              <div>
                <p className="text-2xl font-bold text-foreground md:text-3xl font-mono tabular-nums">
                  ${formatLaunchOfferPrice(launchPrice)}/yr{' '}
                  <span className="text-base font-medium text-muted-foreground line-through font-mono tabular-nums">
                    {formatMoneyWhole(price)}
                  </span>
                </p>
                <p className="mt-1 text-xs font-medium text-primary">
                  Limited time offer: {LAUNCH_OFFER.terms} Use code{' '}
                  {LAUNCH_OFFER.code}.
                  {isLaunchOfferLive() && LAUNCH_OFFER.endsAtDisplay
                    ? ` Offer ends ${LAUNCH_OFFER.endsAtDisplay}.`
                    : ''}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Then {formatMoneyWhole(price)}/yr after the first year.
                </p>
              </div>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Minimum subscription includes up to 25 rentable units. Use the
              pricing page calculator for more units.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <ul className="space-y-3">
              {features.slice(0, 5).map((feature) => (
                <li key={feature.key} className="flex items-center gap-3">
                  <Check className="h-5 w-5 flex-shrink-0 text-primary" />
                  <span className="text-muted-foreground">{feature.label}</span>
                </li>
              ))}
            </ul>

            <Button asChild className="w-full">
              <Link to="/auth/register?plan=reconcile&units=25">
                Start Free Trial
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <div className="mt-10 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            {publicKnowledge.pricing.enterpriseThreshold.summary}
          </p>
          <Link
            to="/pricing"
            className="inline-flex items-center text-primary hover:underline"
          >
            See full pricing
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
