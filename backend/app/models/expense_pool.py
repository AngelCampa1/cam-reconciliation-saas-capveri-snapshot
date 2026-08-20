"""ExpensePool domain model for expense categorization.

The ExpensePool model configures expense buckets for each property,
determining how GL entries are categorized and whether gross-up
rules apply to the pool.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ExpensePool(BaseModel):
    """Full expense pool model from database.

    Expense pools categorize GL entries and define gross-up behavior
    for expense recovery calculations.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID = Field(description="Property this pool belongs to")
    name: str = Field(..., min_length=1, max_length=100, description="Pool name")
    pool_type: str = Field(
        ..., description="Category: operating, tax, insurance, capital, other"
    )
    is_gross_up_applicable: bool = Field(
        default=True, description="Whether gross-up applies to this pool"
    )
    gross_up_target: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Target occupancy for gross-up (e.g., 0.95)",
    )
    description: str | None = Field(None, max_length=500)
    parent_pool_id: UUID | None = Field(
        None, description="Parent pool for hierarchical grouping (max 2 levels)"
    )
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def validate_gross_up_target(self) -> "ExpensePool":
        """Validate gross_up_target is set when gross-up is applicable."""
        if self.is_gross_up_applicable and self.gross_up_target is None:
            # Allow None for now - target can be inherited from property default
            pass
        if not self.is_gross_up_applicable and self.gross_up_target is not None:
            # Clear gross_up_target if gross-up not applicable
            object.__setattr__(self, "gross_up_target", None)
        return self


class ExpensePoolCreate(BaseModel):
    """DTO for creating an expense pool.

    Used when setting up expense categorization for a property.
    """

    property_id: UUID
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

    @model_validator(mode="after")
    def validate_gross_up_target(self) -> "ExpensePoolCreate":
        """Validate gross_up_target constraints."""
        if not self.is_gross_up_applicable and self.gross_up_target is not None:
            raise ValueError(
                "gross_up_target should not be set when is_gross_up_applicable is False"
            )
        return self


class ExpensePoolUpdate(BaseModel):
    """DTO for updating an expense pool.

    All fields are optional for partial updates.
    """

    name: str | None = Field(None, min_length=1, max_length=100)
    pool_type: str | None = None
    is_gross_up_applicable: bool | None = None
    gross_up_target: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
    )
    description: str | None = Field(None, max_length=500)
    parent_pool_id: UUID | None = Field(None, description="Parent pool ID")


class ExpensePoolSummary(BaseModel):
    """Summary view of an expense pool for list displays.

    Includes essential fields and aggregated totals.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    name: str
    pool_type: str
    is_gross_up_applicable: bool
    total_amount: Decimal | None = Field(
        None, description="Sum of all GL entries in this pool"
    )
    entry_count: int = Field(default=0, ge=0, description="Number of GL entries")


class ExpensePoolWithChildren(BaseModel):
    """Expense pool with nested children for hierarchical display.

    Used for tree structure API responses showing parent-child relationships.
    Maximum depth: 2 levels (parent → child only).
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    name: str = Field(..., min_length=1, max_length=100)
    pool_type: str
    is_gross_up_applicable: bool
    gross_up_target: Decimal | None = None
    description: str | None = None
    parent_pool_id: UUID | None = None
    created_at: datetime
    updated_at: datetime
    children: list["ExpensePoolWithChildren"] = Field(
        default_factory=list,
        description="Child pools (empty for leaf nodes)",
    )
    total_amount: Decimal | None = Field(
        None, description="Sum of pool expenses including children roll-up"
    )

    @property
    def is_parent(self) -> bool:
        """Check if this pool has children."""
        return len(self.children) > 0

    @property
    def is_child(self) -> bool:
        """Check if this pool has a parent."""
        return self.parent_pool_id is not None
