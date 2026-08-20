# Story 2.9: Create ExpensePool Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)

## User Story

**As a** property accountant
**I want** expense pools configured for each property
**So that** GL entries can be categorized and gross-up rules applied correctly

## Acceptance Criteria

- [x] **AC1**: Pydantic model with fields:
  - `id`: UUID
  - `property_id`: UUID
  - `name`: str
  - `pool_type`: PoolType enum
  - `is_gross_up_applicable`: bool
  - `gross_up_target`: Optional[Decimal] (target occupancy for this pool)
  - `description`: Optional[str]
  - `created_at`, `updated_at`: datetime
- [x] **AC2**: Zod schema matches
- [x] **AC3**: gross_up_target only relevant if is_gross_up_applicable = true

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── expense_pool.py

frontend/src/types/
└── expense-pool.ts
```

**backend/app/models/expense_pool.py**:
```python
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

from .enums import PoolType

class ExpensePoolBase(BaseModel):
    """Base fields for Expense Pool."""
    name: str = Field(..., min_length=1, max_length=100)
    pool_type: PoolType
    is_gross_up_applicable: bool = Field(default=True)
    gross_up_target: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Target occupancy for gross-up (e.g., 0.95)"
    )
    description: Optional[str] = Field(None, max_length=500)

class ExpensePoolCreate(ExpensePoolBase):
    """DTO for creating an expense pool."""
    property_id: UUID

class ExpensePoolUpdate(BaseModel):
    """DTO for updating an expense pool."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    pool_type: Optional[PoolType] = None
    is_gross_up_applicable: Optional[bool] = None
    gross_up_target: Optional[Decimal] = None
    description: Optional[str] = None

class ExpensePool(ExpensePoolBase):
    """Full expense pool model from database."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    created_at: datetime
    updated_at: datetime
```

**frontend/src/types/expense-pool.ts**:
```typescript
import { z } from 'zod'
import { PoolType } from './enums'

export const ExpensePoolSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  pool_type: z.enum(['operating', 'tax', 'insurance', 'capital', 'other']),
  is_gross_up_applicable: z.boolean().default(true),
  gross_up_target: z.string().nullable().optional(),
  description: z.string().max(500).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const ExpensePoolCreateSchema = z.object({
  property_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  pool_type: z.enum(['operating', 'tax', 'insurance', 'capital', 'other']),
  is_gross_up_applicable: z.boolean().default(true),
  gross_up_target: z.string().optional(),
  description: z.string().max(500).optional(),
})

export const ExpensePoolUpdateSchema = ExpensePoolCreateSchema.omit({ property_id: true }).partial()

export type ExpensePool = z.infer<typeof ExpensePoolSchema>
export type ExpensePoolCreate = z.infer<typeof ExpensePoolCreateSchema>
export type ExpensePoolUpdate = z.infer<typeof ExpensePoolUpdateSchema>
```

## Definition of Done

- [x] Pool type enum restricts values
- [x] Gross-up settings validated
- [x] Links to property

## Estimated Time

2 hours
