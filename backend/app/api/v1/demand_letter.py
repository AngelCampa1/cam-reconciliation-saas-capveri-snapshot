"""
Demand Letter generation endpoint.

POST /api/v1/demand-letter/generate  — streams a PDF demand letter for a
finalized reconciliation snapshot.
"""

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.v1.exports import _load_export_context
from app.auth.dependencies import OrgContext, require_full_access
from app.database.client import get_supabase_admin
from app.exceptions import BadRequestError, NotFoundError
from app.models import ReconciliationStatus
from app.services.billing.feature_usage import record_feature_use
from app.services.legal.demand_letter_generator import (
    DemandLetterData,
    DemandLetterGenerator,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request schema
# ---------------------------------------------------------------------------


class DemandLetterRequest(BaseModel):
    """Request body for generating a demand letter PDF."""

    snapshot_id: UUID
    state: Literal["TX", "CA"]
    landlord_name: str = Field(..., min_length=1, max_length=255)
    landlord_title: str = Field(default="", max_length=255)
    landlord_company: str = Field(default="", max_length=255)
    landlord_address: str = Field(default="", max_length=1000)
    landlord_phone: str = Field(default="", max_length=50)
    landlord_email: str = Field(default="", max_length=255)
    payment_deadline_days: int = Field(default=30, ge=1, le=365)
    dispute_id: UUID | None = None
    dispute_filed_date: date | None = None


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post("/generate", dependencies=[Depends(require_full_access)])
async def generate_demand_letter(
    body: DemandLetterRequest,
    ctx: OrgContext,
) -> StreamingResponse:
    """Generate a PDF demand letter for a finalized reconciliation snapshot.

    Guards:
    - Snapshot must exist and belong to the caller's organisation.
    - Snapshot status must be "finalized".
    - total_recovery must be > 0.

    Returns a streaming PDF response with Content-Disposition: attachment.
    """
    # ------------------------------------------------------------------
    # Fetch snapshot
    # ------------------------------------------------------------------
    snapshot_result = (
        ctx.table("reconciliation_snapshots")
        .select(
            "id, organization_id, property_id, lease_id, status, "
            "total_recovery, period_start_date, period_end_date"
        )
        .eq("id", str(body.snapshot_id))
        .eq("organization_id", str(ctx.org_id))
        .execute()
    )

    if not snapshot_result.data:
        raise NotFoundError("reconciliation_snapshot", str(body.snapshot_id))

    snapshot_data = snapshot_result.data[0]

    # Guard: must be finalized
    if snapshot_data.get("status") != ReconciliationStatus.FINALIZED.value:
        raise BadRequestError(
            "Demand letters can only be generated for finalized snapshots. "
            f"Current status: {snapshot_data.get('status')!r}."
        )

    # Guard: amount must be positive
    total_recovery = Decimal(str(snapshot_data.get("total_recovery") or "0"))
    if total_recovery <= Decimal("0"):
        raise BadRequestError(
            "Demand letters can only be generated when total_recovery > 0. "
            f"Current total_recovery: {total_recovery}."
        )

    # ------------------------------------------------------------------
    # Load lease / property / org context
    # ------------------------------------------------------------------
    lease_data, property_data, _org_data = _load_export_context(ctx, snapshot_data)

    # ------------------------------------------------------------------
    # Assemble DemandLetterData
    # ------------------------------------------------------------------
    tenant_name: str = str(lease_data.get("tenant_name") or "").strip() or str(
        snapshot_data.get("lease_id") or "Tenant"
    )

    property_address: str = property_data.get("address", "")
    lease_reference: str = str(snapshot_data.get("lease_id", ""))

    period_start = date.fromisoformat(snapshot_data["period_start_date"])
    period_end = date.fromisoformat(snapshot_data["period_end_date"])
    today = date.today()
    deadline_date = today + timedelta(days=body.payment_deadline_days)

    letter_data = DemandLetterData(
        tenant_name=tenant_name,
        property_address=property_address,
        amount_owed=total_recovery,
        period_start=period_start,
        period_end=period_end,
        lease_reference=lease_reference,
        landlord_name=body.landlord_name,
        landlord_title=body.landlord_title,
        landlord_company=body.landlord_company,
        landlord_phone=body.landlord_phone,
        landlord_email=body.landlord_email,
        landlord_address=body.landlord_address,
        payment_deadline_date=deadline_date,
        letter_date=today,
        state=body.state,
        dispute_id=body.dispute_id,
        dispute_filed_date=body.dispute_filed_date,
    )

    # ------------------------------------------------------------------
    # Generate PDF
    # ------------------------------------------------------------------
    generator = DemandLetterGenerator(letter_data)
    pdf_buffer = generator.generate()

    safe_tenant = tenant_name.replace("/", "-").replace("\\", "-")
    filename = f"demand-letter-{safe_tenant}.pdf"
    record_feature_use(get_supabase_admin(), str(ctx.organization_id), "demand_letters")
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
