"""Pool allocation management endpoints."""

from decimal import Decimal
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query, status

from app.auth.dependencies import OrgContext, require_org_editor
from app.exceptions import ConflictError, NotFoundError
from app.models.enums import AllocationType
from app.schemas.expense_pool import (
    PoolAllocationCreateRequest,
    PoolAllocationListResponse,
    PoolAllocationResponse,
    PoolAllocationUpdate,
)

router = APIRouter()


async def verify_property_access(property_id: UUID, ctx: OrgContext) -> None:
    """Verify user has access to the property."""
    result = (
        ctx.table("properties")
        .select("id")
        .eq("id", str(property_id))
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        raise NotFoundError("Property", str(property_id))


def _pool_ids_for_property(property_id: UUID, ctx: OrgContext) -> list[str]:
    result = (
        ctx.table("expense_pools")
        .select("id, property_id")
        .eq("property_id", str(property_id))
        .execute()
    )
    return [
        str(pool["id"])
        for pool in (result.data or [])
        if str(pool.get("property_id")) == str(property_id)
    ]


def _ensure_pools_belong_to_property(
    property_id: UUID,
    ctx: OrgContext,
    *pool_ids: UUID,
) -> None:
    pool_ids_for_property = set(_pool_ids_for_property(property_id, ctx))
    if not pool_ids_for_property:
        raise NotFoundError("Expense Pool", ", ".join(str(pid) for pid in pool_ids))

    missing = [str(pid) for pid in pool_ids if str(pid) not in pool_ids_for_property]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Source and target pools must belong to the same property",
        )


def _validate_not_self_allocation(source_pool_id: UUID, target_pool_id: UUID) -> None:
    if source_pool_id == target_pool_id:
        raise HTTPException(
            status_code=422,
            detail="Source and target pools must be different",
        )


def _validate_percentage_value(allocation_value: Decimal) -> None:
    if allocation_value <= Decimal("0") or allocation_value > Decimal("100"):
        raise HTTPException(
            status_code=422,
            detail="Percentage allocation value must be greater than 0 and at most 100",
        )


def _validate_percentage_total(
    source_pool_id: UUID,
    allocation_value: Decimal,
    ctx: OrgContext,
    *,
    exclude_allocation_id: UUID | None = None,
) -> None:
    _validate_percentage_value(allocation_value)
    existing_result = (
        ctx.table("pool_allocations")
        .select("id, allocation_type, allocation_value")
        .eq("source_pool_id", str(source_pool_id))
        .execute()
    )

    total = allocation_value
    for row in existing_result.data or []:
        if row.get("allocation_type") != AllocationType.PERCENTAGE.value:
            continue
        if exclude_allocation_id and row.get("id") == str(exclude_allocation_id):
            continue
        total += Decimal(str(row["allocation_value"]))

    if total > Decimal("100"):
        raise HTTPException(
            status_code=422,
            detail=(
                "Percentage allocations for a source pool cannot exceed "
                f"100%, got {total}%"
            ),
        )


def _validate_supported_allocation(allocation_type: AllocationType) -> None:
    if allocation_type != AllocationType.PERCENTAGE:
        raise HTTPException(
            status_code=422,
            detail="Only percentage pool allocations are supported for reconciliation",
        )


@router.get("", response_model=PoolAllocationListResponse)
async def list_pool_allocations(
    property_id: Annotated[UUID, Path(description="UUID of the parent property")],
    ctx: OrgContext,
    source_pool_id: Annotated[
        UUID | None, Query(description="Filter by source pool ID")
    ] = None,
    skip: Annotated[int, Query(ge=0, description="Number of records to skip")] = 0,
    limit: Annotated[
        int, Query(ge=1, le=100, description="Maximum records to return")
    ] = 100,
) -> PoolAllocationListResponse:
    """List split allocations for pools in a property."""
    await verify_property_access(property_id, ctx)
    pool_ids = _pool_ids_for_property(property_id, ctx)
    if not pool_ids:
        return PoolAllocationListResponse(data=[], count=0, has_more=False)

    query = ctx.table("pool_allocations").select("*", count="exact")
    if source_pool_id:
        if str(source_pool_id) not in pool_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Source pool must belong to the same property",
            )
        query = query.eq("source_pool_id", str(source_pool_id))
    else:
        query = query.in_("source_pool_id", pool_ids)

    result = query.order("created_at").range(skip, skip + limit - 1).execute()
    rows = result.data or []
    total_count = result.count if result.count is not None else len(rows)
    return PoolAllocationListResponse(
        data=[PoolAllocationResponse.model_validate(row) for row in rows],
        count=total_count,
        has_more=total_count > skip + limit,
    )


