"""California SB 1103 Compliance endpoints.

Provides CRUD + export operations for SB 1103 compliance requests.

California SB 1103 (effective January 1, 2025) requires landlords to provide
Qualified Commercial Tenants (QCTs) with an itemized 18-month historical CAM
expense ledger within 30 days of a written request.

Endpoints:
    GET  /compliance/sb1103                     - list requests
    POST /compliance/sb1103                     - create request
    GET  /compliance/sb1103/alerts              - deadline alerts (BEFORE /{id})
    GET  /compliance/sb1103/{request_id}        - get single
    PATCH /compliance/sb1103/{request_id}       - update
    DELETE /compliance/sb1103/{request_id}      - delete (admin only)
    POST /compliance/sb1103/{request_id}/export - generate export
"""

import io
import logging
import zipfile
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.auth.dependencies import (
    CurrentAdminUser,
    OrgContext,
    require_full_access,
    require_org_editor,
)
from app.database.client import get_supabase_admin
from app.exceptions import NotFoundError
from app.schemas.sb1103 import (
    SB1103DeadlineAlert,
    SB1103ListResponse,
    SB1103Request,
    SB1103RequestCreate,
    SB1103RequestUpdate,
)
from app.services.billing.feature_usage import record_feature_use
from app.services.compliance.sb1103_service import (
    build_sb1103_export_data,
    compute_response_deadline,
    compute_window_start,
    generate_excel_export,
    generate_pdf_export,
    get_deadline_alerts,
)

logger = logging.getLogger(__name__)

router = APIRouter()

_XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@router.get("", response_model=SB1103ListResponse)
async def list_sb1103_requests(
    ctx: OrgContext,
    property_id: UUID | None = Query(None),
    status: str | None = Query(None),
) -> SB1103ListResponse:
    """List SB 1103 compliance requests for the organization.

    Filterable by property_id and status.
    """
    qb = ctx.table("sb1103_requests").select("*").order("created_at", desc=True)
    if property_id is not None:
        qb = qb.eq("property_id", str(property_id))
    if status is not None:
        qb = qb.eq("status", status)

    result = qb.execute()
    data = result.data or []
    requests = [SB1103Request.model_validate(r) for r in data]
    return SB1103ListResponse(data=requests, count=len(requests), has_more=False)


# ---------------------------------------------------------------------------
# Alerts — MUST be before /{request_id} to avoid routing conflict
# ---------------------------------------------------------------------------


@router.get("/alerts", response_model=list[SB1103DeadlineAlert])
async def get_sb1103_alerts(
    ctx: OrgContext,
    days_warning: int = Query(default=7, ge=0),
) -> list[SB1103DeadlineAlert]:
    """Return SB 1103 requests with deadlines within days_warning days.

    Includes overdue requests (negative days_remaining). Excludes 'delivered'.
    """
    return get_deadline_alerts(ctx, days_warning=days_warning)


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=SB1103Request,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def create_sb1103_request(
    payload: SB1103RequestCreate,
    ctx: OrgContext,
) -> SB1103Request:
    """Create a new SB 1103 compliance request.

    Auto-computes response_deadline (request_date + 30 days),
    window_start_date (request_date - 18 calendar months),
    and window_end_date (= request_date).
    """
    # Validate property belongs to org
    prop_result = (
        ctx.table("properties")
        .select("id")
        .eq("id", str(payload.property_id))
        .maybe_single()
        .execute()
    )
    if not prop_result or not prop_result.data:
        raise NotFoundError("Property", str(payload.property_id))

    # Validate lease belongs to org and the requested property
    lease_result = (
        ctx.table("leases")
        .select("id, property_id")
        .eq("id", str(payload.lease_id))
        .maybe_single()
        .execute()
    )
    if not lease_result or not lease_result.data:
        raise NotFoundError("Lease", str(payload.lease_id))
    lease_data = (
        lease_result.data[0]
        if isinstance(lease_result.data, list)
        else lease_result.data
    )
    if str(lease_data.get("property_id")) != str(payload.property_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lease does not belong to the requested property",
        )

    request_date = payload.request_date
    now = datetime.now(UTC)

    row = {
        "organization_id": str(ctx.user.organization_id),
        "property_id": str(payload.property_id),
        "lease_id": str(payload.lease_id),
        "requested_by_name": payload.requested_by_name,
        "requested_by_email": payload.requested_by_email,
        "request_date": request_date.isoformat(),
        "response_deadline": compute_response_deadline(request_date).isoformat(),
        "window_start_date": compute_window_start(request_date).isoformat(),
        "window_end_date": request_date.isoformat(),
        "status": "pending",
        "notes": payload.notes,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }

    insert_result = ctx.table("sb1103_requests").insert(row).execute()
    created = (insert_result.data or [row])[0]
    return SB1103Request.model_validate(created)


# ---------------------------------------------------------------------------
# Get single
# ---------------------------------------------------------------------------


