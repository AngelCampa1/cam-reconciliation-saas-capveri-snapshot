"""
System Comparison API (Module B).

Bidirectional variance between CapVeri's correct per-tenant recovery and what
another system charged. Decoupled from ``/reconciliation`` (which produces the
correct numbers) and broader than ``/leakage`` (which only surfaces the
undercharge direction against our own ``actual_billed_amounts`` table): this
surface returns over/under/match per tenant plus both-direction totals.

Two charged sources are supported at the boundary:

- **GET ``/{property_id}``** compares against the DEFAULT source — the existing
  ``actual_billed_amounts`` rows (same data ``compare_charges`` already reads).
- **POST ``/{property_id}``** compares against an EXPLICIT charged set supplied in
  the request body (a manual entry or a parsed legacy reconciliation), without
  touching ``actual_billed_amounts``.

Both return the full :class:`ComparisonResult`. The model is returned directly as
the response (Pydantic v2 ``response_model``), so ``Decimal`` money keeps full
precision in the JSON (serialized as strings) and ``variance_pct`` serializes as a
string or ``null`` when ``capveri_correct`` is zero — never a lossy float. This is
a deliberate divergence from ``/leakage``, which casts its breakdown to floats.

All money is ``Decimal`` (never float).
"""

from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.auth.dependencies import OrgContext
from app.services.comparison.engine import (
    ExplicitCharge,
    compare_charges,
    compare_explicit_charges,
)
from app.services.comparison.models import (
    ComparisonResult,
    ComparisonSource,
    StoredComparisonRun,
    StoredComparisonRunSummary,
)
from app.services.comparison.persistence import (
    get_comparison_run,
    list_comparison_runs,
    save_comparison_run,
)

router = APIRouter()


def _validate_period(period_start: date, period_end: date) -> None:
    """Reject inverted/empty periods the same way ``/leakage`` does (400)."""
    if period_start >= period_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="period_start must be before period_end",
        )


class ExplicitChargesRequest(BaseModel):
    """Request body for comparing against a caller-supplied charged set (B1.3)."""

    period_start: date = Field(description="Start of the comparison period")
    period_end: date = Field(description="End of the comparison period")
    charges: list[ExplicitCharge] = Field(
        description="The other system's charges to compare against CapVeri-correct"
    )
    tolerance: Decimal = Field(
        default=Decimal("0.01"),
        ge=Decimal("0"),
        description="Inclusive absolute MATCH threshold",
    )
    include_drafts: bool = Field(
        default=False,
        description="Include draft reconciliation snapshots as correct amounts",
    )


@router.get("/{property_id}", response_model=ComparisonResult)
async def get_comparison(
    ctx: OrgContext,
    property_id: UUID,
    period_start: date,
    period_end: date,
    tolerance: Decimal = Query(Decimal("0.01"), ge=0),
    include_drafts: bool = Query(False),
) -> ComparisonResult:
    """
    Compare CapVeri-correct recovery against the default charged source.

    The charged side is the existing ``actual_billed_amounts`` for the property and
    period. A property outside the caller's organization yields an empty result
    (mirrors ``compare_charges`` / the leakage cross-org behavior).

    Args:
        ctx: Organization-scoped context (tenant isolation).
        property_id: Property to compare.
        period_start: Start of the comparison period.
        period_end: End of the comparison period.
        tolerance: Inclusive absolute MATCH threshold (default 0.01).
        include_drafts: Include draft reconciliation snapshots as correct amounts.

    Returns:
        The full bidirectional :class:`ComparisonResult`.
    """
    _validate_period(period_start, period_end)

    return await compare_charges(
        organization_id=ctx.organization_id,
        property_id=property_id,
        period_start=period_start,
        period_end=period_end,
        tolerance=tolerance,
        include_drafts=include_drafts,
    )


@router.post("/{property_id}", response_model=ComparisonResult)
async def post_comparison(
    ctx: OrgContext,
    property_id: UUID,
    request: ExplicitChargesRequest,
) -> ComparisonResult:
    """
    Compare CapVeri-correct recovery against an explicit charged set (B1.3).

    The charged side comes entirely from ``request.charges`` (a manual entry or a
    parsed legacy reconciliation); ``actual_billed_amounts`` is not read. A property
    outside the caller's organization yields an empty result.

    Args:
        ctx: Organization-scoped context (tenant isolation).
        property_id: Property to compare.
        request: Period, the explicit charges, tolerance, and draft inclusion.

    Returns:
        The full bidirectional :class:`ComparisonResult`.
    """
    _validate_period(request.period_start, request.period_end)

    return await compare_explicit_charges(
        organization_id=ctx.organization_id,
        property_id=property_id,
        period_start=request.period_start,
        period_end=request.period_end,
        charges=request.charges,
        tolerance=request.tolerance,
        include_drafts=request.include_drafts,
    )


