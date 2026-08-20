"""Tests for pool copy service."""

from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.models.pool_copy import CopyMode, PoolCopyRequest
from app.services.pools.copy_service import PoolCopyService


@pytest.fixture
def mock_supabase():
    """Create mock Supabase client."""
    return MagicMock()


@pytest.fixture
def org_id():
    """Test organization ID."""
    return uuid4()


@pytest.fixture
def copy_service(mock_supabase, org_id):
    """Create copy service instance."""
    return PoolCopyService(mock_supabase, org_id)


@pytest.fixture
def source_property_id():
    """Source property ID for tests."""
    return uuid4()


@pytest.fixture
def target_property_id():
    """Target property ID for tests."""
    return uuid4()


def test_copy_pools_with_no_source_pools(
    copy_service, mock_supabase, source_property_id, target_property_id
):
    """Test copying when source property has no pools."""
    # Mock property validation
    prop_result = type("Result", (), {"data": [{"id": "test"}]})()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
        prop_result
    )

    # Mock empty pools query
    pools_result = type("Result", (), {"data": []})()
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
        pools_result
    )

    request = PoolCopyRequest(
        source_property_id=source_property_id,
        target_property_id=target_property_id,
        copy_mode=CopyMode.MERGE,
    )

    # FIX NEW-SVC-1: Method is now synchronous
    result = copy_service.copy_pools(request)

    assert result.pools_copied == 0
    assert result.parent_pools_copied == 0
    assert result.child_pools_copied == 0


def test_copy_pools_merge_mode(
    copy_service, mock_supabase, source_property_id, target_property_id
):
    """Test copying pools in merge mode."""
    # Mock property validation
    prop_result = type("Result", (), {"data": [{"id": "test"}]})()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
        prop_result
    )

    # Mock source pools
    parent_id = str(uuid4())
    source_pools = [
        {
            "id": parent_id,
            "name": "Utilities",
            "description": "Utility expenses",
            "parent_pool_id": None,
            "gross_up_enabled": True,
        },
        {
            "id": str(uuid4()),
            "name": "Electric",
            "description": None,
            "parent_pool_id": parent_id,
            "gross_up_enabled": True,
        },
    ]
    pools_result = type("Result", (), {"data": source_pools})()

    # Mock pool creation responses
    created_parent = {
        "id": str(uuid4()),
        "name": "Utilities",
        "description": "Utility expenses",
        "parent_pool_id": None,
        "gross_up_enabled": True,
    }
    created_child = {
        "id": str(uuid4()),
        "name": "Electric",
        "description": None,
        "parent_pool_id": created_parent["id"],
        "gross_up_enabled": True,
    }

    insert_results = [
        type("Result", (), {"data": [created_parent]})(),
        type("Result", (), {"data": [created_child]})(),
    ]

    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
        pools_result
    )
    mock_supabase.table.return_value.insert.return_value.execute.side_effect = (
        insert_results
    )

    request = PoolCopyRequest(
        source_property_id=source_property_id,
        target_property_id=target_property_id,
        copy_mode=CopyMode.MERGE,
    )

    # FIX NEW-SVC-1: Method is now synchronous
    result = copy_service.copy_pools(request)

    assert result.pools_copied == 2
    assert result.parent_pools_copied == 1
    assert result.child_pools_copied == 1
    assert result.pools_deleted == 0
    assert len(result.copied_pools) == 2


