"""Additional branch coverage tests for pool mappings API module."""

from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.api.v1.pool_mappings import (
    create_pool_mapping,
    delete_pool_mapping,
    list_pool_mappings,
    update_pool_mapping,
)
from app.exceptions import ConflictError, NotFoundError
from app.schemas.expense_pool import PoolMappingCreateRequest, PoolMappingUpdate


@pytest.mark.asyncio
async def test_list_pool_mappings_applies_pool_filter_and_has_more():
    """List endpoint should apply pool_id filter and compute has_more."""
    property_id = uuid4()
    pool_id = uuid4()
    mapping_id = uuid4()

    ctx = MagicMock()

    # First call: expense_pools query returns pool IDs
    pools_query = MagicMock()
    pools_query.select.return_value = pools_query
    pools_query.eq.return_value = pools_query
    pools_query.execute.return_value = MagicMock(data=[{"id": str(pool_id)}])

    # Second call: pool_mappings query returns mappings
    mappings_query = MagicMock()
    mappings_query.select.return_value = mappings_query
    mappings_query.eq.return_value = mappings_query
    mappings_query.in_.return_value = mappings_query
    mappings_query.order.return_value = mappings_query
    mappings_query.range.return_value = mappings_query
    mappings_query.execute.return_value = MagicMock(
        data=[
            {
                "id": str(mapping_id),
                "expense_pool_id": str(pool_id),
                "gl_account_pattern": "6*",
                "allocation_percentage": "1.0",
                "priority": 100,
                "created_at": "2024-01-01T00:00:00+00:00",
                "updated_at": "2024-01-01T00:00:00+00:00",
            }
        ],
        count=2,
    )

    call_count = {"n": 0}

    def table_side_effect(table_name):
        call_count["n"] += 1
        if table_name == "expense_pools":
            return pools_query
        elif table_name == "pool_mappings":
            return mappings_query
        return MagicMock()

    ctx.table.side_effect = table_side_effect

    with patch("app.api.v1.pool_mappings.verify_property_access", AsyncMock()):
        response = await list_pool_mappings(
            property_id=property_id,
            ctx=ctx,
            pool_id=pool_id,
            skip=0,
            limit=1,
        )

    assert response.count == 2
    assert response.has_more is True


@pytest.mark.asyncio
async def test_create_pool_mapping_duplicate_pattern_conflict():
    """Create endpoint should map duplicate database errors to ConflictError."""
    property_id = uuid4()
    pool_id = uuid4()
    ctx = MagicMock()
    ctx.table.return_value.insert.return_value.execute.side_effect = Exception(
        "duplicate key value violates unique constraint"
    )

    request = PoolMappingCreateRequest(
        expense_pool_id=pool_id,
        gl_account_pattern="6*",
        allocation_percentage=1.0,
        priority=100,
    )

    with (
        patch("app.api.v1.pool_mappings.verify_property_access", AsyncMock()),
        patch("app.api.v1.pool_mappings.verify_pool_belongs_to_property", AsyncMock()),
        pytest.raises(ConflictError),
    ):
        await create_pool_mapping(
            property_id=property_id, mapping_data=request, ctx=ctx
        )


@pytest.mark.asyncio
async def test_create_pool_mapping_returns_500_when_insert_empty():
    """Create endpoint should fail when insert returns no rows."""
    property_id = uuid4()
    pool_id = uuid4()
    ctx = MagicMock()
    ctx.table.return_value.insert.return_value.execute.return_value = MagicMock(data=[])

    request = PoolMappingCreateRequest(
        expense_pool_id=pool_id,
        gl_account_pattern="7*",
        allocation_percentage=1.0,
        priority=1,
    )

    with (
        patch("app.api.v1.pool_mappings.verify_property_access", AsyncMock()),
        patch("app.api.v1.pool_mappings.verify_pool_belongs_to_property", AsyncMock()),
        pytest.raises(HTTPException) as exc_info,
    ):
        await create_pool_mapping(
            property_id=property_id, mapping_data=request, ctx=ctx
        )

    assert exc_info.value.status_code == 500


