"""
ReconciliationSnapshot domain types for CAM reconciliation results.

These Pydantic models represent immutable snapshots of reconciliation
calculations. Once finalized, snapshots cannot be modified to ensure
audit trail integrity.
"""

import base64
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from app.models.enums import ReconciliationStatus
from app.services.formatting import format_usd


class ReconciliationSnapshot(BaseModel):
    """
    Full ReconciliationSnapshot model from database.

    Represents an immutable snapshot of CAM reconciliation calculations
    for a specific lease and time period. Contains all calculated values
    and a trace of calculation steps for audit purposes.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID = Field(description="Property this reconciliation belongs to")
    lease_id: UUID = Field(description="Lease this reconciliation is for")
    period_start_date: date = Field(description="Start of reconciliation period")
    period_end_date: date = Field(description="End of reconciliation period")
    status: ReconciliationStatus = Field(
        default=ReconciliationStatus.DRAFT,
        description="Current status of the reconciliation",
    )

    # Calculated financial values (all stored as Decimal for precision)
    total_operating_expenses: Decimal = Field(
        ...,
        description="Total operating expenses for the period",
    )
    grossed_up_expenses: Decimal = Field(
        ...,
        description="Expenses after gross-up adjustment for occupancy",
    )
    base_year_amount: Decimal = Field(
        ...,
        description="Base year expense amount for comparison",
    )
    tenant_share_before_cap: Decimal = Field(
        ...,
        description="Tenant's share of expenses before cap applied",
    )
    tenant_share_after_cap: Decimal = Field(
        ...,
        description="Tenant's share of expenses after cap applied",
    )
    admin_fee: Decimal = Field(
        ...,
        description="Administrative fee amount",
    )
    total_recovery: Decimal = Field(
        ...,
        description="Total amount recoverable from tenant",
    )

    # Audit trail - calculation steps stored as JSONB
    # Will be typed as list[CalculationStep] once Story 2.12 is implemented
    calculation_trace: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Ordered list of calculation steps for audit trail",
    )

    # Layer-faithful per-pool recovery split (Module A "Produce"), stored as JSONB.
    # Each element mirrors the calculation engine's PoolRecovery. NULL means the
    # snapshot has no per-pool breakdown (no pool input, or a cap reduced the share
    # but pool classification was unavailable so the breakdown was withheld). When
    # present, per-pool amounts reconcile exactly to total_recovery.
    pool_breakdowns: list[dict[str, Any]] | None = Field(
        None,
        description=(
            "Per-pool recovery split; reconciles exactly to total_recovery. "
            "Money values are JSON strings on read (JSONB convention) — parse "
            "to Decimal before any arithmetic."
        ),
    )

    # Lease term versioning — frozen terms for audit
    lease_terms_snapshot: dict[str, Any] | None = Field(
        None,
        description="Frozen copy of LeaseTerms used at calculation time",
    )
    term_version_id: UUID | None = Field(
        None,
        description="Which term version was effective when this reconciliation ran",
    )

    # Finalization tracking
    finalized_at: datetime | None = Field(
        None,
        description="When the snapshot was finalized",
    )
    finalized_by_user_id: UUID | None = Field(
        None,
        description="User who finalized the snapshot",
    )

    created_at: datetime
    updated_at: datetime

    # Computed field: is_finalized (derived from status)
    # Needed for backward compatibility with tests and API responses
    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_finalized(self) -> bool:
        """Check if this snapshot has been finalized."""
        return self.status == ReconciliationStatus.FINALIZED

    # Computed field: tenant_shares breakdown
    @computed_field  # type: ignore[prop-decorator]
    @property
    def tenant_shares(self) -> dict[str, Decimal]:
        """
        Build tenant shares breakdown from snapshot fields.

        Returns:
            Dictionary with all financial components of the tenant's share calculation
        """
        shares: dict[str, Decimal] = {
            "total_operating_expenses": self.total_operating_expenses,
            "grossed_up_expenses": self.grossed_up_expenses,
            "tenant_share_before_cap": self.tenant_share_before_cap,
            "tenant_share_after_cap": self.tenant_share_after_cap,
            "admin_fee": self.admin_fee,
            "total_recovery": self.total_recovery,
        }

        # Add base year if applicable
        if self.base_year_amount and self.base_year_amount > Decimal("0"):
            shares["base_year_impact"] = self.base_year_amount

        # Calculate cap savings if cap was applied
        if self.tenant_share_before_cap != self.tenant_share_after_cap:
            shares["cap_savings"] = (
                self.tenant_share_before_cap - self.tenant_share_after_cap
            )

        return shares

    @model_validator(mode="after")
    def validate_finalization_consistency(self) -> "ReconciliationSnapshot":
        """Ensure finalization fields are consistent with status."""
        if self.status == ReconciliationStatus.FINALIZED:
            if self.finalized_at is None:
                raise ValueError("finalized_at must be set when status is FINALIZED")
        return self


class ReconciliationSnapshotCreate(BaseModel):
    """
    DTO for creating a reconciliation snapshot.

    Requires property_id, lease_id, period dates, and all calculated values.
    """

    property_id: UUID
    lease_id: UUID
    period_start_date: date = Field(description="Start of reconciliation period")
    period_end_date: date = Field(description="End of reconciliation period")
    status: ReconciliationStatus = Field(
        default=ReconciliationStatus.DRAFT,
        description="Initial status (usually DRAFT)",
    )

    # All calculated values are required
    total_operating_expenses: Decimal = Field(...)
    grossed_up_expenses: Decimal = Field(...)
    base_year_amount: Decimal = Field(...)
    tenant_share_before_cap: Decimal = Field(...)
    tenant_share_after_cap: Decimal = Field(...)
    admin_fee: Decimal = Field(...)
    total_recovery: Decimal = Field(...)

    # Calculation trace for audit
    calculation_trace: list[dict[str, Any]] = Field(default_factory=list)

    # Provenance: engine version + deterministic SHA-256 trace checksum.
    # Stored for audit trail integrity; both fields are required on all snapshots.
    engine_version: str | None = None
    trace_checksum: str | None = None

    # Per-pool recovery split (Module A "Produce"). None = aggregate-only snapshot.
    pool_breakdowns: list[dict[str, Any]] | None = None

    # Lease term versioning
    lease_terms_snapshot: dict[str, Any] | None = None
    term_version_id: UUID | None = None

    @model_validator(mode="after")
    def validate_period_dates(self) -> "ReconciliationSnapshotCreate":
        """Ensure period_end_date is after period_start_date."""
        if self.period_end_date <= self.period_start_date:
            raise ValueError("period_end_date must be after period_start_date")
        return self


class ReconciliationSnapshotUpdate(BaseModel):
    """
    DTO for updating a reconciliation snapshot.

    Only allows updating non-finalized snapshots. Status can be changed
    to FINALIZED, but not back to DRAFT once finalized.
    """

    status: ReconciliationStatus | None = None

    # Calculated values can be updated if not finalized
    total_operating_expenses: Decimal | None = None
    grossed_up_expenses: Decimal | None = None
    base_year_amount: Decimal | None = None
    tenant_share_before_cap: Decimal | None = None
    tenant_share_after_cap: Decimal | None = None
    admin_fee: Decimal | None = None
    total_recovery: Decimal | None = None

    # Calculation trace can be updated
    calculation_trace: list[dict[str, Any]] | None = None


class ReconciliationSnapshotFinalize(BaseModel):
    """
    DTO for finalizing a reconciliation snapshot.

    Once finalized, the snapshot becomes immutable.
    """

    finalized_by_user_id: UUID = Field(
        ...,
        description="User performing the finalization",
    )


class FinalizeSnapshotResponse(BaseModel):
    """Response after finalizing a single snapshot."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: ReconciliationStatus
    is_finalized: bool
    finalized_at: datetime
    finalized_by_user_id: UUID
    message: str = Field(
        default="Snapshot finalized successfully",
        description="Success message",
    )


