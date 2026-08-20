"""Historical analysis, GL narrative analysis, and CapEx classification endpoints."""

import logging
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Literal, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, OrgContext
from app.api.v1.property_access import verify_property_belongs_to_org
from app.auth.dependencies import require_full_access, require_org_editor
from app.core.sentry import capture_unexpected_exception
from app.database.client import get_supabase_admin
from app.models.capex_flag import (
    CapExFlag,
    CapExReviewRequest,
    CapExRunResponse,
    CapExSummary,
)
from app.models.denominator_change import DenominatorChangeReport
from app.models.gl_analysis import GLAnalysisResult, GLAnalysisRunResponse
from app.models.historical_analysis import YearOverYearComparison, YearOverYearRequest
from app.schemas.analysis import (
    AnomalyDetectionRequest,
    AnomalyDetectionResponse,
    DetectedAnomalySchema,
)
from app.schemas.denominator_change import DenominatorChangeRequest
from app.services.analysis import HistoricalAnalysisService
from app.services.analysis.anomaly_detection import (
    AnomalyDetectionService,
    AnomalySeverity,
)
from app.services.analysis.capex_classifier import CapExClassifierService
from app.services.analysis.denominator_change import (
    DenominatorChangeService,
    NoComparableSnapshotsError,
)
from app.services.analysis.gl_analysis_service import GLAnalysisService
from app.services.billing.feature_usage import record_feature_use

logger = logging.getLogger(__name__)

router = APIRouter()


def _raise_reported_internal_error(
    exc: Exception,
    *,
    operation: str,
    detail: str,
) -> None:
    """Report unexpected endpoint failures before returning safe 500 detail."""
    capture_unexpected_exception(
        exc,
        operation=operation,
        tags={"endpoint_group": "analysis"},
    )
    raise HTTPException(status_code=500, detail=detail) from exc


@router.post(
    "/year-over-year",
    response_model=YearOverYearComparison,
    dependencies=[Depends(require_full_access)],
)
async def get_year_over_year_comparison(
    request: YearOverYearRequest,
    org_context: OrgContext,
) -> YearOverYearComparison:
    """Get year-over-year expense comparison for a property.

    Compares expense pools across multiple years (2-4 years) with variance
    calculations. Supports fuzzy matching for renamed pools.

    Args:
        request: Year-over-year comparison request
        org_context: Organization context for RLS

    Returns:
        YearOverYearComparison with pool-level and total variances

    Raises:
        HTTPException 400: Invalid years or missing data
        HTTPException 404: Property not found
    """
    service = HistoricalAnalysisService()

    try:
        comparison = await service.get_year_over_year(
            property_id=request.property_id,
            years=request.years,
            organization_id=org_context.org_id,
            use_fuzzy_matching=request.use_fuzzy_matching,
        )
        return comparison

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_reported_internal_error(
            e,
            operation="analysis.year_over_year",
            detail="Failed to generate comparison",
        )


@router.get("/properties/{property_id}/available-years", response_model=list[int])
async def get_available_years_for_property(
    property_id: UUID,
    org_context: OrgContext,
) -> list[int]:
    """Get list of years with finalized snapshots for a property.

    Args:
        property_id: Property ID
        org_context: Organization context for RLS

    Returns:
        List of years with finalized reconciliation snapshots
    """
    response = (
        org_context.table("reconciliation_snapshots")
        .select("period_start_date")
        .eq("property_id", str(property_id))
        .eq("status", "finalized")
        .execute()
    )

    # Extract unique years from period_start_date
    years = set()
    for snapshot_data in response.data:
        # Cast JSON result to dict for type safety
        snapshot = cast(dict[str, Any], snapshot_data)
        period_start_date = snapshot.get("period_start_date")
        if period_start_date:
            # period_start_date is in format YYYY-MM-DD
            year = int(str(period_start_date)[:4])
            years.add(year)

    return sorted(years)


