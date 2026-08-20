"""PoolAllocation domain types for split expense allocations.

These models handle the splitting of expenses from a source pool
to multiple target pools with percentage or fixed amount allocations.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field, ValidationInfo, field_validator

from app.models.enums import AllocationType


class PoolAllocation(BaseModel):
    """Split allocation linking an expense pool to target pools.

    Represents a single allocation from a source pool to a target pool.
    Multiple allocations from the same source pool create a split.
    """

    id: UUID
    source_pool_id: UUID = Field(
        ..., description="Pool being split into multiple targets"
    )
    target_pool_id: UUID = Field(
        ..., description="Destination pool receiving allocation"
    )
    allocation_type: AllocationType = Field(
        ..., description="Whether allocation is percentage or fixed amount"
    )
    allocation_value: Decimal = Field(
        ...,
        description=(
            "Percentage (0-100) if percentage type, " "or dollar amount if fixed_amount"
        ),
    )
    created_at: datetime
    updated_at: datetime

    @field_validator("allocation_value")
    @classmethod
    def validate_allocation_value(cls, v: Decimal, info: ValidationInfo) -> Decimal:
        """Validate allocation value based on type.

        For percentage allocations, value must be between 0 and 100.
        For fixed amounts, value must be positive.
        """
        allocation_type = info.data.get("allocation_type")
        if allocation_type == AllocationType.PERCENTAGE:
            if v <= 0 or v > 100:
                raise ValueError("Percentage allocation must be between 0 and 100")
        elif allocation_type == AllocationType.FIXED_AMOUNT:
            if v <= 0:
                raise ValueError("Fixed amount allocation must be positive")
        return v


class PoolAllocationCreate(BaseModel):
    """DTO for creating a pool allocation."""

    source_pool_id: UUID = Field(
        ..., description="Pool being split into multiple targets"
    )
    target_pool_id: UUID = Field(
        ..., description="Destination pool receiving allocation"
    )
    allocation_type: AllocationType = Field(
        ..., description="Whether allocation is percentage or fixed amount"
    )
    allocation_value: Decimal = Field(
        ...,
        description=(
            "Percentage (0-100) if percentage type, " "or dollar amount if fixed_amount"
        ),
    )

    @field_validator("allocation_value")
    @classmethod
    def validate_allocation_value(cls, v: Decimal, info: ValidationInfo) -> Decimal:
        """Validate allocation value based on type.

        For percentage allocations, value must be between 0 and 100.
        For fixed amounts, value must be positive.
        """
        allocation_type = info.data.get("allocation_type")
        if allocation_type == AllocationType.PERCENTAGE:
            if v <= 0 or v > 100:
                raise ValueError("Percentage allocation must be between 0 and 100")
        elif allocation_type == AllocationType.FIXED_AMOUNT:
            if v <= 0:
                raise ValueError("Fixed amount allocation must be positive")
        return v


class PoolAllocationUpdate(BaseModel):
    """DTO for updating a pool allocation.

    All fields are optional for partial updates.
    """

    target_pool_id: UUID | None = Field(
        None, description="Destination pool receiving allocation"
    )
    allocation_type: AllocationType | None = Field(
        None, description="Whether allocation is percentage or fixed amount"
    )
    allocation_value: Decimal | None = Field(
        None,
        description=(
            "Percentage (0-100) if percentage type, " "or dollar amount if fixed_amount"
        ),
    )

    @field_validator("allocation_value")
    @classmethod
    def validate_allocation_value(
        cls, v: Decimal | None, info: ValidationInfo
    ) -> Decimal | None:
        """Validate allocation value based on type.

        For percentage allocations, value must be between 0 and 100.
        For fixed amounts, value must be positive.
        """
        if v is None:
            return v

        allocation_type = info.data.get("allocation_type")
        if allocation_type == AllocationType.PERCENTAGE:
            if v <= 0 or v > 100:
                raise ValueError("Percentage allocation must be between 0 and 100")
        elif allocation_type == AllocationType.FIXED_AMOUNT:
            if v <= 0:
                raise ValueError("Fixed amount allocation must be positive")
        return v


def validate_allocations_sum_to_100(
    allocations: list[PoolAllocationCreate],
) -> tuple[bool, str]:
    """Validate that percentage allocations sum to exactly 100%.

    Args:
        allocations: List of allocation DTOs to validate

    Returns:
        Tuple of (is_valid, error_message)
        - is_valid: True if allocations are valid, False otherwise
        - error_message: Empty string if valid, error description if invalid
    """
    # Filter to only percentage allocations
    percentage_allocations = [
        a for a in allocations if a.allocation_type == AllocationType.PERCENTAGE
    ]

    if not percentage_allocations:
        # No percentage allocations to validate
        return True, ""

    # Sum all percentage allocations
    total = sum(a.allocation_value for a in percentage_allocations)

    # Check if sum equals 100 (with tolerance for decimal precision)
    if abs(total - Decimal("100")) > Decimal("0.01"):
        return False, f"Percentage allocations must sum to 100%, got {total}%"

    return True, ""
