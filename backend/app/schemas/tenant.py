"""Tenant portal DTOs for dashboard and tenant-facing data.

These schemas are specifically for tenant portal views and do not expose
sensitive organization data beyond what the tenant needs to see.
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.enums import StatementStatus


class PropertySummaryDTO(BaseModel):
    """Minimal property information for tenant view."""

    id: UUID
    name: str
    address: str

    model_config = ConfigDict(from_attributes=True)


class UnitSummaryDTO(BaseModel):
    """Minimal unit information for tenant view."""

    id: UUID
    unit_number: str
    rentable_sqft: Decimal

    model_config = ConfigDict(from_attributes=True)


class LeaseDetailDTO(BaseModel):
    """Lease details for tenant dashboard."""

    id: UUID
    property: PropertySummaryDTO
    unit: UnitSummaryDTO | None = None
    start_date: date
    end_date: date
    pro_rata_share: Decimal
    base_year: int | None = None

    model_config = ConfigDict(from_attributes=True)


class StatementSummaryDTO(BaseModel):
    """Reconciliation statement summary for tenant view."""

    id: UUID
    property_name: str
    period_start: date
    period_end: date
    tenant_share: Decimal
    status: StatementStatus
    pdf_url: str | None = None
    created_at: date

    model_config = ConfigDict(from_attributes=True)


class TenantDashboardResponse(BaseModel):
    """Complete tenant dashboard data."""

    leases: list[LeaseDetailDTO]
    statements: list[StatementSummaryDTO]
    unread_notifications: int
