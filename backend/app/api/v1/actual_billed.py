"""
Actual Billed Amounts API.

Endpoints for uploading and managing what users actually billed tenants.
This data is compared against CapVeri calculations to identify leakage.
"""

import logging
from datetime import date
from decimal import Decimal
from typing import Any, cast
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.auth.dependencies import OrgContext, require_org_editor
from app.database.client import get_supabase_admin
from app.database.pagination import fetch_all_pages
from app.services.ingestion.parsers.billing import BillingParser

logger = logging.getLogger(__name__)

router = APIRouter()


def _to_row(item: Any) -> dict[str, Any] | None:
    """Normalize Supabase row payloads to dictionaries."""
    if isinstance(item, dict):
        return cast(dict[str, Any], item)
    return None


def _decimal_to_db(value: Decimal) -> str:
    """Serialize money without losing precision through JSON floats."""
    return format(value, "f")


def _validate_period(period_start: date, period_end: date) -> None:
    if period_start >= period_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="period_start must be before period_end",
        )


async def _verify_property_access(property_id: UUID, ctx: OrgContext) -> None:
    result = (
        ctx.table("properties")
        .select("id")
        .eq("id", str(property_id))
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property not found",
        )


async def _verify_pool_access(
    pool_id: UUID, property_id: UUID, ctx: OrgContext
) -> None:
    """Ensure the expense pool exists and belongs to the given property.

    Pools are scoped to a property (which the caller already org-verifies), so
    matching on property_id prevents attaching billed amounts to another
    organization's pool through the service-role insert.
    """
    result = (
        ctx.table("expense_pools")
        .select("id")
        .eq("id", str(pool_id))
        .eq("property_id", str(property_id))
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense pool not found",
        )


class BilledAmountItem(BaseModel):
    """Single billed amount entry."""

    id: UUID | None = None
    tenant_name: str
    billed_amount: Decimal
    suite: str | None = None
    lease_id: UUID | None = None
    match_status: str | None = None
    pool_id: UUID | None = None


class UploadBillingResponse(BaseModel):
    """Response from billing data upload."""

    success: bool
    source_type: str
    items: list[BilledAmountItem]
    total_billed: Decimal
    row_count: int
    matched_row_count: int = 0
    unmatched_row_count: int = 0
    warnings: list[str] = []


class ManualBillingRequest(BaseModel):
    """Request to manually enter total billed amount."""

    property_id: UUID
    period_start: date
    period_end: date
    total_billed: Decimal = Field(..., ge=Decimal("0"))
    pool_id: UUID | None = None


class ManualBillingResponse(BaseModel):
    """Response from manual billing entry."""

    id: UUID
    property_id: UUID
    period_start: date
    period_end: date
    total_billed: Decimal
    pool_id: UUID | None = None


class BilledAmountsResponse(BaseModel):
    """Response with aggregated billed amounts for a property."""

    property_id: UUID
    period_start: date
    period_end: date
    total_billed: Decimal
    items: list[dict[str, Any]]


@router.post(
    "/upload",
    response_model=UploadBillingResponse,
    dependencies=[Depends(require_org_editor)],
)
async def upload_billing_file(
    ctx: OrgContext,
    file: UploadFile = File(...),
    property_id: UUID = Form(...),
    period_start: date = Form(...),
    period_end: date = Form(...),
) -> UploadBillingResponse:
    """
    Upload a billing data file (CAM reconciliation export).

    Parses the file and extracts tenant names and billed amounts.
    The data is stored for comparison against CapVeri calculations.

    Args:
        ctx: Organization-scoped context
        file: The uploaded CSV or Excel file
        property_id: Property this billing data relates to
        period_start: Start of billing period
        period_end: End of billing period

    Returns:
        Parsed billing data with tenant details and totals
    """
    _validate_period(period_start, period_end)
    await _verify_property_access(property_id, ctx)

    parser = BillingParser()
    result = parser.parse(file.file, file.filename or "unknown")

    if not result.success:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "Failed to parse billing file", "errors": result.errors},
        )

    # Store parsed data in database
    supabase = get_supabase_admin()

    if result.data:
        rows = [
            {
                "organization_id": str(ctx.organization_id),
                "property_id": str(property_id),
                "period_start_date": period_start.isoformat(),
                "period_end_date": period_end.isoformat(),
                "tenant_name": item.tenant_name,
                "billed_amount": _decimal_to_db(item.billed_amount),
                "source_type": result.source_type,
            }
            for item in result.data
        ]
        insert_result = supabase.table("actual_billed_amounts").insert(rows).execute()
        if len(insert_result.data or []) != len(rows):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create all billing records",
            )

    return UploadBillingResponse(
        success=True,
        source_type=result.source_type,
        items=[
            BilledAmountItem(
                tenant_name=item.tenant_name,
                billed_amount=item.billed_amount,
                suite=item.suite,
                lease_id=None,
                match_status="needs_review",
            )
            for item in result.data
        ],
        total_billed=result.total_billed,
        row_count=result.row_count,
        matched_row_count=0,
        unmatched_row_count=len(result.data),
        warnings=result.warnings,
    )