@router.post(
    "/anomaly-detection",
    response_model=AnomalyDetectionResponse,
    dependencies=[Depends(require_full_access)],
)
async def detect_anomalies(
    request: AnomalyDetectionRequest,
    org_context: OrgContext,
) -> AnomalyDetectionResponse:
    """Detect anomalies in expense data for a property.

    Uses hybrid detection approach:
    - Variance-based detection (simple threshold)
    - Category changes (new/missing pools)

    Args:
        request: Anomaly detection request with property, target year,
            and comparison years
        org_context: Organization context for RLS

    Returns:
        AnomalyDetectionResponse with detected anomalies

    Raises:
        HTTPException 400: Invalid request parameters
        HTTPException 404: Property not found
    """
    from app.database.client import get_async_session

    service = AnomalyDetectionService()
    property_id = UUID(request.property_id)
    verify_property_belongs_to_org(property_id, org_context)

    try:
        async with get_async_session() as db:
            anomalies = await service.detect_anomalies(
                property_id=property_id,
                target_year=request.target_year,
                comparison_years=request.comparison_years,
                db=db,
            )

            # Convert to schemas
            anomaly_schemas = [
                DetectedAnomalySchema(
                    pool_name=a.pool_name,
                    anomaly_type=a.anomaly_type,
                    severity=a.severity,
                    current_value=a.current_value,
                    expected_value=a.expected_value,
                    variance_percent=a.variance_percent,
                    explanation=a.explanation,
                    years_affected=a.years_affected,
                )
                for a in anomalies
            ]

            # Count by severity
            critical_count = sum(
                1 for a in anomalies if a.severity == AnomalySeverity.CRITICAL
            )
            warning_count = sum(
                1 for a in anomalies if a.severity == AnomalySeverity.WARNING
            )
            info_count = sum(1 for a in anomalies if a.severity == AnomalySeverity.INFO)

            record_feature_use(
                get_supabase_admin(),
                str(org_context.organization_id),
                "anomaly_alerts",
            )
            return AnomalyDetectionResponse(
                property_id=request.property_id,
                target_year=request.target_year,
                anomalies=anomaly_schemas,
                total_anomalies=len(anomalies),
                critical_count=critical_count,
                warning_count=warning_count,
                info_count=info_count,
            )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _raise_reported_internal_error(
            e,
            operation="analysis.anomaly_detection",
            detail="Failed to detect anomalies",
        )


