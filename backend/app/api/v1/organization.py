"""
Organization management endpoints.

Provides organization-level information, usage statistics, and settings management.
All endpoints require authentication and are scoped to the user's organization.
"""

import logging

from fastapi import APIRouter
from postgrest import CountMethod

from app.auth.dependencies import CurrentOwnerUser, OrgContext
from app.models.organization import (
    OrganizationSettings,
    OrganizationSettingsResponse,
    OrganizationSettingsUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/usage")
async def get_organization_usage(ctx: OrgContext) -> dict[str, int]:
    """
    Get current organization usage statistics.

    Returns usage metrics for the authenticated user's organization including
    property count and user count.

    Args:
        ctx: Organization-scoped context with authenticated user

    Returns:
        Dictionary with usage statistics:
        - properties: Number of properties in organization
        - users: Number of users in organization
    """
    org_id = str(ctx.organization_id)

    # Count properties
    props_result = (
        ctx.client.table("properties")
        .select("id", count=CountMethod.exact)
        .eq("organization_id", org_id)
        .execute()
    )

    # Count users
    users_result = (
        ctx.client.table("users")
        .select("id", count=CountMethod.exact)
        .eq("organization_id", org_id)
        .execute()
    )

    return {
        "properties": props_result.count or 0,
        "users": users_result.count or 0,
    }


@router.get("/settings", response_model=OrganizationSettingsResponse)
async def get_organization_settings(ctx: OrgContext) -> OrganizationSettingsResponse:
    """
    Get current organization settings.

    Returns the organization's settings including timezone, currency, and fiscal year
    configuration. Returns default values for any settings not explicitly configured.

    Args:
        ctx: Organization-scoped context with authenticated user

    Returns:
        OrganizationSettingsResponse with current settings
    """
    org_id = str(ctx.organization_id)

    # Fetch organization settings
    result = (
        ctx.table("organizations")
        .select("id, settings")
        .eq("id", org_id)
        .single()
        .execute()
    )

    org_data = result.data if result.data else {}
    settings_data = org_data.get("settings") or {}

    # Apply defaults for any missing settings
    settings = OrganizationSettings(**settings_data)

    return OrganizationSettingsResponse(
        organization_id=ctx.organization_id,
        timezone=settings.timezone,
        default_currency=settings.default_currency,
        fiscal_year_end_month=settings.fiscal_year_end_month,
    )


@router.patch("/settings", response_model=OrganizationSettingsResponse)
async def update_organization_settings(
    request: OrganizationSettingsUpdate,
    ctx: OrgContext,
    user: CurrentOwnerUser,
) -> OrganizationSettingsResponse:
    """
    Update organization settings (owner only).

    Allows partial updates - only provided fields will be changed.
    Unprovided fields retain their current values.

    Restricted to organization owners: the `organizations` UPDATE RLS policy is
    owner-only ("Owners can update organizations"), so a non-owner admin would
    pass the API auth check but have the DB write silently filtered by RLS,
    returning a misleading 200. Requiring an owner here surfaces the real
    authority with a 403 for non-owners (F-117).

    Args:
        request: Settings fields to update (all optional)
        ctx: Organization-scoped context with authenticated user
        user: Owner user (enforces owner-only access)

    Returns:
        OrganizationSettingsResponse with updated settings
    """
    org_id = str(ctx.organization_id)

    # Fetch current settings
    current_result = (
        ctx.table("organizations")
        .select("id, settings")
        .eq("id", org_id)
        .single()
        .execute()
    )

    current_data = current_result.data if current_result.data else {}
    current_settings = current_data.get("settings") or {}

    # Apply defaults to current settings
    merged_settings = OrganizationSettings(**current_settings).model_dump()

    # Apply updates (only non-None fields)
    update_data = request.model_dump(exclude_none=True)
    merged_settings.update(update_data)

    # Update in database
    ctx.table("organizations").update({"settings": merged_settings}).eq(
        "id", org_id
    ).execute()

    return OrganizationSettingsResponse(
        organization_id=ctx.organization_id,
        timezone=merged_settings["timezone"],
        default_currency=merged_settings["default_currency"],
        fiscal_year_end_month=merged_settings["fiscal_year_end_month"],
    )
