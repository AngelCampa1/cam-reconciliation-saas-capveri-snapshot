# Story 4.6: Create Error Response Schemas

### User Story
**As an** API consumer
**I want** consistent error response formats
**So that** I can handle errors predictably in the frontend

### Acceptance Criteria

- [x] **AC1**: Standard error response schema with `status_code`, `message`, `detail`
- [x] **AC2**: Validation error schema (422) includes field-level errors
- [x] **AC3**: All errors return JSON (never HTML)
- [x] **AC4**: Error schemas documented in OpenAPI
- [x] **AC5**: Timestamp included in error responses

### Technical Specifications

**Files to Create**:
```
backend/app/
└── schemas/
    ├── __init__.py
    └── errors.py
```

**schemas/errors.py**:
```python
"""
Standard error response schemas.

All API errors should use these schemas for consistency.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """Detailed error information for a specific field or context."""
    loc: List[str] = Field(
        description="Location of the error (e.g., ['body', 'email'])"
    )
    msg: str = Field(description="Human-readable error message")
    type: str = Field(description="Error type identifier")


class ErrorResponse(BaseModel):
    """
    Standard error response format.

    All API errors should return this structure for consistency.
    """
    status_code: int = Field(description="HTTP status code")
    message: str = Field(description="Human-readable error summary")
    detail: Optional[str] = Field(
        default=None,
        description="Additional error details"
    )
    errors: Optional[List[ErrorDetail]] = Field(
        default=None,
        description="Field-level validation errors (for 422 responses)"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="When the error occurred"
    )
    request_id: Optional[str] = Field(
        default=None,
        description="Request ID for debugging"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "status_code": 400,
                "message": "Invalid request",
                "detail": "The provided email address is already in use",
                "timestamp": "2024-01-15T10:30:00Z",
                "request_id": "req_abc123"
            }
        }


class ValidationErrorResponse(ErrorResponse):
    """
    Validation error response (422 Unprocessable Entity).

    Includes detailed field-level errors for form validation.
    """
    status_code: int = 422
    message: str = "Validation failed"
    errors: List[ErrorDetail]

    class Config:
        json_schema_extra = {
            "example": {
                "status_code": 422,
                "message": "Validation failed",
                "errors": [
                    {
                        "loc": ["body", "email"],
                        "msg": "Invalid email format",
                        "type": "value_error.email"
                    },
                    {
                        "loc": ["body", "name"],
                        "msg": "Field required",
                        "type": "value_error.missing"
                    }
                ],
                "timestamp": "2024-01-15T10:30:00Z"
            }
        }


# Standard HTTP error responses for OpenAPI documentation
HTTP_400_RESPONSE = {"model": ErrorResponse, "description": "Bad Request"}
HTTP_401_RESPONSE = {"model": ErrorResponse, "description": "Unauthorized"}
HTTP_403_RESPONSE = {"model": ErrorResponse, "description": "Forbidden"}
HTTP_404_RESPONSE = {"model": ErrorResponse, "description": "Not Found"}
HTTP_409_RESPONSE = {"model": ErrorResponse, "description": "Conflict"}
HTTP_422_RESPONSE = {"model": ValidationErrorResponse, "description": "Validation Error"}
HTTP_500_RESPONSE = {"model": ErrorResponse, "description": "Internal Server Error"}
```

### Definition of Done
- [x] Error schemas defined
- [x] Documented in OpenAPI
- [x] All fields typed

### Estimated Time: 2 hours

### Completion Notes

**Completed**: 2025-12-29

**Implementation**:
- Created `backend/app/schemas/` module for API schema definitions
- Created `ErrorDetail` - field-level error info with loc, msg, type, ctx
- Created `ErrorResponse` - base error with status_code, message, detail, timestamp, request_id, path
- Created `ValidationErrorResponse` - 422 errors with required errors list
- Created `NotFoundErrorResponse` - 404 errors with resource_type/resource_id
- Added factory methods: bad_request, unauthorized, forbidden, not_found, conflict, internal_error
- Added HTTP response definitions for OpenAPI: HTTP_400_RESPONSE through HTTP_500_RESPONSE

**Files Created**:
- `backend/app/schemas/__init__.py` (new)
- `backend/app/schemas/errors.py` (new)
- `backend/tests/test_error_schemas.py` (new, 57 tests)

**Test Results**: 1077 total backend tests passing, 99.89% coverage

---
