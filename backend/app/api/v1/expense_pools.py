"""
Expense pool management endpoints.

Provides CRUD operations for expense pools within properties.
Expense pools are nested resources under properties, accessed via
/properties/{property_id}/expense-pools.
"""

import logging
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth.dependencies import OrgContext, require_org_editor
from app.exceptions import ConflictError, NotFoundError
from app.schemas.expense_pool import (
    ExpensePoolCreateRequest,
    ExpensePoolListResponse,
    ExpensePoolResponse,
    ExpensePoolUpdate,
    ExpensePoolWithChildren,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Valid pool types
VALID_POOL_TYPES = {"operating", "tax", "insurance", "capital", "other"}


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


def build_pool_hierarchy(
    pools: list[dict[str, Any]],
) -> list[ExpensePoolWithChildren]:
    """
    Build hierarchical tree structure from flat pool list.

    Args:
        pools: Flat list of pool dictionaries

    Returns:
        List of parent pools with nested children
    """
    # Separate parent and child pools
    parents = []
    children_by_parent: dict[str, list[dict[str, Any]]] = {}

    for pool in pools:
        parent_id = pool.get("parent_pool_id")
        if parent_id is None:
            parents.append(pool)
        else:
            if parent_id not in children_by_parent:
                children_by_parent[parent_id] = []
            children_by_parent[parent_id].append(pool)

    # Build hierarchy
    result = []
    for parent in parents:
        children = children_by_parent.get(parent["id"], [])
        parent_with_children = ExpensePoolWithChildren(
            **parent,
            children=[ExpensePoolWithChildren(**c, children=[]) for c in children],
        )
        result.append(parent_with_children)

    return result


@router.get("", response_model=ExpensePoolListResponse)
async def list_expense_pools(
    property_id: UUID,
    ctx: OrgContext,
    include_children: Annotated[
        bool, Query(description="Include hierarchical children structure")
    ] = True,
    skip: Annotated[int, Query(ge=0, description="Number of records to skip")] = 0,
    limit: Annotated[
        int, Query(ge=1, le=100, description="Maximum records to return")
    ] = 100,
) -> ExpensePoolListResponse:
    """
    List all expense pools for a property.

    Returns all expense pools that belong to the specified property.
    By default, returns hierarchical structure with parent-child relationships.

    Args:
        property_id: UUID of the parent property
        ctx: Organization-scoped context with authenticated user
        include_children: Whether to build hierarchical structure
        skip: Number of records to skip for pagination
        limit: Maximum number of records to return

    Returns:
        Paginated list of expense pools with metadata
    """
    await verify_property_access(property_id, ctx)

    if include_children:
        # Hierarchy mode: fetch all pools (needed to build parent-child tree)
        result = (
            ctx.table("expense_pools")
            .select("*", count="exact")
            .eq("property_id", str(property_id))
            .order("name")
            .execute()
        )
        pools = result.data or []
        total_count = result.count or len(pools)
        hierarchy = build_pool_hierarchy(pools)
        return ExpensePoolListResponse(
            data=hierarchy,
            count=total_count,
            has_more=False,  # Hierarchy returns all pools
        )

    # Flat list with DB-level pagination
    result = (
        ctx.table("expense_pools")
        .select("*", count="exact")
        .eq("property_id", str(property_id))
        .order("name")
        .range(skip, skip + limit - 1)
        .execute()
    )
    pools = result.data or []
    total_count = result.count if result.count is not None else len(pools)

    flat_pools = [ExpensePoolWithChildren(**p, children=[]) for p in pools]

    return ExpensePoolListResponse(
        data=flat_pools,
        count=total_count,
        has_more=total_count > skip + limit,
    )


@router.get("/{pool_id}", response_model=ExpensePoolResponse)
async def get_expense_pool(
    property_id: UUID,
    pool_id: UUID,
    ctx: OrgContext,
) -> ExpensePoolResponse:
    """
    Get a single expense pool by ID.

    Retrieves detailed information about a specific expense pool.
    Returns 404 if the pool doesn't exist or belongs to another property/org.

    Args:
        property_id: UUID of the parent property
        pool_id: UUID of the pool to retrieve
        ctx: Organization-scoped context with authenticated user

    Returns:
        Expense pool details
    """
    await verify_property_access(property_id, ctx)

    result = (
        ctx.table("expense_pools")
        .select("*")
        .eq("id", str(pool_id))
        .eq("property_id", str(property_id))
        .maybe_single()
        .execute()
    )

    if not result or not result.data:
        raise NotFoundError("Expense Pool", str(pool_id))

    return ExpensePoolResponse.model_validate(result.data)


@router.post(
    "",
    response_model=ExpensePoolResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_editor)],
)
async def create_expense_pool(
    property_id: UUID,
    pool_data: ExpensePoolCreateRequest,
    ctx: OrgContext,
) -> ExpensePoolResponse:
    """
    Create a new expense pool within a property.

    Creates a pool in the specified property. Pool names must be
    unique within the property. Maximum hierarchy depth is 2 levels.

    Args:
        property_id: UUID of the parent property
        pool_data: Pool creation data
        ctx: Organization-scoped context with authenticated user

    Returns:
        Created expense pool with generated ID

    Raises:
        NotFoundError: If property doesn't exist or belongs to another org
        ConflictError: If pool name already exists in this property
        HTTPException: If pool type is invalid or hierarchy depth exceeded
    """
    await verify_property_access(property_id, ctx)

    # Validate pool_type
    if pool_data.pool_type not in VALID_POOL_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid pool_type. Must be one of: {', '.join(VALID_POOL_TYPES)}",
        )

    # If parent_pool_id provided, validate hierarchy depth
    if pool_data.parent_pool_id:
        parent_result = (
            ctx.table("expense_pools")
            .select("id, parent_pool_id, property_id")
            .eq("id", str(pool_data.parent_pool_id))
            .maybe_single()
            .execute()
        )

        if not parent_result or not parent_result.data:
            raise NotFoundError("Parent Pool", str(pool_data.parent_pool_id))

        parent = parent_result.data

        # Check parent belongs to same property
        if parent["property_id"] != str(property_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent pool must belong to the same property",
            )

        # Check if parent already has a parent (max depth = 2)
        if parent.get("parent_pool_id") is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Maximum hierarchy depth exceeded. "
                    "Pools can only be 2 levels deep."
                ),
            )

    # Prepare data with property_id
    data = pool_data.model_dump(mode="json")
    data["property_id"] = str(property_id)

    try:
        result = ctx.table("expense_pools").insert(data).execute()

        if not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create expense pool",
            )

        return ExpensePoolResponse.model_validate(result.data[0])
    except Exception as e:
        error_str = str(e).lower()
        if "unique" in error_str or "duplicate" in error_str:
            raise ConflictError(
                f"Pool '{pool_data.name}' already exists in this property"
            )
        raise


