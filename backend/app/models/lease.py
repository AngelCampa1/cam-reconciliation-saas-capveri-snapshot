"""Lease domain model for tenant agreements.

The Lease model tracks tenant agreements with embedded recovery profile (JSONB)
containing all terms needed for the calculation engine.
"""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .enums import LeaseStatus
from .lease_recovery_profile import LeaseRecoveryProfile, LeaseRecoveryProfileUpdate


class Lease(BaseModel):
    """Full lease model from database.

    Contains all lease data including the embedded recovery profile
    used by the financial calculation engine.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    unit_id: UUID | None = None
    tenant_name: str = Field(..., min_length=1, max_length=255)
    start_date: date
    end_date: date
    status: LeaseStatus = Field(default=LeaseStatus.DRAFT)
    recovery_profile: LeaseRecoveryProfile
    document_url: str | None = Field(
        None, max_length=2048, description="S3 link to lease PDF"
    )
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def validate_dates(self) -> "Lease":
        """Ensure end_date is after start_date."""
        if self.end_date <= self.start_date:
            raise ValueError("End date must be after start date")
        return self


class LeaseCreate(BaseModel):
    """DTO for creating a lease.

    Requires property_id and all base fields. Unit_id is optional
    since a lease might cover multiple units or the entire property.
    """

    property_id: UUID
    unit_id: UUID | None = None
    tenant_name: str = Field(..., min_length=1, max_length=255)
    start_date: date
    end_date: date
    status: LeaseStatus = Field(default=LeaseStatus.DRAFT)
    recovery_profile: LeaseRecoveryProfile
    document_url: str | None = Field(None, max_length=2048)

    @model_validator(mode="after")
    def validate_dates(self) -> "LeaseCreate":
        """Ensure end_date is after start_date."""
        if self.end_date <= self.start_date:
            raise ValueError("End date must be after start date")
        return self


class LeaseUpdate(BaseModel):
    """DTO for updating a lease.

    All fields are optional for partial updates. Date validation
    must be checked at the service layer when merging with existing values.
    """

    tenant_name: str | None = Field(None, min_length=1, max_length=255)
    start_date: date | None = None
    end_date: date | None = None
    status: LeaseStatus | None = None
    recovery_profile: LeaseRecoveryProfileUpdate | None = None
    unit_id: UUID | None = None
    document_url: str | None = Field(None, max_length=2048)


class LeaseSummary(BaseModel):
    """Summary view of a lease for list displays.

    Contains essential fields without the full recovery profile.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    unit_id: UUID | None = None
    tenant_name: str
    start_date: date
    end_date: date
    status: LeaseStatus
