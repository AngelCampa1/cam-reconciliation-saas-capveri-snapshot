# Story 21.8: Create Pricing Page

## Story Info
- **Epic**: Billing & Subscriptions
- **Estimated Hours**: 3
- **Dependencies**: Story 21.2 (Plans), Epic 1 (UI Components)
- **Status**: `pending`

## User Story
**As a** visitor
**I want** to see pricing information
**So that** I can choose the right plan for my needs

## Acceptance Criteria
- [ ] **AC1**: Pricing page displays all plans with features
- [ ] **AC2**: Toggle between monthly and annual pricing
- [ ] **AC3**: "Most Popular" badge on Professional plan
- [ ] **AC4**: CTA buttons link to signup/checkout
- [ ] **AC5**: Feature comparison table available
- [ ] **AC6**: Responsive design for mobile

## Technical Specifications

**File to Create**: `frontend/src/pages/Pricing.tsx`

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { PLANS, type Plan } from '@/config/plans'
import { cn } from '@/lib/utils'

export function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false)

  return (
    <div className="container py-16">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">
          Simple, transparent pricing
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Choose the plan that fits your portfolio. All plans include a 30-day free trial.
        </p>
      </div>

      {/* Pricing cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        {PLANS.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            isAnnual={isAnnual}
          />
        ))}
      </div>

      {/* Feature comparison table */}
      <FeatureComparison />

      {/* FAQ or CTA section */}
      <div className="text-center mt-16">
        <h2 className="text-2xl font-bold mb-4">
          Questions about pricing?
        </h2>
        <p className="text-muted-foreground mb-6">
          Contact us for custom Enterprise pricing or volume discounts.
        </p>
        <Button variant="outline" asChild>
          <Link to="/contact">Contact Sales</Link>
        </Button>
      </div>
    </div>
  )
}

function PricingCard({ plan }: { plan: Plan }) {
  const isEnterprise = plan.id === 'enterprise'

  return (
    <Card className={cn(
      'relative flex flex-col',
      plan.popular && 'border-primary shadow-lg'
    )}>
      {plan.popular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">
          Most Popular
        </Badge>
      )}

      <CardHeader>
        <CardTitle>{plan.name}</CardTitle>
        <CardDescription>{plan.description}</CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        {/* Price */}
        <div className="mb-6">
          {isEnterprise ? (
            <div className="text-3xl font-bold">Custom</div>
          ) : (
            <>
              <div className="text-4xl font-bold">
                ${plan.annualPrice}
                <span className="text-lg font-normal text-muted-foreground">/year</span>
              </div>
              <div className="text-sm text-muted-foreground">
                Annual billing only
              </div>
            </>
          )}
        </div>

        {/* Features */}
        <ul className="space-y-3">
          <FeatureItem
            included
            text={formatLimit(plan.features.maxProperties, 'properties')}
          />
          <FeatureItem
            included
            text={formatLimit(plan.features.maxUsers, 'team members')}
          />
          <FeatureItem
            included={plan.features.reconciliation}
            text="CAM Reconciliation"
          />
          <FeatureItem
            included={plan.features.historicalAnalysis}
            text="Historical Analysis"
          />
          <FeatureItem
            included={plan.features.apiAccess}
            text="API Access"
          />
          <FeatureItem
            included={plan.features.whiteLabel}
            text="White Label"
          />
          <FeatureItem
            included={plan.features.dedicatedSupport}
            text="Dedicated Support"
          />
        </ul>
      </CardContent>

      <CardFooter>
        <Button
          className="w-full"
          variant={plan.popular ? 'default' : 'outline'}
          asChild
        >
          {isEnterprise ? (
            <Link to="/contact">Contact Sales</Link>
          ) : (
            <Link to={`/register?plan=${plan.id}`}>
              Start Free Trial
            </Link>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}

function FeatureItem({ included, text }: { included: boolean; text: string }) {
  return (
    <li className="flex items-center gap-2">
      {included ? (
        <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
      ) : (
        <X className="h-5 w-5 text-muted-foreground flex-shrink-0" />
      )}
      <span className={cn(!included && 'text-muted-foreground')}>{text}</span>
    </li>
  )
}

function formatLimit(limit: number, unit: string): string {
  if (limit === -1) return `Unlimited ${unit}`
  return `${limit} ${unit}`
}

function FeatureComparison() {
  const features = [
    { name: 'Properties', key: 'maxProperties' },
    { name: 'Team Members', key: 'maxUsers' },
    { name: 'CAM Reconciliation', key: 'reconciliation', boolean: true },
    { name: 'Historical Analysis', key: 'historicalAnalysis', boolean: true },
    { name: 'Export Formats', key: 'exportFormats', array: true },
    { name: 'API Access', key: 'apiAccess', boolean: true },
    { name: 'White Label', key: 'whiteLabel', boolean: true },
    { name: 'Dedicated Support', key: 'dedicatedSupport', boolean: true },
  ]

  return (
    <div className="overflow-x-auto">
      <h2 className="text-2xl font-bold mb-6 text-center">Compare Features</h2>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left p-4">Feature</th>
            {PLANS.map((plan) => (
              <th key={plan.id} className="p-4 text-center">{plan.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {features.map((feature) => (
            <tr key={feature.name} className="border-b">
              <td className="p-4 font-medium">{feature.name}</td>
              {PLANS.map((plan) => (
                <td key={plan.id} className="p-4 text-center">
                  {feature.boolean ? (
                    plan.features[feature.key as keyof typeof plan.features] ? (
                      <Check className="h-5 w-5 text-green-500 mx-auto" />
                    ) : (
                      <X className="h-5 w-5 text-muted-foreground mx-auto" />
                    )
                  ) : feature.array ? (
                    (plan.features[feature.key as keyof typeof plan.features] as string[]).join(', ')
                  ) : (
                    formatLimit(
                      plan.features[feature.key as keyof typeof plan.features] as number,
                      ''
                    )
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

**Route Registration**:

```tsx
// frontend/src/App.tsx
<Route path="/pricing" element={<PricingPage />} />
```

## Definition of Done
- [ ] Pricing page displays all plans
- [ ] Monthly/annual toggle works
- [ ] Popular badge on Professional
- [ ] CTAs link correctly
- [ ] Feature comparison table works
- [ ] Mobile responsive design