@router.post(
    "/denominator-change",
    response_model=DenominatorChangeReport,
    dependencies=[Depends(require_full_access)],
)
async def get_denominator_change_report(
    request: DenominatorChangeRequest,
    org_context: OrgContext,
) -> DenominatorChangeReport:
    """Detect and document denominator changes between reconciliation periods.

    Compares finalized snapshots to identify RSF changes, tenant roster
    changes, exclusion changes, BOMA standard changes, and pro-rata share
    recalculations.

    When no finalized snapshot exists for a period (a normal, expected state),
    returns HTTP 200 with an otherwise-empty report carrying
    ``comparison_available=False`` and ``missing_period`` set to ``'current'``
    or ``'prior'``. The client renders guidance instead of treating a 4xx as
    a failure.

    Args:
        request: Denominator change analysis request
        org_context: Organization context for RLS

    Returns:
        DenominatorChangeReport with all detected changes and impacts, or an
        empty report with comparison_available=False when no snapshots exist.

    Raises:
        HTTPException 400: Invalid parameters (not a missing-snapshot case).
        HTTPException 500: Unexpected server error.
    """
    service = DenominatorChangeService()

    try:
        report = await service.generate_report(
            property_id=request.property_id,
            current_period_start=request.current_period_start,
            current_period_end=request.current_period_end,
            prior_period_start=request.prior_period_start,
            prior_period_end=request.prior_period_end,
            prior_total_rsf=request.prior_total_rsf,
            current_total_rsf=request.current_total_rsf,
            db=org_context.client,
            organization_id=org_context.organization_id,
        )
        return report
    except NoComparableSnapshotsError as e:
        # Expected: nothing finalized to compare yet. Return a 200 empty report
        # (comparison_available=False) so the client renders guidance instead of
        # treating a 4xx as a failure.
        prior_period = (
            f"{request.prior_period_start} to {request.prior_period_end}"
            if request.prior_period_start and request.prior_period_end
            else ""
        )
        return DenominatorChangeReport(
            property_id=request.property_id,
            property_name="",
            prior_period=prior_period,
            current_period=(
                f"{request.current_period_start} to {request.current_period_end}"
            ),
            prior_total_rsf=Decimal("0"),
            current_total_rsf=Decimal("0"),
            rsf_delta=Decimal("0"),
            rsf_delta_percent=Decimal("0"),
            changes=[],
            tenant_impacts=[],
            summary=str(e),
            generated_at=datetime.now(UTC),
            comparison_available=False,
            missing_period=e.period,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("Denominator change analysis failed")
        _raise_reported_internal_error(
            e,
            operation="analysis.denominator_change",
            detail="Failed to generate denominator change report",
        )


# ---------------------------------------------------------------------------
# GL Narrative Analysis endpoints
# ---------------------------------------------------------------------------


class GLNarrativeRequest(BaseModel):
    """Request body for running GL narrative analysis."""

    property_id: UUID
    period_year: int = Field(..., ge=1990, le=2100)


@router.post(
    "/gl-narrative",
    response_model=GLAnalysisRunResponse,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def run_gl_narrative(
    request: GLNarrativeRequest,
    org_context: OrgContext,
    current_user: CurrentUser,
) -> GLAnalysisRunResponse:
    """Run Claude-powered GL narrative analysis for a property and year.

    Fetches all GL entries, aggregates by account code, and sends to Claude
    for advisory analysis. Result is persisted and returned.

    This analysis is advisory only — it does not modify any calculations.

    Args:
        request: Property ID and period year to analyze.
        org_context: Organization context with authenticated Supabase client.
        current_user: Authenticated user triggering the analysis.

    Returns:
        GLAnalysisRunResponse with result and GL entry count.

    Raises:
        HTTPException 400: Invalid request parameters.
        HTTPException 500: LLM or database error.
    """
    service = GLAnalysisService()

    try:
        result, gl_entry_count = await service.run_analysis(
            property_id=str(request.property_id),
            period_year=request.period_year,
            user_id=current_user.id,
            org_id=org_context.organization_id,
            supabase=org_context.client,
        )
        record_feature_use(
            get_supabase_admin(),
            str(org_context.organization_id),
            "ai_gl_narrative_analysis",
        )
        return GLAnalysisRunResponse(result=result, gl_entry_count=gl_entry_count)

    except ValueError as e:
        # property not found → 404; other value errors → 400
        msg = str(e)
        status = 404 if "not found" in msg else 400
        raise HTTPException(status_code=status, detail=msg)
    except Exception as e:
        logger.exception("GL narrative analysis failed")
        _raise_reported_internal_error(
            e,
            operation="analysis.gl_narrative.run",
            detail="Failed to run GL analysis",
        )


@router.get(
    "/gl-narrative/{property_id}/{period_year}",
    response_model=GLAnalysisResult | None,
)
async def get_gl_narrative(
    property_id: UUID,
    org_context: OrgContext,
    period_year: int = Path(..., ge=1990, le=2100),
) -> GLAnalysisResult | None:
    """Get the latest non-dismissed GL analysis result for a property/year.

    A GL narrative is an optional, on-demand sub-resource: most reconciliation
    detail pages load before any narrative has been run. Absence is a normal
    state, not a client error, so this returns ``200`` with a ``null`` body
    when none exists (rather than ``404``) to keep page loads clean and avoid
    spurious console errors.

    Args:
        property_id: Property ID.
        period_year: Fiscal year.
        org_context: Organization context.

    Returns:
        The latest GLAnalysisResult, or ``None`` when no analysis exists yet.
    """
    service = GLAnalysisService()

    try:
        return await service.get_latest_analysis(
            property_id=str(property_id),
            period_year=period_year,
            org_id=org_context.organization_id,
            supabase=org_context.client,
        )

    except HTTPException:
        raise
    except Exception as e:
        _raise_reported_internal_error(
            e,
            operation="analysis.gl_narrative.get_latest",
            detail="Failed to retrieve GL analysis",
        )


@router.post(
    "/gl-narrative/{analysis_id}/dismiss",
    response_model=GLAnalysisResult,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def dismiss_gl_narrative(
    analysis_id: UUID,
    org_context: OrgContext,
    current_user: CurrentUser,
) -> GLAnalysisResult:
    """Dismiss a GL narrative analysis result.

    Marks the result as dismissed so it no longer appears in the advisory panel.
    The analysis record is preserved for audit purposes.

    Args:
        analysis_id: ID of the analysis to dismiss.
        org_context: Organization context.
        current_user: Authenticated user performing the dismissal.

    Returns:
        Updated GLAnalysisResult with dismissed_at set.
    """
    service = GLAnalysisService()

    try:
        return await service.dismiss_analysis(
            analysis_id=analysis_id,
            user_id=current_user.id,
            org_id=org_context.organization_id,
            supabase=org_context.client,
        )
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail=f"GL analysis {analysis_id} not found",
        )
    except Exception as e:
        _raise_reported_internal_error(
            e,
            operation="analysis.gl_narrative.dismiss",
            detail="Failed to dismiss GL analysis",
        )


# ---------------------------------------------------------------------------
# CapEx Classification endpoints
# ---------------------------------------------------------------------------


class CapExClassifyRequest(BaseModel):
    """Request body for running CapEx classification."""

    property_id: UUID
    period_year: int = Field(..., ge=1990, le=2100)


@router.post(
    "/capex-classify",
    response_model=CapExRunResponse,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def run_capex_classification(
    request: CapExClassifyRequest,
    org_context: OrgContext,
) -> CapExRunResponse:
    """Run rules-based CapEx classification on GL entries for a property/year.

    Screens individual GL entries for potential capital expenditures using
    deterministic rules. Flags are advisory and do not block reconciliation.

    Args:
        request: Property ID and period year to classify.
        org_context: Organization context with authenticated Supabase client.

    Returns:
        CapExRunResponse with flags_created and gl_entries_scanned.
    """
    service = CapExClassifierService()

    try:
        return await service.run_classification(
            property_id=str(request.property_id),
            period_year=request.period_year,
            org_id=str(org_context.organization_id),
            supabase=org_context.client,
        )
    except Exception as e:
        logger.exception("CapEx classification failed")
        _raise_reported_internal_error(
            e,
            operation="analysis.capex.run",
            detail="Failed to run CapEx classification",
        )


@router.get(
    "/capex-flags/{property_id}/{period_year}",
    response_model=list[CapExFlag],
)
async def get_capex_flags(
    property_id: UUID,
    org_context: OrgContext,
    period_year: int = Path(..., ge=1990, le=2100),
    disposition: Literal["pending", "confirmed_capex", "dismissed"] | None = Query(
        default=None
    ),
) -> list[CapExFlag]:
    """List CapEx flags for a property/year, optionally filtered by disposition.

    Args:
        property_id: Property ID.
        period_year: Fiscal year.
        org_context: Organization context.
        disposition: Optional filter (pending, confirmed_capex, dismissed).

    Returns:
        List of CapExFlag records.
    """
    service = CapExClassifierService()

    try:
        return await service.get_flags(
            property_id=str(property_id),
            period_year=period_year,
            org_id=str(org_context.organization_id),
            supabase=org_context.client,
            disposition=disposition,
        )
    except Exception as e:
        _raise_reported_internal_error(
            e,
            operation="analysis.capex.get_flags",
            detail="Failed to retrieve CapEx flags",
        )


@router.get(
    "/capex-summary/{property_id}/{period_year}",
    response_model=CapExSummary,
)
async def get_capex_summary(
    property_id: UUID,
    org_context: OrgContext,
    period_year: int = Path(..., ge=1990, le=2100),
) -> CapExSummary:
    """Get summary counts of CapEx flags for a property/year.

    Args:
        property_id: Property ID.
        period_year: Fiscal year.
        org_context: Organization context.

    Returns:
        CapExSummary with counts by disposition.
    """
    service = CapExClassifierService()

    try:
        summary_data = await service.get_summary(
            property_id=str(property_id),
            period_year=period_year,
            org_id=str(org_context.organization_id),
            supabase=org_context.client,
        )
        return CapExSummary(**summary_data)
    except Exception as e:
        _raise_reported_internal_error(
            e,
            operation="analysis.capex.summary",
            detail="Failed to get CapEx summary",
        )


@router.post(
    "/capex-flags/{flag_id}/review",
    response_model=CapExFlag,
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def review_capex_flag(
    flag_id: UUID,
    request: CapExReviewRequest,
    org_context: OrgContext,
    current_user: CurrentUser,
) -> CapExFlag:
    """Review a single CapEx flag (confirm or dismiss).

    Args:
        flag_id: ID of the flag to review.
        request: Disposition and optional review note.
        org_context: Organization context.
        current_user: Authenticated reviewer.

    Returns:
        Updated CapExFlag with review fields set.
    """
    service = CapExClassifierService()

    try:
        return await service.review_flag(
            flag_id=flag_id,
            disposition=request.disposition,
            user_id=current_user.id,
            org_id=org_context.organization_id,
            review_note=request.review_note,
            supabase=org_context.client,
        )
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail=f"CapEx flag {flag_id} not found",
        )
    except Exception as e:
        _raise_reported_internal_error(
            e,
            operation="analysis.capex.review",
            detail="Failed to review CapEx flag",
        )


class BulkReviewRequest(BaseModel):
    """Request body for bulk-reviewing CapEx flags."""

    flag_ids: list[UUID]
    disposition: Literal["confirmed_capex", "dismissed"]
    review_note: str | None = None


@router.post(
    "/capex-flags/bulk-review",
    response_model=list[CapExFlag],
    dependencies=[Depends(require_org_editor), Depends(require_full_access)],
)
async def bulk_review_capex_flags(
    request: BulkReviewRequest,
    org_context: OrgContext,
    current_user: CurrentUser,
) -> list[CapExFlag]:
    """Bulk review multiple CapEx flags with the same disposition.

    Args:
        request: Flag IDs, disposition, and optional review note.
        org_context: Organization context.
        current_user: Authenticated reviewer.

    Returns:
        List of updated CapExFlag records.
    """
    service = CapExClassifierService()

    try:
        # Validate all flag IDs exist before modifying any (prevents partial updates)
        existing = (
            org_context.client.table("capex_flags")
            .select("id")
            .eq("organization_id", str(org_context.organization_id))
            .in_("id", [str(fid) for fid in request.flag_ids])
            .execute()
        )
        found_ids = {row["id"] for row in (existing.data or [])}
        missing = [fid for fid in request.flag_ids if str(fid) not in found_ids]
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"CapEx flag(s) not found: {', '.join(str(m) for m in missing)}",
            )

        results: list[CapExFlag] = []
        for flag_id in request.flag_ids:
            flag = await service.review_flag(
                flag_id=flag_id,
                disposition=request.disposition,
                user_id=current_user.id,
                org_id=org_context.organization_id,
                review_note=request.review_note,
                supabase=org_context.client,
            )
            results.append(flag)

        return results
    except HTTPException:
        raise
    except Exception as e:
        _raise_reported_internal_error(
            e,
            operation="analysis.capex.bulk_review",
            detail="Failed to review CapEx flags",
        )
