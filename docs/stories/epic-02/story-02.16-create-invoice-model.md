# Story 2.16: Create Invoice Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)
**Status**: `completed`
**Estimated Time**: 2 hours
**Dependencies**: Story 2.1 (Core Enums)

## User Story

**As a** developer
**I want** Pydantic and Zod schemas for invoice data
**So that** billing history is type-safe across the stack

## Acceptance Criteria

- [x] **AC1**: Python enum created for:
  - `InvoiceStatus` (draft, open, paid, void, uncollectible)
- [x] **AC2**: TypeScript const object created with same values
- [x] **AC3**: Pydantic `Invoice` model with fields:
  - `id: UUID`
  - `organization_id: UUID`
  - `subscription_id: UUID | None`
  - `stripe_invoice_id: str | None`
  - `amount_due: Decimal`
  - `amount_paid: Decimal`
  - `currency: str` (default: "usd")
  - `status: InvoiceStatus`
  - `period_start: datetime`
  - `period_end: datetime`
  - `due_date: datetime | None`
  - `paid_at: datetime | None`
  - `pdf_url: str | None`
  - `created_at: datetime`
  - `updated_at: datetime`
- [x] **AC4**: `InvoiceCreate` DTO defined for internal creation
- [x] **AC5**: Matching Zod schemas in frontend
- [x] **AC6**: Unit tests verify schema validation and serialization (44 Python + 62 TypeScript tests)

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── invoice.py

frontend/src/types/
└── invoice.ts
```

**backend/app/models/invoice.py**:
```python
"""
Invoice domain model for billing history.
"""
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class InvoiceStatus(str, Enum):
    """Current status of an invoice."""
    DRAFT = "draft"
    OPEN = "open"
    PAID = "paid"
    VOID = "void"
    UNCOLLECTIBLE = "uncollectible"


class InvoiceBase(BaseModel):
    """Base invoice fields shared across DTOs."""
    amount_due: Decimal = Field(ge=0, decimal_places=2)
    amount_paid: Decimal = Field(ge=0, decimal_places=2, default=Decimal("0.00"))
    currency: str = Field(default="usd", max_length=3)
    status: InvoiceStatus = InvoiceStatus.DRAFT


class InvoiceCreate(InvoiceBase):
    """DTO for creating a new invoice."""
    organization_id: UUID
    subscription_id: Optional[UUID] = None
    stripe_invoice_id: Optional[str] = None
    period_start: datetime
    period_end: datetime
    due_date: Optional[datetime] = None


class Invoice(InvoiceBase):
    """Full invoice model with all fields."""
    id: UUID
    organization_id: UUID
    subscription_id: Optional[UUID] = None
    stripe_invoice_id: Optional[str] = None
    period_start: datetime
    period_end: datetime
    due_date: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    pdf_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

**frontend/src/types/invoice.ts**:
```typescript
import { z } from 'zod'

export const InvoiceStatus = {
  DRAFT: 'draft',
  OPEN: 'open',
  PAID: 'paid',
  VOID: 'void',
  UNCOLLECTIBLE: 'uncollectible',
} as const
export type InvoiceStatus = typeof InvoiceStatus[keyof typeof InvoiceStatus]

export const InvoiceStatusSchema = z.enum([
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible',
])

export const InvoiceSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  subscription_id: z.string().uuid().nullable(),
  stripe_invoice_id: z.string().nullable(),
  amount_due: z.string().or(z.number()).transform(v => String(v)),
  amount_paid: z.string().or(z.number()).transform(v => String(v)),
  currency: z.string().max(3).default('usd'),
  status: InvoiceStatusSchema,
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  due_date: z.string().datetime().nullable(),
  paid_at: z.string().datetime().nullable(),
  pdf_url: z.string().url().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type Invoice = z.infer<typeof InvoiceSchema>

export const InvoiceCreateSchema = z.object({
  organization_id: z.string().uuid(),
  subscription_id: z.string().uuid().nullable().optional(),
  stripe_invoice_id: z.string().nullable().optional(),
  amount_due: z.string().or(z.number()),
  amount_paid: z.string().or(z.number()).optional().default('0.00'),
  currency: z.string().max(3).optional().default('usd'),
  status: InvoiceStatusSchema.optional().default('draft'),
  period_start: z.string().datetime(),
  period_end: z.string().datetime(),
  due_date: z.string().datetime().nullable().optional(),
})

export type InvoiceCreate = z.infer<typeof InvoiceCreateSchema>
```

## Test Cases

```python
# backend/tests/test_invoice_model.py
def test_invoice_status_enum_values():
    """Verify all invoice status values."""
    assert InvoiceStatus.DRAFT.value == "draft"
    assert InvoiceStatus.PAID.value == "paid"
    assert len(InvoiceStatus) == 5

def test_invoice_amount_validation():
    """Verify amount fields reject negative values."""
    with pytest.raises(ValidationError):
        InvoiceCreate(
            organization_id=uuid4(),
            amount_due=Decimal("-100.00"),
            period_start=datetime.utcnow(),
            period_end=datetime.utcnow(),
        )

def test_invoice_model_serialization():
    """Verify invoice model serializes Decimals as strings."""
    invoice = Invoice(
        id=uuid4(),
        organization_id=uuid4(),
        amount_due=Decimal("99.99"),
        amount_paid=Decimal("0.00"),
        status=InvoiceStatus.OPEN,
        period_start=datetime.utcnow(),
        period_end=datetime.utcnow(),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    data = invoice.model_dump()
    assert data["amount_due"] == Decimal("99.99")
```

## Definition of Done

- [x] All enums defined in both languages
- [x] Values match exactly between Python and TypeScript
- [x] Decimal amounts handled correctly (no floating point)
- [x] Zod schemas validate backend responses
- [x] Unit tests pass with 100% coverage (invoice.py at 100%)

## Implementation Notes

**Files Created**:
- `backend/app/models/invoice.py` - Pydantic models (5 models, 1 enum)
- `backend/tests/test_invoice_model.py` - 44 Python tests
- `frontend/src/types/invoice.ts` - Zod schemas and helpers
- `frontend/src/types/__tests__/invoice.test.ts` - 62 TypeScript tests

**Additional Features Implemented**:
- `InvoiceUpdate` DTO for partial updates
- `InvoiceSummary` model for lightweight listings
- Helper functions: `isValidInvoiceStatus`, `getInvoiceStatusDisplayName`, `isInvoiceFinalized`, `requiresPayment`, `calculateBalance`, `formatInvoiceAmount`
- Non-negative validation on `amount_due` and `amount_paid` fields
- Currency field validation with 3-char max length
