"""
Pool mapping management endpoints.

Provides CRUD operations for pool mappings within properties.
Pool mappings define GL account patterns that map to expense pools.
Accessed via /properties/{property_id}/pool-mappings.
"""

import logging
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from app.auth.dependencies import OrgContext, require_org_editor
from app.exceptions import ConflictError, NotFoundError
from app.models.pool_mapping import is_valid_gl_pattern
from app.schemas.expense_pool import (
    PoolMappingCreateRequest,
    PoolMappingListResponse,
    PoolMappingResponse,
    PoolMappingUpdate,
)

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


async def verify_pool_belongs_to_property(
    pool_id: UUID, property_id: UUID, ctx: OrgContext
) -> None:
    """
    Verify that an expense pool belongs to the specified property.

    Args:
        pool_id: UUID of the expense pool
        property_id: UUID of the property
        ctx: Organization-scoped context

    Raises:
        NotFoundError: If pool doesn't exist
        HTTPException: If pool belongs to different property
    """
    result = (
        ctx.table("expense_pools")
        .select("id, property_id")
        .eq("id", str(pool_id))
        .maybe_single()
        .execute()
    )

    if not result or not result.data:
        raise NotFoundError("Expense Pool", str(pool_id))

    if result.data["property_id"] != str(property_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expense pool must belong to the same property",
        )


@router.get("", response_model=PoolMappingListResponse)
async def list_pool_mappings(
    property_id: Annotated[UUID, Path(description="UUID of the parent property")],
    ctx: OrgContext,
    pool_id: Annotated[
        UUID | None, Query(description="Filter by expense pool ID")
    ] = None,
    skip: Annotated[int, Query(ge=0, description="Number of records to skip")] = 0,
    limit: Annotated[
        int, Query(ge=1, le=100, description="Maximum records to return")
    ] = 100,
) -> PoolMappingListResponse:
    """
    List pool mappings for a property.

    Returns all pool mappings for pools belonging to the specified property.
    Optionally filter by a specific pool ID.

    Args:
        property_id: UUID of the parent property
        ctx: Organization-scoped context with authenticated user
        pool_id: Optional filter by expense pool
        skip: Number of records to skip for pagination
        limit: Maximum number of records to return

    Returns:
        Paginated list of pool mappings with metadata
    """
    await verify_property_access(property_id, ctx)

    # First, get expense pool IDs for this property.
    # Avoids the !inner join syntax which can fail with RLS + count="exact".
    pools_result = (
        ctx.table("expense_pools")
        .select("id")
        .eq("property_id", str(property_id))
        .execute()
    )

    pool_ids = [p["id"] for p in (pools_result.data or [])]

    if not pool_ids:
        return PoolMappingListResponse(data=[], count=0, has_more=False)

    # Query pool_mappings filtered by pool IDs
    query = ctx.table("pool_mappings").select("*", count="exact")

    if pool_id:
        query = query.eq("expense_pool_id", str(pool_id))
    else:
        query = query.in_("expense_pool_id", pool_ids)

    result = query.order("priority", desc=True).range(skip, skip + limit - 1).execute()

    mappings = result.data or []
    total_count = result.count or len(mappings)

    return PoolMappingListResponse(
        data=[PoolMappingResponse.model_validate(m) for m in mappings],
        count=total_count,
        has_more=total_count > skip + limit,
    )


@router.post(
    "",
    response_model=PoolMappingResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_editor)],
)
async def create_pool_mapping(
    property_id: Annotated[UUID, Path(description="UUID of the parent property")],
    mapping_data: PoolMappingCreateRequest,
    ctx: OrgContext,
) -> PoolMappingResponse:
    """
    Create a new pool mapping.

    Creates a mapping that links GL account patterns to an expense pool.
    The expense pool must belong to the specified property.

    Args:
        property_id: UUID of the parent property
        mapping_data: Mapping creation data
        ctx: Organization-scoped context with authenticated user

    Returns:
        Created pool mapping with generated ID

    Raises:
        NotFoundError: If property or pool doesn't exist
        HTTPException: If pattern is invalid or pool belongs to different property
    """
    await verify_property_access(property_id, ctx)

    # Validate GL pattern format
    if not is_valid_gl_pattern(mapping_data.gl_account_pattern):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid GL account pattern. Use digits, *, %, ?, -, or . only.",
        )

    # Verify pool belongs to this property
    await verify_pool_belongs_to_property(
        mapping_data.expense_pool_id, property_id, ctx
    )

    # Prepare data
    data = mapping_data.model_dump(mode="json")

    try:
        result = ctx.table("pool_mappings").insert(data).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create pool mapping",
            )

        return PoolMappingResponse.model_validate(result.data[0])
    except Exception as e:
        error_str = str(e).lower()
        if "unique" in error_str or "duplicate" in error_str:
            raise ConflictError(
                f"Mapping with pattern '{mapping_data.gl_account_pattern}' "
                f"already exists for this pool"
            )
        raise


