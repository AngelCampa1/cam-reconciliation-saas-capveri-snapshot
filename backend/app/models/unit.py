"""Unit domain types for individual spaces within properties.

These Pydantic models represent units/suites within commercial buildings.
Unit numbers are unique within a property but not globally unique.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .enums import SpaceType, UnitStatus


class UnitBase(BaseModel):
    """Base fields for Unit shared by create and response schemas.

    Includes validation for area fields and cross-field validation
    ensuring usable sqft does not exceed rentable sqft.
    """

    unit_number: str = Field(..., min_length=1, max_length=50)
    rentable_sqft: Decimal = Field(..., gt=Decimal("0"))
    usable_sqft: Decimal = Field(..., gt=Decimal("0"))
    floor: int | None = Field(None, ge=0)
    status: UnitStatus = Field(default=UnitStatus.VACANT)
    space_type: SpaceType = Field(
        default=SpaceType.OFFICE,
        description="BOMA 2024 space classification — NATA types: zero load factor",
    )

    @model_validator(mode="after")
    def validate_area_relationships(self) -> "UnitBase":
        """Ensure usable sqft does not exceed rentable sqft."""
        if self.usable_sqft > self.rentable_sqft:
            raise ValueError(
                f"Usable sqft ({self.usable_sqft}) cannot exceed "
                f"rentable sqft ({self.rentable_sqft})"
            )
        return self


class UnitCreate(UnitBase):
    """DTO for creating a new unit.

    Requires property_id to link unit to parent property.
    Status defaults to VACANT if not specified.
    """

    property_id: UUID


class UnitUpdate(BaseModel):
    """DTO for updating an existing unit.

    All fields are optional; only provided fields will be updated.
    Note: Cross-field validation (usable <= rentable) must be checked
    at the service layer when combining with existing values.
    """

    unit_number: str | None = Field(None, min_length=1, max_length=50)
    rentable_sqft: Decimal | None = Field(None, gt=Decimal("0"))
    usable_sqft: Decimal | None = Field(None, gt=Decimal("0"))
    floor: int | None = Field(None, ge=0)
    status: UnitStatus | None = None
    space_type: SpaceType | None = None


class Unit(UnitBase):
    """Full unit model returned from database.

    Includes all base fields plus database-generated fields.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    created_at: datetime
    updated_at: datetime


class UnitSummary(BaseModel):
    """Lightweight unit summary for list views.

    Contains only essential fields for display in unit lists.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    unit_number: str
    rentable_sqft: Decimal
    status: UnitStatus
