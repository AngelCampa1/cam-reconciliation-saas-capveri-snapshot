"""
Lease management endpoints.

Provides CRUD operations for lease agreements.
Leases contain the recovery profile (Financial DNA) used for CAM calculations.
"""

import logging
from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.dependencies import CurrentAdminUser, OrgContext, require_org_editor
from app.exceptions import NotFoundError
from app.models.lease_term_version import LeaseTermVersionCreate
from app.schemas.lease import (
    LeaseCreate,
    LeaseListResponse,
    LeaseRecoveryProfile,
    LeaseRecoveryProfileUpdate,
    LeaseResponse,
    LeaseUpdate,
)
from app.services.lease_terms import LeaseTermService

logger = logging.getLogger(__name__)

router = APIRouter()


async def verify_property_access(property_id: UUID, ctx: OrgContext) -> None:
    """
    Verify user has access to the property.

    Args:
        property_id: UUID of the property to verify
        ctx: Organization-scoped context with authenticated user

    Raises:
        NotFoundError: If property doesn't exist or belongs to another org
    """
    result = (
        ctx.table("properties")
        .select("id")
        .eq("id", str(property_id))
        .maybe_single()
        .execute()
    )

    if not result or not result.data:
        raise NotFoundError("Property", str(property_id))


async def verify_unit_belongs_to_property(
    unit_id: UUID, property_id: UUID, ctx: OrgContext
) -> None:
    """
    Verify unit exists and belongs to the specified property.

    Args:
        unit_id: UUID of the unit to verify
        property_id: UUID of the property the unit should belong to
        ctx: Organization-scoped context with authenticated user

    Raises:
        NotFoundError: If unit doesn't exist or belongs to another property
    """
    result = (
        ctx.table("units")
        .select("id")
        .eq("id", str(unit_id))
        .eq("property_id", str(property_id))
        .maybe_single()
        .execute()
    )

    if not result or not result.data:
        raise NotFoundError("Unit", str(unit_id))


@router.get("", response_model=LeaseListResponse)
async def list_leases(
    ctx: OrgContext,
    property_id: Annotated[
        UUID | None, Query(description="Filter by property ID")
    ] = None,
    status_filter: Annotated[
        str | None, Query(alias="status", description="Filter by lease status")
    ] = None,
    skip: Annotated[int, Query(ge=0, description="Number of records to skip")] = 0,
    limit: Annotated[
        int, Query(ge=1, le=100, description="Maximum records to return")
    ] = 20,
) -> LeaseListResponse:
    """
    List all leases for the organization.

    Returns all leases across all properties in the organization.
    Can be filtered by property_id or status.
    Results are ordered by created_at descending and paginated.

    Args:
        ctx: Organization-scoped context with authenticated user
        property_id: Optional filter by property ID
        status_filter: Optional filter by lease status
        skip: Number of records to skip for pagination
        limit: Maximum number of records to return

    Returns:
        Paginated list of leases with metadata
    """
    query = ctx.table("leases").select("*", count="exact")

    if property_id:
        query = query.eq("property_id", str(property_id))

    if status_filter:
        query = query.eq("status", status_filter)

    result = (
        query.range(skip, skip + limit - 1).order("created_at", desc=True).execute()
    )

    total_count = result.count or len(result.data)

    return LeaseListResponse(
        data=result.data,
        count=total_count,
        has_more=total_count > skip + limit,
    )


@router.get("/{lease_id}", response_model=LeaseResponse)
async def get_lease(
    lease_id: UUID,
    ctx: OrgContext,
) -> LeaseResponse:
    """
    Get a single lease by ID.

    Retrieves detailed lease information including the recovery profile.
    Returns 404 if the lease doesn't exist or belongs to another organization.

    Args:
        lease_id: UUID of the lease to retrieve
        ctx: Organization-scoped context with authenticated user

    Returns:
        Full lease details including recovery profile
    """
    result = (
        ctx.table("leases").select("*").eq("id", str(lease_id)).maybe_single().execute()
    )

    if not result or not result.data:
        raise NotFoundError("Lease", str(lease_id))

    return LeaseResponse.model_validate(result.data)


@router.post(
    "",
    response_model=LeaseResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_editor)],
)
async def create_lease(
    lease_data: LeaseCreate,
    ctx: OrgContext,
) -> LeaseResponse:
    """
    Create a new lease.

    Creates a lease for a property in the organization.
    The recovery profile can be set during creation.

    Args:
        lease_data: Lease creation data including property_id and recovery_profile
        ctx: Organization-scoped context with authenticated user

    Returns:
        Created lease with generated ID

    Raises:
        NotFoundError: If property or unit doesn't exist
    """
    # Verify property belongs to org
    await verify_property_access(lease_data.property_id, ctx)

    # Verify unit if provided
    if lease_data.unit_id:
        await verify_unit_belongs_to_property(
            lease_data.unit_id, lease_data.property_id, ctx
        )

    # Prepare data for insertion
    data = lease_data.model_dump(mode="json")

    result = ctx.table("leases").insert(data).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create lease",
        )

    return LeaseResponse.model_validate(result.data[0])


