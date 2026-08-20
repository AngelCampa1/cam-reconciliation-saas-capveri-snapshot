"""
Calculation job models for async reconciliation calculations.

These models track the status of long-running reconciliation calculations
and provide job status polling capabilities.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import CalculationJobStatus


class CalculationJobCreate(BaseModel):
    """Request to create a new calculation job."""

    property_id: UUID = Field(
        ..., description="Property to calculate reconciliation for"
    )
    period_start: date = Field(..., description="Start date of reconciliation period")
    period_end: date = Field(..., description="End date of reconciliation period")
    force_recalculate: bool = Field(
        default=False,
        description="If true, delete existing draft snapshots and recalculate",
    )

    @model_validator(mode="after")
    def validate_period(self) -> "CalculationJobCreate":
        """Ensure period_end is after period_start."""
        if self.period_end <= self.period_start:
            raise ValueError("period_end must be after period_start")
        return self


class CalculationJob(BaseModel):
    """Calculation job with current status and results."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    property_id: UUID
    period_start: date
    period_end: date
    status: CalculationJobStatus
    force_recalculate: bool

    # Progress tracking
    total_leases: int | None = Field(
        None, description="Total number of leases to process"
    )
    processed_leases: int = Field(0, description="Number of leases processed so far")

    # Results
    snapshot_ids: list[UUID] = Field(
        default_factory=list,
        description="IDs of created reconciliation snapshots",
    )

    # Error tracking
    error_message: str | None = Field(None, description="Error message if job failed")
    error_details: dict[str, Any] | None = Field(
        None,
        description="Detailed error information",
    )

    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None


class CalculationJobSummary(BaseModel):
    """Summary view of a calculation job."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    period_start: date
    period_end: date
    status: CalculationJobStatus
    total_leases: int | None = None
    processed_leases: int = 0
    snapshot_ids: list[UUID] = Field(default_factory=list)
    error_message: str | None = None
    created_at: datetime
    completed_at: datetime | None = None


class CalculationJobResponse(BaseModel):
    """Response after submitting a calculation request."""

    job_id: UUID = Field(..., description="ID to use for polling job status")
    status: CalculationJobStatus
    message: str = Field(..., description="Human-readable status message")


class CalculationJobStatusResponse(BaseModel):
    """Response for job status polling."""

    job_id: UUID
    status: CalculationJobStatus
    property_id: UUID
    period_start: date
    period_end: date

    # Progress
    total_leases: int | None = None
    processed_leases: int = 0
    progress_percentage: int | None = Field(
        None,
        description="Progress as percentage (0-100)",
    )

    # Results (only present when status is COMPLETED)
    snapshot_ids: list[UUID] = Field(default_factory=list)

    # Error info (only present when status is FAILED)
    error_message: str | None = None

    # Recovery summary (only present when status is COMPLETED)
    potential_recovery_total: Decimal | None = Field(
        None,
        description=(
            "Sum of total_recovery across all tenant snapshots" " (completed jobs only)"
        ),
    )

    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None

    @model_validator(mode="after")
    def calculate_progress(self) -> "CalculationJobStatusResponse":
        """Calculate progress percentage if total_leases is known."""
        if self.total_leases and self.total_leases > 0:
            self.progress_percentage = int(
                (self.processed_leases / self.total_leases) * 100
            )
        return self


def is_terminal_status(status: CalculationJobStatus) -> bool:
    """Check if a job status is terminal (won't change anymore)."""
    return status in (CalculationJobStatus.COMPLETED, CalculationJobStatus.FAILED)
