"""
Dashboard API endpoint for landlord dashboard.

Provides aggregate counts, recent activity, and alerts
for the authenticated user's organization.
"""

import logging
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter

from app.auth.dependencies import OrgContext
from app.database.client import get_supabase_admin
from app.database.pagination import fetch_all_pages
from app.schemas.dashboard import (
    ActivityItem,
    AlertItem,
    DashboardSummary,
    PropertySummary,
)
from app.services.compliance.sb1103_service import get_deadline_alerts

logger = logging.getLogger(__name__)

router = APIRouter()


def _build_alerts(
    property_count: int,
    pending_verifications: int,
    ctx: OrgContext,
) -> list[AlertItem]:
    """Build alert items based on current state."""
    alerts: list[AlertItem] = []

    # Alert for new users with no properties
    if property_count == 0:
        alerts.append(
            AlertItem(
                id="no-properties",
                type="action",
                title="Add your first property",
                description="Get started by adding a commercial property to manage.",
                href="/properties/new",
            )
        )

    # Alert for pending document verifications
    if pending_verifications > 0:
        alerts.append(
            AlertItem(
                id="pending-verifications",
                type="warning",
                title="Documents need review",
                description=(
                    f"{pending_verifications} document(s) awaiting verification."
                ),
                href="/extractions",
                count=pending_verifications,
            )
        )

    # California SB 1103 compliance deadline alerts (7-day warning window)
    try:
        sb1103_alerts = get_deadline_alerts(ctx, days_warning=7)
        for sb_alert in sb1103_alerts:
            if sb_alert.days_remaining < 0:
                days_over = abs(sb_alert.days_remaining)
                description = (
                    f"SB 1103 response for {sb_alert.tenant_name} at "
                    f"{sb_alert.property_name} is {days_over} day(s) "
                    f"overdue. Tenant may rescind their lease."
                )
            else:
                description = (
                    f"SB 1103 response for {sb_alert.tenant_name} at "
                    f"{sb_alert.property_name} due in {sb_alert.days_remaining} day(s)."
                )
            alerts.append(
                AlertItem(
                    id=f"sb1103-{sb_alert.request_id}",
                    type="warning",
                    title="SB 1103 Response Deadline Approaching",
                    description=description,
                    href=f"/properties/{sb_alert.property_id}?tab=compliance",
                )
            )
    except Exception:
        # Non-critical: don't let compliance alerts break the dashboard
        logger.exception("Failed to fetch SB 1103 deadline alerts for dashboard")

    return alerts


