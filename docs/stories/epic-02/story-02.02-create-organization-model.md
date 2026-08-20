# Story 2.2: Create Organization Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)

## User Story

**As a** multi-tenant SaaS user
**I want** organization data properly modeled
**So that** all my data is scoped to my organization and isolated from others

## Acceptance Criteria

- [ ] **AC1**: Pydantic model with fields:
  - `id`: UUID
  - `name`: str (required, 1-255 chars)
  - `subscription_status`: str (active, trial, suspended, cancelled)
  - `settings`: dict (JSONB for flexible org config)
  - `created_at`: datetime
  - `updated_at`: datetime
- [ ] **AC2**: Zod schema matches Pydantic exactly
- [ ] **AC3**: Settings schema allows: timezone, default_currency, fiscal_year_end
- [ ] **AC4**: Create and Update DTOs defined (without id, timestamps)

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── organization.py

frontend/src/types/
└── organization.ts
```

**backend/app/models/organization.py**:
```python
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

class OrganizationSettings(BaseModel):
    """Flexible settings stored as JSONB."""
    timezone: str = "America/New_York"
    default_currency: str = "USD"
    fiscal_year_end_month: int = Field(default=12, ge=1, le=12)

class OrganizationBase(BaseModel):
    """Base fields for Organization."""
    name: str = Field(..., min_length=1, max_length=255)
    subscription_status: str = Field(default="trial")
    settings: OrganizationSettings = Field(default_factory=OrganizationSettings)

class OrganizationCreate(OrganizationBase):
    """DTO for creating an organization."""
    pass

class OrganizationUpdate(BaseModel):
    """DTO for updating an organization (all fields optional)."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    subscription_status: Optional[str] = None
    settings: Optional[OrganizationSettings] = None

class Organization(OrganizationBase):
    """Full organization model from database."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
```

**frontend/src/types/organization.ts**:
```typescript
import { z } from 'zod'

export const OrganizationSettingsSchema = z.object({
  timezone: z.string().default('America/New_York'),
  default_currency: z.string().default('USD'),
  fiscal_year_end_month: z.number().int().min(1).max(12).default(12),
})

export const OrganizationSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  subscription_status: z.enum(['active', 'trial', 'suspended', 'cancelled']),
  settings: OrganizationSettingsSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const OrganizationCreateSchema = z.object({
  name: z.string().min(1).max(255),
  subscription_status: z.string().optional(),
  settings: OrganizationSettingsSchema.optional(),
})

export const OrganizationUpdateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subscription_status: z.string().optional(),
  settings: OrganizationSettingsSchema.optional(),
})

export type OrganizationSettings = z.infer<typeof OrganizationSettingsSchema>
export type Organization = z.infer<typeof OrganizationSchema>
export type OrganizationCreate = z.infer<typeof OrganizationCreateSchema>
export type OrganizationUpdate = z.infer<typeof OrganizationUpdateSchema>
```

## Definition of Done

- [ ] Pydantic and Zod schemas validate same inputs
- [ ] Settings schema is flexible but typed
- [ ] Create/Update DTOs work for API requests

## Estimated Time

2 hours
