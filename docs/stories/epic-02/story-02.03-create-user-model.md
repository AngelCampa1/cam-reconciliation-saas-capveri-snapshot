# Story 2.3: Create User Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)

## User Story

**As a** team member
**I want** user accounts linked to organizations with roles
**So that** I can access my organization's data with appropriate permissions

## Acceptance Criteria

- [ ] **AC1**: Pydantic model with fields:
  - `id`: UUID (matches Supabase auth.users.id)
  - `organization_id`: UUID (foreign key)
  - `email`: str (valid email format)
  - `full_name`: str (optional)
  - `role`: UserRole enum
  - `created_at`: datetime
  - `updated_at`: datetime
- [ ] **AC2**: Zod schema matches Pydantic
- [ ] **AC3**: User cannot exist without organization_id
- [ ] **AC4**: Email uniqueness enforced (at database level, but validated here)

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── user.py

frontend/src/types/
└── user.ts
```

**backend/app/models/user.py**:
```python
from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, EmailStr, ConfigDict

from .enums import UserRole

class UserBase(BaseModel):
    """Base fields for User."""
    email: EmailStr
    full_name: Optional[str] = Field(None, max_length=255)
    role: UserRole = Field(default=UserRole.MEMBER)

class UserCreate(UserBase):
    """DTO for creating a user."""
    organization_id: UUID

class UserUpdate(BaseModel):
    """DTO for updating a user."""
    full_name: Optional[str] = Field(None, max_length=255)
    role: Optional[UserRole] = None

class User(UserBase):
    """Full user model from database."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    created_at: datetime
    updated_at: datetime

class UserWithOrg(User):
    """User with organization details for context."""
    organization_name: str
```

**frontend/src/types/user.ts**:
```typescript
import { z } from 'zod'
import { UserRole } from './enums'

export const UserSchema = z.object({
  id: z.string().uuid(),
  organization_id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().max(255).nullable(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export const UserCreateSchema = z.object({
  email: z.string().email(),
  full_name: z.string().max(255).optional(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).default('member'),
  organization_id: z.string().uuid(),
})

export const UserUpdateSchema = z.object({
  full_name: z.string().max(255).optional(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']).optional(),
})

export type User = z.infer<typeof UserSchema>
export type UserCreate = z.infer<typeof UserCreateSchema>
export type UserUpdate = z.infer<typeof UserUpdateSchema>
```

## Definition of Done

- [ ] User model links to organization
- [ ] Role enum restricts valid values
- [ ] Email validation works

## Estimated Time

2 hours
