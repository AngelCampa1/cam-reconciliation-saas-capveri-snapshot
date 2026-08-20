"""
Tax Protest Data Package endpoints.

GET  /api/v1/tax-protest/deadlines?year={year}  — per-property deadline list
POST /api/v1/tax-protest/generate               — stream ZIP with 4-file package
"""

import fnmatch
import logging
import zipfile
from datetime import date
from decimal import Decimal
from io import BytesIO, StringIO
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.api.v1.exports import TenantPacketGenerator, _load_export_context
from app.auth.dependencies import OrgContext
from app.database.client import get_supabase_admin
from app.database.pagination import fetch_all_pages
from app.exceptions import BadRequestError, NotFoundError
from app.models import ReconciliationStatus
from app.services.billing.entitlements import has_tax_protest_access
from app.services.billing.feature_usage import record_feature_use
from app.services.export.gl_category_csv import GLCategoryCSVExporter
from app.services.export.variance_pdf import generate_variance_pdf
from app.services.tax_protest.cover_sheet_generator import (
    CoverSheetData,
    TaxProtestCoverSheetGenerator,
)
from app.services.tax_protest.deadline_service import (
    compute_days_remaining,
    compute_effective_deadline,
    get_deadline_for_county,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Response / request schemas
# ---------------------------------------------------------------------------


class PropertyDeadlineItem(BaseModel):
    property_id: str
    property_name: str
    county: str | None
    state: str | None
    effective_deadline: date | None
    days_remaining: int | None
    is_past: bool
    is_configured: bool


class DeadlinesResponse(BaseModel):
    items: list[PropertyDeadlineItem]
    year: int


class TaxProtestRequest(BaseModel):
    snapshot_id: UUID
    tax_year: int
    county: str | None = None
    state: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _fetch_pool_details(ctx: OrgContext, property_id: UUID, year: int) -> list[dict]:
    """Fetch expense pools + GL entries and return pool detail dicts."""
    pools_resp = (
        ctx.table("expense_pools")
        .select("id, name, pool_type")
        .eq("property_id", str(property_id))
        .execute()
    )
    pools_data = pools_resp.data or []
    if not pools_data:
        return []

    pool_ids = [p["id"] for p in pools_data]
    pool_info = {p["id"]: p for p in pools_data}

    mappings_resp = (
        ctx.table("pool_mappings")
        .select("expense_pool_id, gl_account_pattern, allocation_percentage")
        .in_("expense_pool_id", pool_ids)
        .execute()
    )
    mappings_data = mappings_resp.data or []

    pool_mappings: dict[str, list[dict]] = {pid: [] for pid in pool_ids}
    for m in mappings_data:
        pool_mappings[m["expense_pool_id"]].append(m)

    gl_entries = fetch_all_pages(
        lambda: ctx.table("gl_entries")
        .select("id, account_code, account_description, amount")
        .eq("property_id", str(property_id))
        .eq("period_year", year)
    )

    pool_items: dict[str, list[dict]] = {pid: [] for pid in pool_ids}

    for entry in gl_entries:
        code = entry.get("account_code", "")
        amount = Decimal(str(entry.get("amount", 0)))
        desc = entry.get("account_description", code)

        for pool_id, mapping_list in pool_mappings.items():
            for mapping in mapping_list:
                pattern = mapping["gl_account_pattern"].replace("%", "*")
                if fnmatch.fnmatch(code, pattern):
                    alloc = Decimal(str(mapping.get("allocation_percentage", 1)))
                    pool_items[pool_id].append(
                        {
                            "account_code": code,
                            "account_description": desc,
                            "amount": str(amount * alloc),
                        }
                    )
                    break

    result = []
    for pool_id, items in pool_items.items():
        if not items:
            continue
        info = pool_info[pool_id]
        pool_total = sum(Decimal(i["amount"]) for i in items)
        result.append(
            {
                "pool_name": info["name"],
                "pool_type": info.get("pool_type", "operating"),
                "pool_total": str(pool_total),
                "items": items,
            }
        )
    return result


def _fetch_prior_snapshots(ctx: OrgContext, property_id: UUID, year: int) -> list[dict]:
    """Return finalized snapshots for the prior year."""
    year_start = f"{year}-01-01"
    year_end = f"{year}-12-31"
    return fetch_all_pages(
        lambda: ctx.table("reconciliation_snapshots")
        .select("*")
        .eq("organization_id", str(ctx.organization_id))
        .eq("property_id", str(property_id))
        .eq("status", ReconciliationStatus.FINALIZED.value)
        .gte("period_start_date", year_start)
        .lte("period_end_date", year_end)
    )


# ---------------------------------------------------------------------------
# GET /deadlines
# ---------------------------------------------------------------------------


@router.get("/deadlines", response_model=DeadlinesResponse)
async def get_deadlines(
    ctx: OrgContext,
    year: Annotated[int | None, Query(ge=2000, le=2100)] = None,
) -> DeadlinesResponse:
    """Return all org properties with their effective tax protest deadlines."""
    effective_year = year or date.today().year

    props_result = (
        ctx.table("properties")
        .select("id, name, state, tax_protest_county, tax_protest_deadline_override")
        .eq("organization_id", str(ctx.organization_id))
        .execute()
    )
    properties = props_result.data or []

    items = []
    for prop in properties:
        county = prop.get("tax_protest_county")
        state = prop.get("state")
        override_raw = prop.get("tax_protest_deadline_override")
        override_date: date | None = None
        if override_raw:
            override_date = (
                date.fromisoformat(override_raw)
                if isinstance(override_raw, str)
                else override_raw
            )

        county_deadline = (
            get_deadline_for_county(state or "", county or "") if county else None
        )
        effective_deadline = compute_effective_deadline(
            county_deadline, override_date, effective_year
        )

        if effective_deadline is not None:
            days_remaining: int | None = compute_days_remaining(effective_deadline)
            is_past = days_remaining is not None and days_remaining < 0
        else:
            days_remaining = None
            is_past = False

        is_configured = bool(county or override_date)

        items.append(
            PropertyDeadlineItem(
                property_id=prop["id"],
                property_name=prop.get("name", ""),
                county=county,
                state=state,
                effective_deadline=effective_deadline,
                days_remaining=days_remaining,
                is_past=is_past,
                is_configured=is_configured,
            )
        )

    return DeadlinesResponse(items=items, year=effective_year)


# ---------------------------------------------------------------------------
# POST /generate
# ---------------------------------------------------------------------------


@router.post("/generate")
async def generate_tax_protest_package(
    body: TaxProtestRequest,
    ctx: OrgContext,
) -> StreamingResponse:
    """Generate a 4-file ZIP tax protest data package for a finalized snapshot.

    Guards (in order):
    1. Reconcile subscription required -> 402
    2. Snapshot must exist and belong to org -> 404
    3. Snapshot must be finalized -> 400
    """
    # Guard 1: entitlement
    if not has_tax_protest_access(ctx):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=(
                "reconcile_subscription_required: Tax protest data package "
                "requires an active Reconcile subscription."
            ),
        )

    # Guard 2: snapshot exists + belongs to org
    snapshot_result = (
        ctx.table("reconciliation_snapshots")
        .select(
            "id, organization_id, property_id, lease_id, status, "
            "total_recovery, period_start_date, period_end_date"
        )
        .eq("id", str(body.snapshot_id))
        .eq("organization_id", str(ctx.organization_id))
        .execute()
    )

    if not snapshot_result.data:
        raise NotFoundError("reconciliation_snapshot", str(body.snapshot_id))

    snapshot_data = snapshot_result.data[0]

    # Guard 3: finalized
    if snapshot_data.get("status") != ReconciliationStatus.FINALIZED.value:
        raise BadRequestError(
            "Tax protest packages can only be generated for finalized snapshots. "
            f"Current status: {snapshot_data.get('status')!r}."
        )

    # Load lease / property / org context
    lease_data, property_data, org_data = _load_export_context(ctx, snapshot_data)

    property_id = UUID(snapshot_data["property_id"])
    tax_year = body.tax_year

    # Resolve county/state: request overrides > property config
    county = body.county or property_data.get("tax_protest_county")
    state = body.state or property_data.get("state")

    # ----------------------------------------------------------------
    # File 1: 01_Expense_Summary.pdf
    # ----------------------------------------------------------------
    generator = TenantPacketGenerator(
        snapshot_data=snapshot_data,
        lease_data=lease_data,
        property_data=property_data,
        org_data=org_data,
    )
    expense_summary_buf: BytesIO = generator.generate()

    # ----------------------------------------------------------------
    # File 2: 02_GL_by_Category.csv
    # ----------------------------------------------------------------
    pool_details = _fetch_pool_details(ctx, property_id, tax_year)
    csv_exporter = GLCategoryCSVExporter(pool_details, tax_year)
    gl_csv_sio: StringIO = csv_exporter.generate()
    gl_csv_bytes = gl_csv_sio.getvalue().encode("utf-8")

    # ----------------------------------------------------------------
    # File 3: 03_Year_Over_Year_Comparison.pdf
    # ----------------------------------------------------------------
    prior_snapshots = _fetch_prior_snapshots(ctx, property_id, tax_year - 1)
    yoy_buf: BytesIO = generate_variance_pdf(
        [snapshot_data],
        prior_snapshots,
        tax_year,
        tax_year - 1,
        10.0,
        property_data,
    )

    # ----------------------------------------------------------------
    # File 4: 04_County_Cover_Sheet.pdf
    # ----------------------------------------------------------------
    county_deadline = (
        get_deadline_for_county(state or "", county or "") if county else None
    )
    override_raw = property_data.get("tax_protest_deadline_override")
    deadline_override: date | None = None
    if override_raw:
        deadline_override = (
            date.fromisoformat(override_raw)
            if isinstance(override_raw, str)
            else override_raw
        )
    effective_deadline = compute_effective_deadline(
        county_deadline, deadline_override, tax_year
    )
    days_remaining: int | None = (
        compute_days_remaining(effective_deadline) if effective_deadline else None
    )

    cover_data = CoverSheetData(
        property_name=property_data.get("name", ""),
        property_address=property_data.get("address", ""),
        county=county or "Not configured",
        state=state or "",
        effective_deadline=effective_deadline,
        days_remaining=days_remaining,
        notes=county_deadline.notes if county_deadline else "",
        tax_year=tax_year,
    )
    cover_buf: BytesIO = TaxProtestCoverSheetGenerator(cover_data).generate()

    # ----------------------------------------------------------------
    # Build ZIP
    # ----------------------------------------------------------------
    zip_buf = BytesIO()
    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("01_Expense_Summary.pdf", expense_summary_buf.read())
        zf.writestr("02_GL_by_Category.csv", gl_csv_bytes)
        zf.writestr("03_Year_Over_Year_Comparison.pdf", yoy_buf.read())
        zf.writestr("04_County_Cover_Sheet.pdf", cover_buf.read())

    zip_buf.seek(0)
    prop_name_safe = (
        property_data.get("name", "property").replace("/", "-").replace("\\", "-")
    )
    filename = f"tax-protest-{prop_name_safe}-{tax_year}.zip"

    record_feature_use(get_supabase_admin(), str(ctx.organization_id), "tax_protest")
    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
