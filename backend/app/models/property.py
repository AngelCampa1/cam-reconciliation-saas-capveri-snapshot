"""Property domain models for commercial real estate buildings.

Properties represent commercial buildings with BOMA-compliant area
measurements. Each property belongs to an organization and contains
units that are leased to tenants.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .enums import BomaStandardVersion


class PropertyBase(BaseModel):
    """Base fields for Property.

    Contains address information and BOMA-compliant area measurements
    required for accurate expense allocation calculations.
    """

    name: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="Property display name",
    )
    address_line1: str = Field(
        ...,
        max_length=255,
        description="Street address",
    )
    address_line2: str | None = Field(
        None,
        max_length=255,
        description="Suite, floor, or additional address info",
    )
    city: str = Field(
        ...,
        max_length=100,
        description="City name",
    )
    state: str = Field(
        ...,
        min_length=2,
        max_length=2,
        description="US state code (e.g., 'CA', 'NY')",
    )
    postal_code: str = Field(
        ...,
        max_length=20,
        description="ZIP or postal code",
    )

    # BOMA area fields
    total_rentable_sqft: Decimal = Field(
        ...,
        gt=Decimal("0"),
        description="Total rentable square footage per BOMA standards",
    )
    total_usable_sqft: Decimal = Field(
        ...,
        gt=Decimal("0"),
        description="Total usable square footage per BOMA standards",
    )
    common_area_sqft: Decimal = Field(
        ...,
        ge=Decimal("0"),
        description="Common area square footage (lobbies, restrooms, etc.)",
    )
    target_occupancy: Decimal = Field(
        default=Decimal("0.95"),
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Target occupancy rate for gross-up calculations (0.0-1.0)",
    )

    # BOMA 2024 compliance fields
    boma_standard_version: BomaStandardVersion = Field(
        default=BomaStandardVersion.V2024,
        description="BOMA Office Standard version used for area calculations",
    )
    rsf_measurement_date: date | None = Field(
        default=None,
        description="Date building RSF was last certified under the BOMA standard",
    )

    # Fiscal year
    fiscal_year_start_month: int = Field(
        default=1,
        ge=1,
        le=12,
        description="Month (1-12) when the fiscal year begins. 1 = calendar year.",
    )

    # Tax protest configuration
    # Defined on the base so they are accepted on create and returned on read,
    # not only on update (see PropertyUpdate). Both are optional/nullable.
    tax_protest_county: str | None = Field(
        default=None,
        max_length=255,
        description="County name for tax protest deadline lookup (e.g. 'Harris')",
    )
    tax_protest_deadline_override: date | None = Field(
        default=None,
        description="Optional per-property override for the tax protest deadline",
    )

    @model_validator(mode="after")
    def validate_area_relationships(self) -> "PropertyBase":
        """Validate BOMA area relationships.

        Ensures usable square footage does not exceed rentable square footage.
        This is a fundamental BOMA constraint.
        """
        if self.total_usable_sqft > self.total_rentable_sqft:
            raise ValueError(
                f"Usable sqft ({self.total_usable_sqft}) cannot exceed "
                f"rentable sqft ({self.total_rentable_sqft})"
            )
        return self


class PropertyCreate(PropertyBase):
    """DTO for creating a property.

    Inherits all base fields. ID, organization_id, and timestamps
    are set by the system.
    """

    pass


class PropertyUpdate(BaseModel):
    """DTO for updating a property (all fields optional).

    Only provided fields will be updated; others remain unchanged.
    Note: Area validations are checked at the service layer when
    combining with existing values.
    """

    name: str | None = Field(
        None,
        min_length=1,
        max_length=255,
        description="Property display name",
    )
    address_line1: str | None = Field(
        None,
        max_length=255,
        description="Street address",
    )
    address_line2: str | None = Field(
        None,
        max_length=255,
        description="Suite, floor, or additional address info",
    )
    city: str | None = Field(
        None,
        max_length=100,
        description="City name",
    )
    state: str | None = Field(
        None,
        min_length=2,
        max_length=2,
        description="US state code (e.g., 'CA', 'NY')",
    )
    postal_code: str | None = Field(
        None,
        max_length=20,
        description="ZIP or postal code",
    )
    total_rentable_sqft: Decimal | None = Field(
        None,
        gt=Decimal("0"),
        description="Total rentable square footage",
    )
    total_usable_sqft: Decimal | None = Field(
        None,
        gt=Decimal("0"),
        description="Total usable square footage",
    )
    common_area_sqft: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        description="Common area square footage",
    )
    target_occupancy: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Target occupancy rate (0.0-1.0)",
    )
    boma_standard_version: BomaStandardVersion | None = Field(
        None,
        description="BOMA Office Standard version used for area calculations",
    )
    rsf_measurement_date: date | None = Field(
        None,
        description="Date building RSF was last certified",
    )
    fiscal_year_start_month: int | None = Field(
        None,
        ge=1,
        le=12,
        description="Month (1-12) when the fiscal year begins",
    )
    tax_protest_county: str | None = Field(
        None,
        max_length=255,
        description="County name for tax protest deadline lookup (e.g. 'Harris')",
    )
    tax_protest_deadline_override: date | None = Field(
        None,
        description="Optional per-property override for the tax protest deadline",
    )


class Property(PropertyBase):
    """Full property model from database.

    Includes all base fields plus database-generated fields.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique property identifier")
    organization_id: UUID = Field(description="Organization this property belongs to")
    created_at: datetime = Field(description="When property was created")
    updated_at: datetime = Field(description="When property was last modified")


class PropertySummary(BaseModel):
    """Lightweight property summary for list views.

    Contains only essential fields for display in property lists.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique property identifier")
    name: str = Field(description="Property display name")
    city: str = Field(description="City name")
    state: str = Field(description="US state code")
    total_rentable_sqft: Decimal = Field(description="Total rentable square footage")
