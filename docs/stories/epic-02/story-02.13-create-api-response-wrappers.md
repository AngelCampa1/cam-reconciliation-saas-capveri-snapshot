# Story 2.13: Create API Response Wrappers

**Epic**: [Epic 2 - Shared Type System & Domain Models](./_overview.md)

## User Story

**As a** frontend developer
**I want** consistent API response structures
**So that** I can handle success, errors, and pagination uniformly

## Acceptance Criteria

- [x] **AC1**: Paginated response wrapper with:
  - `items`: list of data
  - `total`: total count
  - `page`: current page
  - `page_size`: items per page
  - `total_pages`: computed
- [x] **AC2**: Error response with:
  - `error`: error code
  - `message`: human-readable message
  - `details`: Optional dict with field errors
- [x] **AC3**: Success response with:
  - `message`: Optional success message
  - `data`: Optional payload
- [x] **AC4**: Both Pydantic and Zod versions

## Technical Specifications

**Files to Create**:
```
backend/app/models/
└── responses.py

frontend/src/types/
└── api-responses.ts
```

**backend/app/models/responses.py**:
```python
from typing import Generic, TypeVar, Optional, Any

from pydantic import BaseModel, Field, computed_field

T = TypeVar('T')

class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated list response."""
    items: list[T]
    total: int = Field(..., ge=0)
    page: int = Field(..., ge=1)
    page_size: int = Field(..., ge=1, le=100)

    @computed_field
    @property
    def total_pages(self) -> int:
        return (self.total + self.page_size - 1) // self.page_size

    @computed_field
    @property
    def has_next(self) -> bool:
        return self.page < self.total_pages

    @computed_field
    @property
    def has_previous(self) -> bool:
        return self.page > 1

class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str = Field(..., description="Error code")
    message: str = Field(..., description="Human-readable message")
    details: Optional[dict[str, Any]] = Field(
        None,
        description="Additional error details (e.g., field validation errors)"
    )

class SuccessResponse(BaseModel):
    """Standard success response."""
    message: Optional[str] = Field(None, description="Success message")
    data: Optional[Any] = Field(None, description="Response payload")
```

**frontend/src/types/api-responses.ts**:
```typescript
import { z } from 'zod'

export function createPaginatedSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    page_size: z.number().int().min(1).max(100),
    total_pages: z.number().int().min(0),
    has_next: z.boolean(),
    has_previous: z.boolean(),
  })
}

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).nullable().optional(),
})

export const SuccessResponseSchema = z.object({
  message: z.string().nullable().optional(),
  data: z.unknown().nullable().optional(),
})

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>
export type SuccessResponse = z.infer<typeof SuccessResponseSchema>
```

## Definition of Done

- [x] Pagination wrapper works with any type
- [x] Error response captures validation details
- [x] Both languages match

## Estimated Time

2 hours