@router.put(
    "/{mapping_id}",
    response_model=PoolMappingResponse,
    dependencies=[Depends(require_org_editor)],
)
async def update_pool_mapping(
    property_id: Annotated[UUID, Path(description="UUID of the parent property")],
    mapping_id: Annotated[UUID, Path(description="UUID of the mapping to update")],
    mapping_data: PoolMappingUpdate,
    ctx: OrgContext,
) -> PoolMappingResponse:
    """
    Update a pool mapping.

    Updates an existing mapping's pattern, allocation, or priority.
    Only provided fields will be updated.

    Args:
        property_id: UUID of the parent property
        mapping_id: UUID of the mapping to update
        mapping_data: Fields to update
        ctx: Organization-scoped context with authenticated user

    Returns:
        Updated pool mapping details

    Raises:
        NotFoundError: If property or mapping doesn't exist
        HTTPException: If pattern is invalid
    """
    await verify_property_access(property_id, ctx)

    # Only include non-None fields
    update_data = mapping_data.model_dump(exclude_unset=True, mode="json")

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    # Validate pattern if being updated
    if "gl_account_pattern" in update_data:
        if not is_valid_gl_pattern(update_data["gl_account_pattern"]):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid GL account pattern. Use digits, *, %, ?, -, or . only.",
            )

    # Verify mapping exists and belongs to a pool in this property
    # We need to join to verify property ownership
    existing = (
        ctx.table("pool_mappings")
        .select("id, expense_pools!inner(property_id)")
        .eq("id", str(mapping_id))
        .eq("expense_pools.property_id", str(property_id))
        .maybe_single()
        .execute()
    )

    if not existing or not existing.data:
        raise NotFoundError("Pool Mapping", str(mapping_id))

    try:
        result = (
            ctx.table("pool_mappings")
            .update(update_data)
            .eq("id", str(mapping_id))
            .execute()
        )

        if not result.data:
            raise NotFoundError("Pool Mapping", str(mapping_id))

        return PoolMappingResponse.model_validate(result.data[0])
    except NotFoundError:
        raise
    except Exception as e:
        error_str = str(e).lower()
        if "unique" in error_str or "duplicate" in error_str:
            raise ConflictError("A mapping with this pattern already exists")
        raise


@router.delete(
    "/{mapping_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_org_editor)],
)
async def delete_pool_mapping(
    property_id: Annotated[UUID, Path(description="UUID of the parent property")],
    mapping_id: Annotated[UUID, Path(description="UUID of the mapping to delete")],
    ctx: OrgContext,
) -> None:
    """
    Delete a pool mapping.

    Removes a mapping from the property's pool configuration.

    Args:
        property_id: UUID of the parent property
        mapping_id: UUID of the mapping to delete
        ctx: Organization-scoped context with authenticated user

    Raises:
        NotFoundError: If property or mapping doesn't exist
    """
    await verify_property_access(property_id, ctx)

    # Verify mapping exists and belongs to a pool in this property
    existing = (
        ctx.table("pool_mappings")
        .select("id, expense_pools!inner(property_id)")
        .eq("id", str(mapping_id))
        .eq("expense_pools.property_id", str(property_id))
        .maybe_single()
        .execute()
    )

    if not existing or not existing.data:
        raise NotFoundError("Pool Mapping", str(mapping_id))

    result = ctx.table("pool_mappings").delete().eq("id", str(mapping_id)).execute()

    if not result.data:
        raise NotFoundError("Pool Mapping", str(mapping_id))

    return None