def test_copy_pools_replace_mode(
    copy_service, mock_supabase, source_property_id, target_property_id
):
    """Test copying pools in replace mode deletes existing pools."""
    # Mock property validation
    prop_result = type("Result", (), {"data": [{"id": "test"}]})()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
        prop_result
    )

    # Mock source pools
    source_pools = [
        {
            "id": str(uuid4()),
            "name": "Utilities",
            "description": None,
            "parent_pool_id": None,
            "gross_up_enabled": True,
        }
    ]
    pools_result = type("Result", (), {"data": source_pools})()

    # Mock existing pool count for deletion
    count_result = type("Result", (), {"count": 3, "data": []})()
    delete_result = type("Result", (), {"data": []})()

    # Mock pool creation
    created_pool = {
        "id": str(uuid4()),
        "name": "Utilities",
        "description": None,
        "parent_pool_id": None,
        "gross_up_enabled": True,
    }
    insert_result = type("Result", (), {"data": [created_pool]})()

    # Setup mock chain for different operations
    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
        pools_result
    )
    mock_supabase.table.return_value.select.return_value.execute.return_value = (
        count_result
    )
    mock_supabase.table.return_value.delete.return_value.eq.return_value.execute.return_value = (
        delete_result
    )
    mock_supabase.table.return_value.insert.return_value.execute.return_value = (
        insert_result
    )

    request = PoolCopyRequest(
        source_property_id=source_property_id,
        target_property_id=target_property_id,
        copy_mode=CopyMode.REPLACE,
    )

    # FIX NEW-SVC-1: Method is now synchronous
    result = copy_service.copy_pools(request)

    assert result.pools_copied == 1
    assert result.pools_deleted > 0  # Just verify some pools were deleted


def test_validate_properties_source_not_found(
    copy_service, mock_supabase, source_property_id, target_property_id
):
    """Test validation fails when source property not found."""
    # Mock empty result for source property
    empty_result = type("Result", (), {"data": []})()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
        empty_result
    )

    # FIX NEW-SVC-1: Method is now synchronous
    with pytest.raises(ValueError) as exc_info:
        copy_service._validate_properties(source_property_id, target_property_id)

    assert "not found or access denied" in str(exc_info.value).lower()


def test_validate_properties_target_not_found(
    copy_service, mock_supabase, source_property_id, target_property_id
):
    """Test validation fails when target property not found."""
    # Mock source exists, target doesn't
    source_result = type("Result", (), {"data": [{"id": str(source_property_id)}]})()
    target_result = type("Result", (), {"data": []})()

    results = [source_result, target_result]
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.side_effect = (
        results
    )

    # FIX NEW-SVC-1: Method is now synchronous
    with pytest.raises(ValueError) as exc_info:
        copy_service._validate_properties(source_property_id, target_property_id)

    assert "not found or access denied" in str(exc_info.value).lower()


def test_orphaned_child_pool_skipped(
    copy_service, mock_supabase, source_property_id, target_property_id
):
    """Test that child pools with missing parents are skipped (not copied)."""
    # Mock property validation
    prop_result = type("Result", (), {"data": [{"id": "test"}]})()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
        prop_result
    )

    # Create orphaned child pool - parent_pool_id references non-existent parent
    orphaned_parent_id = str(uuid4())
    source_pools = [
        {
            "id": str(uuid4()),
            "name": "Orphaned Child",
            "description": None,
            "parent_pool_id": orphaned_parent_id,  # Parent not in source_pools!
            "gross_up_enabled": True,
        }
    ]
    pools_result = type("Result", (), {"data": source_pools})()

    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
        pools_result
    )

    request = PoolCopyRequest(
        source_property_id=source_property_id,
        target_property_id=target_property_id,
        copy_mode=CopyMode.MERGE,
    )

    result = copy_service.copy_pools(request)

    # Orphaned child should be skipped - no pools copied
    assert result.pools_copied == 0
    assert result.child_pools_copied == 0
    assert result.parent_pools_copied == 0