@router.post(
    "",
    response_model=PoolAllocationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_editor)],
)
async def create_pool_allocation(
    property_id: Annotated[UUID, Path(description="UUID of the parent property")],
    allocation_data: PoolAllocationCreateRequest,
    ctx: OrgContext,
) -> PoolAllocationResponse:
    """Create a split allocation between two pools in the same property."""
    await verify_property_access(property_id, ctx)
    _validate_supported_allocation(allocation_data.allocation_type)
    _validate_not_self_allocation(
        allocation_data.source_pool_id, allocation_data.target_pool_id
    )
    _ensure_pools_belong_to_property(
        property_id, ctx, allocation_data.source_pool_id, allocation_data.target_pool_id
    )
    _validate_percentage_total(
        allocation_data.source_pool_id, allocation_data.allocation_value, ctx
    )

    data = allocation_data.model_dump(mode="json")
    try:
        result = ctx.table("pool_allocations").insert(data).execute()
    except Exception as exc:
        error = str(exc).lower()
        if "unique" in error or "duplicate" in error:
            raise ConflictError("Allocation already exists for this source/target pair")
        raise

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create pool allocation",
        )
    return PoolAllocationResponse.model_validate(result.data[0])


@router.put(
    "/{allocation_id}",
    response_model=PoolAllocationResponse,
    dependencies=[Depends(require_org_editor)],
)
async def update_pool_allocation(
    property_id: Annotated[UUID, Path(description="UUID of the parent property")],
    allocation_id: Annotated[UUID, Path(description="UUID of the allocation")],
    allocation_data: PoolAllocationUpdate,
    ctx: OrgContext,
) -> PoolAllocationResponse:
    """Update an existing split allocation."""
    await verify_property_access(property_id, ctx)
    update_data: dict[str, Any] = allocation_data.model_dump(
        exclude_unset=True, mode="json"
    )
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    existing_result = (
        ctx.table("pool_allocations")
        .select("*")
        .eq("id", str(allocation_id))
        .maybe_single()
        .execute()
    )
    if not existing_result or not existing_result.data:
        raise NotFoundError("Pool Allocation", str(allocation_id))

    existing = existing_result.data
    source_pool_id = UUID(str(existing["source_pool_id"]))
    target_pool_id = UUID(
        str(update_data.get("target_pool_id", existing["target_pool_id"]))
    )
    allocation_type = AllocationType(
        update_data.get("allocation_type", existing["allocation_type"])
    )
    allocation_value = Decimal(
        str(update_data.get("allocation_value", existing["allocation_value"]))
    )

    _validate_supported_allocation(allocation_type)
    _validate_not_self_allocation(source_pool_id, target_pool_id)
    _ensure_pools_belong_to_property(property_id, ctx, source_pool_id, target_pool_id)
    _validate_percentage_total(
        source_pool_id,
        allocation_value,
        ctx,
        exclude_allocation_id=allocation_id,
    )

    result = (
        ctx.table("pool_allocations")
        .update(update_data)
        .eq("id", str(allocation_id))
        .execute()
    )
    if not result.data:
        raise NotFoundError("Pool Allocation", str(allocation_id))
    return PoolAllocationResponse.model_validate(result.data[0])


@router.delete(
    "/{allocation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_org_editor)],
)
async def delete_pool_allocation(
    property_id: Annotated[UUID, Path(description="UUID of the parent property")],
    allocation_id: Annotated[UUID, Path(description="UUID of the allocation")],
    ctx: OrgContext,
) -> None:
    """Delete a split allocation."""
    await verify_property_access(property_id, ctx)
    pool_ids = _pool_ids_for_property(property_id, ctx)
    existing = (
        ctx.table("pool_allocations")
        .select("id, source_pool_id")
        .eq("id", str(allocation_id))
        .maybe_single()
        .execute()
    )
    if (
        not existing
        or not existing.data
        or existing.data["source_pool_id"] not in pool_ids
    ):
        raise NotFoundError("Pool Allocation", str(allocation_id))

    result = (
        ctx.table("pool_allocations").delete().eq("id", str(allocation_id)).execute()
    )
    if not result.data:
        raise NotFoundError("Pool Allocation", str(allocation_id))

    return None
