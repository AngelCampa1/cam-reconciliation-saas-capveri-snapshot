"""
Comparison run persistence (Module B / story B1.6).

A comparison computed by ``engine.py`` is normally derive-on-read (the API GET/POST
recompute against the latest snapshots + charges). This layer additionally PERSISTS
a run as a point-in-time audit record: ``comparison_runs`` (header + aggregate
totals) plus one ``comparison_findings`` row per tenant variance. Storing the run is
what lets CapVeri defend "the right amount was charged on date X" — a recompute can
drift as underlying data changes.

Reads use the admin client with EXPLICIT ``organization_id`` filters (same approach
as ``engine.compare_charges``); RLS is the defense-in-depth layer for any direct
authenticated access. All money is ``Decimal`` (never float); it is serialized to
strings on the way into ``NUMERIC`` columns to preserve precision.
"""

from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, cast
from uuid import UUID

from app.database.client import get_supabase_admin
from app.database.pagination import fetch_all_pages
from app.services.comparison.models import (
    ComparisonResult,
    ComparisonSource,
    StoredComparisonRun,
    StoredComparisonRunSummary,
    TenantVariance,
    VarianceDirection,
)

_RUN_COLUMNS = (
    "id, property_id, period_start_date, period_end_date, tolerance, source, "
    "total_capveri_correct, total_actual_charged, total_net_variance, "
    "total_overcharge, total_undercharge, overcharge_count, undercharge_count, "
    "match_count, created_by, created_at"
)


def _to_row(item: Any) -> dict[str, Any] | None:
    """Normalize a Supabase row payload to a dict (or None)."""
    if isinstance(item, dict):
        return cast(dict[str, Any], item)
    return None


def _serialize_findings(
    tenants: list[TenantVariance], run_id: str, organization_id: str
) -> list[dict[str, Any]]:
    """Build ``comparison_findings`` insert rows from per-tenant variances."""
    rows: list[dict[str, Any]] = []
    for tenant in tenants:
        pool_breakdowns = (
            [pv.model_dump(mode="json") for pv in tenant.pool_breakdowns]
            if tenant.pool_breakdowns is not None
            else None
        )
        rows.append(
            {
                "comparison_run_id": run_id,
                "organization_id": organization_id,
                "lease_id": tenant.lease_id,
                "tenant_name": tenant.tenant_name,
                "capveri_correct": str(tenant.capveri_correct),
                "actual_charged": str(tenant.actual_charged),
                "variance": str(tenant.variance),
                "abs_variance": str(tenant.abs_variance),
                "direction": tenant.direction.value,
                "variance_pct": (
                    str(tenant.variance_pct)
                    if tenant.variance_pct is not None
                    else None
                ),
                "pool_breakdowns": pool_breakdowns,
            }
        )
    return rows


def save_comparison_run(
    result: ComparisonResult,
    organization_id: UUID,
    source: ComparisonSource,
    created_by: UUID | None = None,
) -> UUID:
    """
    Persist a computed ``ComparisonResult`` as a run + per-tenant findings.

    Inserts one ``comparison_runs`` header row and one ``comparison_findings`` row
    per tenant. If the findings insert fails, the already-inserted run header is
    deleted so a partial run is never left behind (the child rows would otherwise be
    orphaned-but-empty; we keep the audit trail all-or-nothing).

    Args:
        result: The computed comparison to persist.
        organization_id: Owning organization (tenant isolation).
        source: Where the charged side came from (actual_billed or explicit).
        created_by: User who initiated the run, if known.

    Returns:
        The server-assigned ``comparison_runs.id``.

    Raises:
        RuntimeError: If the run header insert returns no row, or the findings
            insert fails (after the header is rolled back).
    """
    client = get_supabase_admin()
    org_str = str(organization_id)

    run_payload: dict[str, Any] = {
        "organization_id": org_str,
        "property_id": str(result.property_id),
        "period_start_date": result.period_start.isoformat(),
        "period_end_date": result.period_end.isoformat(),
        "tolerance": str(result.tolerance),
        "source": source.value,
        "total_capveri_correct": str(result.total_capveri_correct),
        "total_actual_charged": str(result.total_actual_charged),
        "total_net_variance": str(result.total_net_variance),
        "total_overcharge": str(result.total_overcharge),
        "total_undercharge": str(result.total_undercharge),
        "overcharge_count": result.overcharge_count,
        "undercharge_count": result.undercharge_count,
        "match_count": result.match_count,
        "created_by": str(created_by) if created_by is not None else None,
    }

    run_result = client.table("comparison_runs").insert(run_payload).execute()
    run_row = _to_row((run_result.data or [None])[0])
    if run_row is None or not isinstance(run_row.get("id"), str):
        raise RuntimeError("Failed to insert comparison run header")
    run_id = run_row["id"]

    finding_rows = _serialize_findings(result.tenants, run_id, org_str)
    if finding_rows:
        try:
            client.table("comparison_findings").insert(finding_rows).execute()
        except Exception as exc:
            # Keep the audit trail all-or-nothing: drop the orphaned header.
            try:
                client.table("comparison_runs").delete().eq("id", run_id).execute()
            except Exception:
                pass
            raise RuntimeError(
                f"Failed to persist comparison findings; rolled back run {run_id}. "
                f"Original error: {exc}"
            ) from exc

    return UUID(run_id)