@router.post(
    "/manual",
    response_model=ManualBillingResponse,
    dependencies=[Depends(require_org_editor)],
)
async def create_manual_billing(
    ctx: OrgContext,
    request: ManualBillingRequest,
) -> ManualBillingResponse:
    """
    Manually enter the total amount billed for a property.

    Use this when users don't have a detailed billing export
    but know their total CAM charges for the period.

    Args:
        ctx: Organization-scoped context
        request: Manual billing entry details

    Returns:
        Created billing record
    """
    _validate_period(request.period_start, request.period_end)
    await _verify_property_access(request.property_id, ctx)
    if request.pool_id is not None:
        await _verify_pool_access(request.pool_id, request.property_id, ctx)

    supabase = get_supabase_admin()

    result = (
        supabase.table("actual_billed_amounts")
        .insert(
            {
                "organization_id": str(ctx.organization_id),
                "property_id": str(request.property_id),
                "period_start_date": request.period_start.isoformat(),
                "period_end_date": request.period_end.isoformat(),
                "tenant_name": "TOTAL (Manual Entry)",
                "billed_amount": _decimal_to_db(request.total_billed),
                "source_type": "manual",
                "pool_id": (
                    str(request.pool_id) if request.pool_id is not None else None
                ),
            }
        )
        .execute()
    )

    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create billing record",
        )

    record = _to_row(result.data[0]) if result.data else None
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Invalid billing record response",
        )

    return ManualBillingResponse(
        id=UUID(record["id"]),
        property_id=request.property_id,
        period_start=request.period_start,
        period_end=request.period_end,
        total_billed=request.total_billed,
        pool_id=request.pool_id,
    )


@router.get("/{property_id}", response_model=BilledAmountsResponse)
async def get_billed_amounts(
    ctx: OrgContext,
    property_id: UUID,
    period_start: date,
    period_end: date,
) -> BilledAmountsResponse:
    """
    Get aggregated billed amounts for a property and period.

    Args:
        ctx: Organization-scoped context
        property_id: Property to get billing data for
        period_start: Start of period
        period_end: End of period

    Returns:
        Aggregated billing data with total and breakdown
    """
    _validate_period(period_start, period_end)
    await _verify_property_access(property_id, ctx)
    supabase = get_supabase_admin()

    raw_items = fetch_all_pages(
        lambda: supabase.table("actual_billed_amounts")
        .select("*")
        .eq("organization_id", str(ctx.organization_id))
        .eq("property_id", str(property_id))
        .lte("period_start_date", period_end.isoformat())
        .gte("period_end_date", period_start.isoformat())
    )
    items: list[dict[str, Any]] = []
    total_billed = Decimal("0")
    for raw_item in raw_items:
        item = _to_row(raw_item)
        if item is None:
            continue
        items.append(item)
        billed_amount = item.get("billed_amount")
        total_billed += Decimal(str(billed_amount if billed_amount is not None else 0))

    return BilledAmountsResponse(
        property_id=property_id,
        period_start=period_start,
        period_end=period_end,
        total_billed=total_billed,
        items=items,
    )


@router.delete(
    "/{property_id}",
    dependencies=[Depends(require_org_editor)],
)
async def delete_billed_amounts(
    ctx: OrgContext,
    property_id: UUID,
    period_start: date | None = None,
    period_end: date | None = None,
) -> dict[str, str]:
    """
    Delete billed amounts for a property.

    Optionally filter by period. If no period specified,
    deletes all billing data for the property.

    Args:
        ctx: Organization-scoped context
        property_id: Property to delete billing data for
        period_start: Optional start of period filter
        period_end: Optional end of period filter

    Returns:
        Confirmation message
    """
    await _verify_property_access(property_id, ctx)
    supabase = get_supabase_admin()

    query = (
        supabase.table("actual_billed_amounts")
        .delete()
        .eq("organization_id", str(ctx.organization_id))
        .eq("property_id", str(property_id))
    )

    if period_start and period_end:
        _validate_period(period_start, period_end)

    if period_end:
        query = query.lte("period_start_date", period_end.isoformat())
    if period_start:
        query = query.gte("period_end_date", period_start.isoformat())

    query.execute()

    return {"message": "Billing data deleted successfully"}
