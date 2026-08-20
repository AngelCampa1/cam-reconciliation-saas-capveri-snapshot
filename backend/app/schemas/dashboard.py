"""
Dashboard schemas for landlord dashboard API.

Provides DTOs for the dashboard summary endpoint including
activity items, alerts, and aggregate counts.
"""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field


class ActivityItem(BaseModel):
    """Represents a recent activity item on the dashboard."""

    id: UUID
    type: (
        str  # 'property', 'lease', 'upload', 'verification', 'reconciliation', 'export'
    )
    title: str
    description: str
    timestamp: datetime
    href: str  # Link to relevant page


class AlertItem(BaseModel):
    """Represents an alert or action item on the dashboard."""

    id: str
    type: Literal["warning", "info", "action"]
    title: str
    description: str
    href: str
    count: int | None = None  # Optional count badge


class PropertySummary(BaseModel):
    """Summary of a property for dashboard display."""

    id: UUID
    name: str
    unit_count: int = Field(ge=0)
    last_reconciliation: str | None = None  # Formatted date string


class DashboardSummary(BaseModel):
    """Dashboard summary response containing counts, activity, and alerts."""

    # Entity counts
    property_count: int = Field(ge=0)
    unit_count: int = Field(ge=0)
    lease_count: int = Field(ge=0)
    gl_entry_count: int = Field(ge=0)

    # Pending items
    pending_reconciliations: int = Field(ge=0)
    pending_verifications: int = Field(ge=0)

    # Recent properties (up to 5)
    recent_properties: list[PropertySummary] = Field(default_factory=list)

    # Recent activity (last 10 items)
    recent_activity: list[ActivityItem] = Field(default_factory=list)

    # ROI metrics
    total_recovery_finalized: Decimal = Field(default=Decimal("0"))

    # Alerts/action items
    alerts: list[AlertItem] = Field(default_factory=list)
