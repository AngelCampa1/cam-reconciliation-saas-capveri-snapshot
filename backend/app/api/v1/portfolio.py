"""
Portfolio Summary API.

Endpoints for viewing a portfolio-level financial summary:
total recoverable CAM, leakage identified, and recovery rate
across all properties for the most recent finalized year.
"""

import logging
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

from fastapi import APIRouter
from pydantic import BaseModel

from app.auth.dependencies import OrgContext
from app.database.client import get_supabase_admin
from app.database.pagination import fetch_all_pages

logger = logging.getLogger(__name__)

router = APIRouter()


def _to_row(item: Any) -> dict[str, Any] | None:
    """Normalize Supabase row payloads to dictionaries."""
    if isinstance(item, dict):
        return cast(dict[str, Any], item)
    return None


def _parse_year(date_val: Any) -> int | None:
    """Extract year from a date string like '2024-01-01'."""
    if isinstance(date_val, str) and len(date_val) >= 4:
        try:
            return int(date_val[:4])
        except ValueError:
            return None
    return None


class PropertyPortfolioEntry(BaseModel):
    """Portfolio summary for a single property."""

    property_id: UUID
    property_name: str
    total_recoverable: Decimal
    total_billed: Decimal
    leakage: Decimal
    recovery_rate: float | None


class PortfolioSummaryResponse(BaseModel):
    """Organization-wide portfolio summary for the most recent reconciliation year."""

    period_year: int | None
    total_recoverable_cam: Decimal
    total_leakage: Decimal
    recovery_rate: float | None
    properties_with_leakage: int
    has_billing_data: bool
    total_recovery_all_years: Decimal
    properties: list[PropertyPortfolioEntry]


