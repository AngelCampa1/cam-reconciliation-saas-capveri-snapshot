"""
Cross-document analysis API endpoints.

Provides endpoints for triggering cross-document analysis, reviewing findings,
and accepting/dismissing individual findings.
"""

import logging
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.dependencies import (
    CurrentUser,
    OrgContext,
    require_full_access,
    require_org_editor,
)
from app.services.extraction.cross_doc_models import (
    AuditorContext,
    CrossDocAnalysisResult,
    PropertyAuditorOverrides,
)
from app.services.extraction.cross_doc_orchestrator import (
    CrossDocInsufficientDataError,
    CrossDocOrchestrator,
    CrossDocValidationError,
)
from app.services.extraction.cross_doc_persistence import update_finding_decision
from app.services.extraction.openrouter_client import OpenRouterClient

logger = logging.getLogger(__name__)

router = APIRouter()


class TriggerAnalysisRequest(BaseModel):
    period_year: int = Field(..., ge=1900, le=2100)


class FindingDecisionRequest(BaseModel):
    decision: Literal["accepted", "dismissed", "deferred"]
    reason: str = ""


class DecisionResponse(BaseModel):
    """Response returned after recording a finding decision."""

    status: str
    decision: Literal["accepted", "dismissed", "deferred"]


class StatusResponse(BaseModel):
    """Generic OK response for write endpoints."""

    status: str


class CrossDocAnalysisRow(BaseModel):
    """API response model for a stored cross-document analysis row."""

    id: str
    property_id: str
    period_year: int
    status: str
    findings: dict[str, Any]
    # Each key is a finding UUID string; value is the decision record.
    finding_decisions: dict[str, dict[str, Any]]
    token_usage: int


# ---------------------------------------------------------------------------
# POST /properties/{property_id}/cross-doc-analysis
# ---------------------------------------------------------------------------


@router.post(
    "/properties/{property_id}/cross-doc-analysis",
    response_model=CrossDocAnalysisResult,
    status_code=status.HTTP_201_CREATED,
    summary="Trigger cross-document analysis for a property/period",
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def trigger_cross_doc_analysis(
    property_id: UUID,
    request: TriggerAnalysisRequest,
    user: CurrentUser,
    org: OrgContext,
) -> CrossDocAnalysisResult:
    """Assemble all property documents and run Claude cross-document analysis.

    Returns structured findings. Creates a cross_doc_analyses row with status=pending.
    """
    db = org.client

    # Verify the property belongs to this org before running analysis
    prop_check = (
        db.table("properties")
        .select("id")
        .eq("id", str(property_id))
        .eq("organization_id", str(org.organization_id))
        .maybe_single()
        .execute()
    )
    if not prop_check or not prop_check.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property not found.",
        )

    client = OpenRouterClient()
    orchestrator = CrossDocOrchestrator(openrouter_client=client, db=db)

    try:
        result = await orchestrator.run_analysis(
            property_id=property_id,
            period_year=request.period_year,
            org_id=org.organization_id,
        )
    except CrossDocInsufficientDataError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )
    except CrossDocValidationError as exc:
        logger.error(
            "cross_doc_analysis: validation error for property %s: %s",
            property_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Claude returned an invalid response. Please retry.",
        )
    except Exception as exc:
        logger.error(
            "cross_doc_analysis: unexpected error for property %s: %s",
            property_id,
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Cross-document analysis failed.",
        )

    return result


# ---------------------------------------------------------------------------
# GET /properties/{property_id}/cross-doc-analysis/{period_year}
# ---------------------------------------------------------------------------


@router.get(
    "/properties/{property_id}/cross-doc-analysis/{period_year}",
    response_model=CrossDocAnalysisRow,
    summary="Get cross-document analysis results for a property/period",
)
async def get_cross_doc_analysis(
    property_id: UUID,
    period_year: int,
    user: CurrentUser,
    org: OrgContext,
) -> CrossDocAnalysisRow:
    """Retrieve the latest cross-document analysis for a property/period."""
    db = org.client
    resp = (
        db.table("cross_doc_analyses")
        .select(
            "id, property_id, period_year, status, "
            "findings, finding_decisions, token_usage"
        )
        .eq("property_id", str(property_id))
        .eq("period_year", period_year)
        .eq("organization_id", str(org.organization_id))
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = resp.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No cross-document analysis found for this property/period.",
        )
    return CrossDocAnalysisRow(**rows[0])


