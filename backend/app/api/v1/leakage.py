"""
Leakage Analysis API.

Endpoints for calculating and viewing leakage (recovery opportunities)
by comparing CapVeri calculations against actual billed amounts.
"""

import logging
from datetime import date
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.auth.dependencies import OrgContext
from app.database.client import get_supabase_admin
from app.database.pagination import fetch_all_pages
from app.services.calculation.leakage import calculate_leakage

logger = logging.getLogger(__name__)

router = APIRouter()


def _to_row(item: Any) -> dict[str, Any] | None:
    """Normalize Supabase row payloads to dictionaries."""
    if isinstance(item, dict):
        return cast(dict[str, Any], item)
    return None


class LeakageResponse(BaseModel):
    """Response model for leakage calculation."""

    property_id: UUID
    period_start: date
    period_end: date
    capveri_calculated: Decimal
    actual_billed: Decimal
    leakage: Decimal
    leakage_pct: float
    has_reconciliation_data: bool
    has_gl_data: bool
    has_billing_data: bool
    breakdown: list[dict[str, Any]]


class LeakageSummaryResponse(BaseModel):
    """Response model for organization-wide leakage summary."""

    total_recovery_opportunity: Decimal = Field(
        description="Legacy under-bill exposure across all properties"
    )
    properties_with_leakage: int = Field(
        description="Legacy count of properties with under-bills"
    )
    total_underbill_exposure: Decimal = Field(
        default=Decimal("0"),
        description="Amount billed below the checked statement total",
    )
    total_overbill_exposure: Decimal = Field(
        default=Decimal("0"),
        description="Amount billed above the checked statement total",
    )
    total_billing_exposure: Decimal = Field(
        default=Decimal("0"),
        description="Total absolute billing difference to review",
    )
    properties_with_underbill: int = Field(
        default=0,
        description="Number of properties billed below the checked statement total",
    )
    properties_with_overbill: int = Field(
        default=0,
        description="Number of properties billed above the checked statement total",
    )
    properties_with_billing_exposure: int = Field(
        default=0,
        description="Number of properties with a billing difference to review",
    )
    has_billing_data: bool = Field(
        description="Whether any billing data has been uploaded"
    )
    draft_recovery: Decimal = Field(
        default=Decimal("0"),
        description="Total recovery from draft (unfinalized) reconciliation snapshots",
    )
    draft_property_count: int = Field(
        default=0,
        description="Number of properties with draft reconciliation snapshots",
    )


