"""Tests for PoolAllocation domain models.

Tests cover:
- PoolAllocation schema validation
- PoolAllocationCreate schema validation with type-specific rules
- PoolAllocationUpdate schema validation
- validate_allocations_sum_to_100 validation function
"""

from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models import (
    AllocationType,
    PoolAllocation,
    PoolAllocationCreate,
    PoolAllocationUpdate,
    validate_allocations_sum_to_100,
)


class TestPoolAllocation:
    """Tests for PoolAllocation model."""

    def test_valid_percentage_allocation(self):
        """Test creating a valid percentage allocation."""
        allocation = PoolAllocation(
            id=uuid4(),
            source_pool_id=uuid4(),
            target_pool_id=uuid4(),
            allocation_type=AllocationType.PERCENTAGE,
            allocation_value=Decimal("50.00"),
            created_at="2024-01-01T00:00:00Z",
            updated_at="2024-01-01T00:00:00Z",
        )
        assert allocation.allocation_type == AllocationType.PERCENTAGE
        assert allocation.allocation_value == Decimal("50.00")

    def test_valid_fixed_amount_allocation(self):
        """Test creating a valid fixed amount allocation."""
        allocation = PoolAllocation(
            id=uuid4(),
            source_pool_id=uuid4(),
            target_pool_id=uuid4(),
            allocation_type=AllocationType.FIXED_AMOUNT,
            allocation_value=Decimal("1000.00"),
            created_at="2024-01-01T00:00:00Z",
            updated_at="2024-01-01T00:00:00Z",
        )
        assert allocation.allocation_type == AllocationType.FIXED_AMOUNT
        assert allocation.allocation_value == Decimal("1000.00")

    def test_invalid_percentage_over_100_rejected(self):
        """Test that PoolAllocation rejects percentage over 100."""
        with pytest.raises(ValidationError) as exc_info:
            PoolAllocation(
                id=uuid4(),
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("150"),
                created_at="2024-01-01T00:00:00Z",
                updated_at="2024-01-01T00:00:00Z",
            )
        assert "Percentage allocation must be between 0 and 100" in str(exc_info.value)

    def test_invalid_fixed_amount_zero_rejected(self):
        """Test that PoolAllocation rejects zero fixed amount."""
        with pytest.raises(ValidationError) as exc_info:
            PoolAllocation(
                id=uuid4(),
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.FIXED_AMOUNT,
                allocation_value=Decimal("0"),
                created_at="2024-01-01T00:00:00Z",
                updated_at="2024-01-01T00:00:00Z",
            )
        assert "Fixed amount allocation must be positive" in str(exc_info.value)