@router.put(
    "/{pool_id}",
    response_model=ExpensePoolResponse,
    dependencies=[Depends(require_org_editor)],
)
async def update_expense_pool(
    property_id: UUID,
    pool_id: UUID,
    pool_data: ExpensePoolUpdate,
    ctx: OrgContext,
) -> ExpensePoolResponse:
    """
    Update an expense pool.

    Updates an existing pool's information.
    Only provided fields will be updated.

    Args:
        property_id: UUID of the parent property
        pool_id: UUID of the pool to update
        pool_data: Fields to update
        ctx: Organization-scoped context with authenticated user

    Returns:
        Updated expense pool details

    Raises:
        NotFoundError: If property or pool doesn't exist
        ConflictError: If new pool name already exists in this property
    """
    await verify_property_access(property_id, ctx)

    # Only include non-None fields
    update_data = pool_data.model_dump(exclude_unset=True, mode="json")

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    try:
        result = (
            ctx.table("expense_pools")
            .update(update_data)
            .eq("id", str(pool_id))
            .eq("property_id", str(property_id))
            .execute()
        )

        if not result.data:
            raise NotFoundError("Expense Pool", str(pool_id))

        return ExpensePoolResponse.model_validate(result.data[0])
    except NotFoundError:
        raise
    except Exception as e:
        error_str = str(e).lower()
        if "unique" in error_str or "duplicate" in error_str:
            new_name = update_data.get("name", "unknown")
            raise ConflictError(f"Pool '{new_name}' already exists in this property")
        raise


@router.delete(
    "/{pool_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_org_editor)],
)
async def delete_expense_pool(
    property_id: UUID,
    pool_id: UUID,
    ctx: OrgContext,
) -> None:
    """
    Delete an expense pool.

    Removes a pool from the property.
    Note: Child pools will be deleted via CASCADE constraint.

    Args:
        property_id: UUID of the parent property
        pool_id: UUID of the pool to delete
        ctx: Organization-scoped context with authenticated user

    Raises:
        NotFoundError: If property or pool doesn't exist
    """
    await verify_property_access(property_id, ctx)

    result = (
        ctx.table("expense_pools")
        .delete()
        .eq("id", str(pool_id))
        .eq("property_id", str(property_id))
        .execute()
    )

    if not result.data:
        raise NotFoundError("Expense Pool", str(pool_id))

    return None