@router.get("/summary", response_model=PortfolioSummaryResponse)
async def get_portfolio_summary(ctx: OrgContext) -> PortfolioSummaryResponse:
    """
    Get portfolio-wide CAM recovery summary.

    Auto-detects the most recent year with finalized reconciliation snapshots
    and aggregates recoverable CAM, billed amounts, and leakage across all
    properties for that year.

    Args:
        ctx: Organization context

    Returns:
        Portfolio summary with per-property breakdown sorted by leakage DESC
    """
    supabase = get_supabase_admin()

    # 1. Get all properties for org (id + name)
    properties_raw = fetch_all_pages(
        lambda: supabase.table("properties")
        .select("id, name")
        .eq("organization_id", str(ctx.organization_id))
    )

    property_names: dict[str, str] = {}
    for raw_prop in properties_raw:
        prop = _to_row(raw_prop)
        if prop is None:
            continue
        prop_id = prop.get("id")
        if isinstance(prop_id, str):
            property_names[prop_id] = str(prop.get("name", ""))

    property_ids = list(property_names.keys())

    if not property_ids:
        return PortfolioSummaryResponse(
            period_year=None,
            total_recoverable_cam=Decimal("0"),
            total_leakage=Decimal("0"),
            recovery_rate=None,
            properties_with_leakage=0,
            has_billing_data=False,
            total_recovery_all_years=Decimal("0"),
            properties=[],
        )

    # 2. Fetch all finalized snapshots for these properties
    snapshots = fetch_all_pages(
        lambda: supabase.table("reconciliation_snapshots")
        .select("property_id, total_recovery, period_start_date")
        .in_("property_id", property_ids)
        .eq("organization_id", str(ctx.organization_id))
        .eq("status", "finalized")
    )

    if not snapshots:
        return PortfolioSummaryResponse(
            period_year=None,
            total_recoverable_cam=Decimal("0"),
            total_leakage=Decimal("0"),
            recovery_rate=None,
            properties_with_leakage=0,
            has_billing_data=False,
            total_recovery_all_years=Decimal("0"),
            properties=[],
        )

    # 3. Find most recent year from period_start_date
    years: set[int] = set()
    for raw_snap in snapshots:
        snap = _to_row(raw_snap)
        if snap is None:
            continue
        year = _parse_year(snap.get("period_start_date"))
        if year is not None:
            years.add(year)

    if not years:
        return PortfolioSummaryResponse(
            period_year=None,
            total_recoverable_cam=Decimal("0"),
            total_leakage=Decimal("0"),
            recovery_rate=None,
            properties_with_leakage=0,
            has_billing_data=False,
            total_recovery_all_years=Decimal("0"),
            properties=[],
        )

    most_recent_year = max(years)

    # 3b. Sum total_recovery across ALL years for cumulative ROI metric
    total_recovery_all_years = Decimal("0")
    for raw_snap in snapshots:
        snap = _to_row(raw_snap)
        if snap is None:
            continue
        total_recovery_all_years += Decimal(str(snap.get("total_recovery", 0)))

    # 4. Filter snapshots to most recent year and aggregate total_recovery per property
    recoverable_by_property: dict[str, Decimal] = {}
    for raw_snap in snapshots:
        snap = _to_row(raw_snap)
        if snap is None:
            continue
        year = _parse_year(snap.get("period_start_date"))
        if year != most_recent_year:
            continue
        prop_id = snap.get("property_id")
        if not isinstance(prop_id, str):
            continue
        amount = Decimal(str(snap.get("total_recovery", 0)))
        recoverable_by_property[prop_id] = (
            recoverable_by_property.get(prop_id, Decimal("0")) + amount
        )

    # 5. Fetch actual_billed_amounts for org
    billed_data = fetch_all_pages(
        lambda: supabase.table("actual_billed_amounts")
        .select("property_id, billed_amount, period_start_date")
        .eq("organization_id", str(ctx.organization_id))
    )

    # 6. Aggregate billed amounts for most recent year per property only
    billed_by_property: dict[str, Decimal] = {}
    for raw_record in billed_data:
        record = _to_row(raw_record)
        if record is None:
            continue
        year = _parse_year(record.get("period_start_date"))
        if year != most_recent_year:
            continue
        prop_id = record.get("property_id")
        if not isinstance(prop_id, str):
            continue
        amount = Decimal(str(record.get("billed_amount", 0)))
        billed_by_property[prop_id] = (
            billed_by_property.get(prop_id, Decimal("0")) + amount
        )

    # has_billing_data reflects year-filtered data to avoid showing stale rate
    has_billing_data = len(billed_by_property) > 0

    # 7. Build per-property entries
    property_entries: list[PropertyPortfolioEntry] = []
    for prop_id, total_recoverable in recoverable_by_property.items():
        total_billed = billed_by_property.get(prop_id, Decimal("0"))
        leakage = total_recoverable - total_billed

        recovery_rate: float | None = None
        if has_billing_data and total_recoverable > 0:
            recovery_rate = float(total_billed / total_recoverable) * 100

        property_entries.append(
            PropertyPortfolioEntry(
                property_id=UUID(prop_id),
                property_name=property_names.get(prop_id, ""),
                total_recoverable=total_recoverable,
                total_billed=total_billed,
                leakage=leakage,
                recovery_rate=recovery_rate,
            )
        )

    # 8. Sort by leakage DESC
    property_entries.sort(key=lambda e: e.leakage, reverse=True)

    # 9. Compute portfolio-wide totals
    total_recoverable_cam = sum(
        (e.total_recoverable for e in property_entries), Decimal("0")
    )
    total_leakage = sum(
        (e.leakage for e in property_entries if e.leakage > 0), Decimal("0")
    )
    properties_with_leakage = sum(1 for e in property_entries if e.leakage > 0)

    portfolio_recovery_rate: float | None = None
    if has_billing_data and total_recoverable_cam > 0:
        total_billed_sum = sum((e.total_billed for e in property_entries), Decimal("0"))
        portfolio_recovery_rate = float(total_billed_sum / total_recoverable_cam) * 100

    return PortfolioSummaryResponse(
        period_year=most_recent_year,
        total_recoverable_cam=total_recoverable_cam,
        total_leakage=total_leakage,
        recovery_rate=portfolio_recovery_rate,
        properties_with_leakage=properties_with_leakage,
        has_billing_data=has_billing_data,
        total_recovery_all_years=total_recovery_all_years,
        properties=property_entries,
    )
