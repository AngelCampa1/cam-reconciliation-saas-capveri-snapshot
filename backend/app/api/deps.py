"""
Common API dependencies.

Re-exports authentication dependencies for convenient import in route handlers.
Also provides common query parameter dependencies for pagination, filtering, etc.
"""

from typing import Annotated

from fastapi import Query

# Re-export auth dependencies for convenience
from app.auth.dependencies import (
    CurrentActiveUser,
    CurrentAdminUser,
    CurrentEditorUser,
    CurrentLandlordUser,
    CurrentOwnerUser,
    CurrentUser,
    OrganizationContext,
    OrgContext,
    require_org_admin,
    require_org_editor,
    require_org_owner,
)
from app.services.billing.stripe_client import StripeService

__all__ = [
    # Auth dependencies
    "CurrentActiveUser",
    "CurrentAdminUser",
    "CurrentEditorUser",
    "CurrentLandlordUser",
    "CurrentOwnerUser",
    "CurrentUser",
    "OrgContext",
    "OrganizationContext",
    "require_org_admin",
    "require_org_editor",
    "require_org_owner",
    # Pagination
    "PaginationParams",
    "pagination_params",
    # Billing
    "get_stripe_service",
]


def pagination_params(
    skip: Annotated[int, Query(ge=0, description="Number of records to skip")] = 0,
    limit: Annotated[
        int, Query(ge=1, le=100, description="Maximum number of records to return")
    ] = 20,
) -> dict[str, int]:
    """
    Common pagination parameters.

    Provides skip/limit pagination with sensible defaults and limits.

    Args:
        skip: Number of records to skip (offset)
        limit: Maximum records to return (1-100, default 20)

    Returns:
        Dict with skip and limit values
    """
    return {"skip": skip, "limit": limit}


# Type alias for pagination dependency
PaginationParams = Annotated[dict, Query()]


def sort_params(
    sort_by: Annotated[str | None, Query(description="Field to sort by")] = None,
    sort_order: Annotated[
        str, Query(pattern="^(asc|desc)$", description="Sort order (asc or desc)")
    ] = "asc",
) -> dict[str, str | None]:
    """
    Common sort parameters.

    Provides sorting options for list endpoints.

    Args:
        sort_by: Field name to sort by
        sort_order: 'asc' or 'desc'

    Returns:
        Dict with sort configuration
    """
    return {"sort_by": sort_by, "sort_order": sort_order}


def get_stripe_service() -> StripeService:
    """FastAPI dependency for Stripe service."""
    return StripeService()