@pytest.mark.asyncio
async def test_update_pool_mapping_validates_pattern():
    """Update endpoint should reject invalid GL patterns."""
    property_id = uuid4()
    mapping_id = uuid4()
    ctx = MagicMock()
    request = PoolMappingUpdate(gl_account_pattern="6*")

    with (
        patch("app.api.v1.pool_mappings.verify_property_access", AsyncMock()),
        patch("app.api.v1.pool_mappings.is_valid_gl_pattern", return_value=False),
        pytest.raises(HTTPException) as exc_info,
    ):
        await update_pool_mapping(
            property_id=property_id,
            mapping_id=mapping_id,
            mapping_data=request,
            ctx=ctx,
        )

    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_update_pool_mapping_not_found_after_update():
    """Update endpoint should raise NotFoundError when update returns empty rows."""
    property_id = uuid4()
    mapping_id = uuid4()
    ctx = MagicMock()

    existing_query = MagicMock()
    existing_query.eq.return_value = existing_query
    existing_query.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": str(mapping_id), "expense_pools": {"property_id": str(property_id)}}
    )

    update_query = MagicMock()
    update_query.eq.return_value.execute.return_value = MagicMock(data=[])

    def table_side_effect(name: str):
        if name == "pool_mappings":
            root = MagicMock()
            root.select.return_value = existing_query
            root.update.return_value = update_query
            return root
        return MagicMock()

    ctx.table.side_effect = table_side_effect

    request = PoolMappingUpdate(priority=10)

    with (
        patch("app.api.v1.pool_mappings.verify_property_access", AsyncMock()),
        pytest.raises(NotFoundError),
    ):
        await update_pool_mapping(
            property_id=property_id,
            mapping_id=mapping_id,
            mapping_data=request,
            ctx=ctx,
        )


@pytest.mark.asyncio
async def test_update_pool_mapping_duplicate_conflict():
    """Update endpoint should map duplicate errors to ConflictError."""
    property_id = uuid4()
    mapping_id = uuid4()
    ctx = MagicMock()

    existing_query = MagicMock()
    existing_query.eq.return_value = existing_query
    existing_query.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": str(mapping_id), "expense_pools": {"property_id": str(property_id)}}
    )

    update_query = MagicMock()
    update_query.eq.return_value.execute.side_effect = Exception("unique violation")

    def table_side_effect(name: str):
        if name == "pool_mappings":
            root = MagicMock()
            root.select.return_value = existing_query
            root.update.return_value = update_query
            return root
        return MagicMock()

    ctx.table.side_effect = table_side_effect

    request = PoolMappingUpdate(gl_account_pattern="8*")

    with (
        patch("app.api.v1.pool_mappings.verify_property_access", AsyncMock()),
        pytest.raises(ConflictError),
    ):
        await update_pool_mapping(
            property_id=property_id,
            mapping_id=mapping_id,
            mapping_data=request,
            ctx=ctx,
        )


@pytest.mark.asyncio
async def test_delete_pool_mapping_raises_not_found_when_delete_returns_empty():
    """Delete endpoint should raise NotFoundError if delete affects zero rows."""
    property_id = uuid4()
    mapping_id = uuid4()
    ctx = MagicMock()

    existing_query = MagicMock()
    existing_query.eq.return_value = existing_query
    existing_query.maybe_single.return_value.execute.return_value = MagicMock(
        data={"id": str(mapping_id), "expense_pools": {"property_id": str(property_id)}}
    )

    delete_query = MagicMock()
    delete_query.eq.return_value.execute.return_value = MagicMock(data=[])

    def table_side_effect(name: str):
        if name == "pool_mappings":
            root = MagicMock()
            root.select.return_value = existing_query
            root.delete.return_value = delete_query
            return root
        return MagicMock()

    ctx.table.side_effect = table_side_effect

    with (
        patch("app.api.v1.pool_mappings.verify_property_access", AsyncMock()),
        pytest.raises(NotFoundError),
    ):
        await delete_pool_mapping(
            property_id=property_id, mapping_id=mapping_id, ctx=ctx
        )