@router.get("/summary", response_model=LeakageSummaryResponse)
async def get_leakage_summary(ctx: OrgContext) -> LeakageSummaryResponse:
    """
    Get organization-wide leakage summary for dashboard.

    Aggregates leakage (recovery opportunity) across all properties.

    Args:
        ctx: Organization context

    Returns:
        Summary of recovery opportunity
    """
    supabase = get_supabase_admin()

    # Get all properties for org
    properties = fetch_all_pages(
        lambda: supabase.table("properties")
        .select("id")
        .eq("organization_id", str(ctx.organization_id))
    )
    property_ids: list[str] = []
    for raw_property in properties:
        prop = _to_row(raw_property)
        if prop is None:
            continue
        prop_id = prop.get("id")
        if isinstance(prop_id, str):
            property_ids.append(prop_id)

    if not property_ids:
        return LeakageSummaryResponse(
            total_recovery_opportunity=Decimal("0"),
            properties_with_leakage=0,
            total_underbill_exposure=Decimal("0"),
            total_overbill_exposure=Decimal("0"),
            total_billing_exposure=Decimal("0"),
            properties_with_underbill=0,
            properties_with_overbill=0,
            properties_with_billing_exposure=0,
            has_billing_data=False,
        )

    # Get all finalized reconciliation snapshots for these properties
    snapshots = fetch_all_pages(
        lambda: supabase.table("reconciliation_snapshots")
        .select("property_id, total_recovery")
        .in_("property_id", property_ids)
        .eq("organization_id", str(ctx.organization_id))
        .eq("status", "finalized")
    )

    # Also get draft snapshots for draft_recovery metric
    draft_snapshots = fetch_all_pages(
        lambda: supabase.table("reconciliation_snapshots")
        .select("property_id, total_recovery")
        .in_("property_id", property_ids)
        .eq("organization_id", str(ctx.organization_id))
        .eq("status", "draft")
    )

    # Aggregate draft recovery by property
    draft_by_property: dict[str, Decimal] = {}
    for raw_snapshot in draft_snapshots:
        snap = _to_row(raw_snapshot)
        if snap is None:
            continue
        prop_id = snap.get("property_id")
        if not isinstance(prop_id, str):
            continue
        amount = Decimal(str(snap.get("total_recovery", 0)))
        draft_by_property[prop_id] = (
            draft_by_property.get(prop_id, Decimal("0")) + amount
        )

    draft_recovery = sum(draft_by_property.values(), Decimal("0"))
    draft_property_count = len(draft_by_property)

    # Aggregate calculated amounts by property
    calculated_by_property: dict[str, Decimal] = {}
    for raw_snapshot in snapshots:
        snap = _to_row(raw_snapshot)
        if snap is None:
            continue
        prop_id = snap.get("property_id")
        if not isinstance(prop_id, str):
            continue
        amount = Decimal(str(snap.get("total_recovery", 0)))
        calculated_by_property[prop_id] = (
            calculated_by_property.get(prop_id, Decimal("0")) + amount
        )

    # Get all actual billed amounts for org
    billed_data = fetch_all_pages(
        lambda: supabase.table("actual_billed_amounts")
        .select("property_id, billed_amount")
        .eq("organization_id", str(ctx.organization_id))
        .in_("property_id", property_ids)
    )
    has_billing_data = len(billed_data) > 0

    # Aggregate billed amounts by property
    billed_by_property: dict[str, Decimal] = {}
    for raw_record in billed_data:
        record = _to_row(raw_record)
        if record is None:
            continue
        prop_id = record.get("property_id")
        if not isinstance(prop_id, str):
            continue
        amount = Decimal(str(record.get("billed_amount", 0)))
        billed_by_property[prop_id] = (
            billed_by_property.get(prop_id, Decimal("0")) + amount
        )

    total_underbill_exposure = Decimal("0")
    total_overbill_exposure = Decimal("0")
    total_billing_exposure = Decimal("0")
    properties_with_underbill = 0
    properties_with_overbill = 0
    properties_with_billing_exposure = 0

    for prop_id in property_ids:
        calculated = calculated_by_property.get(prop_id, Decimal("0"))
        billed = billed_by_property.get(prop_id, Decimal("0"))
        variance = calculated - billed

        if variance > 0:
            total_underbill_exposure += variance
            total_billing_exposure += variance
            properties_with_underbill += 1
            properties_with_billing_exposure += 1
        elif variance < 0:
            overbill = abs(variance)
            total_overbill_exposure += overbill
            total_billing_exposure += overbill
            properties_with_overbill += 1
            properties_with_billing_exposure += 1

    return LeakageSummaryResponse(
        total_recovery_opportunity=total_underbill_exposure,
        properties_with_leakage=properties_with_underbill,
        total_underbill_exposure=total_underbill_exposure,
        total_overbill_exposure=total_overbill_exposure,
        total_billing_exposure=total_billing_exposure,
        properties_with_underbill=properties_with_underbill,
        properties_with_overbill=properties_with_overbill,
        properties_with_billing_exposure=properties_with_billing_exposure,
        has_billing_data=has_billing_data,
        draft_recovery=draft_recovery,
        draft_property_count=draft_property_count,
    )


@router.get("/{property_id}", response_model=LeakageResponse)
async def get_leakage(
    ctx: OrgContext,
    property_id: UUID,
    period_start: date,
    period_end: date,
    include_drafts: bool = Query(False),
) -> LeakageResponse:
    """
    Calculate leakage for a property.

    Compares CapVeri's calculated recovery against what was actually billed
    to identify the recovery opportunity.

    Args:
        ctx: Organization context
        property_id: Property to analyze
        period_start: Start of analysis period
        period_end: End of analysis period

    Returns:
        Leakage analysis with breakdown
    """
    if period_start >= period_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="period_start must be before period_end",
        )

    result = calculate_leakage(
        organization_id=ctx.organization_id,
        property_id=property_id,
        period_start=period_start,
        period_end=period_end,
        include_drafts=include_drafts,
    )

    return LeakageResponse(
        property_id=result.property_id,
        period_start=result.period_start,
        period_end=result.period_end,
        capveri_calculated=result.capveri_calculated,
        actual_billed=result.actual_billed,
        leakage=result.leakage,
        leakage_pct=result.leakage_pct,
        has_reconciliation_data=result.has_reconciliation_data,
        has_gl_data=result.has_gl_data,
        has_billing_data=result.has_billing_data,
        breakdown=[
            {
                "tenant_name": b.tenant_name,
                "calculated_amount": float(b.calculated_amount),
                "billed_amount": float(b.billed_amount),
                "difference": float(b.difference),
                "difference_pct": b.difference_pct,
            }
            for b in result.breakdown
        ],
    )