@router.get("/{request_id}", response_model=SB1103Request)
async def get_sb1103_request(
    request_id: UUID,
    ctx: OrgContext,
) -> SB1103Request:
    """Get a single SB 1103 compliance request by ID."""
    result = (
        ctx.table("sb1103_requests").select("*").eq("id", str(request_id)).execute()
    )
    data = result.data
    if not data:
        raise NotFoundError("SB1103Request", str(request_id))
    record = data[0] if isinstance(data, list) else data
    return SB1103Request.model_validate(record)


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


@router.patch(
    "/{request_id}",
    response_model=SB1103Request,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def update_sb1103_request(
    request_id: UUID,
    payload: SB1103RequestUpdate,
    ctx: OrgContext,
) -> SB1103Request:
    """Partially update an SB 1103 compliance request."""
    # Verify exists
    existing = (
        ctx.table("sb1103_requests").select("*").eq("id", str(request_id)).execute()
    )
    existing_data = existing.data
    if not existing_data:
        raise NotFoundError("SB1103Request", str(request_id))

    updates = payload.model_dump(exclude_none=True)
    updates["updated_at"] = datetime.now(UTC).isoformat()

    update_result = (
        ctx.table("sb1103_requests").update(updates).eq("id", str(request_id)).execute()
    )

    # Return updated record, falling back to merged existing + updates
    updated_data = update_result.data
    if updated_data:
        record = updated_data[0] if isinstance(updated_data, list) else updated_data
    else:
        # Merge updates into existing for mock environments
        record = existing_data[0] if isinstance(existing_data, list) else existing_data
        record.update(updates)

    return SB1103Request.model_validate(record)


# ---------------------------------------------------------------------------
# Delete (admin only)
# ---------------------------------------------------------------------------


@router.delete(
    "/{request_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_full_access)],
)
async def delete_sb1103_request(
    request_id: UUID,
    ctx: OrgContext,
    _admin: CurrentAdminUser,
) -> None:
    """Delete an SB 1103 compliance request (admin only)."""
    existing = (
        ctx.table("sb1103_requests").select("id").eq("id", str(request_id)).execute()
    )
    if not existing.data:
        raise NotFoundError("SB1103Request", str(request_id))

    ctx.table("sb1103_requests").delete().eq("id", str(request_id)).execute()


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def _tenant_slug(tenant_name: str) -> str:
    """Convert tenant name to a URL-safe slug for filenames."""
    slug = tenant_name.strip().replace(" ", "_")
    safe = "".join(c for c in slug if c.isalnum() or c == "_")
    return safe[:30] or "Tenant"


@router.post(
    "/{request_id}/export",
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def export_sb1103_request(
    request_id: UUID,
    ctx: OrgContext,
    format: str = Query(..., description="Export format: pdf, excel, or both"),
) -> StreamingResponse:
    """Generate a SB 1103 compliance export (PDF, Excel, or both as ZIP).

    Sets status='exported' and exported_at=now() on the request record.

    Filename pattern: SB1103_{TenantSlug}_{WindowStart}_{WindowEnd}.{ext}
    """
    if format not in ("pdf", "excel", "both"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid export format '{format}'. Must be pdf, excel, or both.",
        )

    try:
        export_data = build_sb1103_export_data(ctx, request_id)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        ) from e

    tenant_slug = _tenant_slug(export_data.tenant_name)
    start_str = export_data.request.window_start_date.strftime("%Y%m%d")
    end_str = export_data.request.window_end_date.strftime("%Y%m%d")
    base_name = f"SB1103_{tenant_slug}_{start_str}_{end_str}"

    # Generate file bytes BEFORE updating DB status — if generation fails,
    # we must not mark the request as exported.
    if format == "pdf":
        file_bytes = generate_pdf_export(export_data)
        media_type = "application/pdf"
        filename = f"{base_name}.pdf"
    elif format == "excel":
        file_bytes = generate_excel_export(export_data)
        media_type = _XLSX_CONTENT_TYPE
        filename = f"{base_name}.xlsx"
    else:
        # Both — return as ZIP
        pdf_bytes = generate_pdf_export(export_data)
        xlsx_bytes = generate_excel_export(export_data)
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(
            zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED
        ) as zf:
            zf.writestr(f"{base_name}.pdf", pdf_bytes.getvalue())
            zf.writestr(f"{base_name}.xlsx", xlsx_bytes.getvalue())
        zip_buffer.seek(0)
        file_bytes = zip_buffer
        media_type = "application/zip"
        filename = f"{base_name}.zip"

    # Update request status only after successful file generation
    now_iso = datetime.now(UTC).isoformat()
    ctx.table("sb1103_requests").update(
        {
            "status": "exported",
            "export_format": format,
            "exported_at": now_iso,
            "updated_at": now_iso,
        }
    ).eq("id", str(request_id)).execute()

    record_feature_use(
        get_supabase_admin(), str(ctx.organization_id), "sb1103_compliance_export"
    )
    return StreamingResponse(
        file_bytes,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
