# Story 2.8: Create GLEntry Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)

## User Story

**As a** data importer
**I want** general ledger entries normalized and stored
**So that** the calculation engine can aggregate expenses by pool

## Acceptance Criteria

- [x] **AC1**: Pydantic model with fields:
  - `id`: UUID
  - `import_batch_id`: UUID (links to import)
  - `property_id`: UUID
  - `account_code`: str (GL account number)
  - `account_description`: str
  - `amount`: Decimal (signed: positive=debit, negative=credit)
  - `transaction_date`: date
  - `period_year`: int
  - `period_month`: int
  - `vendor_name`: Optional[str]
  - `description`: Optional[str]
  - `raw_row_data`: dict (original CSV row as JSONB)
  - `created_at`: datetime
- [x] **AC2**: Zod schema matches
- [x] **AC3**: Amount stored as signed decimal (no separate debit/credit columns)

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── gl_entry.py

frontend/src/types/
└── gl-entry.ts
```

**backend/app/models/gl_entry.py**:
```python
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, Any
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

class GLEntryBase(BaseModel):
    """Base fields for GL Entry."""
    account_code: str = Field(..., min_length=1, max_length=50)
    account_description: str = Field(..., max_length=255)
    amount: Decimal = Field(..., decimal_places=2)  # Signed amount
    transaction_date: date
    period_year: int = Field(..., ge=1990, le=2100)
    period_month: int = Field(..., ge=1, le=12)
    vendor_name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=1000)

class GLEntryCreate(GLEntryBase):
    """DTO for creating a GL entry (from parser)."""
    import_batch_id: UUID
    property_id: UUID
    raw_row_data: dict[str, Any] = Field(default_factory=dict)

class GLEntry(GLEntryBase):
    """Full GL entry model from database."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    import_batch_id: UUID
    property_id: UUID
    raw_row_data: dict[str, Any]
    created_at: datetime

class GLEntrySummary(BaseModel):
    """Aggregated GL entries for reporting."""
    account_code: str
    account_description: str
    total_amount: Decimal
    entry_count: int
```

**frontend/src/types/gl-entry.ts**:
```typescript
import { z } from 'zod'

export const GLEntrySchema = z.object({
  id: z.string().uuid(),
  import_batch_id: z.string().uuid(),
  property_id: z.string().uuid(),
  account_code: z.string().min(1).max(50),
  account_description: z.string().max(255),
  amount: z.string(), // Decimal as string
  transaction_date: z.string().date(),
  period_year: z.number().int().min(1990).max(2100),
  period_month: z.number().int().min(1).max(12),
  vendor_name: z.string().max(255).nullable(),
  description: z.string().max(1000).nullable(),
  raw_row_data: z.record(z.unknown()),
  created_at: z.string().datetime(),
})

export const GLEntrySummarySchema = z.object({
  account_code: z.string(),
  account_description: z.string(),
  total_amount: z.string(),
  entry_count: z.number().int(),
})

export type GLEntry = z.infer<typeof GLEntrySchema>
export type GLEntrySummary = z.infer<typeof GLEntrySummarySchema>
```

## Definition of Done

- [x] GL entries store signed amounts
- [x] Raw row data preserved as JSONB
- [x] Period fields allow filtering

## Estimated Time

2 hours
