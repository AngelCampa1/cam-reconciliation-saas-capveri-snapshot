"""Historical analysis PDF report generator."""

import logging
from datetime import datetime
from decimal import Decimal
from io import BytesIO
from typing import Any
from uuid import UUID

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Flowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.database.client import SupabaseDB, get_supabase
from app.services.analysis import HistoricalAnalysisService
from app.services.analysis.anomaly_detection import AnomalyDetectionService
from app.services.formatting import format_usd_whole

logger = logging.getLogger(__name__)


class HistoricalReportGenerator:
    """Generate PDF historical analysis reports."""

    def __init__(self) -> None:
        """Initialize report generator."""
        self.analysis_service = HistoricalAnalysisService()
        self.anomaly_service = AnomalyDetectionService()

    async def generate(
        self,
        property_id: UUID,
        years: list[int],
        organization_id: UUID,
        include_charts: bool = False,
        db: SupabaseDB | None = None,
    ) -> bytes:
        """Generate PDF report and return bytes.

        Args:
            property_id: Property to analyze
            years: Years to include in comparison
            organization_id: Organization ID for RLS
            include_charts: Whether to include chart images
            db: Organization-scoped Supabase client for anomaly reads

        Returns:
            PDF report as bytes
        """
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        story: list[Flowable] = []

        # Custom styles
        title_style = ParagraphStyle(
            "CustomTitle",
            parent=styles["Title"],
            fontSize=24,
            textColor=colors.HexColor("#1e3a8a"),
        )

        heading_style = ParagraphStyle(
            "CustomHeading",
            parent=styles["Heading2"],
            fontSize=16,
            textColor=colors.HexColor("#1e40af"),
            spaceAfter=12,
        )

        # Title
        story.append(Paragraph("Historical Expense Analysis Report", title_style))
        story.append(Spacer(1, 0.3 * inch))

        # Report metadata
        report_date = datetime.now().strftime("%B %d, %Y")
        story.append(Paragraph(f"<b>Report Date:</b> {report_date}", styles["Normal"]))
        story.append(
            Paragraph(
                f"<b>Analysis Period:</b> {min(years)} - {max(years)}",
                styles["Normal"],
            )
        )
        story.append(Spacer(1, 0.5 * inch))

        # Executive Summary
        story.append(Paragraph("Executive Summary", heading_style))
        summary = await self._build_executive_summary(
            property_id, years, organization_id, db=db
        )

        for finding in summary["key_findings"]:
            story.append(Paragraph(f"• {finding}", styles["Normal"]))

        story.append(Spacer(1, 0.3 * inch))

        # Year-over-Year Comparison Table
        story.append(Paragraph("Year-over-Year Comparison", heading_style))
        yoy_table = await self._build_comparison_table(
            property_id, years, organization_id
        )
        story.append(yoy_table)
        story.append(Spacer(1, 0.3 * inch))

        # Anomalies Section
        if len(years) >= 2:
            story.append(Paragraph("Detected Anomalies", heading_style))
            anomalies_table = await self._build_anomalies_section(
                property_id, years, organization_id, db=db
            )
            if anomalies_table:
                story.append(anomalies_table)
            else:
                story.append(
                    Paragraph(
                        "No significant anomalies detected. "
                        "All expense patterns appear normal.",
                        styles["Normal"],
                    )
                )
            story.append(Spacer(1, 0.3 * inch))

        # Fine-print footer
        fine_print_style = ParagraphStyle(
            "FinePrint",
            parent=styles["Normal"],
            fontSize=7,
            textColor=colors.HexColor("#6B7280"),
        )
        story.append(Spacer(1, 0.3 * inch))
        story.append(
            Paragraph(
                "Figures are system-calculated and may contain errors."
                " Verify all numbers against your lease and source GL"
                " before relying on this report.",
                fine_print_style,
            )
        )

        # Build PDF
        doc.build(story)
        return buffer.getvalue()

    async def _build_executive_summary(
        self,
        property_id: UUID,
        years: list[int],
        organization_id: UUID,
        db: SupabaseDB | None = None,
    ) -> dict[str, Any]:
        """Build executive summary data.

        Args:
            property_id: Property to analyze
            years: Years to compare
            organization_id: Organization ID

        Returns:
            Dictionary with summary statistics
        """
        # Get YoY comparison for total variance
        yoy = await self.analysis_service.get_year_over_year(
            property_id=property_id,
            years=years,
            organization_id=organization_id,
            use_fuzzy_matching=True,
        )

        # Get anomalies using the request-scoped client when supplied so RLS sees
        # the same organization context as the report request.
        db = db or get_supabase()
        anomalies = await self.anomaly_service.detect_anomalies(
            property_id=property_id,
            target_year=max(years),
            comparison_years=[y for y in years if y < max(years)],
            db=db,
        )

        critical_count = sum(1 for a in anomalies if a.severity.value == "critical")

        # Build key findings
        findings = []

        if yoy.total_variance_percent:
            direction = "increased" if yoy.total_variance_percent > 0 else "decreased"
            findings.append(
                f"Total expenses {direction} by "
                f"{abs(yoy.total_variance_percent):.1f}% "
                f"from {min(years)} to {max(years)}"
            )

        if critical_count > 0:
            findings.append(
                f"{critical_count} critical anomalies detected requiring attention"
            )
        elif len(anomalies) > 0:
            findings.append(f"{len(anomalies)} minor expense anomalies identified")
        else:
            findings.append("Expense patterns are consistent with historical trends")

        return {
            "total_variance": yoy.total_variance_percent or Decimal("0"),
            "anomaly_count": len(anomalies),
            "key_findings": findings,
        }

    async def _build_comparison_table(
        self, property_id: UUID, years: list[int], organization_id: UUID
    ) -> Table:
        """Build year-over-year comparison table.

        Args:
            property_id: Property to analyze
            years: Years to compare
            organization_id: Organization ID

        Returns:
            ReportLab Table object
        """
        yoy = await self.analysis_service.get_year_over_year(
            property_id=property_id,
            years=years,
            organization_id=organization_id,
            use_fuzzy_matching=True,
        )

        # Build table data
        headers = ["Expense Pool"] + [str(y) for y in years] + ["Variance %"]
        rows = [headers]

        for pool in yoy.pool_comparisons[:15]:  # Limit to top 15 pools
            row = [pool.pool_name]

            # Add amounts for each year
            for year in years:
                amount = pool.amounts.get(year)
                if amount is not None:
                    row.append(format_usd_whole(amount))
                else:
                    row.append("—")

            # Add variance
            if pool.variance_percent is not None:
                variance_str = f"{pool.variance_percent:+.1f}%"
                row.append(variance_str)
            else:
                row.append("—")

            rows.append(row)

        # Add totals row
        total_row = ["Total"]
        for year in years:
            total = yoy.total_amounts.get(year, 0)
            total_row.append(format_usd_whole(total))

        if yoy.total_variance_percent is not None:
            total_row.append(f"{yoy.total_variance_percent:+.1f}%")
        else:
            total_row.append("—")

        rows.append(total_row)

        # Create table with styling
        table = Table(rows, colWidths=[2.5 * inch] + [1 * inch] * (len(years) + 1))

        table.setStyle(
            TableStyle(
                [
                    # Header row
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e0e7ff")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 10),
                    ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                    # Data rows
                    ("FONTNAME", (0, 1), (-1, -2), "Helvetica"),
                    ("FONTSIZE", (0, 1), (-1, -2), 9),
                    ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                    ("ALIGN", (0, 1), (0, -1), "LEFT"),
                    # Totals row
                    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#f3f4f6")),
                    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                    ("LINEABOVE", (0, -1), (-1, -1), 1, colors.black),
                    # Grid
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )

        return table

    async def _build_anomalies_section(
        self,
        property_id: UUID,
        years: list[int],
        organization_id: UUID,
        db: SupabaseDB | None = None,
    ) -> Table | None:
        """Build anomalies section table.

        Args:
            property_id: Property to analyze
            years: Years to compare
            organization_id: Organization ID

        Returns:
            ReportLab Table object or None if no anomalies
        """
        db = db or get_supabase()
        anomalies = await self.anomaly_service.detect_anomalies(
            property_id=property_id,
            target_year=max(years),
            comparison_years=[y for y in years if y < max(years)],
            db=db,
        )

        if not anomalies:
            return None

        # Build table data
        headers = ["Severity", "Expense Pool", "Type", "Details"]
        rows = [headers]

        # Limit to top 10 most severe anomalies
        for anomaly in anomalies[:10]:
            severity_label = anomaly.severity.value.upper()
            pool_name = anomaly.pool_name
            anomaly_type = anomaly.anomaly_type.value.replace("_", " ").title()

            # Format details based on type
            if anomaly.anomaly_type.value in ["spike", "drop"]:
                details = f"{anomaly.variance_percent:+.1f}% variance"
            else:
                details = "See explanation"

            rows.append([severity_label, pool_name, anomaly_type, details])

        # Create table with styling
        table = Table(rows, colWidths=[1 * inch, 2 * inch, 1.5 * inch, 2 * inch])

        # Determine row colors based on severity
        table_style_commands: list[tuple[Any, ...]] = [
            # Header row
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e0e7ff")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#1e3a8a")),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 10),
            ("ALIGN", (0, 0), (-1, 0), "CENTER"),
            # Data rows
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 9),
            ("ALIGN", (0, 1), (-1, -1), "LEFT"),
            # Grid
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ]

        # Add severity-based coloring
        for i, anomaly in enumerate(anomalies[:10], 1):
            if anomaly.severity.value == "critical":
                table_style_commands.append(
                    ("BACKGROUND", (0, i), (0, i), colors.HexColor("#fee2e2"))
                )
                table_style_commands.append(
                    ("TEXTCOLOR", (0, i), (0, i), colors.HexColor("#991b1b"))
                )
            elif anomaly.severity.value == "warning":
                table_style_commands.append(
                    ("BACKGROUND", (0, i), (0, i), colors.HexColor("#fef3c7"))
                )
                table_style_commands.append(
                    ("TEXTCOLOR", (0, i), (0, i), colors.HexColor("#92400e"))
                )

        table.setStyle(TableStyle(table_style_commands))

        return table
