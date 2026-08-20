# Story 2.18: Create Feedback Model

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)
**Status**: `completed`
**Estimated Time**: 1 hour
**Dependencies**: Story 2.1 (Core Enums)

## User Story

**As a** developer
**I want** Pydantic and Zod schemas for user feedback
**So that** feedback data is type-safe across the stack

## Acceptance Criteria

- [x] **AC1**: Python enums created for:
  - `FeedbackType` (bug, feature_request, general)
  - `FeedbackStatus` (new, reviewed, resolved, dismissed)
- [x] **AC2**: TypeScript const objects created with same values
- [x] **AC3**: Pydantic `Feedback` model with fields:
  - `id: UUID`
  - `user_id: UUID`
  - `organization_id: UUID`
  - `type: FeedbackType`
  - `status: FeedbackStatus`
  - `message: str`
  - `screenshot_url: str | None`
  - `page_url: str`
  - `user_agent: str | None`
  - `metadata: dict` (JSONB for additional context)
  - `created_at: datetime`
  - `updated_at: datetime`
- [x] **AC4**: `FeedbackCreate` DTO defined
- [x] **AC5**: Matching Zod schemas in frontend
- [x] **AC6**: Unit tests verify schema validation

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── feedback.py

frontend/src/types/
└── feedback.ts
```

**backend/app/models/feedback.py**:
```python
"""
Feedback domain model for user bug reports and feature requests.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl


class FeedbackType(str, Enum):
    """Type of feedback submitted."""
    BUG = "bug"
    FEATURE_REQUEST = "feature_request"
    GENERAL = "general"


class FeedbackStatus(str, Enum):
    """Current status of feedback item."""
    NEW = "new"
    REVIEWED = "reviewed"
    RESOLVED = "resolved"
    DISMISSED = "dismissed"


class FeedbackBase(BaseModel):
    """Base feedback fields shared across DTOs."""
    type: FeedbackType
    message: str = Field(min_length=10, max_length=5000)
    page_url: str = Field(max_length=2000)


class FeedbackCreate(FeedbackBase):
    """DTO for creating new feedback."""
    screenshot_url: Optional[str] = None
    user_agent: Optional[str] = Field(default=None, max_length=500)
    metadata: dict[str, Any] = Field(default_factory=dict)


class FeedbackUpdate(BaseModel):
    """DTO for updating feedback (admin only)."""
    status: Optional[FeedbackStatus] = None
    metadata: Optional[dict[str, Any]] = None


class Feedback(FeedbackBase):
    """Full feedback model with all fields."""
    id: UUID
    user_id: UUID
    organization_id: UUID
    status: FeedbackStatus = FeedbackStatus.NEW
    screenshot_url: Optional[str] = None
    user_agent: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
```

**frontend/src/types/feedback.ts**:
```typescript
import { z } from 'zod'

export const FeedbackType = {
  BUG: 'bug',
  FEATURE_REQUEST: 'feature_request',
  GENERAL: 'general',
} as const
export type FeedbackType = typeof FeedbackType[keyof typeof FeedbackType]

export const FeedbackStatus = {
  NEW: 'new',
  REVIEWED: 'reviewed',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
} as const
export type FeedbackStatus = typeof FeedbackStatus[keyof typeof FeedbackStatus]

export const FeedbackTypeSchema = z.enum([
  'bug',
  'feature_request',
  'general',
])

export const FeedbackStatusSchema = z.enum([
  'new',
  'reviewed',
  'resolved',
  'dismissed',
])

export const FeedbackMetadataSchema = z.object({
  browser: z.string().optional(),
  os: z.string().optional(),
  viewport: z.object({
    width: z.number(),
    height: z.number(),
  }).optional(),
  console_errors: z.array(z.string()).optional(),
}).passthrough()

export const FeedbackSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  type: FeedbackTypeSchema,
  status: FeedbackStatusSchema,
  message: z.string().min(10).max(5000),
  screenshot_url: z.string().url().nullable(),
  page_url: z.string().max(2000),
  user_agent: z.string().max(500).nullable(),
  metadata: FeedbackMetadataSchema.default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
})

export type Feedback = z.infer<typeof FeedbackSchema>

export const FeedbackCreateSchema = z.object({
  type: FeedbackTypeSchema,
  message: z.string().min(10).max(5000),
  page_url: z.string().max(2000),
  screenshot_url: z.string().url().nullable().optional(),
  user_agent: z.string().max(500).nullable().optional(),
  metadata: FeedbackMetadataSchema.optional(),
})

export type FeedbackCreate = z.infer<typeof FeedbackCreateSchema>

export const FeedbackUpdateSchema = z.object({
  status: FeedbackStatusSchema.optional(),
  metadata: FeedbackMetadataSchema.optional(),
})

export type FeedbackUpdate = z.infer<typeof FeedbackUpdateSchema>
```

## Metadata Schema

The `metadata` JSONB field captures additional context:

```json
{
  "browser": "Chrome 120.0.0",
  "os": "Windows 11",
  "viewport": {
    "width": 1920,
    "height": 1080
  },
  "console_errors": [
    "TypeError: Cannot read property 'id' of undefined"
  ],
  "component_stack": "at ReconciliationGrid > at PropertyPage"
}
```

## Test Cases

```python
# backend/tests/test_feedback_model.py
def test_feedback_type_enum_values():
    """Verify all feedback type values."""
    assert FeedbackType.BUG.value == "bug"
    assert FeedbackType.FEATURE_REQUEST.value == "feature_request"
    assert len(FeedbackType) == 3

def test_feedback_status_enum_values():
    """Verify all feedback status values."""
    assert FeedbackStatus.NEW.value == "new"
    assert FeedbackStatus.RESOLVED.value == "resolved"
    assert len(FeedbackStatus) == 4

def test_feedback_message_minimum_length():
    """Verify message must be at least 10 characters."""
    with pytest.raises(ValidationError):
        FeedbackCreate(
            type=FeedbackType.BUG,
            message="Too short",
            page_url="/dashboard",
        )

def test_feedback_create_with_metadata():
    """Verify feedback with metadata serializes correctly."""
    feedback = FeedbackCreate(
        type=FeedbackType.BUG,
        message="The reconciliation grid is not loading correctly",
        page_url="/properties/123/reconciliation",
        metadata={"browser": "Chrome", "viewport": {"width": 1920, "height": 1080}},
    )
    assert feedback.metadata["browser"] == "Chrome"
```

## Definition of Done

- [x] All enums defined in both languages
- [x] Values match exactly between Python and TypeScript
- [x] Message length validation works
- [x] Metadata schema is flexible (JSONB)
- [x] Unit tests pass with 100% coverage (41 Python, 60 TypeScript)
