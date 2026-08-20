# Story 21.10: Create Billing Dashboard

## Story Info
- **Epic**: Billing & Subscriptions
- **Estimated Hours**: 3
- **Dependencies**: Story 21.4 (Subscription Endpoints), Story 21.5 (Payment Methods), Epic 1 (UI Components)
- **Status**: `pending`

## User Story
**As a** billing administrator
**I want** a centralized billing dashboard
**So that** I can manage my subscription and payment methods in one place

## Acceptance Criteria
- [ ] **AC1**: Dashboard shows current subscription details
- [ ] **AC2**: Shows current billing period and next invoice date
- [ ] **AC3**: Displays payment method on file
- [ ] **AC4**: Quick actions: upgrade, manage payment, cancel
- [ ] **AC5**: Usage stats relative to plan limits
- [ ] **AC6**: Link to full billing history

## Technical Specifications

**Frontend - Billing Dashboard Page**:

```tsx
// frontend/src/pages/settings/Billing.tsx
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  CreditCard,
  FileText,
  Settings,
  TrendingUp,
  Users,
  Building,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useSubscription } from '@/hooks/use-subscription'
import { usePaymentMethods } from '@/hooks/use-payment-methods'
import { useOrganizationUsage } from '@/hooks/use-organization-usage'
import { PLANS } from '@/config/plans'

export function BillingPage() {
  const { data: subscription, isLoading: subLoading } = useSubscription()
  const { data: paymentMethods, isLoading: pmLoading } = usePaymentMethods()
  const { data: usage, isLoading: usageLoading } = useOrganizationUsage()

  const plan = subscription ? PLANS.find(p => p.id === subscription.plan) : null
  const defaultCard = paymentMethods?.find(pm => pm.is_default)

  return (
    <div className="container py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Billing & Subscription</h1>
        <p className="text-muted-foreground">
          Manage your subscription, payment methods, and billing history.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Current Plan Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
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
                  <span className="text-2xl font-bold">{plan?.name || subscription.plan}</span>
                  <StatusBadge status={subscription.status} />
                  {subscription.cancel_at_period_end && (
                    <Badge variant="destructive">Canceling</Badge>
                  )}
                </div>

                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current period</span>
                    <span>
                      {format(new Date(subscription.current_period_start), 'MMM d')} -{' '}
                      {format(new Date(subscription.current_period_end), 'MMM d, yyyy')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Next invoice</span>
                    <span>
                      {subscription.cancel_at_period_end
                        ? 'No upcoming invoice'
                        : format(new Date(subscription.current_period_end), 'MMM d, yyyy')}
                    </span>
                  </div>
                </div>

                {subscription.cancel_at_period_end && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 text-amber-800 rounded-md">
                    <AlertTriangle className="h-4 w-4" />
                    <span className="text-sm">
                      Your subscription will end on{' '}
                      {format(new Date(subscription.current_period_end), 'MMMM d, yyyy')}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-4">No active subscription</p>
                <Button asChild>
                  <Link to="/pricing">View Plans</Link>
                </Button>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-2">
            {subscription && (
              <>
                <Button variant="outline" asChild>
                  <Link to="/pricing">
                    {subscription.plan === 'free' ? 'Upgrade Plan' : 'Change Plan'}
                  </Link>
                </Button>
                {subscription.cancel_at_period_end ? (
                  <Button variant="outline" onClick={() => resumeSubscription()}>
                    Resume Subscription
                  </Button>
                ) : (
                  <Button variant="ghost" asChild>
                    <Link to="/settings/billing/cancel">Cancel Subscription</Link>
                  </Button>
                )}
              </>
            )}
          </CardFooter>
        </Card>

        {/* Payment Method Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment Method
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pmLoading ? (
              <Skeleton className="h-12 w-full" />
            ) : defaultCard ? (
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-medium capitalize">
                    {defaultCard.brand} •••• {defaultCard.last4}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Expires {defaultCard.exp_month}/{defaultCard.exp_year}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">No payment method on file</p>
            )}
          </CardContent>
          <CardFooter>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/settings/billing/payment-methods">
                <Settings className="mr-2 h-4 w-4" />
                Manage Payment Methods
              </Link>
            </Button>
          </CardFooter>
        </Card>

        {/* Usage Card */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Usage This Period</CardTitle>
            <CardDescription>
              Current usage relative to your plan limits
            </CardDescription>
          </CardHeader>
          <CardContent>
            {usageLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : usage && plan ? (
              <div className="space-y-6">
                <UsageBar
                  icon={<Building className="h-4 w-4" />}
                  label="Properties"
                  current={usage.properties}
                  max={plan.features.maxProperties}
                />
                <UsageBar
                  icon={<Users className="h-4 w-4" />}
                  label="Team Members"
                  current={usage.users}
                  max={plan.features.maxUsers}
                />
              </div>
            ) : null}
          </CardContent>
          {usage && plan && (
            (usage.properties >= plan.features.maxProperties * 0.8 ||
             usage.users >= plan.features.maxUsers * 0.8) && (
              <CardFooter>
                <Button asChild>
                  <Link to="/pricing">Upgrade for More Capacity</Link>
                </Button>
              </CardFooter>
            )
          )}
        </Card>

        {/* Billing History Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
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
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    active: 'default',
    trialing: 'secondary',
    past_due: 'destructive',
    canceled: 'outline',
  }

  return (
    <Badge variant={variants[status] || 'outline'}>
      {status.replace('_', ' ')}
    </Badge>
  )
}

function UsageBar({
  icon,
  label,
  current,
  max,
}: {
  icon: React.ReactNode
  label: string
  current: number
  max: number
}) {
  const percentage = max === -1 ? 0 : Math.min((current / max) * 100, 100)
  const isNearLimit = percentage >= 80
  const isUnlimited = max === -1

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {icon}
          <span>{label}</span>
        </div>
        <span className={isNearLimit && !isUnlimited ? 'text-amber-600 font-medium' : ''}>
          {current} / {isUnlimited ? '∞' : max}
        </span>
      </div>
      {!isUnlimited && (
        <Progress
          value={percentage}
          className={isNearLimit ? '[&>div]:bg-amber-500' : ''}
        />
      )}
    </div>
  )
}

async function resumeSubscription() {
  await fetch('/api/billing/subscription/resume', { method: 'POST' })
  window.location.reload()
}
```