def _parse_summary(row: dict[str, Any]) -> StoredComparisonRunSummary:
    """Map a ``comparison_runs`` row to a ``StoredComparisonRunSummary``."""
    created_by = row.get("created_by")
    return StoredComparisonRunSummary(
        id=UUID(str(row["id"])),
        property_id=UUID(str(row["property_id"])),
        period_start=date.fromisoformat(str(row["period_start_date"])),
        period_end=date.fromisoformat(str(row["period_end_date"])),
        tolerance=Decimal(str(row["tolerance"])),
        source=ComparisonSource(str(row["source"])),
        total_capveri_correct=Decimal(str(row["total_capveri_correct"])),
        total_actual_charged=Decimal(str(row["total_actual_charged"])),
        total_net_variance=Decimal(str(row["total_net_variance"])),
        total_overcharge=Decimal(str(row["total_overcharge"])),
        total_undercharge=Decimal(str(row["total_undercharge"])),
        overcharge_count=int(row["overcharge_count"]),
        undercharge_count=int(row["undercharge_count"]),
        match_count=int(row["match_count"]),
        created_by=UUID(str(created_by)) if created_by is not None else None,
        created_at=_parse_timestamp(row["created_at"]),
    )


def _parse_timestamp(value: Any) -> datetime:
    """Parse a Supabase timestamptz string (handles a trailing ``Z``)."""
    if isinstance(value, datetime):
        return value
    text = str(value).replace("Z", "+00:00")
    return datetime.fromisoformat(text)


def _recompute_stored_variance_pct(row: dict[str, Any]) -> Decimal | None:
    """Derive variance_pct from persisted amounts using the current contract."""
    correct = Decimal(str(row["capveri_correct"]))
    if correct == 0:
        return None
    variance = Decimal(str(row["variance"]))
    return (variance / abs(correct) * Decimal("100")).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def _parse_finding(row: dict[str, Any]) -> TenantVariance:
    """Map a ``comparison_findings`` row back to a ``TenantVariance``."""
    pool_breakdowns = row.get("pool_breakdowns")
    return TenantVariance(
        lease_id=str(row["lease_id"]),
        tenant_name=row.get("tenant_name"),
        capveri_correct=Decimal(str(row["capveri_correct"])),
        actual_charged=Decimal(str(row["actual_charged"])),
        variance=Decimal(str(row["variance"])),
        direction=VarianceDirection(str(row["direction"])),
        abs_variance=Decimal(str(row["abs_variance"])),
        variance_pct=_recompute_stored_variance_pct(row),
        pool_breakdowns=pool_breakdowns,
    )


def list_comparison_runs(
    organization_id: UUID,
    property_id: UUID,
    limit: int = 50,
    offset: int = 0,
) -> list[StoredComparisonRunSummary]:
    """
    List persisted comparison runs for a property, newest first.

    Org-scoped by an explicit ``organization_id`` filter; a property in another
    organization simply yields no rows. No findings are loaded (use
    ``get_comparison_run`` for the detail view).

    Args:
        organization_id: Owning organization (tenant isolation).
        property_id: Property whose runs to list.
        limit: Max rows to return (page size).
        offset: Rows to skip (pagination).

    Returns:
        Run headers ordered by ``created_at`` descending.
    """
    client = get_supabase_admin()
    result = (
        client.table("comparison_runs")
        .select(_RUN_COLUMNS)
        .eq("organization_id", str(organization_id))
        .eq("property_id", str(property_id))
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    summaries: list[StoredComparisonRunSummary] = []
    for raw in result.data or []:
        row = _to_row(raw)
        if row is not None:
            summaries.append(_parse_summary(row))
    return summaries


def get_comparison_run(
    organization_id: UUID,
    run_id: UUID,
) -> StoredComparisonRun | None:
    """
    Fetch one persisted comparison run plus its findings, or ``None``.

    Org-scoped by an explicit ``organization_id`` filter, so a run belonging to
    another organization returns ``None`` (not a cross-tenant leak).

    Args:
        organization_id: Owning organization (tenant isolation).
        run_id: The comparison run to fetch.

    Returns:
        The stored run with findings, or ``None`` if not found for this org.
    """
    client = get_supabase_admin()
    run_result = (
        client.table("comparison_runs")
        .select(_RUN_COLUMNS)
        .eq("organization_id", str(organization_id))
        .eq("id", str(run_id))
        .limit(1)
        .execute()
    )
    run_row = _to_row((run_result.data or [None])[0])
    if run_row is None:
        return None

    summary = _parse_summary(run_row)
    finding_data = fetch_all_pages(
        lambda: client.table("comparison_findings")
        .select(
            "lease_id, tenant_name, capveri_correct, actual_charged, variance, "
            "abs_variance, direction, variance_pct, pool_breakdowns, created_at"
        )
        .eq("organization_id", str(organization_id))
        .eq("comparison_run_id", str(run_id))
    )
    findings: list[TenantVariance] = []
    for raw in finding_data:
        row = _to_row(raw)
        if row is not None:
            findings.append(_parse_finding(row))
    findings.sort(key=lambda t: t.abs_variance, reverse=True)

    return StoredComparisonRun(**summary.model_dump(), findings=findings)
