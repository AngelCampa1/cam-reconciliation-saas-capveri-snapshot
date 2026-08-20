"""Helper functions to fetch data needed by the orchestrator."""

import logging
from collections import defaultdict
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, NamedTuple
from uuid import UUID

from app.database.client import SupabaseDB, get_supabase
from app.database.pagination import fetch_all_pages, fetch_all_pages_chunked_in
from app.models.enums import BomaStandardVersion, SpaceType
from app.models.lease_recovery_profile import BaseYearAdjustmentItem
from app.services.calculation.tenant_share import LeaseTerms

logger = logging.getLogger(__name__)


class TenantCapHistory(NamedTuple):
    """Historical cap data for a tenant's lease."""

    prior_year_amount: Decimal | None
    """Tenant share from the immediately prior year (for non-cumulative caps)."""

    all_prior_amounts: list[Decimal]
    """All historical tenant shares since base year (for cumulative caps)."""

    cap_base_year_amount: Decimal | None
    """First year's tenant share to use as cap base (for cumulative caps)."""


def fetch_tenant_cap_history(
    lease_id: UUID,
    current_period_start: date,
    base_year: int | None = None,
    client: SupabaseDB | None = None,
) -> TenantCapHistory:
    """
    Fetch historical tenant recovery amounts for cap calculations (single lease).

    This function is maintained for backward compatibility. For fetching cap histories
    for multiple leases, use fetch_all_tenant_cap_histories() to avoid N+1 queries.

    Args:
        lease_id: Lease to fetch history for
        current_period_start: Start date of current reconciliation period
        base_year: Optional base year for cumulative cap calculations
        client: Optional Supabase client (for background tasks)

    Returns:
        TenantCapHistory with all historical data needed for cap calculations
    """
    # Use the batch function internally for consistency
    # This ensures the same logic is used whether fetching one or many leases
    all_histories = fetch_all_tenant_cap_histories(
        lease_ids=[lease_id],
        current_period_start=current_period_start,
        base_year=base_year,
        client=client,
    )

    # Return the history for the single lease
    return all_histories.get(
        lease_id,
        # Fallback to empty history (should not happen)
        TenantCapHistory(
            prior_year_amount=None, all_prior_amounts=[], cap_base_year_amount=None
        ),
    )


def fetch_all_tenant_cap_histories(
    lease_ids: list[UUID],
    current_period_start: date,
    base_year: int | None = None,
    client: SupabaseDB | None = None,
) -> dict[UUID, TenantCapHistory]:
    """
    Batch fetch historical tenant recovery amounts for multiple leases.

    This function replaces N individual queries with a single batch query,
    solving the N+1 query problem in reconciliation calculations.

    Args:
        lease_ids: List of lease IDs to fetch history for
        current_period_start: Start date of current reconciliation period
        base_year: Optional base year for cumulative cap calculations
        client: Optional Supabase client (for background tasks)

    Returns:
        Dictionary mapping lease_id to TenantCapHistory for each lease.
        Leases with no history will have None/empty values.
    """
    if client is None:
        client = get_supabase()

    # Handle empty list case
    if not lease_ids:
        return {}

    # Convert UUIDs to strings for Supabase query
    str_lease_ids = [str(lease_id) for lease_id in lease_ids]

    # Fetch all finalized snapshots for ALL leases. Chunk the lease-id IN filter
    # so large properties (hundreds of leases) don't overflow the request URL
    # and trigger HTTP 414 (BUG-09).
    history_rows = fetch_all_pages_chunked_in(
        lambda chunk: client.table("reconciliation_snapshots")
        .select("lease_id, period_start_date, period_end_date, tenant_share_after_cap")
        .in_("lease_id", chunk)
        .eq("status", "finalized")
        .lt("period_start_date", current_period_start.isoformat())
        .order("period_start_date", desc=True),
        str_lease_ids,
    )

    # Group snapshots by lease_id
    snapshots_by_lease: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in history_rows:
        snapshots_by_lease[row["lease_id"]].append(row)

    # Build TenantCapHistory for each lease
    cap_histories: dict[UUID, TenantCapHistory] = {}

    for lease_id in lease_ids:
        str_lease_id = str(lease_id)
        snapshots = snapshots_by_lease.get(str_lease_id, [])

        if not snapshots:
            # No historical data - first year for this lease
            cap_histories[lease_id] = TenantCapHistory(
                prior_year_amount=None,
                all_prior_amounts=[],
                cap_base_year_amount=None,
            )
            continue

        # Sort snapshots by period desc to get most recent first
        snapshots_desc = sorted(
            snapshots, key=lambda x: x["period_start_date"], reverse=True
        )

        # Extract most recent amount (prior year)
        prior_year_amount = Decimal(str(snapshots_desc[0]["tenant_share_after_cap"]))

        # For cumulative caps, collect all amounts since base year
        all_prior_amounts: list[Decimal] = []
        cap_base_year_amount: Decimal | None = None

        # Sort chronologically for cumulative tracking
        sorted_snapshots = sorted(snapshots, key=lambda x: x["period_start_date"])

        for snapshot in sorted_snapshots:
            period_year = date.fromisoformat(snapshot["period_start_date"]).year
            amount = Decimal(str(snapshot["tenant_share_after_cap"]))

            # If base_year specified, only include snapshots from base_year onwards
            if base_year is not None:
                if period_year >= base_year:
                    all_prior_amounts.append(amount)

                    # Track the first year's amount as cap base
                    if cap_base_year_amount is None:
                        cap_base_year_amount = amount
            else:
                # No base year specified - include all history
                all_prior_amounts.append(amount)
                if cap_base_year_amount is None:
                    cap_base_year_amount = amount

        cap_histories[lease_id] = TenantCapHistory(
            prior_year_amount=prior_year_amount,
            all_prior_amounts=all_prior_amounts,
            cap_base_year_amount=cap_base_year_amount,
        )

    return cap_histories


