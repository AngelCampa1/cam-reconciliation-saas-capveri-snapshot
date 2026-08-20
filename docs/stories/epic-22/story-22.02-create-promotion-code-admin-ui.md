# Story 22.2: Create Promotion Code Admin UI

## Story Info
- **Epic**: Promotions & Discounts
- **Estimated Hours**: 3
- **Dependencies**: Story 22.1 (Coupon Admin UI)
- **Status**: `pending`

## User Story
**As an** administrator
**I want** to create customer-facing promotion codes
**So that** customers can redeem discounts at checkout

## Acceptance Criteria
- [ ] **AC1**: List all promotion codes from Stripe
- [ ] **AC2**: Create promo code linked to existing coupon
- [ ] **AC3**: Set customer-specific restriction
- [ ] **AC4**: Set first-time transaction restriction
- [ ] **AC5**: Set minimum amount requirement
- [ ] **AC6**: Set expiration and max redemptions
- [ ] **AC7**: Deactivate promotion codes

## Technical Specifications

**Backend - Promotion Code Endpoints**:

```python
# backend/app/api/routes/promotions.py (add to existing)

# ============ Promotion Code Models ============

class PromoCodeCreate(BaseModel):
    """Create a new promotion code."""
    coupon_id: str
    code: Optional[str] = Field(None, min_length=3, max_length=50)
    active: bool = True

    # Restrictions
    customer_id: Optional[str] = None
    first_time_transaction: bool = False
    minimum_amount: Optional[int] = Field(None, ge=100)  # In cents
    minimum_amount_currency: str = "usd"

    # Limits
    max_redemptions: Optional[int] = Field(None, ge=1)
    expires_at: Optional[datetime] = None


class PromoCodeResponse(BaseModel):
    """Promotion code response from Stripe."""
    id: str
    code: str
    active: bool
    coupon_id: str
    coupon_name: Optional[str]
    coupon_percent_off: Optional[float]
    coupon_amount_off: Optional[int]
    customer: Optional[str]
    first_time_transaction: bool
    minimum_amount: Optional[int]
    max_redemptions: Optional[int]
    times_redeemed: int
    expires_at: Optional[int]
    created: int

    @classmethod
    def from_stripe(cls, pc: stripe.PromotionCode) -> "PromoCodeResponse":
        return cls(
            id=pc.id,
            code=pc.code,
            active=pc.active,
            coupon_id=pc.coupon.id,
            coupon_name=pc.coupon.name,
            coupon_percent_off=pc.coupon.percent_off,
            coupon_amount_off=pc.coupon.amount_off,
            customer=pc.customer,
            first_time_transaction=pc.restrictions.first_time_transaction,
            minimum_amount=pc.restrictions.minimum_amount,
            max_redemptions=pc.max_redemptions,
            times_redeemed=pc.times_redeemed,
            expires_at=pc.expires_at,
            created=pc.created,
        )


# ============ Promotion Code Endpoints ============

@router.get("/codes", response_model=list[PromoCodeResponse])
async def list_promotion_codes(
    active: Optional[bool] = None,
    coupon_id: Optional[str] = None,
    _: None = Depends(require_admin),
):
    """List all promotion codes from Stripe."""
    params = {"limit": 100, "expand": ["data.coupon"]}
    if active is not None:
        params["active"] = active
    if coupon_id:
        params["coupon"] = coupon_id

    codes = stripe.PromotionCode.list(**params)
    return [PromoCodeResponse.from_stripe(pc) for pc in codes.data]


@router.post("/codes", response_model=PromoCodeResponse)
async def create_promotion_code(
    data: PromoCodeCreate,
    _: None = Depends(require_admin),
):
    """Create a new promotion code in Stripe."""
    params = {
        "coupon": data.coupon_id,
        "active": data.active,
    }

    if data.code:
        params["code"] = data.code.upper()
    if data.customer_id:
        params["customer"] = data.customer_id
    if data.max_redemptions:
        params["max_redemptions"] = data.max_redemptions
    if data.expires_at:
        params["expires_at"] = int(data.expires_at.timestamp())

    # Build restrictions
    restrictions = {}
    if data.first_time_transaction:
        restrictions["first_time_transaction"] = True
    if data.minimum_amount:
        restrictions["minimum_amount"] = data.minimum_amount
        restrictions["minimum_amount_currency"] = data.minimum_amount_currency

    if restrictions:
        params["restrictions"] = restrictions

    promo_code = stripe.PromotionCode.create(**params)
    return PromoCodeResponse.from_stripe(promo_code)


@router.get("/codes/{code_id}", response_model=PromoCodeResponse)
async def get_promotion_code(
    code_id: str,
    _: None = Depends(require_admin),
):
    """Get a specific promotion code."""
    try:
        pc = stripe.PromotionCode.retrieve(code_id, expand=["coupon"])
        return PromoCodeResponse.from_stripe(pc)
    except stripe.error.InvalidRequestError:
        raise HTTPException(404, "Promotion code not found")


@router.patch("/codes/{code_id}")
async def update_promotion_code(
    code_id: str,
    active: bool,
    _: None = Depends(require_admin),
):
    """Activate or deactivate a promotion code."""
    try:
        pc = stripe.PromotionCode.modify(code_id, active=active)
        return PromoCodeResponse.from_stripe(pc)
    except stripe.error.InvalidRequestError:
        raise HTTPException(404, "Promotion code not found")


@router.get("/codes/lookup/{code}")
async def lookup_promotion_code(
    code: str,
    _: None = Depends(require_admin),
):
    """Look up a promotion code by the customer-facing code string."""
    codes = stripe.PromotionCode.list(code=code.upper(), limit=1)
    if not codes.data:
        raise HTTPException(404, "Promotion code not found")
    return PromoCodeResponse.from_stripe(codes.data[0])
```