**Hooks**:

```typescript
// frontend/src/hooks/use-subscription.ts
import { useQuery } from '@tanstack/react-query'

interface Subscription {
  id: string
  plan: string
  status: string
  current_period_start: string
  current_period_end: string
  cancel_at_period_end: boolean
}

export function useSubscription() {
  return useQuery<Subscription>({
    queryKey: ['subscription'],
    queryFn: async () => {
      const res = await fetch('/api/billing/subscription')
      if (res.status === 404) return null
      if (!res.ok) throw new Error('Failed to fetch subscription')
      return res.json()
    },
  })
}

// frontend/src/hooks/use-payment-methods.ts
import { useQuery } from '@tanstack/react-query'

interface PaymentMethod {
  id: string
  brand: string
  last4: string
  exp_month: number
  exp_year: number
  is_default: boolean
}

export function usePaymentMethods() {
  return useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const res = await fetch('/api/billing/payment-methods')
      if (!res.ok) throw new Error('Failed to fetch payment methods')
      return res.json()
    },
  })
}

// frontend/src/hooks/use-organization-usage.ts
import { useQuery } from '@tanstack/react-query'

interface OrganizationUsage {
  properties: number
  users: number
  reconciliations_this_month: number
}

export function useOrganizationUsage() {
  return useQuery<OrganizationUsage>({
    queryKey: ['organization-usage'],
    queryFn: async () => {
      const res = await fetch('/api/organization/usage')
      if (!res.ok) throw new Error('Failed to fetch usage')
      return res.json()
    },
  })
}
```

**Backend - Usage Endpoint**:

```python
# backend/app/api/routes/organization.py

@router.get("/usage")
async def get_organization_usage(
    current_user = Depends(get_current_user),
    db = Depends(get_db),
):
    """Get current organization usage statistics."""
    org_id = str(current_user.organization_id)

    # Count properties
    props = await db.table('properties') \
        .select('id', count='exact') \
        .eq('organization_id', org_id) \
        .execute()

    # Count users
    users = await db.table('users') \
        .select('id', count='exact') \
        .eq('organization_id', org_id) \
        .execute()

    return {
        "properties": props.count or 0,
        "users": users.count or 0,
    }
```

## Test Cases

```typescript
describe('BillingPage', () => {
  it('displays current subscription details', async () => {
    // Mock subscription data
    // Render component
    // Verify plan name, status, period dates shown
  })

  it('shows cancellation warning when cancel_at_period_end', async () => {
    // Mock subscription with cancel_at_period_end = true
    // Verify warning message displayed
  })

  it('displays payment method on file', async () => {
    // Mock payment methods
    // Verify card brand and last4 displayed
  })

  it('shows usage relative to plan limits', async () => {
    // Mock usage and plan data
    // Verify progress bars shown correctly
  })

  it('highlights near-limit usage', async () => {
    // Mock usage at 85% of limit
    // Verify amber styling applied
  })
})
```

## Definition of Done
- [ ] Subscription details displayed correctly
- [ ] Payment method shown
- [ ] Usage stats with progress bars
- [ ] Quick action buttons work
- [ ] Cancellation warning displayed when applicable
- [ ] Responsive layout for mobile