def _unit_value(row: dict[str, Any], key: str) -> Any:
    """Read a field from a lease row's embedded ``units`` record, if present.

    ``leases.unit_id`` is nullable (``ON DELETE SET NULL``) and ``leases.property_id``
    is the authoritative property anchor, so a lease may legitimately have no unit.
    The ``units`` embed is LEFT-joined and is ``None`` for such unit-less leases;
    return ``None`` rather than raising so they still participate in reconciliation.
    """
    unit = row.get("units")
    if not unit:
        return None
    return unit.get(key)


def _unit_sqft(row: dict[str, Any]) -> Decimal | None:
    """Optional tenant square footage from the embedded unit (``None`` if unit-less)."""
    sqft = _unit_value(row, "rentable_sqft")
    return Decimal(str(sqft)) if sqft is not None else None


def _unit_space_type(row: dict[str, Any]) -> SpaceType | None:
    """Optional unit space type from the embedded unit (``None`` if unit-less)."""
    space_type = _unit_value(row, "space_type")
    return SpaceType(space_type) if space_type else None


def _build_lease_terms_from_profile(row: dict[str, Any]) -> LeaseTerms:
    """Build LeaseTerms from a lease row's recovery_profile JSONB (fallback path)."""
    return LeaseTerms(
        lease_id=UUID(row["id"]),
        tenant_name=row["tenant_name"],
        pro_rata_share=Decimal(str(row["recovery_profile"].get("pro_rata_share", 0))),
        admin_fee_percentage=Decimal(
            str(row["recovery_profile"].get("admin_fee_percentage", 0))
        ),
        management_fee_percentage=(
            Decimal(str(_mgmt_fee))
            if (_mgmt_fee := row["recovery_profile"].get("management_fee_percentage"))
            is not None
            else None
        ),
        tenant_sqft=_unit_sqft(row),
        base_year=row["recovery_profile"].get("base_year"),
        base_year_amount=(
            Decimal(str(row["recovery_profile"].get("base_year_amount", 0)))
            if row["recovery_profile"].get("base_year_amount")
            else None
        ),
        cap_type=row["recovery_profile"].get("cap_type", "none"),
        cap_rate=(
            Decimal(str(row["recovery_profile"].get("cap_rate", 0)))
            if row["recovery_profile"].get("cap_rate")
            else None
        ),
        excluded_pools=row["recovery_profile"].get("excluded_pools", []),
        expense_stops=(
            {
                pool_name: Decimal(str(amount))
                for pool_name, amount in row["recovery_profile"]
                .get("expense_stops", {})
                .items()
            }
            if row["recovery_profile"].get("expense_stops")
            else None
        ),
        start_date=(
            date.fromisoformat(row["start_date"]) if row.get("start_date") else None
        ),
        end_date=(date.fromisoformat(row["end_date"]) if row.get("end_date") else None),
        unit_space_type=_unit_space_type(row),
        rsf_measurement_standard=(
            BomaStandardVersion(row["recovery_profile"]["rsf_measurement_standard"])
            if row["recovery_profile"].get("rsf_measurement_standard")
            else None
        ),
        accounting_basis=row["recovery_profile"].get("accounting_basis"),
        base_year_adjustments=[
            BaseYearAdjustmentItem(**a)
            for a in row["recovery_profile"].get("base_year_adjustments", [])
        ],
    )