class TestPoolAllocationCreate:
    """Tests for PoolAllocationCreate model with validation."""

    def test_valid_percentage_allocation(self):
        """Test creating a valid percentage allocation."""
        allocation = PoolAllocationCreate(
            source_pool_id=uuid4(),
            target_pool_id=uuid4(),
            allocation_type=AllocationType.PERCENTAGE,
            allocation_value=Decimal("25.50"),
        )
        assert allocation.allocation_value == Decimal("25.50")

    def test_valid_fixed_amount_allocation(self):
        """Test creating a valid fixed amount allocation."""
        allocation = PoolAllocationCreate(
            source_pool_id=uuid4(),
            target_pool_id=uuid4(),
            allocation_type=AllocationType.FIXED_AMOUNT,
            allocation_value=Decimal("500.00"),
        )
        assert allocation.allocation_value == Decimal("500.00")

    def test_percentage_allocation_zero_rejected(self):
        """Test that zero percentage is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("0"),
            )
        assert "Percentage allocation must be between 0 and 100" in str(exc_info.value)

    def test_percentage_allocation_over_100_rejected(self):
        """Test that percentage over 100 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("150"),
            )
        assert "Percentage allocation must be between 0 and 100" in str(exc_info.value)

    def test_fixed_amount_zero_rejected(self):
        """Test that zero fixed amount is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.FIXED_AMOUNT,
                allocation_value=Decimal("0"),
            )
        assert "Fixed amount allocation must be positive" in str(exc_info.value)

    def test_negative_allocation_rejected(self):
        """Test that negative allocation value is rejected by gt constraint."""
        with pytest.raises(ValidationError) as exc_info:
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("-10"),
            )
        assert "between 0 and 100" in str(exc_info.value).lower()


class TestPoolAllocationUpdate:
    """Tests for PoolAllocationUpdate model."""

    def test_partial_update_target_pool_only(self):
        """Test updating only target_pool_id."""
        update = PoolAllocationUpdate(target_pool_id=uuid4())
        assert update.target_pool_id is not None
        assert update.allocation_type is None
        assert update.allocation_value is None

    def test_partial_update_allocation_type_only(self):
        """Test updating only allocation_type."""
        update = PoolAllocationUpdate(allocation_type=AllocationType.FIXED_AMOUNT)
        assert update.allocation_type == AllocationType.FIXED_AMOUNT
        assert update.target_pool_id is None
        assert update.allocation_value is None

    def test_partial_update_allocation_value_only(self):
        """Test updating only allocation_value."""
        update = PoolAllocationUpdate(allocation_value=Decimal("75.00"))
        assert update.allocation_value == Decimal("75.00")
        assert update.target_pool_id is None
        assert update.allocation_type is None

    def test_update_with_invalid_percentage_over_100_rejected(self):
        """Test that PoolAllocationUpdate rejects percentage over 100."""
        with pytest.raises(ValidationError) as exc_info:
            PoolAllocationUpdate(
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("150"),
            )
        assert "Percentage allocation must be between 0 and 100" in str(exc_info.value)

    def test_update_with_invalid_fixed_amount_zero_rejected(self):
        """Test that PoolAllocationUpdate rejects zero fixed amount."""
        with pytest.raises(ValidationError) as exc_info:
            PoolAllocationUpdate(
                allocation_type=AllocationType.FIXED_AMOUNT,
                allocation_value=Decimal("0"),
            )
        assert "Fixed amount allocation must be positive" in str(exc_info.value)


class TestValidateAllocationsSumTo100:
    """Tests for validate_allocations_sum_to_100 function."""

    def test_no_allocations_is_valid(self):
        """Test that empty allocation list is valid."""
        is_valid, error = validate_allocations_sum_to_100([])
        assert is_valid is True
        assert error == ""

    def test_only_fixed_amount_allocations_is_valid(self):
        """Test that only fixed amount allocations don't require 100% validation."""
        allocations = [
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.FIXED_AMOUNT,
                allocation_value=Decimal("1000"),
            ),
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.FIXED_AMOUNT,
                allocation_value=Decimal("2000"),
            ),
        ]
        is_valid, error = validate_allocations_sum_to_100(allocations)
        assert is_valid is True
        assert error == ""

    def test_percentage_allocations_sum_to_100_is_valid(self):
        """Test that percentage allocations summing to exactly 100 are valid."""
        allocations = [
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("40.00"),
            ),
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("60.00"),
            ),
        ]
        is_valid, error = validate_allocations_sum_to_100(allocations)
        assert is_valid is True
        assert error == ""

    def test_percentage_allocations_under_100_is_invalid(self):
        """Test that percentage allocations summing to less than 100 are invalid."""
        allocations = [
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("40.00"),
            ),
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("50.00"),
            ),
        ]
        is_valid, error = validate_allocations_sum_to_100(allocations)
        assert is_valid is False
        assert "must sum to 100%" in error
        assert "90" in error

    def test_percentage_allocations_over_100_is_invalid(self):
        """Test that percentage allocations summing to more than 100 are invalid."""
        allocations = [
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("60.00"),
            ),
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("50.00"),
            ),
        ]
        is_valid, error = validate_allocations_sum_to_100(allocations)
        assert is_valid is False
        assert "must sum to 100%" in error
        assert "110" in error

    def test_mixed_allocation_types_validates_only_percentages(self):
        """Test that mixed allocation types validate only percentage allocations."""
        allocations = [
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("100.00"),
            ),
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.FIXED_AMOUNT,
                allocation_value=Decimal("5000.00"),  # Should be ignored
            ),
        ]
        is_valid, error = validate_allocations_sum_to_100(allocations)
        assert is_valid is True
        assert error == ""

    def test_percentage_within_tolerance_is_valid(self):
        """Test that percentage sum within 0.01 tolerance is considered valid."""
        allocations = [
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("33.33"),
            ),
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("33.33"),
            ),
            PoolAllocationCreate(
                source_pool_id=uuid4(),
                target_pool_id=uuid4(),
                allocation_type=AllocationType.PERCENTAGE,
                allocation_value=Decimal("33.34"),  # Gets remainder
            ),
        ]
        is_valid, error = validate_allocations_sum_to_100(allocations)
        assert is_valid is True
        assert error == ""