class BatchFinalizeRequest(BaseModel):
    """Request to finalize all draft snapshots for a property and period."""

    property_id: UUID
    period_start: date
    period_end: date


class BatchFinalizeResult(BaseModel):
    """Result for a single snapshot in batch finalization."""

    snapshot_id: UUID
    success: bool
    error_message: str | None = None


class BatchFinalizeResponse(BaseModel):
    """Response after batch finalization."""

    total_attempted: int
    total_succeeded: int
    total_failed: int
    results: list[BatchFinalizeResult]
    message: str


class VarianceItem(BaseModel):
    """Individual field variance in comparison."""

    field_name: str = Field(description="Name of the field being compared")
    current_value: Decimal = Field(description="Current period value")
    prior_value: Decimal = Field(description="Prior period value")
    variance_amount: Decimal = Field(description="Absolute variance (current - prior)")
    variance_percent: Decimal = Field(description="Percentage variance")
    exceeds_threshold: bool = Field(description="Whether variance exceeds threshold")
    reason_hints: list[str] = Field(
        default_factory=list,
        description="Hints about potential reasons for variance",
    )


class VarianceAnalysis(BaseModel):
    """Complete variance analysis comparing current to prior period."""

    current_snapshot_id: UUID
    prior_snapshot_id: UUID | None
    has_prior_period: bool
    current_period_start: date
    current_period_end: date
    prior_period_start: date | None
    prior_period_end: date | None
    threshold_percent: Decimal = Field(
        description="Threshold used for flagging variances"
    )
    variances: list[VarianceItem]
    significant_variance_count: int = Field(
        description="Count of variances exceeding threshold"
    )
    summary_message: str