def _build_lease_terms_from_version(
    row: dict[str, Any],
    version: dict[str, Any],
    start_date_override: date | None = None,
    end_date_override: date | None = None,
    proration_factor: Decimal = Decimal("1"),
) -> LeaseTerms:
    """Build LeaseTerms from a versioned term row (preferred path)."""
    return LeaseTerms(
        lease_id=UUID(row["id"]),
        tenant_name=row["tenant_name"],
        pro_rata_share=Decimal(str(version["pro_rata_share"])),
        admin_fee_percentage=Decimal(str(version["admin_fee_percentage"])),
        management_fee_percentage=(
            Decimal(str(version["management_fee_percentage"]))
            if version.get("management_fee_percentage") is not None
            else None
        ),
        tenant_sqft=_unit_sqft(row),
        base_year=version.get("base_year"),
        base_year_amount=(
            Decimal(str(version["base_year_amount"]))
            if version.get("base_year_amount") is not None
            else None
        ),
        cap_type=version.get("cap_type", "none"),
        cap_rate=(
            Decimal(str(version["cap_rate"]))
            if version.get("cap_rate") is not None
            else None
        ),
        excluded_pools=version.get("excluded_pools", []),
        expense_stops=(
            {
                pool_name: Decimal(str(amount))
                for pool_name, amount in row["recovery_profile"]
                .get("expense_stops", {})
                .items()
            }
            if row.get("recovery_profile")
            and row["recovery_profile"].get("expense_stops")
            else None
        ),
        start_date=start_date_override
        or (date.fromisoformat(row["start_date"]) if row.get("start_date") else None),
        end_date=end_date_override
        or (date.fromisoformat(row["end_date"]) if row.get("end_date") else None),
        unit_space_type=_unit_space_type(row),
        rsf_measurement_standard=(
            BomaStandardVersion(version["rsf_measurement_standard"])
            if version.get("rsf_measurement_standard")
            else None
        ),
        term_version_id=UUID(version["id"]),
        proration_factor=proration_factor,
        accounting_basis=version.get("accounting_basis"),
        base_year_adjustments=[
            BaseYearAdjustmentItem(**a)
            for a in version.get("base_year_adjustments", [])
        ],
    )


def _fetch_effective_versions(
    client: SupabaseDB, lease_ids: list[str], as_of: date
) -> dict[str, dict[str, Any]]:
    """Batch fetch effective term versions for multiple leases via RPC."""
    if not lease_ids:
        return {}
    result = client.rpc(
        "get_effective_term_versions",
        {"p_lease_ids": lease_ids, "p_as_of": as_of.isoformat()},
    ).execute()
    return {row["lease_id"]: row for row in (result.data or [])}


def _fetch_period_versions(
    client: SupabaseDB,
    lease_ids: list[str],
    period_end: date,
) -> dict[str, list[dict[str, Any]]]:
    """Fetch all versions that could be effective during a period."""
    if not lease_ids:
        return {}
    version_rows = fetch_all_pages_chunked_in(
        lambda chunk: client.table("lease_term_versions")
        .select("*")
        .in_("lease_id", chunk)
        .lte("effective_date", period_end.isoformat())
        .order("lease_id")
        .order("effective_date"),
        lease_ids,
    )
    versions_by_lease: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in version_rows:
        versions_by_lease[row["lease_id"]].append(row)
    return versions_by_lease


def _check_multi_version_warnings(
    client: SupabaseDB,
    lease_ids: list[str],
    period_start: date,
    period_end: date,
) -> list[str]:
    """Check if any lease has multiple versions spanning the period."""
    if not lease_ids:
        return []
    version_rows = fetch_all_pages_chunked_in(
        lambda chunk: client.table("lease_term_versions")
        .select("lease_id, effective_date")
        .in_("lease_id", chunk)
        .gt("effective_date", period_start.isoformat())
        .lte("effective_date", period_end.isoformat()),
        lease_ids,
    )
    warnings: list[str] = []
    mid_period_leases: dict[str, list[str]] = defaultdict(list)
    for row in version_rows:
        mid_period_leases[row["lease_id"]].append(row["effective_date"])
    for lid, dates in mid_period_leases.items():
        warnings.append(
            f"Lease {lid} has {len(dates)} term version(s) with effective dates "
            f"during the period ({', '.join(dates)}). Applying day-based proration."
        )
    return warnings


