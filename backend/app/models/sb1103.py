"""SB 1103 Compliance domain models.

California SB 1103 (effective January 1, 2025) requires landlords to provide
Qualified Commercial Tenants (QCTs) with an itemized 18-month historical CAM
expense ledger within 30 days of a written request.

These models track compliance requests, export payloads, and deadline alerts.
"""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SB1103Request(BaseModel):
    """Full SB 1103 compliance request record from the database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    property_id: UUID
    lease_id: UUID
    requested_by_name: str = Field(..., min_length=1, max_length=255)
    requested_by_email: EmailStr = Field(..., max_length=255)
    request_date: date
    response_deadline: date
    window_start_date: date
    window_end_date: date
    status: str = Field(default="pending")
    export_format: str | None = None
    exported_at: datetime | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class SB1103RequestCreate(BaseModel):
    """Input DTO for creating a new SB 1103 compliance request.

    The API auto-computes response_deadline (request_date + 30 days),
    window_start_date (request_date - 18 calendar months), and
    window_end_date (= request_date).
    """

    property_id: UUID
    lease_id: UUID
    requested_by_name: str = Field(..., min_length=1, max_length=255)
    requested_by_email: EmailStr = Field(..., max_length=255)
    request_date: date
    notes: str | None = None


class SB1103RequestUpdate(BaseModel):
    """Partial update DTO for SB 1103 requests.

    All fields are optional — only provided fields are updated.
    """

    status: str | None = Field(
        None,
        pattern="^(pending|exported|delivered|overdue)$",
    )
    notes: str | None = None


class SB1103GLEntry(BaseModel):
    """One GL ledger row included in an SB 1103 export.

    Carries both the raw GL amount and the tenant's pro-rata share
    of that amount, computed at export time.
    """

    id: UUID
    transaction_date: date
    account_code: str
    account_description: str
    vendor_name: str | None = None
    description: str | None = None
    amount: Decimal = Field(description="Full GL entry amount")
    import_batch_id: UUID = Field(description="Audit trail link to source import batch")
    tenant_share_amount: Decimal = Field(
        description="amount × pro_rata_share (ROUND_HALF_UP)"
    )


class SB1103ExportData(BaseModel):
    """Assembled payload passed to PDF and Excel generators.

    Carries all data needed to produce a complete SB 1103 export
    without additional database queries.
    """

    request: SB1103Request
    property_address: str
    property_name: str
    tenant_name: str
    pro_rata_share: Decimal = Field(description="Lease pro-rata share (0–1)")
    gl_entries: list[SB1103GLEntry]
    category_subtotals: dict[str, Decimal] = Field(
        description="account_description → sum of tenant_share_amount"
    )
    is_ca_property: bool = Field(
        description="True when property.state == 'CA'; soft gate for SB 1103 applicability"
    )
    total_cam_expenses: Decimal = Field(description="Sum of all gl_entry amounts")
    total_tenant_share: Decimal = Field(description="Sum of all tenant_share_amounts")


class SB1103ListResponse(BaseModel):
    """Paginated list response for SB 1103 requests."""

    data: list[SB1103Request] = Field(description="List of compliance requests")
    count: int = Field(ge=0, description="Total count")
    has_more: bool = Field(default=False)


class SB1103DeadlineAlert(BaseModel):
    """Alert item for an approaching or overdue SB 1103 response deadline."""

    request_id: UUID
    property_id: UUID
    property_name: str
    tenant_name: str
    response_deadline: date
    days_remaining: int = Field(
        description="Days until deadline; negative means overdue"
    )
    status: str
