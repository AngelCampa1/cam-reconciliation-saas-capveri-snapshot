"""Tenant dashboard API endpoint.

Provides read-only access to tenant's lease information and reconciliation statements.
"""

import logging
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.api.v1.exports import TenantPacketGenerator
from app.auth.dependencies import CurrentTenantUser
from app.database.client import SupabaseDB, get_supabase
from app.models.enums import DisputeStatus, ReconciliationStatus, StatementStatus
from app.models.tenant import TenantUser
from app.schemas.tenant import (
    LeaseDetailDTO,
    PropertySummaryDTO,
    StatementSummaryDTO,
    TenantDashboardResponse,
    UnitSummaryDTO,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tenant", tags=["tenant"])


def _tenant_statement_pdf_url(statement_id: str, status: str) -> str | None:
    """Return tenant PDF URL only for finalized statements."""
    if status != ReconciliationStatus.FINALIZED.value:
        return None
    return f"/api/v1/tenant/statements/{statement_id}/pdf"


def _load_statement_pdf_context(
    db: SupabaseDB,
    current_tenant: TenantUser,
    snapshot: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Load lease, property, and organization rows needed for tenant PDF generation."""
    lease_id = str(snapshot["lease_id"])
    lease_result = (
        db.table("leases")
        .select("id, property_id, tenant_name")
        .eq("id", lease_id)
        .execute()
    )
    lease_data = lease_result.data[0] if lease_result.data else {}
    if not lease_data:
        raise HTTPException(status_code=404, detail="Statement not found")

    property_id = str(snapshot.get("property_id") or lease_data.get("property_id"))
    property_result = (
        db.table("properties")
        .select("id, name, address_line1, city, state, postal_code")
        .eq("id", property_id)
        .execute()
    )
    property_data = property_result.data[0] if property_result.data else {}
    if not property_data:
        raise HTTPException(status_code=404, detail="Statement not found")

    address_parts = [property_data.get("address_line1", "")]
    if property_data.get("city") and property_data.get("state"):
        address_parts.append(f"{property_data['city']}, {property_data['state']}")
    if property_data.get("postal_code"):
        if address_parts:
            address_parts[-1] += f" {property_data['postal_code']}"
        else:
            address_parts.append(str(property_data["postal_code"]))
    property_data["address"] = ", ".join(filter(None, address_parts))

    org_result = (
        db.table("organizations")
        .select("id, name")
        .eq("id", str(current_tenant.organization_id))
        .execute()
    )
    org_data = org_result.data[0] if org_result.data else {"name": "Organization"}
    return lease_data, property_data, org_data


def _fetch_tenant_lease_ids(db: SupabaseDB, current_tenant: TenantUser) -> list[str]:
    lease_links = (
        db.table("tenant_lease_links")
        .select("lease_id")
        .eq("tenant_user_id", str(current_tenant.id))
        .execute()
    )
    if lease_links is None or not hasattr(lease_links, "data"):
        return []
    return [
        str(link["lease_id"]) for link in cast(list[dict[str, Any]], lease_links.data)
    ]


@router.get("/dashboard", response_model=TenantDashboardResponse)
async def get_tenant_dashboard(
    current_tenant: CurrentTenantUser,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
) -> TenantDashboardResponse:
    """Get dashboard data for authenticated tenant.

    Queries database for tenant's linked leases, reconciliation statements,
    and unread notifications. RLS policies automatically enforce data isolation.

    Args:
        current_tenant: Authenticated tenant user from JWT
        db: Supabase client for database operations

    Returns:
        TenantDashboardResponse with leases, statements, and notification count
    """
    try:
        logger.info(f"Tenant dashboard request for tenant_user_id: {current_tenant.id}")

        # Query leases linked to this tenant (via RLS-protected join table)
        logger.info(
            f"Querying tenant_lease_links for tenant_user_id: {current_tenant.id}"
        )
        lease_links = (
            db.table("tenant_lease_links")
            .select("lease_id")
            .eq("tenant_user_id", str(current_tenant.id))
            .execute()
        )

        # Defensive check: ensure query returned a valid response
        if lease_links is None or not hasattr(lease_links, "data"):
            logger.error(
                f"tenant_lease_links query returned None for tenant {current_tenant.id}"
            )
            return TenantDashboardResponse(
                leases=[], statements=[], unread_notifications=0
            )

        logger.debug(f"Found {len(lease_links.data)} lease links")
        # Cast JSON results to list of dicts for type safety
        links = cast(list[dict[str, Any]], lease_links.data)
        lease_ids = [link["lease_id"] for link in links]

        if not lease_ids:
            # Tenant has no linked leases yet
            return TenantDashboardResponse(
                leases=[], statements=[], unread_notifications=0
            )

        # Query leases with property and unit (Supabase join syntax)
        logger.debug(f"Querying leases for ids: {lease_ids}")
        leases = (
            db.table("leases")
            .select(
                """
                id, start_date, end_date, recovery_profile,
                property:properties(id, name, address_line1, city, state, postal_code),
                unit:units(id, unit_number, rentable_sqft)
            """
            )
            .in_("id", lease_ids)
            .execute()
        )

        if leases is None or not hasattr(leases, "data"):
            logger.error(f"leases query returned None for lease_ids {lease_ids}")
            return TenantDashboardResponse(
                leases=[], statements=[], unread_notifications=0
            )

        # Cast JSON results to list of dicts for type safety
        leases_data = cast(list[dict[str, Any]], leases.data)

        # Build a property_id -> name map from the leases embed. The tenant's
        # RLS grant on properties resolves through the leases relationship, so
        # this map is the reliable source of property names. The statements
        # embed below can return a null property for the same row, so we fall
        # back to this map instead of crashing (F-294).
        property_names: dict[str, str] = {}
        for lease in leases_data:
            prop = lease.get("property")
            if prop and prop.get("id"):
                property_names[str(prop["id"])] = prop["name"]

        lease_details = [
            LeaseDetailDTO(
                id=UUID(lease["id"]),
                property=PropertySummaryDTO(
                    id=UUID(lease["property"]["id"]),
                    name=lease["property"]["name"],
                    address=(
                        f"{lease['property']['address_line1']}, "
                        f"{lease['property']['city']}, "
                        f"{lease['property']['state']} "
                        f"{lease['property']['postal_code']}"
                    ),
                ),
                unit=(
                    UnitSummaryDTO(
                        id=UUID(lease["unit"]["id"]),
                        unit_number=lease["unit"]["unit_number"],
                        rentable_sqft=Decimal(str(lease["unit"]["rentable_sqft"])),
                    )
                    if lease.get("unit")
                    else None
                ),
                start_date=date.fromisoformat(lease["start_date"]),
                end_date=date.fromisoformat(lease["end_date"]),
                pro_rata_share=Decimal(
                    str(lease["recovery_profile"]["pro_rata_share"])
                ),
                base_year=lease["recovery_profile"].get("base_year"),
            )
            for lease in leases_data
        ]

        # Query statements (RLS automatically filters to accessible leases)
        logger.debug(f"Querying reconciliation_snapshots for lease_ids: {lease_ids}")
        statements = (
            db.table("reconciliation_snapshots")
            .select(
                """
                id, period_start_date, period_end_date,
                tenant_share_after_cap, status, created_at,
                property_id, property:properties(name)
            """
            )
            .in_("lease_id", lease_ids)
            .eq("status", ReconciliationStatus.FINALIZED.value)
            .order("created_at", desc=True)
            .limit(10)
            .execute()
        )

        if statements is None or not hasattr(statements, "data"):
            logger.error(
                f"reconciliation_snapshots query returned None "
                f"for lease_ids {lease_ids}"
            )
            statements_data: list[dict[str, Any]] = []
        else:
            # Cast JSON results to list of dicts for type safety
            statements_data = cast(list[dict[str, Any]], statements.data)

        # Derive which statements have an active (open/under_review) dispute so
        # the tenant-facing status can surface DISPUTED. Without this join every
        # finalized statement showed as PENDING regardless of dispute state
        # (F-060). PAID/OVERDUE are NOT derivable yet: reconciliation_snapshots
        # has no payment or due-date columns, so those remain future schema work.
        statement_ids = [str(stmt["id"]) for stmt in statements_data]
        disputed_statement_ids: set[str] = set()
        if statement_ids:
            disputes_result = (
                db.table("disputes")
                .select("statement_id, status")
                .in_("statement_id", statement_ids)
                .in_(
                    "status",
                    [DisputeStatus.OPEN.value, DisputeStatus.UNDER_REVIEW.value],
                )
                .execute()
            )
            if disputes_result is not None and hasattr(disputes_result, "data"):
                disputed_statement_ids = {
                    str(row["statement_id"])
                    for row in (disputes_result.data or [])
                    if row.get("statement_id") is not None
                }

        # Map database status to tenant-facing status
        def map_statement_status(stmt: dict[str, Any]) -> StatementStatus:
            """Map internal database status to tenant-facing status.

            A finalized statement with an active dispute (open/under_review)
            surfaces as DISPUTED; otherwise PENDING. PAID/OVERDUE require
            payment/due-date columns that do not yet exist (F-060).
            """
            if str(stmt["id"]) in disputed_statement_ids:
                return StatementStatus.DISPUTED
            return StatementStatus.PENDING

        statement_summaries = [
            StatementSummaryDTO(
                id=UUID(stmt["id"]),
                property_name=(
                    (stmt.get("property") or {}).get("name")
                    or property_names.get(str(stmt.get("property_id")))
                    or "Property"
                ),
                period_start=date.fromisoformat(stmt["period_start_date"]),
                period_end=date.fromisoformat(stmt["period_end_date"]),
                tenant_share=Decimal(str(stmt["tenant_share_after_cap"])),
                status=map_statement_status(stmt),
                pdf_url=_tenant_statement_pdf_url(stmt["id"], stmt["status"]),
                created_at=datetime.fromisoformat(stmt["created_at"]).date(),
            )
            for stmt in statements_data
        ]

        # Query unread notification count
        logger.debug(
            f"Querying tenant_notifications for tenant_user_id: {current_tenant.id}"
        )
        unread_result = (
            db.table("tenant_notifications")
            .select("id", count="exact")
            .eq("tenant_user_id", str(current_tenant.id))
            .is_("read_at", "null")
            .execute()
        )

        if unread_result is None or not hasattr(unread_result, "count"):
            logger.warning(
                f"tenant_notifications query returned None "
                f"for tenant {current_tenant.id}"
            )
            unread_count = 0
        else:
            unread_count = unread_result.count or 0

        logger.info(
            f"Dashboard response ready: {len(lease_details)} leases, "
            f"{len(statement_summaries)} statements, "
            f"{unread_count} notifications"
        )

        return TenantDashboardResponse(
            leases=lease_details,
            statements=statement_summaries,
            unread_notifications=unread_count,
        )
    except Exception as e:
        logger.error(
            f"Error in tenant dashboard for {current_tenant.id}: "
            f"{type(e).__name__}: {str(e)}"
        )
        logger.exception("Full traceback:")
        raise HTTPException(
            status_code=500,
            detail="Unable to load dashboard data. Please try again.",
        )


@router.get("/statements/{statement_id}/pdf")
async def download_tenant_statement_pdf(
    statement_id: UUID,
    current_tenant: CurrentTenantUser,
    db: Annotated[SupabaseDB, Depends(get_supabase)],
) -> StreamingResponse:
    """Download a finalized reconciliation statement PDF for a linked tenant lease."""
    lease_ids = _fetch_tenant_lease_ids(db, current_tenant)
    if not lease_ids:
        raise HTTPException(status_code=404, detail="Statement not found")

    snapshot_result = (
        db.table("reconciliation_snapshots")
        .select("*")
        .eq("id", str(statement_id))
        .in_("lease_id", lease_ids)
        .execute()
    )
    if not snapshot_result.data:
        raise HTTPException(status_code=404, detail="Statement not found")

    snapshot = cast(dict[str, Any], snapshot_result.data[0])
    if snapshot.get("status") != ReconciliationStatus.FINALIZED.value:
        raise HTTPException(status_code=404, detail="Statement not found")

    lease_data, property_data, org_data = _load_statement_pdf_context(
        db, current_tenant, snapshot
    )
    pdf_buffer = TenantPacketGenerator(
        snapshot_data=snapshot,
        lease_data=lease_data,
        property_data=property_data,
        org_data=org_data,
    ).generate()

    period_start = datetime.fromisoformat(snapshot["period_start_date"]).date()
    year = period_start.year
    property_name = property_data.get("name", "Property").replace(" ", "_")
    filename = f"Reconciliation_{property_name}_{year}.pdf"
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