class PersistRunRequest(BaseModel):
    """
    Request body for persisting a comparison run (B1.6).

    The charged side is the DEFAULT ``actual_billed_amounts`` source when
    ``charges`` is omitted (stored ``source = actual_billed``), or the explicit
    caller-supplied set when ``charges`` is provided (stored ``source = explicit``).
    """

    period_start: date = Field(description="Start of the comparison period")
    period_end: date = Field(description="End of the comparison period")
    tolerance: Decimal = Field(
        default=Decimal("0.01"),
        ge=Decimal("0"),
        description="Inclusive absolute MATCH threshold",
    )
    include_drafts: bool = Field(
        default=False,
        description="Include draft reconciliation snapshots as correct amounts",
    )
    charges: list[ExplicitCharge] | None = Field(
        default=None,
        description=(
            "Explicit charged set to compare against. Omit (None) to use the "
            "default actual_billed_amounts source"
        ),
    )


@router.post(
    "/{property_id}/runs",
    response_model=StoredComparisonRun,
    status_code=status.HTTP_201_CREATED,
)
async def create_comparison_run(
    ctx: OrgContext,
    property_id: UUID,
    request: PersistRunRequest,
) -> StoredComparisonRun:
    """
    Compute a comparison and PERSIST it as a point-in-time audit run (B1.6).

    Unlike GET/POST ``/{property_id}`` (which derive-on-read and return nothing
    stored), this computes the comparison and writes a ``comparison_runs`` header
    plus one ``comparison_findings`` row per tenant, then returns the stored run.
    The charged source is ``actual_billed`` when ``charges`` is omitted, else
    ``explicit``.

    Args:
        ctx: Organization-scoped context (tenant isolation).
        property_id: Property to compare and persist.
        request: Period, tolerance, draft inclusion, and optional explicit charges.

    Returns:
        The persisted :class:`StoredComparisonRun` (header + findings).

    Raises:
        HTTPException: 400 if the period is inverted/empty; 500 if persistence
            unexpectedly fails to read back the just-saved run.
    """
    _validate_period(request.period_start, request.period_end)

    if request.charges is None:
        result = await compare_charges(
            organization_id=ctx.organization_id,
            property_id=property_id,
            period_start=request.period_start,
            period_end=request.period_end,
            tolerance=request.tolerance,
            include_drafts=request.include_drafts,
        )
        source = ComparisonSource.ACTUAL_BILLED
    else:
        result = await compare_explicit_charges(
            organization_id=ctx.organization_id,
            property_id=property_id,
            period_start=request.period_start,
            period_end=request.period_end,
            charges=request.charges,
            tolerance=request.tolerance,
            include_drafts=request.include_drafts,
        )
        source = ComparisonSource.EXPLICIT

    run_id = save_comparison_run(
        result=result,
        organization_id=ctx.organization_id,
        source=source,
        created_by=ctx.user.id,
    )
    stored = get_comparison_run(organization_id=ctx.organization_id, run_id=run_id)
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Comparison run was saved but could not be read back",
        )
    return stored


@router.get(
    "/{property_id}/runs",
    response_model=list[StoredComparisonRunSummary],
)
async def list_runs(
    ctx: OrgContext,
    property_id: UUID,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[StoredComparisonRunSummary]:
    """
    List persisted comparison runs for a property, newest first (B1.6).

    Org-scoped: a property outside the caller's organization yields an empty list.
    Findings are omitted; use ``GET /runs/{run_id}`` for the detail view.

    Args:
        ctx: Organization-scoped context (tenant isolation).
        property_id: Property whose runs to list.
        limit: Page size (1-200, default 50).
        offset: Rows to skip (pagination, default 0).

    Returns:
        Run headers ordered by ``created_at`` descending.
    """
    return list_comparison_runs(
        organization_id=ctx.organization_id,
        property_id=property_id,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/runs/{run_id}",
    response_model=StoredComparisonRun,
)
async def get_run(
    ctx: OrgContext,
    run_id: UUID,
) -> StoredComparisonRun:
    """
    Fetch one persisted comparison run plus its findings (B1.6).

    Org-scoped: a run owned by another organization returns 404 (not a cross-tenant
    leak). The literal ``/runs/...`` prefix does not collide with ``/{property_id}``
    (one segment) or ``/{property_id}/runs`` (property segment is a UUID, never the
    literal ``runs``).

    Args:
        ctx: Organization-scoped context (tenant isolation).
        run_id: The comparison run to fetch.

    Returns:
        The stored :class:`StoredComparisonRun` (header + findings).

    Raises:
        HTTPException: 404 if no such run exists for the caller's organization.
    """
    stored = get_comparison_run(organization_id=ctx.organization_id, run_id=run_id)
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comparison run not found",
        )
    return stored
