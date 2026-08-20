"""Denominator change PDF report generator.

Generates a PDF report documenting denominator changes between reconciliation
periods, including RSF changes, tenant roster changes, and per-tenant impact.
"""

from io import BytesIO
from typing import Any
from xml.sax.saxutils import escape

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

from app.models.denominator_change import DenominatorChangeReport
from app.services.formatting import format_usd, format_usd_delta


class DenominatorChangeReportGenerator:
    """Generate PDF reports for denominator change analysis."""

    def generate(self, report: DenominatorChangeReport) -> bytes:
        """Generate PDF report from a DenominatorChangeReport.

        Args:
            report: The denominator change report data

        Returns:
            PDF file as bytes
        """
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter)
        styles = getSampleStyleSheet()
        story: list[Flowable] = []

        # Custom styles
        title_style = ParagraphStyle(
            "DenomTitle",
            parent=styles["Title"],
            fontSize=22,
            textColor=colors.HexColor("#1e3a8a"),
        )
        heading_style = ParagraphStyle(
            "DenomHeading",
            parent=styles["Heading2"],
            fontSize=14,
            textColor=colors.HexColor("#1e40af"),
            spaceAfter=10,
        )
        body_style = styles["Normal"]

        # Header
        story.append(Paragraph("Denominator Change Audit Report", title_style))
        story.append(Spacer(1, 0.2 * inch))

        # Property and period info
        story.append(
            Paragraph(f"<b>Property:</b> {escape(report.property_name)}", body_style)
        )
        story.append(
            Paragraph(f"<b>Prior Period:</b> {escape(report.prior_period)}", body_style)
        )
        story.append(
            Paragraph(
                f"<b>Current Period:</b> {escape(report.current_period)}", body_style
            )
        )
        story.append(
            Paragraph(
                f"<b>Generated:</b> {report.generated_at.strftime('%Y-%m-%d %H:%M')}",
                body_style,
            )
        )
        story.append(Spacer(1, 0.3 * inch))

        # Executive summary
        story.append(Paragraph("Executive Summary", heading_style))
        story.append(Paragraph(escape(report.summary), body_style))
        story.append(Spacer(1, 0.1 * inch))

        # RSF summary table
        rsf_data = [
            ["Metric", "Prior Period", "Current Period", "Change"],
            [
                "Total RSF",
                f"{report.prior_total_rsf:,.0f}",
                f"{report.current_total_rsf:,.0f}",
                f"{report.rsf_delta:+,.0f} ({report.rsf_delta_percent:+.2f}%)",
            ],
        ]
        rsf_table = Table(
            rsf_data, colWidths=[2 * inch, 1.5 * inch, 1.5 * inch, 2 * inch]
        )
        rsf_table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e0e7ff")),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ]
            )
        )
        story.append(rsf_table)
        story.append(Spacer(1, 0.3 * inch))

        # Denominator changes table
        if report.changes:
            story.append(Paragraph("Denominator Changes", heading_style))
            changes_data: list[list[Any]] = [
                ["Type", "Description", "Prior", "Current"]
            ]
            for change in report.changes:
                changes_data.append(
                    [
                        change.change_type.value.replace("_", " ").title(),
                        Paragraph(escape(change.description), body_style),
                        change.prior_value,
                        change.current_value,
                    ]
                )
            changes_table = Table(
                changes_data,
                colWidths=[1.5 * inch, 3 * inch, 1.25 * inch, 1.25 * inch],
            )
            changes_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e0e7ff")),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 8),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("TOPPADDING", (0, 0), (-1, -1), 4),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ]
                )
            )
            story.append(changes_table)
            story.append(Spacer(1, 0.3 * inch))
        else:
            story.append(Paragraph("Denominator Changes", heading_style))
            story.append(
                Paragraph(
                    "No denominator changes detected between periods.", body_style
                )
            )
            story.append(Spacer(1, 0.3 * inch))

        # Per-tenant impact table
        if report.tenant_impacts:
            story.append(Paragraph("Per-Tenant Impact", heading_style))
            impact_data = [
                [
                    "Tenant",
                    "Prior Share",
                    "Current Share",
                    "Delta (ppt)",
                    "Prior Recovery",
                    "Current Recovery",
                    "Delta ($)",
                ]
            ]
            for impact in report.tenant_impacts:
                impact_data.append(
                    [
                        impact.tenant_name,
                        f"{impact.prior_pro_rata_share * 100:.2f}%",
                        f"{impact.current_pro_rata_share * 100:.2f}%",
                        f"{impact.share_delta_pct_points:+.2f}",
                        format_usd(impact.prior_estimated_recovery),
                        format_usd(impact.current_estimated_recovery),
                        format_usd_delta(impact.recovery_delta),
                    ]
                )
            impact_table = Table(
                impact_data,
                colWidths=[
                    1.2 * inch,
                    0.8 * inch,
                    0.8 * inch,
                    0.7 * inch,
                    1.1 * inch,
                    1.1 * inch,
                    1.1 * inch,
                ],
            )
            impact_table.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e0e7ff")),
                        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                        ("FONTSIZE", (0, 0), (-1, -1), 7),
                        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("TOPPADDING", (0, 0), (-1, -1), 3),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                    ]
                )
            )
            story.append(impact_table)
            story.append(Spacer(1, 0.3 * inch))

        # Footer
        story.append(Spacer(1, 0.5 * inch))
        footer_style = ParagraphStyle(
            "Footer",
            parent=body_style,
            fontSize=7,
            textColor=colors.grey,
        )
        story.append(
            Paragraph(
                "Generated by CapVeri | "
                "This report is for informational purposes only."
                " Figures are system-calculated and may contain errors."
                " Verify all numbers against your lease and source GL"
                " before issuing any billing change.",
                footer_style,
            )
        )

        doc.build(story)
        return buffer.getvalue()
