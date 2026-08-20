"""Lease request/response schemas for API endpoints.

These schemas define the API contract for lease operations.
They build on the domain models but add API-specific concerns.
"""

from pydantic import BaseModel, Field

# Re-export domain models for API use
from app.models.lease import (
    Lease,
    LeaseCreate,
    LeaseSummary,
    LeaseUpdate,
)
from app.models.lease_recovery_profile import (
    LeaseRecoveryProfile,
    LeaseRecoveryProfileCreate,
    LeaseRecoveryProfileUpdate,
)


class LeaseListResponse(BaseModel):
    """Paginated list of leases response.

    Used for list endpoints to provide pagination metadata
    alongside the lease data.

    Attributes:
        data: List of leases
        count: Total number of leases (for pagination)
        has_more: Whether there are more leases after this page
    """

    data: list[Lease] = Field(description="List of leases")
    count: int = Field(ge=0, description="Total count of leases")
    has_more: bool = Field(
        default=False,
        description="Whether more leases exist beyond this page",
    )


# Convenience exports for type annotations
LeaseResponse = Lease


__all__ = [
    # Domain models (re-exported)
    "Lease",
    "LeaseCreate",
    "LeaseUpdate",
    "LeaseSummary",
    # Recovery profile models
    "LeaseRecoveryProfile",
    "LeaseRecoveryProfileCreate",
    "LeaseRecoveryProfileUpdate",
    # API schemas
    "LeaseResponse",
    "LeaseListResponse",
]
