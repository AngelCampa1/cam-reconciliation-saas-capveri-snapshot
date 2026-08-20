"""Models for CapEx classification flags.

The CapExFlag stores rules-based classification results for individual GL entries.
Flags are advisory — they do not block reconciliation but surface potential
capital expenditures for human review before pool aggregation.
"""

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CapExFlag(BaseModel):
    """Full CapEx flag record from database."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    gl_entry_id: UUID
    property_id: UUID
    period_year: int = Field(..., ge=1990, le=2100)
    flag_reason: str
    rule_name: str
    confidence_score: Decimal = Field(..., ge=0, le=1)
    matched_pattern: str | None = None
    disposition: Literal["pending", "confirmed_capex", "dismissed"]
    reviewed_at: datetime | None = None
    reviewed_by_user_id: UUID | None = None
    review_note: str | None = None
    classifier_version: str = "1.0"
    created_at: datetime


class CapExFlagWithEntry(CapExFlag):
    """CapEx flag joined with GL entry details for display."""

    account_code: str
    account_description: str | None = None
    vendor_name: str | None = None
    amount: Decimal
    description: str | None = None
    transaction_date: str


class CapExReviewRequest(BaseModel):
    """Request body for reviewing a single CapEx flag."""

    disposition: Literal["confirmed_capex", "dismissed"]
    review_note: str | None = None


class CapExRunResponse(BaseModel):
    """API response returned after running CapEx classification."""

    flags_created: int = Field(..., ge=0)
    gl_entries_scanned: int = Field(..., ge=0)
    property_id: UUID
    period_year: int = Field(..., ge=1990, le=2100)


class CapExSummary(BaseModel):
    """Summary counts of CapEx flags for a property/year."""

    total: int = Field(..., ge=0)
    pending: int = Field(..., ge=0)
    confirmed_capex: int = Field(..., ge=0)
    dismissed: int = Field(..., ge=0)
    total_flagged_amount: Decimal = Field(..., ge=0)