class ReconciliationSnapshotSummary(BaseModel):
    """
    Summary view of a reconciliation snapshot for list displays.

    Includes key financial figures without the full calculation trace.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    property_id: UUID
    lease_id: UUID
    period_start_date: date
    period_end_date: date
    status: ReconciliationStatus
    total_recovery: Decimal
    tenant_share_after_cap: Decimal | None = Field(
        None,
        description="Tenant's share before the admin fee (for display)",
    )
    admin_fee: Decimal | None = Field(
        None,
        description="Administrative fee charged on the recovery (for display)",
    )
    is_finalized: bool = Field(default=False)
    finalized_at: datetime | None = None
    created_at: datetime | None = None

    # Optional related info for display
    property_name: str | None = Field(
        None,
        description="Name of the property (for display)",
    )
    tenant_name: str | None = Field(
        None,
        description="Name of the tenant (for display)",
    )


def can_modify_snapshot(snapshot: ReconciliationSnapshot) -> bool:
    """
    Check if a snapshot can be modified.

    Returns False if the snapshot has been finalized.
    """
    return not snapshot.is_finalized


def format_recovery_amount(amount: Decimal) -> str:
    """
    Format a recovery amount for display.

    Args:
        amount: The Decimal amount to format

    Returns:
        Formatted string with currency symbol and 2 decimal places
    """
    return format_usd(amount)


# Cell Update Models (for PATCH /cells/{cell_id} endpoint)

EDITABLE_FIELDS: set[str] = {
    "total_operating_expenses",
    "grossed_up_expenses",
    "base_year_amount",
    "tenant_share_before_cap",
    "tenant_share_after_cap",
    "admin_fee",
    "total_recovery",
}


class ReconciliationCellUpdate(BaseModel):
    """Request model for updating a single reconciliation grid cell."""

    model_config = ConfigDict(from_attributes=True)

    value: Decimal = Field(description="New value for the cell")

    @field_validator("value")
    @classmethod
    def validate_non_negative(cls, v: Decimal) -> Decimal:
        """Ensure value is non-negative."""
        if v < 0:
            raise ValueError("Cell value must be non-negative")
        return v


class ReconciliationCell(BaseModel):
    """Response model for a single reconciliation grid cell."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(description="Encoded cell ID (base64 of snapshot_id:field_name)")
    snapshot_id: UUID = Field(description="ID of the reconciliation snapshot")
    field_name: str = Field(description="Name of the editable field")
    value: Decimal = Field(description="Current value of the cell")
    is_manual_override: bool = Field(
        default=False, description="Whether this cell has been manually edited"
    )
    updated_at: datetime | None = Field(
        default=None, description="Timestamp of last update"
    )
    updated_by: UUID | None = Field(
        default=None, description="User ID who last updated this cell"
    )


def encode_cell_id(snapshot_id: UUID, field_name: str) -> str:
    """
    Encode snapshot_id and field_name into URL-safe base64 cell ID.

    Args:
        snapshot_id: UUID of the reconciliation snapshot
        field_name: Name of the field (must be in EDITABLE_FIELDS)

    Returns:
        Base64-encoded string in format: base64(snapshot_id:field_name)

    Example:
        >>> encode_cell_id(UUID("123..."), "total_operating_expenses")
        "MTIzLi4uOnRvdGFsX29wZXJhdGluZ19leHBlbnNlcw=="
    """
    if field_name not in EDITABLE_FIELDS:
        raise ValueError(f"Field '{field_name}' is not editable")

    composite = f"{snapshot_id}:{field_name}"
    return base64.urlsafe_b64encode(composite.encode()).decode()


def decode_cell_id(cell_id: str) -> tuple[UUID, str]:
    """
    Decode base64 cell ID into snapshot_id and field_name.

    Args:
        cell_id: Base64-encoded cell ID

    Returns:
        Tuple of (snapshot_id, field_name)

    Raises:
        ValueError: If cell_id is invalid or field_name is not editable

    Example:
        >>> decode_cell_id("MTIzLi4uOnRvdGFsX29wZXJhdGluZ19leHBlbnNlcw==")
        (UUID("123..."), "total_operating_expenses")
    """
    try:
        decoded = base64.urlsafe_b64decode(cell_id.encode()).decode()
    except Exception as e:
        raise ValueError(f"Invalid cell_id encoding: {e}") from e

    parts = decoded.split(":", 1)
    if len(parts) != 2:
        raise ValueError("cell_id must contain snapshot_id:field_name")

    try:
        snapshot_id = UUID(parts[0])
    except ValueError as e:
        raise ValueError(f"Invalid snapshot_id in cell_id: {e}") from e

    field_name = parts[1]

    if field_name not in EDITABLE_FIELDS:
        raise ValueError(f"Field '{field_name}' is not editable")

    return snapshot_id, field_name