def _active_overlap(
    row: dict[str, Any], period_start: date, period_end: date
) -> tuple[date, date] | None:
    lease_start = (
        date.fromisoformat(row["start_date"]) if row.get("start_date") else None
    )
    lease_end = date.fromisoformat(row["end_date"]) if row.get("end_date") else None
    overlap_start = max(lease_start or period_start, period_start)
    overlap_end = min(lease_end or period_end, period_end)
    if overlap_start > overlap_end:
        return None
    return overlap_start, overlap_end


def _period_proration_factor(
    segment_start: date, segment_end: date, period_start: date, period_end: date
) -> Decimal:
    total_days = (period_end - period_start).days + 1
    segment_days = (segment_end - segment_start).days + 1
    return (Decimal(segment_days) / Decimal(total_days)).quantize(
        Decimal("0.00000001"), rounding=ROUND_HALF_UP
    )


def _build_prorated_version_terms(
    row: dict[str, Any],
    versions: list[dict[str, Any]],
    period_start: date,
    period_end: date,
) -> list[LeaseTerms]:
    """Split a lease into term-version slices for day-based proration."""
    overlap = _active_overlap(row, period_start, period_end)
    if overlap is None:
        return []

    active_start, active_end = overlap
    sorted_versions = sorted(versions, key=lambda v: v["effective_date"])
    effective_versions = [
        version
        for version in sorted_versions
        if date.fromisoformat(version["effective_date"]) <= active_end
    ]
    if not effective_versions:
        return []

    terms: list[LeaseTerms] = []
    for index, version in enumerate(effective_versions):
        version_start = date.fromisoformat(version["effective_date"])
        next_start = (
            date.fromisoformat(effective_versions[index + 1]["effective_date"])
            if index + 1 < len(effective_versions)
            else None
        )
        segment_start = max(active_start, version_start)
        segment_end = (
            min(active_end, next_start - timedelta(days=1))
            if next_start
            else active_end
        )

        if segment_start > segment_end:
            continue

        terms.append(
            _build_lease_terms_from_version(
                row,
                version,
                start_date_override=segment_start,
                end_date_override=segment_end,
                proration_factor=_period_proration_factor(
                    segment_start, segment_end, period_start, period_end
                ),
            )
        )

    return terms


def fetch_active_leases(
    property_id: UUID,
    period_start: date,
    period_end: date,
    client: SupabaseDB | None = None,
) -> list[LeaseTerms]:
    """
    Fetch all leases active during the reconciliation period.

    Prefers versioned term data when available, falling back to recovery_profile
    JSONB for leases without term versions.

    A lease is active if:
    - lease.start_date <= period_end AND
    - (lease.end_date IS NULL OR lease.end_date >= period_start)
    """
    if client is None:
        client = get_supabase()

    rows = fetch_all_pages(
        lambda: client.table("leases")
        .select("*, units(property_id, rentable_sqft, space_type)")
        .eq("property_id", str(property_id))
        .lte("start_date", period_end.isoformat())
        .or_(f"end_date.is.null,end_date.gte.{period_start.isoformat()}")
    )

    if not rows:
        return []

    # Batch fetch effective term versions
    str_lease_ids = [row["id"] for row in rows]
    versions_by_lease = _fetch_effective_versions(client, str_lease_ids, period_start)

    # Check for multi-version warnings
    warnings = _check_multi_version_warnings(
        client, str_lease_ids, period_start, period_end
    )
    has_mid_period_versions = bool(warnings)
    period_versions_by_lease = (
        _fetch_period_versions(client, str_lease_ids, period_end)
        if has_mid_period_versions
        else {}
    )
    for warning in warnings:
        logger.info(warning)

    # Build LeaseTerms, preferring versioned terms
    lease_terms_list: list[LeaseTerms] = []
    for row in rows:
        period_versions = period_versions_by_lease.get(row["id"], [])
        if period_versions:
            lease_terms_list.extend(
                _build_prorated_version_terms(
                    row, period_versions, period_start, period_end
                )
            )
            continue

        version = versions_by_lease.get(row["id"])
        if version:
            lease_terms_list.append(_build_lease_terms_from_version(row, version))
        else:
            lease_terms_list.append(_build_lease_terms_from_profile(row))

    return lease_terms_list
