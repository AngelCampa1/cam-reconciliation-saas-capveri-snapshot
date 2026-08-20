"""Property request/response schemas for API endpoints.

These schemas define the API contract for property operations.
They build on the domain models but add API-specific concerns.
"""

from pydantic import BaseModel, Field

# Re-export domain models for API use
from app.models.property import (
    Property,
    PropertyBase,
    PropertyCreate,
    PropertySummary,
    PropertyUpdate,
)


class PropertyListResponse(BaseModel):
    """Paginated list of properties response.

    Used for list endpoints to provide pagination metadata
    alongside the property data.

    Attributes:
        data: List of properties
        count: Total number of properties (for pagination)
        has_more: Whether there are more properties after this page
    """

    data: list[Property] = Field(description="List of properties")
    count: int = Field(ge=0, description="Total count of properties")
    has_more: bool = Field(
        default=False,
        description="Whether more properties exist beyond this page",
    )


# Convenience exports for type annotations
PropertyResponse = Property


__all__ = [
    # Domain models (re-exported)
    "PropertyBase",
    "PropertyCreate",
    "PropertyUpdate",
    "Property",
    "PropertySummary",
    # API schemas
    "PropertyResponse",
    "PropertyListResponse",
]
