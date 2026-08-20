# Story 22.1: Create Stripe Coupon Admin UI

## Story Info
- **Epic**: Promotions & Discounts
- **Estimated Hours**: 3
- **Dependencies**: Story 21.1 (Stripe Client)
- **Status**: `pending`

## User Story
**As an** administrator
**I want** to create and manage discount coupons
**So that** I can offer promotions to customers

## Acceptance Criteria
- [ ] **AC1**: List all coupons from Stripe
- [ ] **AC2**: Create percentage-off coupons
- [ ] **AC3**: Create fixed-amount coupons
- [ ] **AC4**: Set duration (once, repeating, forever)
- [ ] **AC5**: Set max redemptions and expiration
- [ ] **AC6**: Delete/archive coupons

## Technical Specifications

**Backend - Coupon Endpoints**:

```python
# backend/app/api/routes/promotions.py
"""
Promotion management endpoints.

Thin wrappers around Stripe Coupon and Promotion Code APIs.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
import stripe

from app.auth.dependencies import get_current_user, require_admin
from app.services.billing.stripe_client import get_stripe_service

router = APIRouter(prefix="/promotions", tags=["promotions"])


# ============ Coupon Models ============

class CouponCreate(BaseModel):
    """Create a new coupon."""
    name: str = Field(..., min_length=1, max_length=40)

    # Discount type (choose one)
    percent_off: Optional[Decimal] = Field(None, gt=0, le=100)
    amount_off: Optional[int] = Field(None, gt=0)  # In cents
    currency: Optional[str] = Field(None, min_length=3, max_length=3)

    # Duration
    duration: str = Field("once", pattern="^(once|repeating|forever)$")
    duration_in_months: Optional[int] = Field(None, ge=1, le=36)

    # Limits
    max_redemptions: Optional[int] = Field(None, ge=1)
    redeem_by: Optional[datetime] = None

    # Custom ID (optional)
    id: Optional[str] = Field(None, max_length=50)


class CouponResponse(BaseModel):
    """Coupon response from Stripe."""
    id: str
    name: Optional[str]
    percent_off: Optional[float]
    amount_off: Optional[int]
    currency: Optional[str]
    duration: str
    duration_in_months: Optional[int]
    max_redemptions: Optional[int]
    times_redeemed: int
    redeem_by: Optional[int]
    valid: bool
    created: int

    @classmethod
    def from_stripe(cls, coupon: stripe.Coupon) -> "CouponResponse":
        return cls(
            id=coupon.id,
            name=coupon.name,
            percent_off=coupon.percent_off,
            amount_off=coupon.amount_off,
            currency=coupon.currency,
            duration=coupon.duration,
            duration_in_months=coupon.duration_in_months,
            max_redemptions=coupon.max_redemptions,
            times_redeemed=coupon.times_redeemed,
            redeem_by=coupon.redeem_by,
            valid=coupon.valid,
            created=coupon.created,
        )


# ============ Coupon Endpoints ============

@router.get("/coupons", response_model=list[CouponResponse])
async def list_coupons(
    _: None = Depends(require_admin),
):
    """List all coupons from Stripe."""
    coupons = stripe.Coupon.list(limit=100)
    return [CouponResponse.from_stripe(c) for c in coupons.data]


@router.post("/coupons", response_model=CouponResponse)
async def create_coupon(
    data: CouponCreate,
    _: None = Depends(require_admin),
):
    """Create a new coupon in Stripe."""
    # Validate discount type
    if not data.percent_off and not data.amount_off:
        raise HTTPException(400, "Must specify percent_off or amount_off")
    if data.percent_off and data.amount_off:
        raise HTTPException(400, "Cannot specify both percent_off and amount_off")
    if data.amount_off and not data.currency:
        raise HTTPException(400, "currency required when using amount_off")
    if data.duration == "repeating" and not data.duration_in_months:
        raise HTTPException(400, "duration_in_months required for repeating duration")

    params = {
        "name": data.name,
        "duration": data.duration,
    }

    if data.percent_off:
        params["percent_off"] = float(data.percent_off)
    if data.amount_off:
        params["amount_off"] = data.amount_off
        params["currency"] = data.currency
    if data.duration_in_months:
        params["duration_in_months"] = data.duration_in_months
    if data.max_redemptions:
        params["max_redemptions"] = data.max_redemptions
    if data.redeem_by:
        params["redeem_by"] = int(data.redeem_by.timestamp())
    if data.id:
        params["id"] = data.id

    coupon = stripe.Coupon.create(**params)
    return CouponResponse.from_stripe(coupon)


@router.get("/coupons/{coupon_id}", response_model=CouponResponse)
async def get_coupon(
    coupon_id: str,
    _: None = Depends(require_admin),
):
    """Get a specific coupon."""
    try:
        coupon = stripe.Coupon.retrieve(coupon_id)
        return CouponResponse.from_stripe(coupon)
    except stripe.error.InvalidRequestError:
        raise HTTPException(404, "Coupon not found")


@router.delete("/coupons/{coupon_id}")
async def delete_coupon(
    coupon_id: str,
    _: None = Depends(require_admin),
):
    """Delete a coupon from Stripe."""
    try:
        stripe.Coupon.delete(coupon_id)
        return {"deleted": True}
    except stripe.error.InvalidRequestError:
        raise HTTPException(404, "Coupon not found")
```

