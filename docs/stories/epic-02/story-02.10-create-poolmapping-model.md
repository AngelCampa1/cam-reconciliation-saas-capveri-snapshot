# Story 2.10: Create PoolMapping Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)

## User Story

**As a** property accountant
**I want** GL accounts mapped to expense pools using patterns
**So that** expenses are automatically categorized without manual assignment

## Acceptance Criteria

- [x] **AC1**: Pydantic model with fields:
  - `id`: UUID
  - `expense_pool_id`: UUID
  - `gl_account_pattern`: str (supports wildcards like `5*`, `51??`)
  - `allocation_percentage`: Decimal (0.0 - 1.0)
  - `priority`: int (for resolving conflicts)
  - `created_at`, `updated_at`: datetime
- [x] **AC2**: Zod schema matches
- [x] **AC3**: Pattern supports `*` (any chars) and `?` (single char) wildcards

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── pool_mapping.py

frontend/src/types/
└── pool-mapping.ts
```

**backend/app/models/pool_mapping.py**:
```python
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

class PoolMappingBase(BaseModel):
    """Base fields for Pool Mapping."""
    gl_account_pattern: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Pattern to match GL accounts (e.g., '51*', '5???')"
    )
    allocation_percentage: Decimal = Field(
        default=Decimal("1.0"),
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Portion of matching entries to allocate (1.0 = 100%)"
    )
    priority: int = Field(
        default=0,
        ge=0,
        description="Higher priority patterns evaluated first"
    )

class PoolMappingCreate(PoolMappingBase):
    """DTO for creating a pool mapping."""
    expense_pool_id: UUID

class PoolMappingUpdate(BaseModel):
    """DTO for updating a pool mapping."""
    gl_account_pattern: Optional[str] = None
    allocation_percentage: Optional[Decimal] = None
    priority: Optional[int] = None

class PoolMapping(PoolMappingBase):
    """Full pool mapping model from database."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    expense_pool_id: UUID
    created_at: datetime
    updated_at: datetime
```

**frontend/src/types/pool-mapping.ts**:
```typescript
import { z } from 'zod'

export const PoolMappingSchema = z.object({
  id: z.string().uuid(),
  expense_pool_id: z.string().uuid(),
  gl_account_pattern: z.string().min(1).max(50),
  allocation_percentage: z.string().refine(
    (val) => {
      const num = parseFloat(val)
      return !isNaN(num) && num >= 0 && num <= 1
    },
    { message: 'Allocation percentage must be between 0 and 1' }
  ),
  priority: z.number().int().min(0),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const PoolMappingCreateSchema = z.object({
  expense_pool_id: z.string().uuid(),
  gl_account_pattern: z.string().min(1).max(50),
  allocation_percentage: z.string().default('1.0'),
  priority: z.number().int().min(0).default(0),
})

export const PoolMappingUpdateSchema = z.object({
  gl_account_pattern: z.string().min(1).max(50).optional(),
  allocation_percentage: z.string().optional(),
  priority: z.number().int().min(0).optional(),
})

export type PoolMapping = z.infer<typeof PoolMappingSchema>
export type PoolMappingCreate = z.infer<typeof PoolMappingCreateSchema>
export type PoolMappingUpdate = z.infer<typeof PoolMappingUpdateSchema>
```

## Definition of Done

- [x] Wildcards documented
- [x] Allocation percentage validated
- [x] Priority for conflict resolution

## Estimated Time

2 hours
