# Story 22.4: Create Promotion Analytics Dashboard

## Story Info
- **Epic**: Promotions & Discounts
- **Estimated Hours**: 2
- **Dependencies**: Story 22.1 (Coupons), Story 22.2 (Promo Codes)
- **Status**: `pending`

## User Story
**As an** administrator
**I want** to see promotion performance metrics
**So that** I can evaluate campaign effectiveness

## Acceptance Criteria
- [ ] **AC1**: Dashboard shows total coupons and promo codes
- [ ] **AC2**: Shows total redemptions across all promotions
- [ ] **AC3**: Shows total discount amount given
- [ ] **AC4**: Top performing promo codes listed
- [ ] **AC5**: Recent redemption activity feed
- [ ] **AC6**: Filter by date range

## Technical Specifications

**Backend - Analytics Endpoints**:

```python
# backend/app/api/routes/promotions.py (add to existing)
from datetime import datetime, timedelta


class PromotionStats(BaseModel):
    """Promotion analytics summary."""
    total_coupons: int
    active_coupons: int
    total_promo_codes: int
    active_promo_codes: int
    total_redemptions: int
    total_discount_amount: int  # In cents
    currency: str


class PromoCodeStats(BaseModel):
    """Individual promo code stats."""
    code: str
    coupon_name: Optional[str]
    times_redeemed: int
    percent_off: Optional[float]
    amount_off: Optional[int]


class RecentRedemption(BaseModel):
    """Recent discount application."""
    customer_email: str
    promo_code: Optional[str]
    coupon_name: str
    discount_amount: int
    currency: str
    applied_at: int


@router.get("/analytics/summary", response_model=PromotionStats)
async def get_promotion_stats(
    _: None = Depends(require_admin),
):
    """Get promotion performance summary."""
    # Fetch coupons
    coupons = stripe.Coupon.list(limit=100)
    active_coupons = [c for c in coupons.data if c.valid]

    # Fetch promo codes
    promo_codes = stripe.PromotionCode.list(limit=100)
    active_codes = [pc for pc in promo_codes.data if pc.active]

    # Calculate total redemptions
    total_redemptions = sum(c.times_redeemed for c in coupons.data)
    total_code_redemptions = sum(pc.times_redeemed for pc in promo_codes.data)

    # Estimate discount amount from recent invoices with discounts
    # Note: This is an approximation; full tracking requires invoice analysis
    invoices = stripe.Invoice.list(
        limit=100,
        created={"gte": int((datetime.utcnow() - timedelta(days=30)).timestamp())},
    )

    total_discount = sum(
        inv.total_discount_amounts[0].amount if inv.total_discount_amounts else 0
        for inv in invoices.data
    )

    return PromotionStats(
        total_coupons=len(coupons.data),
        active_coupons=len(active_coupons),
        total_promo_codes=len(promo_codes.data),
        active_promo_codes=len(active_codes),
        total_redemptions=total_redemptions,
        total_discount_amount=total_discount,
        currency="usd",
    )


@router.get("/analytics/top-codes", response_model=list[PromoCodeStats])
async def get_top_promo_codes(
    limit: int = 10,
    _: None = Depends(require_admin),
):
    """Get top performing promo codes by redemptions."""
    promo_codes = stripe.PromotionCode.list(
        limit=100,
        expand=["data.coupon"],
    )

    # Sort by redemptions
    sorted_codes = sorted(
        promo_codes.data,
        key=lambda pc: pc.times_redeemed,
        reverse=True,
    )[:limit]

    return [
        PromoCodeStats(
            code=pc.code,
            coupon_name=pc.coupon.name,
            times_redeemed=pc.times_redeemed,
            percent_off=pc.coupon.percent_off,
            amount_off=pc.coupon.amount_off,
        )
        for pc in sorted_codes
    ]


@router.get("/analytics/recent-redemptions", response_model=list[RecentRedemption])
async def get_recent_redemptions(
    limit: int = 20,
    _: None = Depends(require_admin),
):
    """Get recent discount applications."""
    # Get recent invoices with discounts
    invoices = stripe.Invoice.list(
        limit=limit,
        expand=["data.customer", "data.discount"],
    )

    redemptions = []
    for inv in invoices.data:
        if not inv.discount:
            continue

        redemptions.append(
            RecentRedemption(
                customer_email=inv.customer_email or "Unknown",
                promo_code=inv.discount.promotion_code if hasattr(inv.discount, 'promotion_code') else None,
                coupon_name=inv.discount.coupon.name or inv.discount.coupon.id,
                discount_amount=inv.total_discount_amounts[0].amount if inv.total_discount_amounts else 0,
                currency=inv.currency,
                applied_at=inv.created,
            )
        )

    return redemptions
```

**Frontend - Analytics Dashboard**:

