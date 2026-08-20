"""
Standard error response schemas.

All API errors should use these schemas for consistency.
This ensures predictable error handling in frontend applications.
"""

from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class ErrorSource(str, Enum):
    """Identifies the origin of an error for reconciliation provenance.

    SOFTWARE_LOGIC errors may be covered by the $50K Deterministic Billing
    product calculations, while USER_DATA errors are not.
    """

    USER_DATA = "user_data"
    SOFTWARE_LOGIC = "software_logic"
    SYSTEM_INFRASTRUCTURE = "system_infrastructure"


class ErrorDetail(BaseModel):
    """
    Detailed error information for a specific field or context.

    Used for validation errors to pinpoint exactly where the error occurred.

    Attributes:
        loc: Location path to the error (e.g., ["body", "email"])
        msg: Human-readable error message
        type: Machine-readable error type identifier
        ctx: Optional context with additional error info
    """

    loc: list[str | int] = Field(
        description="Location of the error (e.g., ['body', 'email'] or ['query', 0])"
    )
    msg: str = Field(description="Human-readable error message")
    type: str = Field(description="Error type identifier (e.g., 'value_error.email')")
    ctx: dict[str, Any] | None = Field(
        default=None,
        description="Additional context about the error",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "loc": ["body", "email"],
                "msg": "value is not a valid email address",
                "type": "value_error.email",
            }
        }
    }


class ErrorResponse(BaseModel):
    """
    Standard error response format.

    All API errors should return this structure for consistency.
    This enables frontend applications to handle errors predictably.

    Attributes:
        status_code: HTTP status code (e.g., 400, 404, 500)
        message: Short, human-readable error summary
        detail: Optional longer explanation of what went wrong
        errors: Optional list of field-level errors (for validation)
        timestamp: When the error occurred (UTC)
        request_id: Optional request ID for debugging/support
        path: Optional request path that caused the error
    """

    status_code: int = Field(
        description="HTTP status code",
        ge=400,
        le=599,
    )
    message: str = Field(
        description="Human-readable error summary",
        min_length=1,
        max_length=200,
    )
    detail: str | None = Field(
        default=None,
        description="Additional error details or explanation",
        max_length=10000,
    )
    errors: list[ErrorDetail] | None = Field(
        default=None,
        description="Field-level validation errors (for 422 responses)",
    )
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(UTC),
        description="When the error occurred (UTC)",
    )
    request_id: str | None = Field(
        default=None,
        description="Request ID for debugging and support tickets",
        max_length=100,
    )
    path: str | None = Field(
        default=None,
        description="Request path that caused the error",
        max_length=500,
    )
    error_source: ErrorSource | None = Field(
        default=None,
        description=(
            "Identifies whether the error originated from user data, software logic, "
            "or infrastructure. Used for reconciliation provenance."
        ),
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "status_code": 400,
                "message": "Invalid request",
                "detail": "The provided email address is already in use",
                "timestamp": "2024-01-15T10:30:00Z",
                "request_id": "req_abc123",
                "path": "/api/v1/users",
            }
        }
    }

    @classmethod
    def bad_request(
        cls,
        message: str = "Bad request",
        detail: str | None = None,
        request_id: str | None = None,
        path: str | None = None,
    ) -> "ErrorResponse":
        """Create a 400 Bad Request error response."""
        return cls(
            status_code=400,
            message=message,
            detail=detail,
            request_id=request_id,
            path=path,
        )

    @classmethod
    def unauthorized(
        cls,
        message: str = "Authentication required",
        detail: str | None = None,
        request_id: str | None = None,
        path: str | None = None,
    ) -> "ErrorResponse":
        """Create a 401 Unauthorized error response."""
        return cls(
            status_code=401,
            message=message,
            detail=detail,
            request_id=request_id,
            path=path,
        )

    @classmethod
    def forbidden(
        cls,
        message: str = "Access denied",
        detail: str | None = None,
        request_id: str | None = None,
        path: str | None = None,
    ) -> "ErrorResponse":
        """Create a 403 Forbidden error response."""
        return cls(
            status_code=403,
            message=message,
            detail=detail,
            request_id=request_id,
            path=path,
        )

    @classmethod
    def not_found(
        cls,
        message: str = "Resource not found",
        detail: str | None = None,
        request_id: str | None = None,
        path: str | None = None,
    ) -> "ErrorResponse":
        """Create a 404 Not Found error response."""
        return cls(
            status_code=404,
            message=message,
            detail=detail,
            request_id=request_id,
            path=path,
        )

    @classmethod
    def conflict(
        cls,
        message: str = "Resource conflict",
        detail: str | None = None,
        request_id: str | None = None,
        path: str | None = None,
    ) -> "ErrorResponse":
        """Create a 409 Conflict error response."""
        return cls(
            status_code=409,
            message=message,
            detail=detail,
            request_id=request_id,
            path=path,
        )

    @classmethod
    def internal_error(
        cls,
        message: str = "Internal server error",
        detail: str | None = None,
        request_id: str | None = None,
        path: str | None = None,
    ) -> "ErrorResponse":
        """Create a 500 Internal Server Error response."""
        return cls(
            status_code=500,
            message=message,
            detail=detail,
            request_id=request_id,
            path=path,
        )