# ---------------------------------------------------------------------------
# PATCH /cross-doc-analysis/{analysis_id}/findings/{finding_id}
# ---------------------------------------------------------------------------


@router.patch(
    "/cross-doc-analysis/{analysis_id}/findings/{finding_id}",
    response_model=DecisionResponse,
    status_code=status.HTTP_200_OK,
    summary="Accept or dismiss a cross-document finding",
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def decide_finding(
    analysis_id: UUID,
    # UUID path param: FastAPI rejects non-UUID values with 422 automatically,
    # preventing arbitrary strings from polluting JSONB finding_decisions keys.
    finding_id: UUID,
    request: FindingDecisionRequest,
    user: CurrentUser,
    org: OrgContext,
) -> DecisionResponse:
    """Record accept/dismiss/deferred decision for a finding.

    This endpoint is last-write-wins: calling it twice with the same finding_id
    and decision overwrites the previous decided_at timestamp. This is intentional
    — it allows auditors to update their reason without creating a conflict.

    Accepted findings record the reviewer's decision in the finding_decisions
    store and may advance the analysis status. Advisory findings surface in the
    CalculationTrace at reconciliation time, and accepted lease-term override
    suggestions are applied before reconciliation calculation.
    """
    db = org.client

    # Verify the analysis belongs to this org
    check_resp = (
        db.table("cross_doc_analyses")
        .select("id, organization_id")
        .eq("id", str(analysis_id))
        .maybe_single()
        .execute()
    )
    row = check_resp.data if check_resp else None
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Analysis not found.",
        )
    if str(row.get("organization_id")) != str(org.organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied.",
        )

    await update_finding_decision(
        db=db,
        analysis_id=analysis_id,
        finding_id=str(finding_id),
        decision=request.decision,
        reason=request.reason,
        org_id=org.organization_id,
        user_id=str(user.id),
    )

    return DecisionResponse(status="ok", decision=request.decision)


# ---------------------------------------------------------------------------
# PATCH /organizations/{org_id}/auditor-config
# ---------------------------------------------------------------------------


@router.patch(
    "/organizations/{org_id}/auditor-config",
    response_model=StatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Update org-level auditor context",
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def update_auditor_config(
    org_id: UUID,
    config: AuditorContext,
    user: CurrentUser,
    org: OrgContext,
) -> StatusResponse:
    """Set org-level auditor context (market, fee ranges, custom rules)."""
    if str(org_id) != str(org.organization_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied.",
        )
    org.client.table("organizations").update(
        {"auditor_config": config.model_dump(mode="json")}
    ).eq("id", str(org_id)).execute()
    return StatusResponse(status="ok")


# ---------------------------------------------------------------------------
# PATCH /properties/{property_id}/auditor-overrides
# ---------------------------------------------------------------------------


@router.patch(
    "/properties/{property_id}/auditor-overrides",
    response_model=StatusResponse,
    status_code=status.HTTP_200_OK,
    summary="Update property-level auditor overrides",
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def update_auditor_overrides(
    property_id: UUID,
    overrides: PropertyAuditorOverrides,
    user: CurrentUser,
    org: OrgContext,
) -> StatusResponse:
    """Set property-level auditor overrides (exceptions, suppressed findings)."""
    db = org.client

    # Verify property belongs to this org before writing
    check_resp = (
        db.table("properties")
        .select("id")
        .eq("id", str(property_id))
        .eq("organization_id", str(org.organization_id))
        .maybe_single()
        .execute()
    )
    if not check_resp or not check_resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property not found.",
        )

    db.table("properties").update(
        {"auditor_overrides": overrides.model_dump(mode="json")}
    ).eq("id", str(property_id)).eq(
        "organization_id", str(org.organization_id)
    ).execute()
    return StatusResponse(status="ok")