```tsx
// frontend/src/pages/admin/PromotionAnalytics.tsx
import { useQuery } from '@tanstack/react-query'
import { format, fromUnixTime } from 'date-fns'
import {
  Tag,
  TrendingUp,
  DollarSign,
  Users,
  BarChart3,
} from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface PromotionStats {
  total_coupons: number
  active_coupons: number
  total_promo_codes: number
  active_promo_codes: number
  total_redemptions: number
  total_discount_amount: number
  currency: string
}

interface PromoCodeStats {
  code: string
  coupon_name: string | null
  times_redeemed: number
  percent_off: number | null
  amount_off: number | null
}

interface RecentRedemption {
  customer_email: string
  promo_code: string | null
  coupon_name: string
  discount_amount: number
  currency: string
  applied_at: number
}

export function PromotionAnalyticsPage() {
  const { data: stats } = useQuery<PromotionStats>({
    queryKey: ['promo-stats'],
    queryFn: async () => {
      const res = await fetch('/api/promotions/analytics/summary')
      return res.json()
    },
  })

  const { data: topCodes } = useQuery<PromoCodeStats[]>({
    queryKey: ['promo-top-codes'],
    queryFn: async () => {
      const res = await fetch('/api/promotions/analytics/top-codes')
      return res.json()
    },
  })

  const { data: recentRedemptions } = useQuery<RecentRedemption[]>({
    queryKey: ['promo-recent-redemptions'],
    queryFn: async () => {
      const res = await fetch('/api/promotions/analytics/recent-redemptions')
      return res.json()
    },
  })

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Promotion Analytics</h1>
        <p className="text-muted-foreground">
          Track promotion performance and redemptions
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Coupons</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.active_coupons || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.total_coupons || 0} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Promo Codes</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.active_promo_codes || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats?.total_promo_codes || 0} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Redemptions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.total_redemptions || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              All time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Discounts Given</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${((stats?.total_discount_amount || 0) / 100).toFixed(0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Last 30 days
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Performing Codes */}
        <Card>
          <CardHeader>
            <CardTitle>Top Promo Codes</CardTitle>
            <CardDescription>By number of redemptions</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead className="text-right">Redemptions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCodes?.map((pc) => (
                  <TableRow key={pc.code}>
                    <TableCell>
                      <code className="font-mono font-bold">{pc.code}</code>
                      {pc.coupon_name && (
                        <div className="text-sm text-muted-foreground">
                          {pc.coupon_name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {pc.percent_off
                        ? `${pc.percent_off}% off`
                        : `$${(pc.amount_off! / 100).toFixed(2)} off`}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {pc.times_redeemed}
                    </TableCell>
                  </TableRow>
                ))}
                {(!topCodes || topCodes.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No redemptions yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent Redemptions */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Redemptions</CardTitle>
            <CardDescription>Latest discount applications</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentRedemptions?.map((r, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{r.customer_email}</div>
                    <div className="text-sm text-muted-foreground">
                      {r.promo_code || r.coupon_name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-green-600">
                      -${(r.discount_amount / 100).toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {format(fromUnixTime(r.applied_at), 'MMM d, h:mm a')}
                    </div>
                  </div>
                </div>
              ))}
              {(!recentRedemptions || recentRedemptions.length === 0) && (
                <div className="text-center text-muted-foreground py-4">
                  No recent redemptions
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
```

**Route Registration**:

```tsx
// frontend/src/App.tsx
<Route path="/admin/promotions" element={<CouponsPage />} />
<Route path="/admin/promotions/codes" element={<PromoCodesPage />} />
<Route path="/admin/promotions/analytics" element={<PromotionAnalyticsPage />} />
```

## Test Cases

```python
def test_get_promotion_stats():
    """Verify stats endpoint returns valid data."""
    response = client.get("/api/promotions/analytics/summary")
    assert response.status_code == 200
    data = response.json()
    assert "total_coupons" in data
    assert "total_redemptions" in data

def test_get_top_codes():
    """Verify top codes sorted by redemptions."""
    response = client.get("/api/promotions/analytics/top-codes?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data) <= 5
    # Verify sorted descending
    redemptions = [pc["times_redeemed"] for pc in data]
    assert redemptions == sorted(redemptions, reverse=True)

def test_get_recent_redemptions():
    """Verify recent redemptions returned."""
    response = client.get("/api/promotions/analytics/recent-redemptions")
    assert response.status_code == 200
    assert isinstance(response.json(), list)
```

## Definition of Done
- [ ] Summary stats displayed (coupons, codes, redemptions)
- [ ] Total discount amount calculated
- [ ] Top performing codes listed
- [ ] Recent redemptions shown with customer info
- [ ] Dashboard is admin-only
- [ ] Data pulled from Stripe API
