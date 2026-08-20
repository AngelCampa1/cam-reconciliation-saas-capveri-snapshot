# Story 2.11: Create ReconciliationSnapshot Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)

## User Story

**As a** property accountant
**I want** reconciliation calculations saved as immutable snapshots
**So that** I have an audit trail and can compare calculations over time

## Acceptance Criteria

- [x] **AC1**: Pydantic model with fields:
  - `id`: UUID
  - `property_id`: UUID
  - `lease_id`: UUID
  - `period_start_date`: date
  - `period_end_date`: date
  - `status`: ReconciliationStatus enum
  - Calculated values (all Decimal):
    - `total_operating_expenses`
    - `grossed_up_expenses`
    - `base_year_amount`
    - `tenant_share_before_cap`
    - `tenant_share_after_cap`
    - `admin_fee`
    - `total_recovery`
  - `calculation_trace`: list (JSONB of CalculationStep)
  - `finalized_at`: Optional[datetime]
  - `finalized_by_user_id`: Optional[UUID]
  - `created_at`, `updated_at`: datetime
- [x] **AC2**: Zod schema matches
- [x] **AC3**: Once finalized, cannot be modified

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── reconciliation_snapshot.py

frontend/src/types/
└── reconciliation-snapshot.ts
```

**backend/app/models/reconciliation_snapshot.py**:
```python
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

from .enums import ReconciliationStatus
from .calculation_step import CalculationStep

class ReconciliationSnapshotBase(BaseModel):
    """Base fields for Reconciliation Snapshot."""
    period_start_date: date
    period_end_date: date
    status: ReconciliationStatus = Field(default=ReconciliationStatus.DRAFT)

    # Calculated values
    total_operating_expenses: Decimal = Field(..., decimal_places=2)
    grossed_up_expenses: Decimal = Field(..., decimal_places=2)
    base_year_amount: Decimal = Field(..., decimal_places=2)
    tenant_share_before_cap: Decimal = Field(..., decimal_places=2)
    tenant_share_after_cap: Decimal = Field(..., decimal_places=2)
    admin_fee: Decimal = Field(..., decimal_places=2)
    total_recovery: Decimal = Field(..., decimal_places=2)

    # Audit trail
    calculation_trace: list[CalculationStep] = Field(default_factory=list)

class ReconciliationSnapshotCreate(ReconciliationSnapshotBase):
    """DTO for creating a reconciliation snapshot."""
    property_id: UUID
    lease_id: UUID

class ReconciliationSnapshot(ReconciliationSnapshotBase):
    """Full reconciliation snapshot model from database."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    lease_id: UUID
    finalized_at: Optional[datetime] = None
    finalized_by_user_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    @property
    def is_finalized(self) -> bool:
        return self.status == ReconciliationStatus.FINALIZED
```

**frontend/src/types/reconciliation-snapshot.ts**:
```typescript
import { z } from 'zod'
import { ReconciliationStatus } from './enums'
import { CalculationStepSchema } from './calculation-step'

export const ReconciliationSnapshotSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  lease_id: z.string().uuid(),
  period_start_date: z.string().date(),
  period_end_date: z.string().date(),
  status: z.enum(['draft', 'finalized']),

  // Calculated values
  total_operating_expenses: z.string(),
  grossed_up_expenses: z.string(),
  base_year_amount: z.string(),
  tenant_share_before_cap: z.string(),
  tenant_share_after_cap: z.string(),
  admin_fee: z.string(),
  total_recovery: z.string(),

  // Audit trail
  calculation_trace: z.array(CalculationStepSchema),

  finalized_at: z.string().datetime().nullable(),
  finalized_by_user_id: z.string().uuid().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const ReconciliationSnapshotCreateSchema = z.object({
  property_id: z.string().uuid(),
  lease_id: z.string().uuid(),
  period_start_date: z.string().date(),
  period_end_date: z.string().date(),
  status: z.enum(['draft', 'finalized']).default('draft'),

  total_operating_expenses: z.string(),
  grossed_up_expenses: z.string(),
  base_year_amount: z.string(),
  tenant_share_before_cap: z.string(),
  tenant_share_after_cap: z.string(),
  admin_fee: z.string(),
  total_recovery: z.string(),

  calculation_trace: z.array(CalculationStepSchema).default([]),
})

export type ReconciliationSnapshot = z.infer<typeof ReconciliationSnapshotSchema>
export type ReconciliationSnapshotCreate = z.infer<typeof ReconciliationSnapshotCreateSchema>
```

## Definition of Done

- [x] All calculation fields stored
- [x] Status tracks draft vs finalized
- [x] Calculation trace preserved

## Estimated Time

3 hours