**Frontend - Coupon Admin Page**:

```tsx
// frontend/src/pages/admin/Coupons.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, fromUnixTime } from 'date-fns'
import { Plus, Trash2, Percent, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { CouponForm } from '@/components/promotions/CouponForm'

interface Coupon {
  id: string
  name: string | null
  percent_off: number | null
  amount_off: number | null
  currency: string | null
  duration: string
  duration_in_months: number | null
  max_redemptions: number | null
  times_redeemed: number
  redeem_by: number | null
  valid: boolean
  created: number
}

export function CouponsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: coupons, isLoading } = useQuery<Coupon[]>({
    queryKey: ['coupons'],
    queryFn: async () => {
      const res = await fetch('/api/promotions/coupons')
      if (!res.ok) throw new Error('Failed to fetch coupons')
      return res.json()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (couponId: string) => {
      const res = await fetch(`/api/promotions/coupons/${couponId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete coupon')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      toast({ title: 'Coupon deleted' })
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to delete coupon' })
    },
  })

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Coupons</h1>
          <p className="text-muted-foreground">
            Manage discount coupons via Stripe
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Coupon
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Coupon</DialogTitle>
            </DialogHeader>
            <CouponForm onSuccess={() => setIsCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Coupons</CardTitle>
          <CardDescription>
            Coupons define the discount. Create promotion codes to share with customers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name / ID</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Redemptions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coupons?.map((coupon) => (
                <TableRow key={coupon.id}>
                  <TableCell>
                    <div className="font-medium">{coupon.name || coupon.id}</div>
                    {coupon.name && (
                      <div className="text-sm text-muted-foreground">{coupon.id}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {coupon.percent_off ? (
                      <span className="flex items-center gap-1">
                        <Percent className="h-4 w-4" />
                        {coupon.percent_off}% off
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-4 w-4" />
                        ${(coupon.amount_off! / 100).toFixed(2)} off
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {coupon.duration === 'once' && 'Once'}
                    {coupon.duration === 'forever' && 'Forever'}
                    {coupon.duration === 'repeating' && `${coupon.duration_in_months} months`}
                  </TableCell>
                  <TableCell>
                    {coupon.times_redeemed}
                    {coupon.max_redemptions && ` / ${coupon.max_redemptions}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={coupon.valid ? 'default' : 'secondary'}>
                      {coupon.valid ? 'Active' : 'Expired'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteMutation.mutate(coupon.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
```

**Frontend - Coupon Form**:

```tsx
// frontend/src/components/promotions/CouponForm.tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useToast } from '@/hooks/use-toast'

const schema = z.object({
  name: z.string().min(1).max(40),
  discountType: z.enum(['percent', 'amount']),
  percent_off: z.number().min(1).max(100).optional(),
  amount_off: z.number().min(1).optional(),
  currency: z.string().default('usd'),
  duration: z.enum(['once', 'repeating', 'forever']),
  duration_in_months: z.number().min(1).max(36).optional(),
  max_redemptions: z.number().min(1).optional(),
})

type FormData = z.infer<typeof schema>

export function CouponForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      discountType: 'percent',
      duration: 'once',
      currency: 'usd',
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const body: Record<string, unknown> = {
        name: data.name,
        duration: data.duration,
      }

      if (data.discountType === 'percent') {
        body.percent_off = data.percent_off
      } else {
        body.amount_off = (data.amount_off || 0) * 100 // Convert to cents
        body.currency = data.currency
      }

      if (data.duration === 'repeating') {
        body.duration_in_months = data.duration_in_months
      }

      if (data.max_redemptions) {
        body.max_redemptions = data.max_redemptions
      }

      const res = await fetch('/api/promotions/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Failed to create coupon')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coupons'] })
      toast({ title: 'Coupon created' })
      onSuccess()
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to create coupon' })
    },
  })

  const discountType = form.watch('discountType')
  const duration = form.watch('duration')

  return (
    <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div>
        <Label>Coupon Name</Label>
        <Input {...form.register('name')} placeholder="Summer Sale 2024" />
      </div>

      <div>
        <Label>Discount Type</Label>
        <RadioGroup
          value={discountType}
          onValueChange={(v) => form.setValue('discountType', v as 'percent' | 'amount')}
          className="flex gap-4 mt-2"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="percent" id="percent" />
            <Label htmlFor="percent">Percentage</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="amount" id="amount" />
            <Label htmlFor="amount">Fixed Amount</Label>
          </div>
        </RadioGroup>
      </div>

      {discountType === 'percent' ? (
        <div>
          <Label>Percent Off</Label>
          <Input
            type="number"
            {...form.register('percent_off', { valueAsNumber: true })}
            placeholder="20"
            max={100}
          />
        </div>
      ) : (
        <div>
          <Label>Amount Off ($)</Label>
          <Input
            type="number"
            {...form.register('amount_off', { valueAsNumber: true })}
            placeholder="10.00"
            step="0.01"
          />
        </div>
      )}

      <div>
        <Label>Duration</Label>
        <Select value={duration} onValueChange={(v) => form.setValue('duration', v as any)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="once">Once (first invoice only)</SelectItem>
            <SelectItem value="repeating">Repeating (X months)</SelectItem>
            <SelectItem value="forever">Forever</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {duration === 'repeating' && (
        <div>
          <Label>Duration (months)</Label>
          <Input
            type="number"
            {...form.register('duration_in_months', { valueAsNumber: true })}
            placeholder="3"
            min={1}
            max={36}
          />
        </div>
      )}

      <div>
        <Label>Max Redemptions (optional)</Label>
        <Input
          type="number"
          {...form.register('max_redemptions', { valueAsNumber: true })}
          placeholder="Unlimited"
        />
      </div>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating...' : 'Create Coupon'}
      </Button>
    </form>
  )
}
```

## Test Cases

```python
def test_create_percent_coupon():
    """Verify percentage coupon creation."""
    response = client.post("/api/promotions/coupons", json={
        "name": "20% Off",
        "percent_off": 20,
        "duration": "once",
    })
    assert response.status_code == 200
    assert response.json()["percent_off"] == 20

def test_create_amount_coupon():
    """Verify fixed amount coupon creation."""
    response = client.post("/api/promotions/coupons", json={
        "name": "$10 Off",
        "amount_off": 1000,
        "currency": "usd",
        "duration": "once",
    })
    assert response.status_code == 200
    assert response.json()["amount_off"] == 1000

def test_list_coupons():
    """Verify coupon listing."""
    response = client.get("/api/promotions/coupons")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_delete_coupon():
    """Verify coupon deletion."""
    # Create then delete
    create_resp = client.post("/api/promotions/coupons", json={...})
    coupon_id = create_resp.json()["id"]

    delete_resp = client.delete(f"/api/promotions/coupons/{coupon_id}")
    assert delete_resp.status_code == 200
```

## Definition of Done
- [ ] List coupons from Stripe
- [ ] Create percentage coupons
- [ ] Create fixed amount coupons
- [ ] Duration options work
- [ ] Delete coupons
- [ ] Admin-only access enforced
