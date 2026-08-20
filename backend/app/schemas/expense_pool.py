"""ExpensePool request/response schemas for API endpoints.

These schemas define the API contract for expense pool operations.
They build on the domain models but add API-specific concerns.
"""

from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

# Re-export domain models for API use
from app.models.expense_pool import (
    ExpensePool,
    ExpensePoolSummary,
    ExpensePoolUpdate,
    ExpensePoolWithChildren,
)
from app.models.pool_allocation import (
    PoolAllocation,
    PoolAllocationCreate,
    PoolAllocationUpdate,
)
from app.models.pool_mapping import (
    PoolMapping,
    PoolMappingSummary,
    PoolMappingUpdate,
)


class ExpensePoolCreateRequest(BaseModel):
    """API schema for creating an expense pool.

    Unlike the domain ExpensePoolCreate, this doesn't require property_id
    because it's obtained from the URL path parameter.
    """

    name: str = Field(..., min_length=1, max_length=100)
    pool_type: str = Field(
        ..., description="Category: operating, tax, insurance, capital, other"
    )
    is_gross_up_applicable: bool = Field(default=True)
    gross_up_target: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
    )
    description: str | None = Field(None, max_length=500)
    parent_pool_id: UUID | None = Field(
        None, description="Parent pool ID for hierarchical grouping"
    )


# Keep ExpensePoolCreate as alias for backwards compatibility
ExpensePoolCreate = ExpensePoolCreateRequest


class ExpensePoolListResponse(BaseModel):
    """Paginated list of expense pools response.

    Used for list endpoints to provide count metadata
    alongside the pool data.
    """

    data: list[ExpensePoolWithChildren] = Field(description="List of expense pools")
    count: int = Field(ge=0, description="Total count of pools")
    has_more: bool = Field(
        default=False,
        description="Whether more pools exist beyond this page",
    )


class PoolMappingCreateRequest(BaseModel):
    """API schema for creating a pool mapping.

    Requires expense_pool_id to link the mapping to a pool.
    """

    expense_pool_id: UUID = Field(description="Expense pool to allocate to")
    gl_account_pattern: str = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Pattern to match GL accounts (e.g., '51*', '5???')",
    )
    allocation_percentage: Decimal = Field(
        default=Decimal("1.0"),
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Portion of matching entries to allocate (1.0 = 100%)",
    )
    priority: int = Field(
        default=0,
        ge=0,
        description="Higher priority patterns evaluated first",
    )


# Keep PoolMappingCreate as alias
PoolMappingCreate = PoolMappingCreateRequest


class PoolMappingListResponse(BaseModel):
    """Paginated list of pool mappings response."""

    data: list[PoolMapping] = Field(description="List of pool mappings")
    count: int = Field(ge=0, description="Total count of mappings")
    has_more: bool = Field(
        default=False,
        description="Whether more mappings exist beyond this page",
    )


# Convenience exports for type annotations
ExpensePoolResponse = ExpensePool
PoolMappingResponse = PoolMapping


class PoolAllocationCreateRequest(PoolAllocationCreate):
    """API schema for creating a pool allocation."""


PoolAllocationCreateSchema = PoolAllocationCreateRequest


class PoolAllocationListResponse(BaseModel):
    """Paginated list of pool allocations response."""

    data: list[PoolAllocation] = Field(description="List of pool allocations")
    count: int = Field(ge=0, description="Total count of allocations")
    has_more: bool = Field(
        default=False,
        description="Whether more allocations exist beyond this page",
    )


PoolAllocationResponse = PoolAllocation


__all__ = [
    # Domain models (re-exported)
    "ExpensePool",
    "ExpensePoolCreate",
    "ExpensePoolUpdate",
    "ExpensePoolSummary",
    "ExpensePoolWithChildren",
    "PoolMapping",
    "PoolMappingCreate",
    "PoolMappingUpdate",
    "PoolMappingSummary",
    "PoolAllocation",
    "PoolAllocationCreate",
    "PoolAllocationUpdate",
    # API schemas
    "ExpensePoolCreateRequest",
    "ExpensePoolResponse",
    "ExpensePoolListResponse",
    "PoolMappingCreateRequest",
    "PoolMappingResponse",
    "PoolMappingListResponse",
    "PoolAllocationCreateRequest",
    "PoolAllocationCreateSchema",
    "PoolAllocationResponse",
    "PoolAllocationListResponse",
]
