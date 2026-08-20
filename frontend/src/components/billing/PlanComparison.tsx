import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TIERS, FEATURES, getAnnualTotal, type TierId } from '@/config/plans'
import {
  LAUNCH_OFFER,
  formatLaunchOfferPrice,
  getLaunchOfferPrice,
  isLaunchOfferLive,
} from '@/config/launch-offer'

const VISIBLE_TIER_IDS: TierId[] = ['reconcile']

interface PlanComparisonProps {
  currentTierId?: TierId | null
  onSelectPlan: (tierId: TierId) => void
  unitCount?: number
}

export function PlanComparison({
  currentTierId,
  onSelectPlan,
  unitCount = 1,
}: PlanComparisonProps) {
  const visibleTiers = TIERS.filter((t) =>
    VISIBLE_TIER_IDS.includes(t.id as TierId)
  )

  return (
    <div className="grid grid-cols-1 gap-4">
      {visibleTiers.map((tier) => {
        const annualTotal = getAnnualTotal(tier.id, unitCount)
        const launchAnnual = getLaunchOfferPrice(tier.id, unitCount)
        const isCurrent = tier.id === currentTierId
        const tierFeatures = FEATURES.filter((f) => f.tier === tier.id)

        return (
          <Card
            key={tier.id}
            className={`relative flex flex-col shadow-sm ${tier.popular ? 'ring-2 ring-primary' : ''}`}
          >
            {tier.popular && (
              <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap">
                Most popular
              </Badge>
            )}
            <CardHeader variant="muted">
              <CardTitle className="text-base">{tier.name}</CardTitle>
              <div className="mt-1">
                {annualTotal != null && launchAnnual != null ? (
                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold font-mono tabular-nums">
                        ${formatLaunchOfferPrice(launchAnnual)}/yr
                      </span>
                      <span className="text-sm text-muted-foreground line-through font-mono tabular-nums">
                        ${formatLaunchOfferPrice(annualTotal)}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-primary">
                      Limited time offer: {LAUNCH_OFFER.terms} Use code{' '}
                      {LAUNCH_OFFER.code}.
                      {isLaunchOfferLive() && LAUNCH_OFFER.endsAtDisplay
                        ? ` Offer ends ${LAUNCH_OFFER.endsAtDisplay}.`
                        : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Then ${formatLaunchOfferPrice(annualTotal!)}/yr after the
                      first year.
                    </p>
                  </div>
                ) : (
                  <span className="text-2xl font-bold">Published pricing</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {tier.includedUnits > 0
                  ? `Annual plan. Up to ${tier.includedUnits} units included`
                  : tier.description}
              </p>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-1.5">
                {tierFeatures.map((f) => (
                  <li key={f.key} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                variant={isCurrent ? 'outline' : 'default'}
                disabled={isCurrent}
                onClick={() => onSelectPlan(tier.id)}
                title={isCurrent ? 'You are already on this plan' : undefined}
              >
                {isCurrent ? 'Current plan' : 'Select plan'}
              </Button>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
