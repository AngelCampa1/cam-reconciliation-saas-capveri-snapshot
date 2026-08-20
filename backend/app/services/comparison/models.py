"""
Domain model for bidirectional system comparison (Module B).

Pure, dependency-free Pydantic v2 models. All money is ``Decimal`` (never float).

Signed convention (see goal decision log, 2026-06-01):

    variance = actual_charged - capveri_correct

- ``variance > 0`` and ``abs(variance) > tolerance`` => OVERCHARGE
  (the other system billed too much; tenant exposure / refund).
- ``variance < 0`` and ``abs(variance) > tolerance`` => UNDERCHARGE
  (the other system billed too little; recovery opportunity).
- ``abs(variance) <= tolerance`` => MATCH (confirmed correct).
"""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field


class VarianceDirection(str, Enum):
    """Direction of a per-tenant deviation from CapVeri's correct amount."""

    OVERCHARGE = "overcharge"
    UNDERCHARGE = "undercharge"
    MATCH = "match"


def classify_variance(
    variance: Decimal, tolerance: Decimal = Decimal("0.01")
) -> VarianceDirection:
    """
    Classify a signed variance into a direction.

    Args:
        variance: ``actual_charged - capveri_correct``.
        tolerance: Inclusive absolute threshold below which a variance is a MATCH.

    Returns:
        ``MATCH`` if ``abs(variance) <= tolerance``, otherwise ``OVERCHARGE``
        for a positive variance or ``UNDERCHARGE`` for a negative one.
    """
    if abs(variance) <= tolerance:
        return VarianceDirection.MATCH
    if variance > 0:
        return VarianceDirection.OVERCHARGE
    return VarianceDirection.UNDERCHARGE


class PoolVariance(BaseModel):
    """
    A single expense pool's signed deviation within one tenant (B1.5a).

    Same signed convention and classification as ``TenantVariance``, scoped to one
    expense pool (e.g. CAM, Insurance, Taxes). Optional plumbing: present only when
    the caller supplies per-pool maps to ``build_comparison_result``. Inert until
    B1.5b feeds real per-pool data end-to-end.
    """

    pool_id: str = Field(description="Expense pool identifier the variance is keyed by")
    pool_name: str | None = Field(
        default=None, description="Expense pool display name if known"
    )
    capveri_correct: Decimal = Field(
        description="CapVeri-correct amount for this pool within the tenant"
    )
    actual_charged: Decimal = Field(
        description="Actual charged amount for this pool within the tenant"
    )
    variance: Decimal = Field(
        description="Signed difference: actual_charged - capveri_correct"
    )
    direction: VarianceDirection = Field(
        description="OVERCHARGE / UNDERCHARGE / MATCH classification"
    )
    abs_variance: Decimal = Field(description="Absolute magnitude of the variance")
    variance_pct: Decimal | None = Field(
        default=None,
        description=(
            "Variance as a percentage of abs(capveri_correct); "
            "None when capveri_correct is zero"
        ),
    )


class TenantVariance(BaseModel):
    """A single tenant's deviation between CapVeri-correct and actual-charged."""

    lease_id: str = Field(description="Lease identifier the variance is keyed by")
    tenant_name: str | None = Field(
        default=None, description="Tenant display name if known"
    )
    capveri_correct: Decimal = Field(
        description="What CapVeri computed should be charged (correct amount)"
    )
    actual_charged: Decimal = Field(
        description="What the other system actually charged"
    )
    variance: Decimal = Field(
        description="Signed difference: actual_charged - capveri_correct"
    )
    direction: VarianceDirection = Field(
        description="OVERCHARGE / UNDERCHARGE / MATCH classification"
    )
    abs_variance: Decimal = Field(description="Absolute magnitude of the variance")
    variance_pct: Decimal | None = Field(
        default=None,
        description=(
            "Variance as a percentage of abs(capveri_correct); "
            "None when capveri_correct is zero"
        ),
    )
    pool_breakdowns: list[PoolVariance] | None = Field(
        default=None,
        description=(
            "Optional signed per-pool variances (B1.5a). None when the comparison "
            "was run without pool maps (pool mode off); a list (possibly empty) "
            "when pool mode is on. Empty means pool mode on but no pool data for "
            "this lease"
        ),
    )


class ComparisonResult(BaseModel):
    """Full bidirectional comparison for a property + period."""

    property_id: UUID
    period_start: date
    period_end: date
    tolerance: Decimal = Field(description="Absolute tolerance used to classify MATCH")

    tenants: list[TenantVariance] = Field(
        default_factory=list, description="Per-tenant signed variances"
    )

    total_capveri_correct: Decimal = Field(
        description="Sum of all per-tenant correct amounts"
    )
    total_actual_charged: Decimal = Field(
        description="Sum of all per-tenant charged amounts"
    )
    total_net_variance: Decimal = Field(
        description="Signed net: total_actual_charged - total_capveri_correct"
    )
    total_overcharge: Decimal = Field(
        description="Sum of positive variances (tenant overcharges)"
    )
    total_undercharge: Decimal = Field(
        description="Sum of absolute values of negative variances (undercharges)"
    )

    overcharge_count: int = Field(
        description="Number of tenants classified as OVERCHARGE"
    )
    undercharge_count: int = Field(
        description="Number of tenants classified as UNDERCHARGE"
    )
    match_count: int = Field(description="Number of tenants classified as MATCH")


class ComparisonSource(str, Enum):
    """Where a stored comparison run's charged side came from (B1.6)."""

    ACTUAL_BILLED = "actual_billed"
    EXPLICIT = "explicit"


class StoredComparisonRunSummary(BaseModel):
    """
    Header of a persisted comparison run (B1.6), without per-tenant findings.

    Returned by the list endpoint. Mirrors ``comparison_runs`` columns plus the
    server-assigned ``id`` / ``created_at``. ``ComparisonResult`` is the live
    compute shape; this is the stored, point-in-time audit record.
    """

    id: UUID = Field(description="Server-assigned comparison run id")
    property_id: UUID
    period_start: date
    period_end: date
    tolerance: Decimal = Field(description="Absolute tolerance used to classify MATCH")
    source: ComparisonSource = Field(description="Charged-side source for this run")

    total_capveri_correct: Decimal
    total_actual_charged: Decimal
    total_net_variance: Decimal
    total_overcharge: Decimal
    total_undercharge: Decimal

    overcharge_count: int
    undercharge_count: int
    match_count: int

    created_by: UUID | None = Field(
        default=None, description="User who created the run, if known"
    )
    created_at: datetime = Field(description="When the run was persisted")


class StoredComparisonRun(StoredComparisonRunSummary):
    """A persisted comparison run plus its per-tenant findings (B1.6)."""

    findings: list[TenantVariance] = Field(
        default_factory=list, description="Per-tenant signed variances for this run"
    )
