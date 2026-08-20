# Story 21.7: Create Billing History Endpoints

## Story Info
- **Epic**: Billing & Subscriptions
- **Estimated Hours**: 2
- **Dependencies**: Story 21.6 (Webhooks), Story 3.16 (Invoices Table)
- **Status**: `pending`

## User Story
**As a** customer
**I want** to view my billing history and download invoices
**So that** I can track expenses and provide records to accounting

## Acceptance Criteria
- [ ] **AC1**: GET /billing/invoices lists all invoices
- [ ] **AC2**: Invoices sorted by date descending
- [ ] **AC3**: Each invoice includes PDF download URL
- [ ] **AC4**: Pagination support for long histories
- [ ] **AC5**: Filter by status (paid, open, etc.)

## Technical Specifications

**Backend Endpoint**:

```python
# backend/app/api/routes/billing.py
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

router = APIRouter(prefix="/billing", tags=["billing"])


class InvoiceResponse(BaseModel):
    """Invoice response model."""
    id: str
    stripe_invoice_id: Optional[str]
    amount_due: float
    amount_paid: float
    currency: str
    status: str
    period_start: datetime
    period_end: datetime
    due_date: Optional[datetime]
    paid_at: Optional[datetime]
    pdf_url: Optional[str]
    created_at: datetime


class InvoiceListResponse(BaseModel):
    """Paginated invoice list response."""
    invoices: list[InvoiceResponse]
    total: int
    page: int
    per_page: int
    has_more: bool


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    status: Optional[str] = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    current_user = Depends(get_current_user),
    db = Depends(get_db),
):
    """
    List invoices for current organization.

    Supports filtering by status and pagination.
    """
    # Build query
    query = db.table('invoices') \
        .select('*', count='exact') \
        .eq('organization_id', str(current_user.organization_id)) \
        .order('created_at', desc=True)

    if status:
        query = query.eq('status', status)

    # Apply pagination
    start = (page - 1) * per_page
    query = query.range(start, start + per_page - 1)

    result = await query.execute()

    total = result.count or 0
    has_more = start + per_page < total

    return InvoiceListResponse(
        invoices=[InvoiceResponse(**inv) for inv in result.data],
        total=total,
        page=page,
        per_page=per_page,
        has_more=has_more,
    )


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
):
    """Get a specific invoice."""
    result = await db.table('invoices') \
        .select('*') \
        .eq('id', invoice_id) \
        .eq('organization_id', str(current_user.organization_id)) \
        .single() \
        .execute()

    if not result.data:
        raise HTTPException(404, "Invoice not found")

    return InvoiceResponse(**result.data)


@router.get("/invoices/{invoice_id}/pdf")
async def get_invoice_pdf(
    invoice_id: str,
    current_user = Depends(get_current_user),
    db = Depends(get_db),
):
    """
    Get PDF download URL for an invoice.

    Redirects to Stripe-hosted PDF.
    """
    result = await db.table('invoices') \
        .select('pdf_url') \
        .eq('id', invoice_id) \
        .eq('organization_id', str(current_user.organization_id)) \
        .single() \
        .execute()

    if not result.data:
        raise HTTPException(404, "Invoice not found")

    if not result.data.get('pdf_url'):
        raise HTTPException(404, "PDF not available")

    from fastapi.responses import RedirectResponse
    return RedirectResponse(result.data['pdf_url'])


@router.get("/invoices/summary")
async def get_invoice_summary(
    current_user = Depends(get_current_user),
    db = Depends(get_db),
):
    """Get summary of billing history."""
    result = await db.table('invoices') \
        .select('status, amount_paid') \
        .eq('organization_id', str(current_user.organization_id)) \
        .execute()

    invoices = result.data or []

    total_paid = sum(
        float(inv['amount_paid'])
        for inv in invoices
        if inv['status'] == 'paid'
    )

    return {
        "total_invoices": len(invoices),
        "paid_invoices": len([i for i in invoices if i['status'] == 'paid']),
        "open_invoices": len([i for i in invoices if i['status'] == 'open']),
        "total_paid": total_paid,
        "currency": "usd",
    }
```

**Frontend Hook**:

```typescript
// frontend/src/hooks/use-invoices.ts
import { useQuery } from '@tanstack/react-query'

interface Invoice {
  id: string
  stripe_invoice_id: string | null
  amount_due: number
  amount_paid: number
  currency: string
  status: string
  period_start: string
  period_end: string
  due_date: string | null
  paid_at: string | null
  pdf_url: string | null
  created_at: string
}

interface InvoiceListResponse {
  invoices: Invoice[]
  total: number
  page: number
  per_page: number
  has_more: boolean
}

export function useInvoices(
  status?: string,
  page: number = 1,
  perPage: number = 10,
) {
  return useQuery<InvoiceListResponse>({
    queryKey: ['invoices', status, page, perPage],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      })
      if (status) {
        params.set('status', status)
      }

      const res = await fetch(`/api/billing/invoices?${params}`)
      if (!res.ok) throw new Error('Failed to fetch invoices')
      return res.json()
    },
  })
}

export function useInvoiceSummary() {
  return useQuery({
    queryKey: ['invoices', 'summary'],
    queryFn: async () => {
      const res = await fetch('/api/billing/invoices/summary')
      if (!res.ok) throw new Error('Failed to fetch summary')
      return res.json()
    },
  })
}
```

## Test Cases

```python
def test_list_invoices_returns_org_invoices():
    """Verify only organization invoices returned."""
    # Create invoices for two orgs
    # Query as org A
    # Verify only org A invoices returned

def test_list_invoices_pagination():
    """Verify pagination works correctly."""
    # Create 25 invoices
    # Query page 1, per_page 10
    # Verify 10 returned, has_more=True
    # Query page 3
    # Verify 5 returned, has_more=False

def test_list_invoices_status_filter():
    """Verify status filter works."""
    # Create paid and open invoices
    # Query with status=paid
    # Verify only paid invoices returned

def test_invoice_pdf_redirect():
    """Verify PDF endpoint redirects to Stripe."""
    # Create invoice with pdf_url
    # Request PDF endpoint
    # Verify redirect response
```

## Definition of Done
- [ ] List invoices endpoint works with pagination
- [ ] Status filter works
- [ ] PDF redirect works
- [ ] Summary endpoint returns correct totals
- [ ] Frontend hooks implemented
- [ ] Tests pass