**Frontend - Promotion Codes Page**:

```tsx
// frontend/src/pages/admin/PromoCodes.tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, fromUnixTime } from 'date-fns'
import { Plus, Copy, Check, X } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { PromoCodeForm } from '@/components/promotions/PromoCodeForm'

interface PromoCode {
  id: string
  code: string
  active: boolean
  coupon_id: string
  coupon_name: string | null
  coupon_percent_off: number | null
  coupon_amount_off: number | null
  customer: string | null
  first_time_transaction: boolean
  minimum_amount: number | null
  max_redemptions: number | null
  times_redeemed: number
  expires_at: number | null
  created: number
}

export function PromoCodesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: codes, isLoading } = useQuery<PromoCode[]>({
    queryKey: ['promo-codes'],
    queryFn: async () => {
      const res = await fetch('/api/promotions/codes')
      if (!res.ok) throw new Error('Failed to fetch promotion codes')
      return res.json()
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const res = await fetch(`/api/promotions/codes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      })
      if (!res.ok) throw new Error('Failed to update')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promo-codes'] })
    },
  })

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    toast({ title: 'Code copied to clipboard' })
  }

  return (
    <div className="container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Promotion Codes</h1>
          <p className="text-muted-foreground">
            Customer-facing codes that apply coupon discounts
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Code
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Promotion Code</DialogTitle>
            </DialogHeader>
            <PromoCodeForm onSuccess={() => setIsCreateOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Promotion Codes</CardTitle>
          <CardDescription>
            Share these codes with customers to apply discounts at checkout
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Restrictions</TableHead>
                <TableHead>Redemptions</TableHead>
                <TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes?.map((pc) => (
                <TableRow key={pc.id}>
                  <TableCell>
                    <code className="font-mono font-bold">{pc.code}</code>
                  </TableCell>
                  <TableCell>
                    {pc.coupon_percent_off
                      ? `${pc.coupon_percent_off}% off`
                      : `$${(pc.coupon_amount_off! / 100).toFixed(2)} off`}
                    {pc.coupon_name && (
                      <div className="text-sm text-muted-foreground">
                        {pc.coupon_name}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {pc.first_time_transaction && (
                        <Badge variant="outline">New customers</Badge>
                      )}
                      {pc.minimum_amount && (
                        <Badge variant="outline">
                          Min ${(pc.minimum_amount / 100).toFixed(0)}
                        </Badge>
                      )}
                      {pc.customer && (
                        <Badge variant="outline">Customer-specific</Badge>
                      )}
                      {pc.expires_at && (
                        <Badge variant="outline">
                          Expires {format(fromUnixTime(pc.expires_at), 'MMM d')}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {pc.times_redeemed}
                    {pc.max_redemptions && ` / ${pc.max_redemptions}`}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={pc.active}
                      onCheckedChange={(active) =>
                        toggleMutation.mutate({ id: pc.id, active })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyCode(pc.code)}
                    >
                      <Copy className="h-4 w-4" />
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

**Frontend - Promo Code Form**:

```tsx
// frontend/src/components/promotions/PromoCodeForm.tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'

const schema = z.object({
  coupon_id: z.string().min(1, 'Select a coupon'),
  code: z.string().min(3).max(50).optional().or(z.literal('')),
  first_time_transaction: z.boolean().default(false),
  minimum_amount: z.number().min(1).optional(),
  max_redemptions: z.number().min(1).optional(),
})

type FormData = z.infer<typeof schema>

interface Coupon {
  id: string
  name: string | null
  percent_off: number | null
  amount_off: number | null
  valid: boolean
}

export function PromoCodeForm({ onSuccess }: { onSuccess: () => void }) {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  const { data: coupons } = useQuery<Coupon[]>({
    queryKey: ['coupons'],
    queryFn: async () => {
      const res = await fetch('/api/promotions/coupons')
      return res.json()
    },
  })

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_time_transaction: false,
    },
  })

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const body: Record<string, unknown> = {
        coupon_id: data.coupon_id,
        first_time_transaction: data.first_time_transaction,
      }

      if (data.code) body.code = data.code.toUpperCase()
      if (data.minimum_amount) body.minimum_amount = data.minimum_amount * 100
      if (data.max_redemptions) body.max_redemptions = data.max_redemptions

      const res = await fetch('/api/promotions/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error('Failed to create promotion code')
      return res.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['promo-codes'] })
      toast({ title: `Code ${data.code} created` })
      onSuccess()
    },
    onError: () => {
      toast({ variant: 'destructive', title: 'Failed to create code' })
    },
  })

  const validCoupons = coupons?.filter((c) => c.valid) || []

  return (
    <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div>
        <Label>Coupon</Label>
        <Select onValueChange={(v) => form.setValue('coupon_id', v)}>
          <SelectTrigger>
            <SelectValue placeholder="Select a coupon" />
          </SelectTrigger>
          <SelectContent>
            {validCoupons.map((coupon) => (
              <SelectItem key={coupon.id} value={coupon.id}>
                {coupon.name || coupon.id} —{' '}
                {coupon.percent_off
                  ? `${coupon.percent_off}% off`
                  : `$${(coupon.amount_off! / 100).toFixed(2)} off`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Code (optional)</Label>
        <Input
          {...form.register('code')}
          placeholder="Auto-generated if empty"
          className="font-mono uppercase"
        />
        <p className="text-sm text-muted-foreground mt-1">
          e.g., SUMMER2024, FRIENDS20
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="first_time"
          checked={form.watch('first_time_transaction')}
          onCheckedChange={(c) => form.setValue('first_time_transaction', !!c)}
        />
        <Label htmlFor="first_time">New customers only</Label>
      </div>

      <div>
        <Label>Minimum Purchase ($, optional)</Label>
        <Input
          type="number"
          {...form.register('minimum_amount', { valueAsNumber: true })}
          placeholder="No minimum"
        />
      </div>

      <div>
        <Label>Max Redemptions (optional)</Label>
        <Input
          type="number"
          {...form.register('max_redemptions', { valueAsNumber: true })}
          placeholder="Unlimited"
        />
      </div>

      <Button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? 'Creating...' : 'Create Promotion Code'}
      </Button>
    </form>
  )
}
```

## Test Cases

```python
def test_create_promo_code():
    """Verify promotion code creation."""
    response = client.post("/api/promotions/codes", json={
        "coupon_id": "test_coupon",
        "code": "SUMMER2024",
    })
    assert response.status_code == 200
    assert response.json()["code"] == "SUMMER2024"

def test_create_promo_code_with_restrictions():
    """Verify restrictions are applied."""
    response = client.post("/api/promotions/codes", json={
        "coupon_id": "test_coupon",
        "first_time_transaction": True,
        "minimum_amount": 5000,
    })
    assert response.status_code == 200
    data = response.json()
    assert data["first_time_transaction"] is True
    assert data["minimum_amount"] == 5000

def test_toggle_promo_code_active():
    """Verify code can be deactivated."""
    response = client.patch(f"/api/promotions/codes/{code_id}", json={
        "active": False,
    })
    assert response.status_code == 200
    assert response.json()["active"] is False

def test_lookup_by_code():
    """Verify lookup by code string."""
    response = client.get("/api/promotions/codes/lookup/SUMMER2024")
    assert response.status_code == 200
```

## Definition of Done
- [ ] List promotion codes with coupon details
- [ ] Create codes with custom or auto-generated strings
- [ ] Set first-time transaction restriction
- [ ] Set minimum amount restriction
- [ ] Set max redemptions
- [ ] Toggle active/inactive
- [ ] Copy code to clipboard
