# Story 2.7: Create Lease Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)
**Dependencies**: Story 2.6 (LeaseRecoveryProfile model), Story 2.1 (LeaseStatus enum)

## User Story

**As a** property manager
**I want** lease data with embedded recovery profile
**So that** I can track tenant agreements and calculate their recoveries

## Acceptance Criteria

- [x] **AC1**: Pydantic model with fields:
  - `id`: UUID
  - `property_id`: UUID
  - `unit_id`: Optional[UUID] (lease might cover multiple units)
  - `tenant_name`: str
  - `start_date`: date
  - `end_date`: date
  - `status`: LeaseStatus enum
  - `recovery_profile`: LeaseRecoveryProfile (JSONB)
  - `document_url`: Optional[str] (S3 link to lease PDF)
  - `created_at`, `updated_at`: datetime
- [x] **AC2**: Zod schema matches
- [x] **AC3**: Validation: end_date > start_date
- [x] **AC4**: Recovery profile embedded as nested object

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── lease.py

frontend/src/types/
└── lease.ts
```

**backend/app/models/lease.py**:
```python
from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict, field_validator

from .enums import LeaseStatus
from .lease_recovery_profile import LeaseRecoveryProfile

class LeaseBase(BaseModel):
    """Base fields for Lease."""
    tenant_name: str = Field(..., min_length=1, max_length=255)
    start_date: date
    end_date: date
    status: LeaseStatus = Field(default=LeaseStatus.DRAFT)
    recovery_profile: LeaseRecoveryProfile
    document_url: Optional[str] = Field(None, max_length=2048)

    @field_validator('end_date')
    @classmethod
    def end_after_start(cls, v, info):
        if 'start_date' in info.data and v <= info.data['start_date']:
            raise ValueError('End date must be after start date')
        return v

class LeaseCreate(LeaseBase):
    """DTO for creating a lease."""
    property_id: UUID
    unit_id: Optional[UUID] = None

class LeaseUpdate(BaseModel):
    """DTO for updating a lease."""
    tenant_name: Optional[str] = Field(None, min_length=1, max_length=255)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[LeaseStatus] = None
    recovery_profile: Optional[LeaseRecoveryProfile] = None
    unit_id: Optional[UUID] = None
    document_url: Optional[str] = None

class Lease(LeaseBase):
    """Full lease model from database."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    unit_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime
```

**frontend/src/types/lease.ts**:
```typescript
import { z } from 'zod'
import { LeaseStatus } from './enums'
import { LeaseRecoveryProfileSchema } from './lease-recovery-profile'

export const LeaseSchema = z.object({
  id: z.string().uuid(),
  property_id: z.string().uuid(),
  unit_id: z.string().uuid().nullable(),
  tenant_name: z.string().min(1).max(255),
  start_date: z.string().date(),
  end_date: z.string().date(),
  status: z.enum(['draft', 'active', 'expired', 'terminated']),
  recovery_profile: LeaseRecoveryProfileSchema,
  document_url: z.string().url().max(2048).nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
}).refine(
  (data) => new Date(data.end_date) > new Date(data.start_date),
  { message: 'End date must be after start date' }
)

export const LeaseCreateSchema = z.object({
  property_id: z.string().uuid(),
  unit_id: z.string().uuid().optional(),
  tenant_name: z.string().min(1).max(255),
  start_date: z.string().date(),
  end_date: z.string().date(),
  status: z.enum(['draft', 'active', 'expired', 'terminated']).default('draft'),
  recovery_profile: LeaseRecoveryProfileSchema,
  document_url: z.string().url().max(2048).optional(),
})

export const LeaseUpdateSchema = LeaseCreateSchema.partial().omit({ property_id: true })

export type Lease = z.infer<typeof LeaseSchema>
export type LeaseCreate = z.infer<typeof LeaseCreateSchema>
export type LeaseUpdate = z.infer<typeof LeaseUpdateSchema>
```

## Definition of Done

- [x] Lease with embedded recovery profile validates
- [x] Date validation works
- [x] Status enum enforced

## Estimated Time

3 hours
