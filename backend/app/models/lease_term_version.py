"""Lease Term Version models for temporal versioning of recovery terms.

Each lease can have multiple term versions with effective dates.
The calculation engine looks up the version effective during the
reconciliation period, enabling accurate historical reconciliations
even after terms change.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LeaseTermVersion(BaseModel):
    """Full lease term version from database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    lease_id: UUID
    version_number: int = Field(ge=1)
    effective_date: date

    # Recovery profile fields
    base_year: int | None = Field(None, ge=1990, le=2100)
    base_year_amount: Decimal | None = Field(None, ge=Decimal("0"))
    gross_up_base_year: bool = False
    pro_rata_share: Decimal = Field(..., ge=Decimal("0"), le=Decimal("1"))
    cap_type: str = Field(default="none")
    cap_rate: Decimal | None = Field(None, ge=Decimal("0"), le=Decimal("1"))
    admin_fee_percentage: Decimal = Field(
        default=Decimal("0"), ge=Decimal("0"), le=Decimal("0.20")
    )
    management_fee_percentage: Decimal | None = Field(
        default=None, ge=Decimal("0"), le=Decimal("0.20")
    )
    excluded_pools: list[str] = Field(default_factory=list)
    rsf_measurement_standard: str | None = None
    rsf_measurement_date: date | None = None

    # Amendment metadata
    amendment_reason: str | None = None
    amendment_document_url: str | None = Field(None, max_length=2048)

    # Audit
    created_by: UUID | None = None
    created_at: datetime

    @model_validator(mode="after")
    def validate_cap_rate_required(self) -> "LeaseTermVersion":
        """cap_rate must be provided when cap_type is not 'none'."""
        if self.cap_type != "none" and self.cap_rate is None:
            raise ValueError("cap_rate is required when cap_type is not none")
        return self


class LeaseTermVersionCreate(BaseModel):
    """DTO for creating a new term version (amendment)."""

    effective_date: date
    base_year: int | None = Field(None, ge=1990, le=2100)
    base_year_amount: Decimal | None = Field(None, ge=Decimal("0"))
    gross_up_base_year: bool = False
    pro_rata_share: Decimal = Field(..., ge=Decimal("0"), le=Decimal("1"))
    cap_type: str = Field(default="none")
    cap_rate: Decimal | None = Field(None, ge=Decimal("0"), le=Decimal("1"))
    admin_fee_percentage: Decimal = Field(
        default=Decimal("0"), ge=Decimal("0"), le=Decimal("0.20")
    )
    management_fee_percentage: Decimal | None = Field(
        default=None, ge=Decimal("0"), le=Decimal("0.20")
    )
    excluded_pools: list[str] = Field(default_factory=list)
    rsf_measurement_standard: str | None = None
    rsf_measurement_date: date | None = None
    amendment_reason: str | None = None
    amendment_document_url: str | None = Field(None, max_length=2048)

    @model_validator(mode="after")
    def validate_cap_rate_required(self) -> "LeaseTermVersionCreate":
        """cap_rate must be provided when cap_type is not 'none'."""
        if self.cap_type != "none" and self.cap_rate is None:
            raise ValueError("cap_rate is required when cap_type is not none")
        return self


class LeaseTermVersionSummary(BaseModel):
    """Lightweight model for timeline display."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    version_number: int
    effective_date: date
    pro_rata_share: Decimal
    cap_type: str
    amendment_reason: str | None = None
    created_at: datetime
