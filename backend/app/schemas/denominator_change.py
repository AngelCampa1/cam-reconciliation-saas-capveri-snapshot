"""Request/response schemas for denominator change analysis API."""

from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class DenominatorChangeRequest(BaseModel):
    """Request model for denominator change analysis."""

    property_id: UUID = Field(description="Property to analyze")
    current_period_start: date = Field(description="Start of current period")
    current_period_end: date = Field(description="End of current period")
    prior_period_start: date | None = Field(
        None, description="Start of prior period (auto-detect if omitted)"
    )
    prior_period_end: date | None = Field(
        None, description="End of prior period (auto-detect if omitted)"
    )
    prior_total_rsf: Decimal | None = Field(
        None, description="Prior period total RSF (uses property value if omitted)"
    )
    current_total_rsf: Decimal | None = Field(
        None, description="Current period total RSF (uses property value if omitted)"
    )


class DenominatorChangePdfRequest(DenominatorChangeRequest):
    """Request model for denominator change PDF report.

    Identical to DenominatorChangeRequest — separate class for API schema clarity.
    """

    pass
