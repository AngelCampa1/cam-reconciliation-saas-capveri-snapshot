"""Audit Trail query endpoint.

Provides a JSON API for browsing the organization's audit log — who changed
what, when, and from what value — for programmatic inspection and tenant
dispute defense.
"""

from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.auth.dependencies import CurrentAdminUser, OrgContext
from app.models.responses import PaginatedResponse, create_paginated_response

router = APIRouter()


class AuditLogEntry(BaseModel):
    """Single entry from the audit_log table."""

    id: int
    table_name: str
    operation: str
    row_id: UUID | None = None
    old_data: dict | None = None
    new_data: dict | None = None
    changed_by: UUID | None = None
    changed_at: datetime
    organization_id: UUID | None = None
    session_info: dict | None = None


@router.get("", response_model=PaginatedResponse[AuditLogEntry])
async def list_audit_log(
    ctx: OrgContext,
    _user: CurrentAdminUser,
    start_date: Annotated[
        date | None, Query(description="Filter entries from this date (inclusive)")
    ] = None,
    end_date: Annotated[
        date | None, Query(description="Filter entries to this date (inclusive)")
    ] = None,
    table_name: Annotated[
        str | None,
        Query(
            description="Filter by table (gl_entries, reconciliation_snapshots, leases)"
        ),
    ] = None,
    operation: Annotated[
        str | None,
        Query(description="Filter by operation type (INSERT, UPDATE, DELETE)"),
    ] = None,
    row_id: Annotated[
        UUID | None,
        Query(description="Filter by the specific record that was changed"),
    ] = None,
    changed_by: Annotated[
        UUID | None, Query(description="Filter by the user who made the change")
    ] = None,
    page: Annotated[int, Query(ge=1, description="Page number (1-indexed)")] = 1,
    page_size: Annotated[
        int, Query(ge=1, le=100, description="Items per page (max 100)")
    ] = 50,
) -> PaginatedResponse[AuditLogEntry]:
    """
    Query audit log entries as JSON (admin only).

    Returns paginated audit log entries for the organization, supporting
    all filter combinations. Ordered most-recent-first.

    Use this endpoint for programmatic browsing and dispute defense tooling.
    For bulk exports, use GET /api/v1/exports/audit-log (CSV).
    """
    org_id = str(ctx.organization_id)
    offset = (page - 1) * page_size

    query = (
        ctx.table("audit_log").select("*", count="exact").eq("organization_id", org_id)
    )

    if start_date:
        query = query.gte("changed_at", start_date.isoformat())

    if end_date:
        end_datetime = datetime.combine(end_date, datetime.max.time())
        query = query.lte("changed_at", end_datetime.isoformat())

    if table_name:
        query = query.eq("table_name", table_name)

    if operation:
        query = query.eq("operation", operation.upper())

    if row_id:
        query = query.eq("row_id", str(row_id))

    if changed_by:
        query = query.eq("changed_by", str(changed_by))

    query = query.order("changed_at", desc=True)
    query = query.range(offset, offset + page_size - 1)

    result = query.execute()
    entries = result.data if result.data else []
    total = result.count if result.count is not None else len(entries)

    items = [AuditLogEntry(**entry) for entry in entries]
    return create_paginated_response(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )
