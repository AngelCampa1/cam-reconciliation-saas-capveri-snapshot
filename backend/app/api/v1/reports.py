"""Historical analysis report generation API endpoints."""

import logging
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app.api.deps import OrgContext
from app.auth.dependencies import require_full_access
from app.schemas.denominator_change import DenominatorChangePdfRequest
from app.services.analysis import HistoricalAnalysisService
from app.services.analysis.anomaly_detection import AnomalyDetectionService
from app.services.analysis.denominator_change import DenominatorChangeService
from app.services.reports import (
    DenominatorChangeReportGenerator,
    HistoricalReportGenerator,
    export_to_excel,
)

logger = logging.getLogger(__name__)

router = APIRouter()


class ReportRequest(BaseModel):
    """Request model for historical report generation."""

    property_id: str
    years: list[int]
    include_charts: bool = False


class ReportResponse(BaseModel):
    """Response model for report generation."""

    report_url: str
    expires_at: str
    format: Literal["pdf", "excel"]


@router.post(
    "/historical/pdf",
    response_model=ReportResponse,
    dependencies=[Depends(require_full_access)],
)
async def generate_pdf_report(
    request: ReportRequest,
    org_context: OrgContext,
) -> ReportResponse:
    """Generate PDF historical analysis report.

    Args:
        request: Report generation request
        org_context: Organization context for RLS

    Returns:
        ReportResponse with signed URL to download report

    Raises:
        HTTPException 400: Invalid request parameters
        HTTPException 500: Report generation failed
    """
    try:
        # Validate years
        if len(request.years) < 2:
            raise HTTPException(
                status_code=400,
                detail="At least 2 years required for historical comparison",
            )

        # Generate PDF report
        generator = HistoricalReportGenerator()
        pdf_bytes = await generator.generate(
            property_id=UUID(request.property_id),
            years=sorted(request.years),
            organization_id=org_context.organization_id,
            include_charts=request.include_charts,
            db=org_context.client,
        )

        # Upload to Supabase Storage
        supabase = org_context.client
        storage_path = (
            f"reports/{org_context.organization_id}/"
            f"{request.property_id}/{uuid4()}.pdf"
        )

        supabase.storage.from_("reports").upload(
            storage_path, pdf_bytes, {"content-type": "application/pdf"}
        )

        # Create signed URL (expires in 7 days)
        signed_url_data = supabase.storage.from_("reports").create_signed_url(
            storage_path, 604800  # 7 days in seconds
        )

        expires_at = (datetime.now() + timedelta(days=7)).isoformat()

        return ReportResponse(
            report_url=signed_url_data["signedURL"],
            expires_at=expires_at,
            format="pdf",
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate PDF report: {str(e)}"
        )


@router.post(
    "/historical/excel",
    response_class=Response,
    dependencies=[Depends(require_full_access)],
)
async def generate_excel_report(
    request: ReportRequest,
    org_context: OrgContext,
) -> Response:
    """Generate Excel historical analysis report.

    Returns Excel file directly as download instead of storing in Supabase.

    Args:
        request: Report generation request
        org_context: Organization context for RLS

    Returns:
        Excel file as binary response

    Raises:
        HTTPException 400: Invalid request parameters
        HTTPException 500: Report generation failed
    """
    try:
        # Validate years
        if len(request.years) < 2:
            raise HTTPException(
                status_code=400,
                detail="At least 2 years required for historical comparison",
            )

        # Get analysis data
        analysis_service = HistoricalAnalysisService()
        anomaly_service = AnomalyDetectionService()

        yoy = await analysis_service.get_year_over_year(
            property_id=UUID(request.property_id),
            years=sorted(request.years),
            organization_id=org_context.organization_id,
            use_fuzzy_matching=True,
        )

        sorted_years = sorted(request.years)
        target_year = sorted_years[-1]

        anomalies = await anomaly_service.detect_anomalies(
            property_id=UUID(request.property_id),
            target_year=target_year,
            comparison_years=[y for y in sorted_years if y < target_year],
            db=org_context.client,
        )

        # Build report data structure
        report_data = {
            "property": {
                "id": request.property_id,
                "name": yoy.property_name,
            },
            "years_compared": sorted_years,
            "year_over_year_comparison": {
                "categories": [
                    {
                        "name": pool.pool_name,
                        "years": sorted_years,
                        "amounts": [pool.amounts.get(y, 0) for y in sorted_years],
                        "variance_percent": pool.variance_percent or 0,
                    }
                    for pool in yoy.pool_comparisons
                ],
                "totals": [
                    {"year": year, "total": yoy.total_amounts.get(year, 0)}
                    for year in sorted_years
                ],
            },
            "anomalies": [
                {
                    "severity": a.severity.value,
                    "pool_name": a.pool_name,
                    "anomaly_type": a.anomaly_type.value,
                    "current_value": float(a.current_value),
                    "expected_value": float(a.expected_value),
                    "variance_percent": float(a.variance_percent),
                    "explanation": a.explanation,
                }
                for a in anomalies
            ],
        }

        # Generate Excel file
        excel_bytes = export_to_excel(report_data)

        # Return as download
        filename = (
            f"historical_analysis_{request.property_id}_"
            f"{sorted_years[0]}-{sorted_years[-1]}.xlsx"
        )

        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to generate Excel report: {str(e)}"
        )


@router.post(
    "/denominator-change/pdf",
    response_class=Response,
    dependencies=[Depends(require_full_access)],
)
async def generate_denominator_change_pdf(
    request: DenominatorChangePdfRequest,
    org_context: OrgContext,
) -> Response:
    """Generate PDF report for denominator change analysis.

    Returns PDF file directly as download.

    Args:
        request: Denominator change report request
        org_context: Organization context for RLS

    Returns:
        PDF file as binary response

    Raises:
        HTTPException 400: Invalid request or no snapshots found
        HTTPException 500: Report generation failed
    """
    try:
        # Generate the analysis report
        service = DenominatorChangeService()
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

        # Generate PDF
        generator = DenominatorChangeReportGenerator()
        pdf_bytes = generator.generate(report)

        filename = (
            f"denominator_change_{request.property_id}_"
            f"{request.current_period_start}_{request.current_period_end}.pdf"
        )

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate denominator change PDF: {str(e)}",
        )
