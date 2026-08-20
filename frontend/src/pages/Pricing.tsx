import { Link } from 'react-router-dom'
import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SEO, structuredDataSchemas } from '@/components/SEO'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { publicKnowledge } from '@/generated/public-knowledge'
import { formatNumber } from '@/lib/number'
import {
  FEATURES,
  TIERS,
  TRIAL_DAYS,
  getAnnualTotal,
  getFeaturesForTier,
  type TierId,
} from '@/config/plans'
import {
  LAUNCH_OFFER,
  isLaunchOfferLive,
  formatLaunchOfferPrice,
  getLaunchOfferPrice,
} from '@/config/launch-offer'
import { LandingNav } from '@/components/landing/LandingNav'
import { Footer } from '@/components/layout/Footer'
import { useAuth } from '@/contexts/AuthContext'

export const PRICING_FAQS = publicKnowledge.pricing.pricingFaqs.map((item) => ({
  question: item.question,
  answer: item.answer,
}))

const SLIDER_MAX_UNITS = 5000

function formatListPrice(tierId: TierId, unitCount: number) {
  const total = getAnnualTotal(tierId, unitCount)
  if (total == null) return 'Custom'
  return `$${formatNumber(total)}/year`
}

function formatLaunchPrice(tierId: TierId, unitCount: number) {
  const total = getLaunchOfferPrice(tierId, unitCount)
  if (total == null) return 'Custom'
  return `$${formatLaunchOfferPrice(total)}/year`
}

function TierFeatureList({ tierId }: { tierId: TierId }) {
  const featureKeys = getFeaturesForTier(tierId)
  const features = FEATURES.filter((feature) =>
    featureKeys.includes(feature.key)
  )

  return (
    <ul className="space-y-2">
      {features.slice(0, 9).map((feature) => (
        <li key={feature.key} className="flex items-center gap-2">
          <Check className="h-4 w-4 flex-shrink-0 text-success" />
          <span className="text-sm">{feature.label}</span>
        </li>
      ))}
    </ul>
  )
}

export function PricingPage() {
  const [unitCount, setUnitCount] = useState(25)
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const tier = TIERS.find((item) => item.id === 'reconcile')
  const tierId: TierId = 'reconcile'
  const listPrice = formatListPrice(tierId, unitCount)
  const launchPrice = formatLaunchPrice(tierId, unitCount)
  const moneyBackGuarantee =
    publicKnowledge.claims.byId['money-back-guarantee'].wording
  const trialHref =
    isAuthenticated && !authLoading
      ? `/settings/billing?intent=select-plan&units=${unitCount}`
      : `/auth/register?plan=reconcile&units=${unitCount}`
  const trialCta =
    isAuthenticated && !authLoading ? 'Add Billing' : 'Start Free Trial'

  return (
    <div className="min-h-screen">
      <SEO
        title="Pricing - CAM Reconciliation Software"
        description={`Limited offer pricing: ${publicKnowledge.pricing.display.tierPriceLabels.reconcile}. List price: $4,990/year for up to 25 rentable units. Start a ${TRIAL_DAYS}-day free trial. No credit card required.`}
        canonical="/pricing"
        structuredData={structuredDataSchemas.pricingPage(PRICING_FAQS)}
      />
      <LandingNav variant="light" />

      <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <Badge variant="outline" className="mb-4">
            {TRIAL_DAYS}-day free trial
          </Badge>
          <h1 className="mb-4 text-xl font-bold md:text-2xl lg:text-3xl">
            Price Reconcile by unit count
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            Enter your rentable units. See your yearly price before billing.
          </p>
          <p className="mt-3 text-sm font-medium text-success-strong">
            Limited time offer: {LAUNCH_OFFER.terms} Use code{' '}
            {LAUNCH_OFFER.code}. Annual billing only.
            {isLaunchOfferLive() && LAUNCH_OFFER.endsAtDisplay
              ? ` Offer ends ${LAUNCH_OFFER.endsAtDisplay}.`
              : ''}
          </p>
        </div>

        <Card className="mx-auto mb-16 max-w-5xl shadow-sm">
          <CardHeader>
            <CardTitle>{tier?.name ?? 'Reconcile'}</CardTitle>
            <p className="text-sm text-muted-foreground">{tier?.description}</p>
          </CardHeader>
          <CardContent className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
            <div className="space-y-6">
              <div>
                <p className="text-sm font-medium text-muted-foreground line-through font-mono tabular-nums">
                  {listPrice}
                </p>
                <p className="text-3xl font-bold font-mono tabular-nums">
                  {launchPrice}
                </p>
                <p className="text-sm font-semibold text-success-strong">
                  Limited time offer: {LAUNCH_OFFER.terms} Use code{' '}
                  {LAUNCH_OFFER.code}.
                  {isLaunchOfferLive() && LAUNCH_OFFER.endsAtDisplay
                    ? ` Offer ends ${LAUNCH_OFFER.endsAtDisplay}.`
                    : ''}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Then {listPrice} after the first year.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Minimum subscription: $4,990/year for up to 25 rentable units.
                </p>
              </div>
              <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="frontend-pricing-units">
                      Rentable units
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Slide or type the count.
                    </p>
                  </div>
                  <Input
                    id="frontend-pricing-units"
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
              <Button size="lg" className="w-full" asChild>
                <Link to={trialHref}>{trialCta}</Link>
              </Button>
            </div>
            <div className="space-y-5">
              <div className="rounded-lg border bg-background p-4">
                <p className="font-medium">
                  {publicKnowledge.claims.byId['money-back-guarantee'].wording
                    .split('.')[0]
                    ?.replace('Reconcile has a ', '')}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {moneyBackGuarantee}
                </p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="font-medium">Annual unit bands</p>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>1-25 units: $4,990/year minimum</li>
                  <li>26-150 units: $179 per extra unit/year</li>
                  <li>151-500 units: $169 per extra unit/year</li>
                  <li>501-2,500 units: $159 per extra unit/year</li>
                  <li>2,501+ units: $149 per extra unit/year</li>
                </ul>
              </div>
              <TierFeatureList tierId={tierId} />
            </div>
          </CardContent>
        </Card>

        <section className="mx-auto mt-16 max-w-3xl">
          <h2 className="mb-8 text-center text-lg font-bold md:text-xl lg:text-2xl">
            Frequently Asked Questions
          </h2>
          <div className="space-y-2">
            {PRICING_FAQS.map((faq) => (
              <details key={faq.question} className="group rounded-lg border">
                <summary className="flex cursor-pointer select-none items-center justify-between p-4 font-medium">
                  {faq.question}
                  <ChevronDown
                    className="h-4 w-4 flex-shrink-0 transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </div>
              </details>
            ))}
          </div>
          <div className="mt-8 text-center">
            <p className="mb-4 text-muted-foreground">Still have questions?</p>
            <Button variant="outline" asChild>
              <Link to="/contact">Contact support</Link>
            </Button>
          </div>
        </section>
      </div>

      <Footer />
    </div>
  )
}
