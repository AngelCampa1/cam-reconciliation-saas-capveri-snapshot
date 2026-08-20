"""
API Response Wrappers for consistent API response structures.

These models provide standardized wrappers for:
- Paginated list responses
- Error responses with validation details
- Success responses with optional data payload
"""

from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field, computed_field

T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """
    Paginated list response wrapper.

    Provides consistent pagination structure with computed fields
    for navigation (has_next, has_previous, total_pages).

    Example:
        PaginatedResponse[Property](
            items=[property1, property2],
            total=50,
            page=1,
            page_size=10
        )
        # total_pages=5, has_next=True, has_previous=False
    """

    items: list[T] = Field(..., description="List of items for the current page")
    total: int = Field(..., ge=0, description="Total number of items across all pages")
    page: int = Field(..., ge=1, description="Current page number (1-indexed)")
    page_size: int = Field(
        ..., ge=1, le=100, description="Number of items per page (max 100)"
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_pages(self) -> int:
        """Calculate total number of pages."""
        if self.total == 0:
            return 0
        return (self.total + self.page_size - 1) // self.page_size

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_next(self) -> bool:
        """Check if there is a next page."""
        return self.page < self.total_pages

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_previous(self) -> bool:
        """Check if there is a previous page."""
        return self.page > 1


class ErrorResponse(BaseModel):
    """
    Standard error response for API errors.

    Provides consistent error structure with:
    - error: Machine-readable error code
    - message: Human-readable error message
    - details: Optional dict for field-level validation errors

    Example:
        ErrorResponse(
            error="VALIDATION_ERROR",
            message="Invalid input data",
            details={"email": ["Invalid email format"], "name": ["Required"]}
        )
    """

    error: str = Field(
        ...,
        min_length=1,
        description="Machine-readable error code (e.g., 'VALIDATION_ERROR')",
    )
    message: str = Field(
        ...,
        min_length=1,
        description="Human-readable error message",
    )
    details: dict[str, Any] | None = Field(
        None,
        description="Additional error details (e.g., field validation errors)",
    )


class SuccessResponse(BaseModel):
    """
    Standard success response for non-data operations.

    Used for operations that don't return entity data but need
    to communicate success status and optional message.

    Example:
        SuccessResponse(message="Email sent successfully")
        SuccessResponse(message="Record deleted", data={"id": "abc-123"})
    """

    message: str | None = Field(
        None,
        description="Optional success message",
    )
    data: Any | None = Field(
        None,
        description="Optional response payload",
    )


class DataResponse(BaseModel, Generic[T]):
    """
    Generic data response wrapper.

    Wraps a single data item with optional metadata.
    Useful for GET single item endpoints.

    Example:
        DataResponse[Property](data=property, message="Property retrieved")
    """

    data: T = Field(..., description="Response data payload")
    message: str | None = Field(None, description="Optional message")


# Common error codes as constants
class ErrorCodes:
    """Standard error codes for consistent error handling."""

    VALIDATION_ERROR = "VALIDATION_ERROR"
    NOT_FOUND = "NOT_FOUND"
    UNAUTHORIZED = "UNAUTHORIZED"
    FORBIDDEN = "FORBIDDEN"
    CONFLICT = "CONFLICT"
    INTERNAL_ERROR = "INTERNAL_ERROR"
    BAD_REQUEST = "BAD_REQUEST"
    RATE_LIMITED = "RATE_LIMITED"
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"


def create_error_response(
    error: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> ErrorResponse:
    """
    Factory function to create an ErrorResponse.

    Args:
        error: Error code (use ErrorCodes constants)
        message: Human-readable error message
        details: Optional field-level error details

    Returns:
        ErrorResponse instance
    """
    return ErrorResponse(error=error, message=message, details=details)


def create_success_response(
    message: str | None = None,
    data: Any | None = None,
) -> SuccessResponse:
    """
    Factory function to create a SuccessResponse.

    Args:
        message: Optional success message
        data: Optional response data

    Returns:
        SuccessResponse instance
    """
    return SuccessResponse(message=message, data=data)


def create_paginated_response(
    items: list[T],
    total: int,
    page: int,
    page_size: int,
) -> PaginatedResponse[T]:
    """
    Factory function to create a PaginatedResponse.

    Args:
        items: List of items for the current page
        total: Total number of items
        page: Current page number (1-indexed)
        page_size: Items per page

    Returns:
        PaginatedResponse instance with computed fields
    """
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )
