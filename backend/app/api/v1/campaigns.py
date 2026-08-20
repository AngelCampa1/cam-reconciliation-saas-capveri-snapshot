"""
Reconciliation campaign workflow endpoints.

Provides endpoints for listing campaigns (portfolio pipeline view) and
advancing campaign status through the workflow:
DRAFT → FINALIZED → IN_REVIEW → APPROVED → SENT
"""

import logging
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.auth.dependencies import OrgContext, require_org_admin, require_org_editor
from app.exceptions import ConflictError, NotFoundError
from app.models.enums import CampaignStatus
from app.models.reconciliation_campaign import ReconciliationCampaignSummary
from app.schemas.reconciliation_campaign import CampaignTransitionResponse
from app.services.campaigns.transition import (
    CampaignTransitionError,
    validate_transition,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Maps target status → (timestamp_field, user_id_field) for audit trail
_TRANSITION_AUDIT_FIELDS: dict[CampaignStatus, tuple[str, str]] = {
    CampaignStatus.IN_REVIEW: (
        "submitted_for_review_at",
        "submitted_for_review_by_user_id",
    ),
    CampaignStatus.APPROVED: ("approved_at", "approved_by_user_id"),
    CampaignStatus.SENT: ("sent_at", "sent_by_user_id"),
}


async def _fetch_campaign(campaign_id: UUID, ctx: OrgContext) -> dict:
    """Fetch a campaign by ID, scoped to the user's organization via RLS."""
    result = (
        ctx.table("reconciliation_campaigns")
        .select("*")
        .eq("id", str(campaign_id))
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        raise NotFoundError("Campaign", str(campaign_id))
    return cast(dict, result.data)


async def _apply_transition(
    campaign_id: UUID,
    target_status: CampaignStatus,
    ctx: OrgContext,
) -> CampaignTransitionResponse:
    """Fetch, validate, update with audit fields, return response."""
    campaign_data = await _fetch_campaign(campaign_id, ctx)
    current_status = CampaignStatus(campaign_data["status"])

    try:
        validate_transition(current_status, target_status)
    except CampaignTransitionError as e:
        raise ConflictError(str(e))

    now = datetime.now(UTC)
    user_id = ctx.user.id

    update_payload: dict = {
        "status": target_status.value,
    }

    # Rejection (IN_REVIEW → FINALIZED): clear submission fields
    if (
        current_status == CampaignStatus.IN_REVIEW
        and target_status == CampaignStatus.FINALIZED
    ):
        update_payload["submitted_for_review_at"] = None
        update_payload["submitted_for_review_by_user_id"] = None
    elif target_status in _TRANSITION_AUDIT_FIELDS:
        ts_field, uid_field = _TRANSITION_AUDIT_FIELDS[target_status]
        update_payload[ts_field] = now.isoformat()
        update_payload[uid_field] = str(user_id)

    ctx.table("reconciliation_campaigns").update(update_payload).eq(
        "id", str(campaign_id)
    ).execute()

    return CampaignTransitionResponse(
        id=campaign_id,
        status=target_status,
        transitioned_at=now,
        transitioned_by_user_id=user_id,
    )


@router.get(
    "/",
    response_model=list[ReconciliationCampaignSummary],
)
async def list_campaigns(
    ctx: OrgContext,
    year: Annotated[
        int | None,
        Query(description="Filter by reconciliation period year"),
    ] = None,
) -> list[ReconciliationCampaignSummary]:
    """
    List reconciliation campaigns with optional year filter.

    Returns campaign summaries with property names, tenant counts,
    and total recovery amounts for the portfolio pipeline view.
    """
    query = ctx.table("reconciliation_campaigns").select(
        "id, property_id, period_year, status, "
        "finalized_at, submitted_for_review_at, approved_at, sent_at, updated_at, "
        "properties!inner(name)"
    )

    if year is not None:
        query = query.eq("period_year", year)

    query = query.order("updated_at", desc=True)
    result = query.execute()
    rows = result.data or []

    if not rows:
        return []

    # Batch-fetch all snapshots for the relevant properties in one query
    property_ids = list({row["property_id"] for row in rows})
    snap_result = (
        ctx.table("reconciliation_snapshots")
        .select("id, property_id, period_start_date, status, total_recovery")
        .in_("property_id", property_ids)
        .execute()
    )

    # Index snapshots by (property_id, period_year)
    snap_index: dict[tuple[str, int], list[dict]] = defaultdict(list)
    for s in snap_result.data or []:
        period_start = str(s.get("period_start_date") or "")
        snapshot_year = int(period_start[:4]) if period_start[:4].isdigit() else 0
        key = (s["property_id"], snapshot_year)
        snap_index[key].append(s)

    summaries: list[ReconciliationCampaignSummary] = []
    for row in rows:
        property_name = row.get("properties", {}).get("name", "Unknown")
        key = (row["property_id"], row["period_year"])
        snap_data = snap_index.get(key, [])

        tenant_count = len(snap_data)
        finalized_tenant_count = sum(
            1 for s in snap_data if s.get("status") == "finalized"
        )
        total_recovery = sum(
            Decimal(str(s.get("total_recovery", 0) or 0)) for s in snap_data
        )

        summaries.append(
            ReconciliationCampaignSummary(
                id=row["id"],
                property_id=row["property_id"],
                property_name=property_name,
                period_year=row["period_year"],
                status=CampaignStatus(row["status"]),
                tenant_count=tenant_count,
                finalized_tenant_count=finalized_tenant_count,
                total_recovery=total_recovery,
                finalized_at=row.get("finalized_at"),
                submitted_for_review_at=row.get("submitted_for_review_at"),
                approved_at=row.get("approved_at"),
                sent_at=row.get("sent_at"),
                updated_at=row["updated_at"],
            )
        )

    return summaries


@router.post(
    "/{campaign_id}/submit-for-review",
    response_model=CampaignTransitionResponse,
    dependencies=[Depends(require_org_editor)],
)
async def submit_for_review(
    campaign_id: UUID,
    ctx: OrgContext,
) -> CampaignTransitionResponse:
    """Advance campaign from FINALIZED → IN_REVIEW."""
    return await _apply_transition(campaign_id, CampaignStatus.IN_REVIEW, ctx)


@router.post(
    "/{campaign_id}/approve",
    response_model=CampaignTransitionResponse,
    dependencies=[Depends(require_org_admin)],
)
async def approve_campaign(
    campaign_id: UUID,
    ctx: OrgContext,
) -> CampaignTransitionResponse:
    """Advance campaign from IN_REVIEW → APPROVED."""
    return await _apply_transition(campaign_id, CampaignStatus.APPROVED, ctx)


@router.post(
    "/{campaign_id}/reject",
    response_model=CampaignTransitionResponse,
    dependencies=[Depends(require_org_editor)],
)
async def reject_campaign(
    campaign_id: UUID,
    ctx: OrgContext,
) -> CampaignTransitionResponse:
    """Reject campaign from IN_REVIEW → FINALIZED."""
    return await _apply_transition(campaign_id, CampaignStatus.FINALIZED, ctx)


@router.post(
    "/{campaign_id}/mark-sent",
    response_model=CampaignTransitionResponse,
    dependencies=[Depends(require_org_admin)],
)
async def mark_sent(
    campaign_id: UUID,
    ctx: OrgContext,
) -> CampaignTransitionResponse:
    """Advance campaign from APPROVED → SENT."""
    return await _apply_transition(campaign_id, CampaignStatus.SENT, ctx)
