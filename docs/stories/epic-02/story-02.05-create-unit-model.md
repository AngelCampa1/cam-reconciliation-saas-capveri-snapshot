# Story 2.5: Create Unit Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)

## User Story

**As a** property manager
**I want** individual units tracked within properties
**So that** I can manage tenants and space allocations

## Acceptance Criteria

- [ ] **AC1**: Pydantic model with fields:
  - `id`: UUID
  - `property_id`: UUID (foreign key)
  - `unit_number`: str (unique within property)
  - `rentable_sqft`: Decimal (> 0)
  - `usable_sqft`: Decimal (> 0)
  - `floor`: Optional[int]
  - `status`: enum (vacant, occupied, under_renovation)
  - `created_at`, `updated_at`: datetime
- [ ] **AC2**: Zod schema matches
- [ ] **AC3**: Unit number unique within property (not globally)

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── unit.py

frontend/src/types/
└── unit.ts
```

**backend/app/models/unit.py**:
```python
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

class UnitStatus(str, Enum):
    VACANT = "vacant"
    OCCUPIED = "occupied"
    UNDER_RENOVATION = "under_renovation"

class UnitBase(BaseModel):
    """Base fields for Unit."""
    unit_number: str = Field(..., min_length=1, max_length=50)
    rentable_sqft: Decimal = Field(..., gt=0, decimal_places=2)
    usable_sqft: Decimal = Field(..., gt=0, decimal_places=2)
    floor: Optional[int] = Field(None, ge=0)
    status: UnitStatus = Field(default=UnitStatus.VACANT)

class UnitCreate(UnitBase):
    """DTO for creating a unit."""
    property_id: UUID

class UnitUpdate(BaseModel):
    """DTO for updating a unit."""
    unit_number: Optional[str] = Field(None, min_length=1, max_length=50)
    rentable_sqft: Optional[Decimal] = None
    usable_sqft: Optional[Decimal] = None
    floor: Optional[int] = None
    status: Optional[UnitStatus] = None

class Unit(UnitBase):
    """Full unit model from database."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    created_at: datetime
    updated_at: datetime
```

**frontend/src/types/unit.ts**:
```typescript
import { z } from 'zod'

export const UnitStatus = {
  VACANT: 'vacant',
  OCCUPIED: 'occupied',
  UNDER_RENOVATION: 'under_renovation',
} as const
export type UnitStatus = typeof UnitStatus[keyof typeof UnitStatus]

export const UnitSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  unit_number: z.string().min(1).max(50),
  rentable_sqft: z.string(), // Decimal as string
  usable_sqft: z.string(),
  floor: z.number().int().min(0).nullable(),
  status: z.enum(['vacant', 'occupied', 'under_renovation']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const UnitCreateSchema = z.object({
  property_id: z.string().uuid(),
  unit_number: z.string().min(1).max(50),
  rentable_sqft: z.string(),
  usable_sqft: z.string(),
  floor: z.number().int().min(0).optional(),
  status: z.enum(['vacant', 'occupied', 'under_renovation']).default('vacant'),
})

export const UnitUpdateSchema = UnitCreateSchema.omit({ property_id: true }).partial()

export type Unit = z.infer<typeof UnitSchema>
export type UnitCreate = z.infer<typeof UnitCreateSchema>
export type UnitUpdate = z.infer<typeof UnitUpdateSchema>
```

## Definition of Done

- [ ] Unit links to property
- [ ] Status enum enforced
- [ ] Area fields validated

## Estimated Time

2 hours
