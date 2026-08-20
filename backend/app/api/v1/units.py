"""
Unit management endpoints.

Provides CRUD operations for units (suites) within properties.
Units are nested resources under properties, accessed via
/properties/{property_id}/units.
"""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_stripe_service
from app.auth.dependencies import OrgContext, require_full_access, require_org_editor
from app.exceptions import ConflictError, NotFoundError
from app.schemas.unit import (
    UnitCreate,
    UnitListResponse,
    UnitResponse,
    UnitUpdate,
)
from app.services.billing.building_sync import BuildingSyncService
from app.services.billing.quota_enforcement import QuotaEnforcementService
from app.services.billing.stripe_client import StripeService

logger = logging.getLogger(__name__)

router = APIRouter()


def get_building_sync_service(
    ctx: OrgContext,
    stripe_service: Annotated[StripeService, Depends(get_stripe_service)],
) -> BuildingSyncService:
    """Dependency for BuildingSyncService with proper scoping."""
    return BuildingSyncService(stripe_service=stripe_service, db=ctx.client)


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


@router.get("", response_model=UnitListResponse)
async def list_units(
    property_id: UUID,
    ctx: OrgContext,
    skip: Annotated[int, Query(ge=0, description="Number of records to skip")] = 0,
    limit: Annotated[
        int, Query(ge=1, le=100, description="Maximum records to return")
    ] = 20,
) -> UnitListResponse:
    """
    List all units for a property.

    Returns all units that belong to the specified property.
    The property must belong to the user's organization.
    Results are ordered by unit_number and paginated.

    Args:
        property_id: UUID of the parent property
        ctx: Organization-scoped context with authenticated user
        skip: Number of records to skip for pagination
        limit: Maximum number of records to return

    Returns:
        Paginated list of units with metadata
    """
    await verify_property_access(property_id, ctx)

    result = (
        ctx.table("units")
        .select("*", count="exact")
        .eq("property_id", str(property_id))
        .range(skip, skip + limit - 1)
        .order("unit_number")
        .execute()
    )

    total_count = result.count or len(result.data)

    return UnitListResponse(
        data=result.data,
        count=total_count,
        has_more=total_count > skip + limit,
    )


@router.get("/{unit_id}", response_model=UnitResponse)
async def get_unit(
    property_id: UUID,
    unit_id: UUID,
    ctx: OrgContext,
) -> UnitResponse:
    """
    Get a single unit by ID.

    Retrieves detailed information about a specific unit.
    Returns 404 if the unit doesn't exist or belongs to another property/org.

    Args:
        property_id: UUID of the parent property
        unit_id: UUID of the unit to retrieve
        ctx: Organization-scoped context with authenticated user

    Returns:
        Unit details including area calculations
    """
    await verify_property_access(property_id, ctx)

    result = (
        ctx.table("units")
        .select("*")
        .eq("id", str(unit_id))
        .eq("property_id", str(property_id))
        .maybe_single()
        .execute()
    )

    if not result or not result.data:
        raise NotFoundError("Unit", str(unit_id))

    return UnitResponse.model_validate(result.data)


@router.post(
    "",
    response_model=UnitResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def create_unit(
    property_id: UUID,
    unit_data: UnitCreate,
    ctx: OrgContext,
    building_sync: Annotated[BuildingSyncService, Depends(get_building_sync_service)],
) -> UnitResponse:
    """
    Create a new unit within a property.

    Creates a unit in the specified property. Unit numbers must be
    unique within the property.

    Args:
        property_id: UUID of the parent property
        unit_data: Unit creation data
        ctx: Organization-scoped context with authenticated user

    Returns:
        Created unit with generated ID

    Raises:
        NotFoundError: If property doesn't exist or belongs to another org
        ConflictError: If unit number already exists in this property
    """
    await verify_property_access(property_id, ctx)
    QuotaEnforcementService(ctx).assert_can_add_billable_units(1)

    # Prepare data with property_id
    data = unit_data.model_dump(mode="json")
    data["property_id"] = str(property_id)

    try:
        result = ctx.table("units").insert(data).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create unit",
            )

        try:
            await building_sync.sync_unit_count(ctx.organization_id)
        except ValueError as e:
            logger.warning(
                f"Could not sync unit count for org {ctx.organization_id}: {e}"
            )

        return UnitResponse.model_validate(result.data[0])
    except Exception as e:
        # Check for unique constraint violation
        error_str = str(e).lower()
        if "unique" in error_str or "duplicate" in error_str:
            raise ConflictError(
                f"Unit '{unit_data.unit_number}' already exists in this property"
            )
        raise


@router.put(
    "/{unit_id}",
    response_model=UnitResponse,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def update_unit(
    property_id: UUID,
    unit_id: UUID,
    unit_data: UnitUpdate,
    ctx: OrgContext,
    building_sync: Annotated[BuildingSyncService, Depends(get_building_sync_service)],
) -> UnitResponse:
    """
    Update a unit.

    Updates an existing unit's information.
    Only provided fields will be updated.

    Args:
        property_id: UUID of the parent property
        unit_id: UUID of the unit to update
        unit_data: Fields to update
        ctx: Organization-scoped context with authenticated user

    Returns:
        Updated unit details

    Raises:
        NotFoundError: If property or unit doesn't exist
        ConflictError: If new unit number already exists in this property
    """
    await verify_property_access(property_id, ctx)

    # Only include non-None fields
    update_data = unit_data.model_dump(exclude_unset=True, mode="json")

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    try:
        result = (
            ctx.table("units")
            .update(update_data)
            .eq("id", str(unit_id))
            .eq("property_id", str(property_id))
            .execute()
        )

        if not result.data:
            raise NotFoundError("Unit", str(unit_id))

        try:
            await building_sync.sync_unit_count(ctx.organization_id)
        except ValueError as e:
            logger.warning(
                f"Could not sync unit count for org {ctx.organization_id}: {e}"
            )

        return UnitResponse.model_validate(result.data[0])
    except NotFoundError:
        raise
    except Exception as e:
        # Check for unique constraint violation
        error_str = str(e).lower()
        if "unique" in error_str or "duplicate" in error_str:
            new_unit_number = update_data.get("unit_number", "unknown")
            raise ConflictError(
                f"Unit '{new_unit_number}' already exists in this property"
            )
        raise


@router.delete(
    "/{unit_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def delete_unit(
    property_id: UUID,
    unit_id: UUID,
    ctx: OrgContext,
    building_sync: Annotated[BuildingSyncService, Depends(get_building_sync_service)],
) -> None:
    """
    Delete a unit.

    Removes a unit from the property.
    Note: This may fail if the unit has active leases.

    Args:
        property_id: UUID of the parent property
        unit_id: UUID of the unit to delete
        ctx: Organization-scoped context with authenticated user

    Raises:
        NotFoundError: If property or unit doesn't exist
    """
    await verify_property_access(property_id, ctx)

    result = (
        ctx.table("units")
        .delete()
        .eq("id", str(unit_id))
        .eq("property_id", str(property_id))
        .execute()
    )

    if not result.data:
        raise NotFoundError("Unit", str(unit_id))

    try:
        await building_sync.sync_unit_count(ctx.organization_id)
    except ValueError as e:
        logger.warning(f"Could not sync unit count for org {ctx.organization_id}: {e}")

    return None