async def _get_recent_properties(
    ctx: OrgContext,
    limit: int = 5,
) -> list[PropertySummary]:
    """
    Fetch recent properties with unit counts.

    Returns up to `limit` properties ordered by creation date descending.
    """
    properties: list[PropertySummary] = []

    # Fetch properties with their basic info
    props_result = (
        ctx.table("properties")
        .select("id, name, created_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )

    # Collect property IDs for batch queries
    prop_ids = [prop["id"] for prop in props_result.data or []]

    # Batch fetch unit counts
    unit_counts: dict[str, int] = {}
    if prop_ids:
        for prop_id in prop_ids:
            units_result = (
                ctx.table("units")
                .select("id", count="exact")
                .eq("property_id", prop_id)
                .execute()
            )
            unit_counts[prop_id] = units_result.count or 0

    # Batch fetch most recent reconciliation snapshot per property
    last_recon: dict[str, str] = {}
    if prop_ids:
        try:
            snapshots_result = (
                ctx.table("reconciliation_snapshots")
                .select("property_id, status, created_at")
                .in_("property_id", prop_ids)
                .order("created_at", desc=True)
                .execute()
            )
            for snap in snapshots_result.data or []:
                pid = snap.get("property_id")
                if pid and pid not in last_recon:
                    snap_status = snap.get("status", "draft")
                    created = snap.get("created_at", "")
                    # Show "Draft" or "Finalized" with date
                    date_str = created[:10] if created else ""
                    label = "Finalized" if snap_status == "finalized" else "Draft"
                    last_recon[pid] = f"{label} ({date_str})" if date_str else label
        except Exception:
            logger.exception("Failed to fetch reconciliation snapshots for dashboard")

    for prop in props_result.data or []:
        properties.append(
            PropertySummary(
                id=UUID(prop["id"]),
                name=prop["name"],
                unit_count=unit_counts.get(prop["id"], 0),
                last_reconciliation=last_recon.get(prop["id"]),
            )
        )

    return properties


async def _get_recent_activity(
    ctx: OrgContext,
    limit: int = 10,
) -> list[ActivityItem]:
    """
    Fetch recent activity from multiple sources.

    Combines recently created properties, leases, and documents
    into a single sorted activity feed.
    """
    activities: list[ActivityItem] = []

    # Recent properties
    props_result = (
        ctx.table("properties")
        .select("id, name, created_at")
        .order("created_at", desc=True)
        .limit(5)
        .execute()
    )

    for prop in props_result.data or []:
        activities.append(
            ActivityItem(
                id=UUID(prop["id"]),
                type="property",
                title="Property added",
                description=prop["name"],
                timestamp=datetime.fromisoformat(
                    prop["created_at"].replace("Z", "+00:00")
                ),
                href=f"/properties/{prop['id']}",
            )
        )

    # Recent leases
    leases_result = (
        ctx.table("leases")
        .select("id, tenant_name, property_id, created_at")
        .order("created_at", desc=True)
        .limit(5)
        .execute()
    )

    for lease in leases_result.data or []:
        activities.append(
            ActivityItem(
                id=UUID(lease["id"]),
                type="lease",
                title="Lease added",
                description=lease["tenant_name"],
                timestamp=datetime.fromisoformat(
                    lease["created_at"].replace("Z", "+00:00")
                ),
                href=f"/properties/{lease['property_id']}",
            )
        )

    # Recent documents
    docs_result = (
        ctx.table("documents")
        .select("id, filename, created_at")
        .order("created_at", desc=True)
        .limit(5)
        .execute()
    )

    for doc in docs_result.data or []:
        activities.append(
            ActivityItem(
                id=UUID(doc["id"]),
                type="upload",
                title="Document uploaded",
                description=doc["filename"],
                timestamp=datetime.fromisoformat(
                    doc["created_at"].replace("Z", "+00:00")
                ),
                href="/extractions",
            )
        )

    # Sort by timestamp descending and limit
    activities.sort(key=lambda a: a.timestamp, reverse=True)
    return activities[:limit]


@router.get("", response_model=DashboardSummary)
async def get_dashboard_summary(ctx: OrgContext) -> DashboardSummary:
    """
    Get dashboard summary for authenticated organization.

    Returns aggregate counts for properties, units, and leases,
    plus pending items, recent activity, and alerts.

    All queries are automatically scoped to the user's organization
    via Supabase Row Level Security (RLS).
    """
    # Count properties
    props_result = ctx.table("properties").select("id", count="exact").execute()
    property_count = props_result.count or 0

    # Count units (across all properties)
    units_result = ctx.table("units").select("id", count="exact").execute()
    unit_count = units_result.count or 0

    # Count leases
    leases_result = ctx.table("leases").select("id", count="exact").execute()
    lease_count = leases_result.count or 0

    # Count GL entries (indicates a GL export has been uploaded)
    gl_result = ctx.table("gl_entries").select("id", count="exact").execute()
    gl_entry_count = gl_result.count or 0

    # Count pending verifications (documents with status='ready_for_review')
    pending_docs_result = (
        ctx.table("documents")
        .select("id", count="exact")
        .eq("status", "ready_for_review")
        .execute()
    )
    pending_verifications = pending_docs_result.count or 0

    # Count pending reconciliations (draft snapshots)
    pending_recs_result = (
        ctx.table("reconciliation_snapshots")
        .select("id", count="exact")
        .eq("status", "draft")
        .execute()
    )
    pending_reconciliations = pending_recs_result.count or 0

    # Get recent properties
    recent_properties = await _get_recent_properties(ctx)

    # Get recent activity
    recent_activity = await _get_recent_activity(ctx)

    # Build alerts based on current state
    alerts = _build_alerts(property_count, pending_verifications, ctx)

    # Sum total_recovery across all finalized snapshots for ROI display
    total_recovery_finalized = Decimal("0")
    try:
        supabase_admin = get_supabase_admin()
        finalized_snapshots = fetch_all_pages(
            lambda: supabase_admin.table("reconciliation_snapshots")
            .select("total_recovery")
            .eq("organization_id", str(ctx.organization_id))
            .eq("status", "finalized")
        )
        for snap in finalized_snapshots:
            total_recovery_finalized += Decimal(str(snap.get("total_recovery", 0)))
    except Exception:
        logger.exception("Failed to fetch total recovery for dashboard")

    return DashboardSummary(
        property_count=property_count,
        unit_count=unit_count,
        lease_count=lease_count,
        gl_entry_count=gl_entry_count,
        pending_reconciliations=pending_reconciliations,
        pending_verifications=pending_verifications,
        total_recovery_finalized=total_recovery_finalized,
        recent_properties=recent_properties,
        recent_activity=recent_activity,
        alerts=alerts,
    )
