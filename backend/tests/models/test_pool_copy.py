"""Tests for pool copy models."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models.pool_copy import (
    CopiedPoolInfo,
    CopyMode,
    PoolCopyRequest,
    PoolCopyResult,
)


def test_copy_mode_enum_values():
    """Test CopyMode enum has expected values."""
    assert CopyMode.MERGE.value == "merge"
    assert CopyMode.REPLACE.value == "replace"


def test_pool_copy_request_valid():
    """Test creating valid pool copy request."""
    source_id = uuid4()
    target_id = uuid4()

    request = PoolCopyRequest(
        source_property_id=source_id,
        target_property_id=target_id,
        copy_mode=CopyMode.MERGE,
    )

    assert request.source_property_id == source_id
    assert request.target_property_id == target_id
    assert request.copy_mode == CopyMode.MERGE


def test_pool_copy_request_same_property_raises_error():
    """Test validation prevents copying to same property."""
    same_id = uuid4()

    with pytest.raises(ValidationError) as exc_info:
        PoolCopyRequest(
            source_property_id=same_id,
            target_property_id=same_id,
            copy_mode=CopyMode.MERGE,
        )

    error = exc_info.value.errors()[0]
    assert "cannot copy pools to the same property" in error["msg"].lower()


def test_pool_copy_request_defaults_to_merge():
    """Test copy mode defaults to MERGE."""
    request = PoolCopyRequest(
        source_property_id=uuid4(),
        target_property_id=uuid4(),
    )

    assert request.copy_mode == CopyMode.MERGE


def test_copied_pool_info_creation():
    """Test creating copied pool info."""
    pool_id = uuid4()

    info = CopiedPoolInfo(
        id=pool_id,
        name="Utilities",
        is_parent=True,
    )

    assert info.id == pool_id
    assert info.name == "Utilities"
    assert info.is_parent is True


def test_pool_copy_result_valid():
    """Test creating valid pool copy result."""
    result = PoolCopyResult(
        pools_copied=5,
        parent_pools_copied=2,
        child_pools_copied=3,
        pools_deleted=0,
        copied_pools=[],
    )

    assert result.pools_copied == 5
    assert result.parent_pools_copied == 2
    assert result.child_pools_copied == 3
    assert result.pools_deleted == 0


def test_pool_copy_result_validates_counts():
    """Test validation that parent + child equals total."""
    with pytest.raises(ValidationError) as exc_info:
        PoolCopyResult(
            pools_copied=10,  # Total doesn't match parent + child
            parent_pools_copied=2,
            child_pools_copied=3,
            pools_deleted=0,
        )

    error = exc_info.value.errors()[0]
    assert "must equal total" in error["msg"].lower()


def test_pool_copy_result_with_pool_details():
    """Test copy result with copied pool details."""
    pools = [
        CopiedPoolInfo(id=uuid4(), name="Pool 1", is_parent=True),
        CopiedPoolInfo(id=uuid4(), name="Pool 2", is_parent=False),
    ]

    result = PoolCopyResult(
        pools_copied=2,
        parent_pools_copied=1,
        child_pools_copied=1,
        pools_deleted=5,
        copied_pools=pools,
    )

    assert len(result.copied_pools) == 2
    assert result.pools_deleted == 5