@router.put(
    "/{lease_id}",
    response_model=LeaseResponse,
    dependencies=[Depends(require_org_editor)],
)
async def update_lease(
    lease_id: UUID,
    lease_data: LeaseUpdate,
    ctx: OrgContext,
) -> LeaseResponse:
    """
    Update a lease (excluding recovery profile).

    Updates lease information. Use the /recovery-profile endpoint
    to update the recovery profile separately.

    Args:
        lease_id: UUID of the lease to update
        lease_data: Fields to update
        ctx: Organization-scoped context with authenticated user

    Returns:
        Updated lease details

    Raises:
        NotFoundError: If lease doesn't exist
        HTTPException: If no fields to update or validation fails
    """
    # Only include non-None fields, excluding recovery_profile
    update_data = lease_data.model_dump(
        exclude_unset=True, exclude={"recovery_profile"}, mode="json"
    )

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    # If updating unit_id, verify it exists
    if "unit_id" in update_data and update_data["unit_id"] is not None:
        # First get the lease to find its property_id
        existing = (
            ctx.table("leases")
            .select("property_id")
            .eq("id", str(lease_id))
            .maybe_single()
            .execute()
        )

        if not existing or not existing.data:
            raise NotFoundError("Lease", str(lease_id))

        await verify_unit_belongs_to_property(
            UUID(update_data["unit_id"]),
            UUID(existing.data["property_id"]),
            ctx,
        )

    result = ctx.table("leases").update(update_data).eq("id", str(lease_id)).execute()

    if not result.data:
        raise NotFoundError("Lease", str(lease_id))

    return LeaseResponse.model_validate(result.data[0])


@router.get("/{lease_id}/recovery-profile", response_model=LeaseRecoveryProfile)
async def get_recovery_profile(
    lease_id: UUID,
    ctx: OrgContext,
) -> LeaseRecoveryProfile:
    """
    Get the recovery profile for a lease.

    Returns the Financial DNA extracted from the lease document,
    including base year, caps, pro-rata share, and admin fees.

    Args:
        lease_id: UUID of the lease
        ctx: Organization-scoped context with authenticated user

    Returns:
        Recovery profile with all CAM calculation parameters
    """
    result = (
        ctx.table("leases")
        .select("recovery_profile")
        .eq("id", str(lease_id))
        .maybe_single()
        .execute()
    )

    if not result or not result.data:
        raise NotFoundError("Lease", str(lease_id))

    return LeaseRecoveryProfile.model_validate(result.data["recovery_profile"])


@router.put(
    "/{lease_id}/recovery-profile",
    response_model=LeaseResponse,
    dependencies=[Depends(require_org_editor)],
)
async def update_recovery_profile(
    lease_id: UUID,
    profile_data: LeaseRecoveryProfileUpdate,
    ctx: OrgContext,
) -> LeaseResponse:
    """
    Update the recovery profile for a lease.

    This is a separate endpoint because recovery profile changes
    have significant impact on calculations and may need different
    authorization or audit logging.

    Args:
        lease_id: UUID of the lease
        profile_data: Recovery profile fields to update
        ctx: Organization-scoped context with authenticated user

    Returns:
        Updated lease with new recovery profile

    Raises:
        NotFoundError: If lease doesn't exist
    """
    # First get the existing recovery profile to merge with updates
    existing = (
        ctx.table("leases")
        .select("recovery_profile")
        .eq("id", str(lease_id))
        .maybe_single()
        .execute()
    )

    if not existing or not existing.data:
        raise NotFoundError("Lease", str(lease_id))

    # Merge existing profile with updates
    existing_profile = existing.data["recovery_profile"]
    update_fields = profile_data.model_dump(exclude_unset=True, mode="json")

    merged_profile = {**existing_profile, **update_fields}

    # Validate the merged profile
    LeaseRecoveryProfile.model_validate(merged_profile)

    result = (
        ctx.table("leases")
        .update({"recovery_profile": merged_profile})
        .eq("id", str(lease_id))
        .execute()
    )

    if not result.data:
        raise NotFoundError("Lease", str(lease_id))

    # Also create a term version for audit trail (backward compatibility)
    validated_profile = LeaseRecoveryProfile.model_validate(merged_profile)
    try:
        term_service = LeaseTermService(ctx.client, ctx.organization_id)
        term_data = LeaseTermVersionCreate(
            effective_date=date.today(),
            base_year=validated_profile.base_year,
            base_year_amount=validated_profile.base_year_amount,
            gross_up_base_year=validated_profile.gross_up_base_year,
            pro_rata_share=validated_profile.pro_rata_share,
            cap_type=(
                validated_profile.cap_type.value
                if hasattr(validated_profile.cap_type, "value")
                else str(validated_profile.cap_type)
            ),
            cap_rate=validated_profile.cap_rate,
            admin_fee_percentage=validated_profile.admin_fee_percentage,
            management_fee_percentage=validated_profile.management_fee_percentage,
            excluded_pools=[
                p.value if hasattr(p, "value") else str(p)
                for p in validated_profile.excluded_pools
            ],
            amendment_reason="Updated via recovery profile endpoint",
        )
        term_service.create_version(lease_id, term_data, ctx.user.id)
    except Exception:
        logger.warning(
            "Failed to create term version for lease %s on recovery profile update",
            lease_id,
            exc_info=True,
        )

    return LeaseResponse.model_validate(result.data[0])


@router.delete("/{lease_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lease(
    lease_id: UUID,
    ctx: OrgContext,
    admin: CurrentAdminUser,  # Require admin privileges
) -> None:
    """
    Delete a lease.

    Removes a lease from the database.
    Requires admin privileges.

    Args:
        lease_id: UUID of the lease to delete
        ctx: Organization-scoped context with authenticated user
        admin: Verified admin user (for authorization)

    Raises:
        NotFoundError: If lease doesn't exist
    """
    result = ctx.table("leases").delete().eq("id", str(lease_id)).execute()

    if not result.data:
        raise NotFoundError("Lease", str(lease_id))

    return None
