"""LeaseRecoveryProfile domain type for lease recovery terms.

This Pydantic model represents the "Financial DNA" extracted from lease
documents. It is stored as JSONB in the leases table and contains all
the terms needed for the calculation engine to compute tenant recoveries.
"""

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .enums import AccountingBasis, BomaStandardVersion, CapType, PoolType


class BaseYearAdjustmentItem(BaseModel):
    """An imputed cost added to the base year to account for a service
    introduced after the base year. Multiple items are additive."""

    service_name: str
    imputed_amount: Decimal
    justification: str

    @field_validator("service_name")
    @classmethod
    def service_name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("service_name cannot be empty")
        return v

    @field_validator("imputed_amount")
    @classmethod
    def amount_non_negative(cls, v: Decimal) -> Decimal:
        if v < Decimal("0"):
            raise ValueError("imputed_amount must be >= 0")
        return v


class LeaseRecoveryProfile(BaseModel):
    """Recovery terms for a lease - stored as JSONB in the leases table.

    This is the 'Financial DNA' extracted from lease documents containing
    all terms needed to calculate tenant expense recoveries.
    """

    model_config = ConfigDict(from_attributes=True)

    # Base Year Terms
    base_year: int | None = Field(
        None,
        ge=1990,
        le=2100,
        description="Base year for expense stop calculation",
    )
    base_year_amount: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        description="Frozen base year expense amount (if pre-calculated)",
    )
    gross_up_base_year: bool = Field(
        default=False,
        description="Whether to gross-up base year if occupancy < 95%",
    )

    # Tenant Share
    pro_rata_share: Decimal = Field(
        ...,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Tenant's percentage share (e.g., 0.05 for 5%)",
    )

    # Cap Terms
    cap_type: CapType = Field(
        default=CapType.NONE,
        description="Type of cap applied to recoveries",
    )
    cap_rate: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("1"),
        description="Cap rate as decimal (e.g., 0.05 for 5%)",
    )

    # Admin Fee
    admin_fee_percentage: Decimal = Field(
        default=Decimal("0"),
        ge=Decimal("0"),
        le=Decimal("0.20"),
        description="Admin fee as decimal (e.g., 0.15 for 15%)",
    )

    # Management Fee (distinct from admin fee)
    management_fee_percentage: Decimal | None = Field(
        default=None,
        ge=Decimal("0"),
        le=Decimal("0.20"),
        description=(
            "Management fee as decimal (e.g., 0.04 for 4%), distinct from admin "
            "fee. None when no management fee cap is found."
        ),
    )

    # Exclusions
    excluded_pools: list[PoolType] = Field(
        default_factory=list,
        description="Expense pools excluded from this tenant's recovery",
    )

    # BOMA 2024 RSF measurement provenance
    rsf_measurement_standard: BomaStandardVersion | None = Field(
        default=None,
        description="BOMA standard used to derive this tenant's pro_rata_share",
    )
    rsf_measurement_date: date | None = Field(
        default=None,
        description="Date the tenant's RSF was certified for pro-rata calculation",
    )

    # Accounting basis
    accounting_basis: AccountingBasis | None = Field(
        default=None,
        description=(
            "Cash or accrual basis for GL date filtering. "
            "Null defaults to cash with warning."
        ),
    )

    # New-service base year adjustments
    base_year_adjustments: list[BaseYearAdjustmentItem] = Field(
        default_factory=list,
        description=(
            "Imputed costs for services introduced after the base year; "
            "added to base_year_amount before computing the increase"
        ),
    )

    @model_validator(mode="after")
    def validate_cap_rate_required(self) -> "LeaseRecoveryProfile":
        """Ensure cap_rate is provided when cap_type is not NONE."""
        if self.cap_type != CapType.NONE and self.cap_rate is None:
            raise ValueError("cap_rate is required when cap_type is not none")
        return self


class LeaseRecoveryProfileCreate(BaseModel):
    """DTO for creating/updating lease recovery profile.

    All fields except pro_rata_share are optional with sensible defaults.
    """

    # Base Year Terms
    base_year: int | None = Field(
        None,
        ge=1990,
        le=2100,
    )
    base_year_amount: Decimal | None = Field(None, ge=Decimal("0"))
    gross_up_base_year: bool = Field(default=False)

    # Tenant Share (required)
    pro_rata_share: Decimal = Field(..., ge=Decimal("0"), le=Decimal("1"))

    # Cap Terms
    cap_type: CapType = Field(default=CapType.NONE)
    cap_rate: Decimal | None = Field(None, ge=Decimal("0"), le=Decimal("1"))

    # Admin Fee
    admin_fee_percentage: Decimal = Field(
        default=Decimal("0"),
        ge=Decimal("0"),
        le=Decimal("0.20"),
    )

    # Management Fee (distinct from admin fee)
    management_fee_percentage: Decimal | None = Field(
        default=None,
        ge=Decimal("0"),
        le=Decimal("0.20"),
    )

    # Exclusions
    excluded_pools: list[PoolType] = Field(default_factory=list)

    # BOMA 2024 RSF measurement provenance
    rsf_measurement_standard: BomaStandardVersion | None = Field(default=None)
    rsf_measurement_date: date | None = Field(default=None)

    # Accounting basis
    accounting_basis: AccountingBasis | None = Field(default=None)

    # New-service base year adjustments
    base_year_adjustments: list[BaseYearAdjustmentItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_cap_rate_required(self) -> "LeaseRecoveryProfileCreate":
        """Ensure cap_rate is provided when cap_type is not NONE."""
        if self.cap_type != CapType.NONE and self.cap_rate is None:
            raise ValueError("cap_rate is required when cap_type is not none")
        return self


class LeaseRecoveryProfileUpdate(BaseModel):
    """DTO for partial update of lease recovery profile.

    All fields are optional. Cross-field validation (cap_rate requirement)
    must be checked at the service layer when merging with existing values.
    """

    base_year: int | None = Field(None, ge=1990, le=2100)
    base_year_amount: Decimal | None = Field(None, ge=Decimal("0"))
    gross_up_base_year: bool | None = None
    pro_rata_share: Decimal | None = Field(None, ge=Decimal("0"), le=Decimal("1"))
    cap_type: CapType | None = None
    cap_rate: Decimal | None = Field(None, ge=Decimal("0"), le=Decimal("1"))
    admin_fee_percentage: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("0.20"),
    )
    management_fee_percentage: Decimal | None = Field(
        None,
        ge=Decimal("0"),
        le=Decimal("0.20"),
    )
    excluded_pools: list[PoolType] | None = None
    rsf_measurement_standard: BomaStandardVersion | None = None
    rsf_measurement_date: date | None = None
    accounting_basis: AccountingBasis | None = None
    base_year_adjustments: list[BaseYearAdjustmentItem] | None = None
