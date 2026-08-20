"""
Property management endpoints.

Provides CRUD operations for commercial properties within an organization.
All endpoints require authentication and are scoped to the user's organization.
"""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.api.deps import get_stripe_service
from app.auth.dependencies import (
    CurrentAdminUser,
    OrgContext,
    require_full_access,
    require_org_editor,
)
from app.exceptions import NotFoundError
from app.schemas.ingestion import ImportBatchSummary, ImportListResponse
from app.schemas.property import (
    PropertyCreate,
    PropertyListResponse,
    PropertyResponse,
    PropertyUpdate,
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


@router.get("", response_model=PropertyListResponse)
async def list_properties(
    ctx: OrgContext,
    skip: Annotated[int, Query(ge=0, description="Number of records to skip")] = 0,
    limit: Annotated[
        int, Query(ge=1, le=100, description="Maximum records to return")
    ] = 20,
) -> PropertyListResponse:
    """
    List all properties for the organization.

    Returns all properties that belong to the authenticated user's organization.
    Results are filtered by RLS and paginated.

    Args:
        ctx: Organization-scoped context with authenticated user
        skip: Number of records to skip for pagination
        limit: Maximum number of records to return

    Returns:
        Paginated list of properties with metadata
    """
    result = (
        ctx.table("properties")
        .select("*", count="exact")
        .range(skip, skip + limit - 1)
        .order("created_at", desc=True)
        .execute()
    )

    total_count = result.count or len(result.data)

    return PropertyListResponse(
        data=result.data,
        count=total_count,
        has_more=total_count > skip + limit,
    )


@router.get("/{property_id}", response_model=PropertyResponse)
async def get_property(
    property_id: UUID,
    ctx: OrgContext,
) -> PropertyResponse:
    """
    Get a single property by ID.

    Retrieves detailed information about a specific property.
    Returns 404 if the property doesn't exist or belongs to another organization.

    Args:
        property_id: UUID of the property to retrieve
        ctx: Organization-scoped context with authenticated user

    Returns:
        Property details
    """
    result = (
        ctx.table("properties")
        .select("*")
        .eq("id", str(property_id))
        .maybe_single()
        .execute()
    )

    if not result or not result.data:
        raise NotFoundError("Property", str(property_id))

    return PropertyResponse.model_validate(result.data)


@router.post(
    "",
    response_model=PropertyResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def create_property(
    property_data: PropertyCreate,
    ctx: OrgContext,
    building_sync: Annotated[BuildingSyncService, Depends(get_building_sync_service)],
) -> PropertyResponse:
    """
    Create a new property.

    Creates a property in the authenticated user's organization and syncs
    the building count with Stripe subscription for per-building billing.

    Args:
        property_data: Property creation data
        ctx: Organization-scoped context with authenticated user
        building_sync: Injected BuildingSyncService instance

    Returns:
        Created property with generated ID
    """
    QuotaEnforcementService(ctx).assert_can_add_property()

    # Prepare data with organization_id
    data = property_data.model_dump(mode="json")
    data["organization_id"] = str(ctx.organization_id)

    result = ctx.table("properties").insert(data).execute()

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create property",
        )

    # Sync building count with Stripe after successful creation
    try:
        await building_sync.sync_building_count(ctx.organization_id)
    except ValueError as e:
        # Log warning but don't fail the property creation
        # This handles cases where there's no subscription yet
        logger.warning(
            f"Could not sync building count for org {ctx.organization_id}: {e}"
        )

    return PropertyResponse.model_validate(result.data[0])


@router.put(
    "/{property_id}",
    response_model=PropertyResponse,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def update_property(
    property_id: UUID,
    property_data: PropertyUpdate,
    ctx: OrgContext,
) -> PropertyResponse:
    """
    Update a property.

    Updates an existing property's information.
    Only provided fields will be updated.

    Args:
        property_id: UUID of the property to update
        property_data: Fields to update
        ctx: Organization-scoped context with authenticated user

    Returns:
        Updated property details
    """
    # Only include non-None fields
    update_data = property_data.model_dump(exclude_unset=True, mode="json")

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    result = (
        ctx.table("properties").update(update_data).eq("id", str(property_id)).execute()
    )

    if not result.data:
        raise NotFoundError("Property", str(property_id))

    return PropertyResponse.model_validate(result.data[0])


@router.delete(
    "/{property_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_full_access)],
)
async def delete_property(
    property_id: UUID,
    ctx: OrgContext,
    admin: CurrentAdminUser,  # Require admin role
    building_sync: Annotated[BuildingSyncService, Depends(get_building_sync_service)],
) -> None:
    """
    Delete a property.

    Requires admin privileges. Cascades to units, leases, etc.
    Syncs building count with Stripe subscription after deletion.

    Args:
        property_id: UUID of the property to delete
        ctx: Organization-scoped context with authenticated user
        admin: Verified admin user (enforces admin-only access)
        building_sync: Injected BuildingSyncService instance
    """
    result = ctx.table("properties").delete().eq("id", str(property_id)).execute()

    if not result.data:
        raise NotFoundError("Property", str(property_id))

    # Sync building count with Stripe after successful deletion
    try:
        await building_sync.sync_building_count(ctx.organization_id)
    except ValueError as e:
        # Log warning but don't fail the property deletion
        logger.warning(
            f"Could not sync building count for org {ctx.organization_id}: {e}"
        )

    return None


@router.get("/{property_id}/imports", response_model=ImportListResponse)
async def list_property_imports(
    property_id: UUID,
    ctx: OrgContext,
    page: Annotated[int, Query(ge=1, description="Page number")] = 1,
    size: Annotated[int, Query(ge=1, le=100, description="Items per page")] = 20,
    status_filter: Annotated[
        str | None,
        Query(alias="status", description="Filter by status (completed, failed, all)"),
    ] = None,
) -> ImportListResponse:
    """
    List import batches for a property.

    Returns paginated list of all file imports for the specified property.
    Supports filtering by import status and pagination.

    Args:
        property_id: UUID of the property
        ctx: Organization-scoped context with authenticated user
        page: Page number (1-indexed)
        size: Number of items per page (max 100)
        status_filter: Optional status filter (completed, failed, or None for all)

    Returns:
        Paginated list of import batch summaries with total count

    Raises:
        404: Property not found or doesn't belong to organization
    """
    # Verify property exists and belongs to organization
    property_result = (
        ctx.table("properties")
        .select("id")
        .eq("id", str(property_id))
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )

    if not property_result or not property_result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property not found",
        )

    # Build query for import batches
    query = (
        ctx.table("import_batches")
        .select("*", count="exact")
        .eq("property_id", str(property_id))
        .order("created_at", desc=True)
    )

    # Apply status filter if provided
    if status_filter and status_filter.lower() != "all":
        query = query.eq("status", status_filter.lower())

    # Apply pagination
    offset = (page - 1) * size
    query = query.range(offset, offset + size - 1)

    # Execute with count for pagination
    result = query.execute()

    # Map database records to response schema
    imports = []
    for batch in result.data:
        rows_processed = int(
            batch.get("rows_processed", batch.get("row_count", 0)) or 0
        )
        rows_failed = int(batch.get("rows_failed", batch.get("error_count", 0)) or 0)
        rows_imported = int(
            batch.get(
                "rows_imported",
                max(rows_processed - rows_failed, 0),
            )
            or 0
        )

        imports.append(
            ImportBatchSummary(
                id=batch["id"],
                filename=batch.get("filename", batch.get("file_name", "")),
                status=batch["status"],
                parser_type=batch.get("parser_type", batch.get("source_system", "")),
                rows_processed=rows_processed,
                rows_imported=rows_imported,
                rows_failed=rows_failed,
                created_at=batch["created_at"],
                completed_at=batch.get("completed_at"),
                error_message=batch.get("error_message"),
            )
        )

    return ImportListResponse(
        imports=imports,
        total=result.count or 0,
    )
