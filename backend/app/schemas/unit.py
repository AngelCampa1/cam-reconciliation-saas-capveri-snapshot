"""Unit request/response schemas for API endpoints.

These schemas define the API contract for unit operations.
They build on the domain models but add API-specific concerns.
"""

from pydantic import BaseModel, Field

# Re-export domain models for API use
from app.models.unit import (
    Unit,
    UnitBase,
    UnitSummary,
    UnitUpdate,
)

# Note: We don't re-export UnitCreate from domain model because
# the API uses UnitCreateRequest which doesn't require property_id
# (property_id comes from the URL path)


class UnitCreateRequest(UnitBase):
    """API schema for creating a unit.

    Unlike the domain UnitCreate, this doesn't require property_id
    because it's obtained from the URL path parameter.
    """

    pass


# Keep UnitCreate as alias for backwards compatibility in imports
UnitCreate = UnitCreateRequest


class UnitListResponse(BaseModel):
    """Paginated list of units response.

    Used for list endpoints to provide count metadata
    alongside the unit data.

    Attributes:
        data: List of units
        count: Total number of units (for pagination)
        has_more: Whether there are more units after this page
    """

    data: list[Unit] = Field(description="List of units")
    count: int = Field(ge=0, description="Total count of units")
    has_more: bool = Field(
        default=False,
        description="Whether more units exist beyond this page",
    )


# Convenience exports for type annotations
UnitResponse = Unit


__all__ = [
    # Domain models (re-exported)
    "UnitBase",
    "UnitCreate",
    "UnitUpdate",
    "Unit",
    "UnitSummary",
    # API schemas
    "UnitResponse",
    "UnitListResponse",
]
