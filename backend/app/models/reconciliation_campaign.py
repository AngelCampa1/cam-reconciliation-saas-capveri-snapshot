"""Pydantic models for reconciliation campaigns."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.enums import CampaignStatus


class ReconciliationCampaign(BaseModel):
    """Full campaign model — maps to reconciliation_campaigns table."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    property_id: UUID
    period_year: int
    status: CampaignStatus = CampaignStatus.DRAFT

    finalized_at: datetime | None = None
    finalized_by_user_id: UUID | None = None
    submitted_for_review_at: datetime | None = None
    submitted_for_review_by_user_id: UUID | None = None
    approved_at: datetime | None = None
    approved_by_user_id: UUID | None = None
    sent_at: datetime | None = None
    sent_by_user_id: UUID | None = None

    created_at: datetime
    updated_at: datetime


class ReconciliationCampaignSummary(BaseModel):
    """Summary model for list views.

    Includes joined property name and snapshot aggregates.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    property_name: str
    period_year: int
    status: CampaignStatus
    tenant_count: int
    finalized_tenant_count: int
    total_recovery: Decimal

    finalized_at: datetime | None = None
    submitted_for_review_at: datetime | None = None
    approved_at: datetime | None = None
    sent_at: datetime | None = None
    updated_at: datetime
