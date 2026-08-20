# Story 2.6: Create LeaseRecoveryProfile Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)

## User Story

**As a** property accountant
**I want** lease recovery terms stored in a structured format
**So that** the calculation engine can apply the correct billing rules

## Acceptance Criteria

- [x] **AC1**: Pydantic model (embedded in Lease as JSONB) with fields:
  - `base_year`: Optional[int] (e.g., 2023)
  - `base_year_amount`: Optional[Decimal] (frozen base year expense)
  - `pro_rata_share`: Decimal (0.0 - 1.0, tenant's percentage)
  - `cap_type`: CapType enum
  - `cap_rate`: Optional[Decimal] (e.g., 0.05 for 5% cap)
  - `admin_fee_percentage`: Decimal (0.0 - 0.15 typical)
  - `gross_up_base_year`: bool (whether to normalize base year)
  - `excluded_pools`: list[PoolType] (pools this tenant doesn't pay)
- [x] **AC2**: Zod schema matches
- [x] **AC3**: Conditional validation: cap_rate required if cap_type != none

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── lease_recovery_profile.py

frontend/src/types/
└── lease-recovery-profile.ts
```

**backend/app/models/lease_recovery_profile.py**:
```python
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, Field, model_validator

from .enums import CapType, PoolType

class LeaseRecoveryProfile(BaseModel):
    """
    Recovery terms for a lease - stored as JSONB in the leases table.
    This is the 'Financial DNA' extracted from lease documents.
    """
    # Base Year Terms
    base_year: Optional[int] = Field(
        None,
        ge=1990,
        le=2100,
        description="Base year for expense stop calculation"
    )
    base_year_amount: Optional[Decimal] = Field(
        None,
        ge=0,
        description="Frozen base year expense amount (if pre-calculated)"
    )
    gross_up_base_year: bool = Field(
        default=False,
        description="Whether to gross-up base year if occupancy < 95%"
    )

    # Tenant Share
    pro_rata_share: Decimal = Field(
        ...,
        ge=Decimal("0"),
        le=Decimal("1"),
        decimal_places=6,
        description="Tenant's percentage share (e.g., 0.05 for 5%)"
    )

    # Cap Terms
    cap_type: CapType = Field(
        default=CapType.NONE,
        description="Type of cap applied to recoveries"
    )
    cap_rate: Optional[Decimal] = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Cap rate as decimal (e.g., 0.05 for 5%)"
    )

    # Admin Fee
    admin_fee_percentage: Decimal = Field(
        default=Decimal("0"),
        ge=Decimal("0"),
        le=Decimal("0.20"),
        description="Admin fee as decimal (e.g., 0.15 for 15%)"
    )

    # Exclusions
    excluded_pools: list[PoolType] = Field(
        default_factory=list,
        description="Expense pools excluded from this tenant's recovery"
    )

    @model_validator(mode='after')
    def validate_cap_rate_required(self):
        if self.cap_type != CapType.NONE and self.cap_rate is None:
            raise ValueError('cap_rate is required when cap_type is not none')
        return self
```

**frontend/src/types/lease-recovery-profile.ts**:
```typescript
import { z } from 'zod'
import { CapType, PoolType } from './enums'

export const LeaseRecoveryProfileSchema = z.object({
  // Base Year Terms
  base_year: z.number().int().min(1990).max(2100).nullable().optional(),
  base_year_amount: z.string().nullable().optional(), // Decimal as string
  gross_up_base_year: z.boolean().default(false),

  // Tenant Share
  pro_rata_share: z.string().refine(
    (val) => {
      const num = parseFloat(val)
      return !isNaN(num) && num >= 0 && num <= 1
    },
    { message: 'Pro rata share must be between 0 and 1' }
  ),

  // Cap Terms
  cap_type: z.enum(['none', 'non_cumulative', 'cumulative', 'cumulative_compounding'])
    .default('none'),
  cap_rate: z.string().nullable().optional(),

  // Admin Fee
  admin_fee_percentage: z.string().default('0'),

  // Exclusions
  excluded_pools: z.array(
    z.enum(['operating', 'tax', 'insurance', 'capital', 'other'])
  ).default([]),
}).refine(
  (data) => {
    // cap_rate required if cap_type != 'none'
    if (data.cap_type !== 'none' && !data.cap_rate) {
      return false
    }
    return true
  },
  { message: 'Cap rate is required when cap type is not none' }
)

export type LeaseRecoveryProfile = z.infer<typeof LeaseRecoveryProfileSchema>
```

## Definition of Done

- [ ] All recovery terms captured
- [ ] Conditional validation for cap_rate
- [ ] Exclusions list works

## Estimated Time

3 hours
