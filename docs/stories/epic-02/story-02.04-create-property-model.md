# Story 2.4: Create Property Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)
**Status**: `pending`
**Estimated Time**: 2 hours

## User Story

**As a** property manager
**I want** property data modeled with BOMA area fields
**So that** I can track rentable/usable areas for accurate expense allocation

## Acceptance Criteria

- [ ] **AC1**: Pydantic model with fields:
  - `id`: UUID
  - `organization_id`: UUID
  - `name`: str (required)
  - `address_line1`, `address_line2`, `city`, `state`, `postal_code`: address fields
  - `total_rentable_sqft`: Decimal (> 0)
  - `total_usable_sqft`: Decimal (> 0)
  - `common_area_sqft`: Decimal (>= 0)
  - `target_occupancy`: Decimal (0.0 - 1.0, default 0.95)
  - `created_at`, `updated_at`: datetime
- [ ] **AC2**: Zod schema matches with proper Decimal handling
- [ ] **AC3**: Validation: rentable >= usable
- [ ] **AC4**: Validation: common_area = rentable - usable (soft check)

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── property.py

frontend/src/types/
└── property.ts
```

**backend/app/models/property.py**:
```python
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict, field_validator

class PropertyBase(BaseModel):
    """Base fields for Property."""
    name: str = Field(..., min_length=1, max_length=255)
    address_line1: str = Field(..., max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: str = Field(..., max_length=100)
    state: str = Field(..., min_length=2, max_length=2)  # US state codes
    postal_code: str = Field(..., max_length=20)

    # BOMA area fields
    total_rentable_sqft: Decimal = Field(..., gt=0, decimal_places=2)
    total_usable_sqft: Decimal = Field(..., gt=0, decimal_places=2)
    common_area_sqft: Decimal = Field(..., ge=0, decimal_places=2)
    target_occupancy: Decimal = Field(
        default=Decimal("0.95"),
        ge=Decimal("0"),
        le=Decimal("1"),
        decimal_places=4
    )

    @field_validator('total_usable_sqft')
    @classmethod
    def usable_not_greater_than_rentable(cls, v, info):
        if 'total_rentable_sqft' in info.data:
            if v > info.data['total_rentable_sqft']:
                raise ValueError('Usable sqft cannot exceed rentable sqft')
        return v

class PropertyCreate(PropertyBase):
    """DTO for creating a property."""
    pass

class PropertyUpdate(BaseModel):
    """DTO for updating a property (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    total_rentable_sqft: Optional[Decimal] = None
    total_usable_sqft: Optional[Decimal] = None
    common_area_sqft: Optional[Decimal] = None
    target_occupancy: Optional[Decimal] = None

class Property(PropertyBase):
    """Full property model from database."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime
```

**frontend/src/types/property.ts**:
```typescript
import { z } from 'zod'

// Helper for decimal string validation
const decimalString = (opts?: { gt?: number; ge?: number }) =>
  z.string().refine(
    (val) => {
      const num = parseFloat(val)
      if (isNaN(num)) return false
      if (opts?.gt !== undefined && num <= opts.gt) return false
      if (opts?.ge !== undefined && num < opts.ge) return false
      return true
    },
    { message: 'Invalid decimal value' }
  )

export const PropertySchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  name: z.string().min(1).max(255),
  address_line1: z.string().max(255),
  address_line2: z.string().max(255).nullable(),
  city: z.string().max(100),
  state: z.string().length(2),
  postal_code: z.string().max(20),
  total_rentable_sqft: z.string().refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    { message: "Total rentable sqft must be a valid decimal greater than 0" }
  ),
  total_usable_sqft: z.string().refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0,
    { message: "Total usable sqft must be a valid decimal greater than 0" }
  ),
  common_area_sqft: z.string().refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0,
    { message: "Common area sqft must be a valid decimal greater than or equal to 0" }
  ),
  target_occupancy: z.string().refine(
    (val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0,
    { message: "Target occupancy must be a valid decimal greater than or equal to 0" }
  ),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const PropertyCreateSchema = PropertySchema.omit({
  id: true,
  organization_id: true,
  created_at: true,
  updated_at: true,
})

export const PropertyUpdateSchema = PropertyCreateSchema.partial()

export type Property = z.infer<typeof PropertySchema>
export type PropertyCreate = z.infer<typeof PropertyCreateSchema>
export type PropertyUpdate = z.infer<typeof PropertyUpdateSchema>
```

## Definition of Done

- [ ] BOMA area fields validated
- [ ] Decimal precision maintained
- [ ] Validation prevents usable > rentable