def test_multiple_children_same_parent(
    copy_service, mock_supabase, source_property_id, target_property_id
):
    """Test that multiple children of same parent all get new parent_id."""
    # Mock property validation
    prop_result = type("Result", (), {"data": [{"id": "test"}]})()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
        prop_result
    )

    # Create parent with three children
    parent_id = str(uuid4())
    source_pools = [
        {
            "id": parent_id,
            "name": "Parent Pool",
            "description": None,
            "parent_pool_id": None,
            "gross_up_enabled": True,
        },
        {
            "id": str(uuid4()),
            "name": "Child 1",
            "description": None,
            "parent_pool_id": parent_id,
            "gross_up_enabled": True,
        },
        {
            "id": str(uuid4()),
            "name": "Child 2",
            "description": None,
            "parent_pool_id": parent_id,
            "gross_up_enabled": True,
        },
        {
            "id": str(uuid4()),
            "name": "Child 3",
            "description": None,
            "parent_pool_id": parent_id,
            "gross_up_enabled": True,
        },
    ]
    pools_result = type("Result", (), {"data": source_pools})()

    # Mock pool creation - parent first, then three children
    new_parent_id = str(uuid4())
    insert_results = [
        type("Result", (), {"data": [{"id": new_parent_id, "name": "Parent Pool"}]})(),
        type("Result", (), {"data": [{"id": str(uuid4()), "name": "Child 1"}]})(),
        type("Result", (), {"data": [{"id": str(uuid4()), "name": "Child 2"}]})(),
        type("Result", (), {"data": [{"id": str(uuid4()), "name": "Child 3"}]})(),
    ]

    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
        pools_result
    )
    mock_supabase.table.return_value.insert.return_value.execute.side_effect = (
        insert_results
    )

    request = PoolCopyRequest(
        source_property_id=source_property_id,
        target_property_id=target_property_id,
        copy_mode=CopyMode.MERGE,
    )

    result = copy_service.copy_pools(request)

    # All 4 pools should be copied (1 parent + 3 children)
    assert result.pools_copied == 4
    assert result.parent_pools_copied == 1
    assert result.child_pools_copied == 3


def test_mixed_valid_and_orphaned_children(
    copy_service, mock_supabase, source_property_id, target_property_id
):
    """Test mix of valid children and orphaned children - only valid copied."""
    # Mock property validation
    prop_result = type("Result", (), {"data": [{"id": "test"}]})()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = (
        prop_result
    )

    # Create scenario with one valid parent+child and one orphaned child
    valid_parent_id = str(uuid4())
    orphaned_parent_id = str(uuid4())  # This parent doesn't exist
    source_pools = [
        {
            "id": valid_parent_id,
            "name": "Valid Parent",
            "description": None,
            "parent_pool_id": None,
            "gross_up_enabled": True,
        },
        {
            "id": str(uuid4()),
            "name": "Valid Child",
            "description": None,
            "parent_pool_id": valid_parent_id,
            "gross_up_enabled": True,
        },
        {
            "id": str(uuid4()),
            "name": "Orphaned Child",
            "description": None,
            "parent_pool_id": orphaned_parent_id,  # Parent not in source!
            "gross_up_enabled": True,
        },
    ]
    pools_result = type("Result", (), {"data": source_pools})()

    # Mock pool creation - only parent and valid child get created
    new_parent_id = str(uuid4())
    insert_results = [
        type(
            "Result",
            (),
            {"data": [{"id": new_parent_id, "name": "Valid Parent"}]},
        )(),
        type("Result", (), {"data": [{"id": str(uuid4()), "name": "Valid Child"}]})(),
    ]

    mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value = (
        pools_result
    )
    mock_supabase.table.return_value.insert.return_value.execute.side_effect = (
        insert_results
    )

    request = PoolCopyRequest(
        source_property_id=source_property_id,
        target_property_id=target_property_id,
        copy_mode=CopyMode.MERGE,
    )

    result = copy_service.copy_pools(request)

    # Only 2 pools copied (1 parent + 1 valid child), orphaned child skipped
    assert result.pools_copied == 2
    assert result.parent_pools_copied == 1
    assert result.child_pools_copied == 1
    # Verify copied pools don't include orphaned child
    assert all(p.name != "Orphaned Child" for p in result.copied_pools)