class ValidationErrorResponse(ErrorResponse):
    """
    Validation error response (422 Unprocessable Entity).

    Includes detailed field-level errors for form validation.
    This schema extends ErrorResponse with required errors field.

    Attributes:
        status_code: Always 422 for validation errors
        message: Always "Validation failed"
        errors: Required list of field-level validation errors
    """

    status_code: int = Field(default=422, description="HTTP status code")
    message: str = Field(default="Validation failed", description="Error summary")
    errors: list[ErrorDetail] = Field(
        description="Field-level validation errors",
        min_length=1,
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "status_code": 422,
                "message": "Validation failed",
                "errors": [
                    {
                        "loc": ["body", "email"],
                        "msg": "value is not a valid email address",
                        "type": "value_error.email",
                    },
                    {
                        "loc": ["body", "name"],
                        "msg": "field required",
                        "type": "value_error.missing",
                    },
                ],
                "timestamp": "2024-01-15T10:30:00Z",
                "path": "/api/v1/users",
            }
        }
    }

    @classmethod
    def from_errors(
        cls,
        errors: list[ErrorDetail],
        request_id: str | None = None,
        path: str | None = None,
    ) -> "ValidationErrorResponse":
        """Create a validation error response from a list of error details."""
        return cls(
            errors=errors,
            request_id=request_id,
            path=path,
        )


class NotFoundErrorResponse(ErrorResponse):
    """
    Not Found error response (404).

    Specialized schema for resource not found errors with
    optional resource type and ID information.

    Attributes:
        status_code: Always 404 for not found errors
        resource_type: Optional type of resource that wasn't found
        resource_id: Optional ID of the resource that wasn't found
    """

    status_code: int = Field(default=404, description="HTTP status code")
    message: str = Field(default="Resource not found", description="Error summary")
    resource_type: str | None = Field(
        default=None,
        description="Type of resource that wasn't found (e.g., 'Property', 'Lease')",
    )
    resource_id: str | None = Field(
        default=None,
        description="ID of the resource that wasn't found",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "status_code": 404,
                "message": "Resource not found",
                "detail": "Property with ID 'abc-123' not found",
                "resource_type": "Property",
                "resource_id": "123e4567-e89b-12d3-a456-426614174000",
                "timestamp": "2024-01-15T10:30:00Z",
                "path": "/api/v1/properties/123e4567-e89b-12d3-a456-426614174000",
            }
        }
    }

    @classmethod
    def for_resource(
        cls,
        resource_type: str,
        resource_id: str,
        request_id: str | None = None,
        path: str | None = None,
    ) -> "NotFoundErrorResponse":
        """Create a not found error for a specific resource."""
        return cls(
            message=f"{resource_type} not found",
            detail=f"{resource_type} with ID '{resource_id}' not found",
            resource_type=resource_type,
            resource_id=resource_id,
            request_id=request_id,
            path=path,
        )


# Standard HTTP error responses for OpenAPI documentation
# Use these when defining endpoint responses in FastAPI routers

HTTP_400_RESPONSE: dict[str, Any] = {
    "model": ErrorResponse,
    "description": "Bad Request - The request was invalid or malformed",
}

HTTP_401_RESPONSE: dict[str, Any] = {
    "model": ErrorResponse,
    "description": "Unauthorized - Authentication is required",
}

HTTP_403_RESPONSE: dict[str, Any] = {
    "model": ErrorResponse,
    "description": "Forbidden - You don't have permission to access this resource",
}

HTTP_404_RESPONSE: dict[str, Any] = {
    "model": NotFoundErrorResponse,
    "description": "Not Found - The requested resource does not exist",
}

HTTP_409_RESPONSE: dict[str, Any] = {
    "model": ErrorResponse,
    "description": "Conflict - The request conflicts with the current state",
}

HTTP_422_RESPONSE: dict[str, Any] = {
    "model": ValidationErrorResponse,
    "description": "Validation Error - The request body failed validation",
}

HTTP_500_RESPONSE: dict[str, Any] = {
    "model": ErrorResponse,
    "description": "Internal Server Error - An unexpected error occurred",
}
