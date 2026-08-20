# Story 2.1: Create Core Enums

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)
**Status**: `completed`
**Estimated Time**: 2 hours

## User Story

**As a** developer
**I want** enumerated types for all domain constants
**So that** valid values are enforced at compile time and shared across frontend/backend

## Acceptance Criteria

- [x] **AC1**: Python enums created for:
  - `CapType` (none, non_cumulative, cumulative, cumulative_compounding)
  - `PoolType` (operating, tax, insurance, capital, other)
  - `LeaseStatus` (draft, active, expired, terminated)
  - `ImportStatus` (pending, processing, completed, failed)
  - `UserRole` (owner, admin, member, viewer)
  - `ReconciliationStatus` (draft, finalized)
- [x] **AC2**: TypeScript const objects created with same values
- [x] **AC3**: Python enums use `str` mixin for JSON serialization
- [x] **AC4**: TypeScript types derived from const objects
- [x] **AC5**: Values match exactly between Python and TypeScript

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── enums.py

frontend/src/types/
└── enums.ts
```

**backend/app/models/enums.py**:
```python
from enum import Enum

class CapType(str, Enum):
    """Type of expense cap applied to tenant recoveries."""
    NONE = "none"
    NON_CUMULATIVE = "non_cumulative"
    CUMULATIVE = "cumulative"
    CUMULATIVE_COMPOUNDING = "cumulative_compounding"

class PoolType(str, Enum):
    """Category of expense pool for allocation."""
    OPERATING = "operating"
    TAX = "tax"
    INSURANCE = "insurance"
    CAPITAL = "capital"
    OTHER = "other"

class LeaseStatus(str, Enum):
    """Current status of a lease."""
    DRAFT = "draft"
    ACTIVE = "active"
    EXPIRED = "expired"
    TERMINATED = "terminated"

class ImportStatus(str, Enum):
    """Status of a data import batch."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class UserRole(str, Enum):
    """Role of a user within an organization."""
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"
    VIEWER = "viewer"

class ReconciliationStatus(str, Enum):
    """Status of a reconciliation snapshot."""
    DRAFT = "draft"
    FINALIZED = "finalized"
```

**frontend/src/types/enums.ts**:
```typescript
export const CapType = {
  NONE: 'none',
  NON_CUMULATIVE: 'non_cumulative',
  CUMULATIVE: 'cumulative',
  CUMULATIVE_COMPOUNDING: 'cumulative_compounding',
} as const
export type CapType = typeof CapType[keyof typeof CapType]

export const PoolType = {
  OPERATING: 'operating',
  TAX: 'tax',
  INSURANCE: 'insurance',
  CAPITAL: 'capital',
  OTHER: 'other',
} as const
export type PoolType = typeof PoolType[keyof typeof PoolType]

export const LeaseStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  EXPIRED: 'expired',
  TERMINATED: 'terminated',
} as const
export type LeaseStatus = typeof LeaseStatus[keyof typeof LeaseStatus]

export const ImportStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const
export type ImportStatus = typeof ImportStatus[keyof typeof ImportStatus]

export const UserRole = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
} as const
export type UserRole = typeof UserRole[keyof typeof UserRole]

export const ReconciliationStatus = {
  DRAFT: 'draft',
  FINALIZED: 'finalized',
} as const
export type ReconciliationStatus = typeof ReconciliationStatus[keyof typeof ReconciliationStatus]
```

## Definition of Done

- [x] All enums defined in both languages
- [x] Values match exactly
- [x] Python enums serialize to JSON strings correctly
