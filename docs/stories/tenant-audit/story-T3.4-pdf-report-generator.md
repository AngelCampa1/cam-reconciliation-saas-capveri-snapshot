# Story T3.4: PDF Report Generator

## Story Info
- **Epic**: T3 — Audit Pipeline & Report
- **Estimated Hours**: 8
- **Dependencies**: T3.3 (discrepancy detector)
- **Status**: `pending`

## User Story
As a commercial tenant who paid for a CAM audit, I want to receive a professional PDF report that clearly shows which charges are correct and which are overcharges so that I can present findings to my landlord or use them in a dispute.

## Acceptance Criteria
- `TenantAuditReportGenerator.generate()` produces a valid PDF byte stream using ReportLab
- Report sections are tier-dependent:
  - **Standard** ($49): Executive summary, pro-rata share check, gross-up check, cap enforcement check, base year stop check, total comparison
  - **Detailed** ($99): Standard + admin fee analysis, expense exclusion review, occupancy adjustment, capital vs operating classification, full calculation trace
  - **Expert** ($199): Detailed + dispute letter draft with lease clause citations, line-by-line expense breakdown, methodology notes for CPA review
- Report header includes: CapVeri branding, audit ID, date generated, property name, tier badge
- Executive summary shows: total overcharge/undercharge, number of discrepancies by severity, overall assessment (Clean / Minor Issues / Material Discrepancies)
- Each discrepancy section shows: landlord's value, calculated value, difference, dollar impact, and plain-English explanation
- Color coding: green for correct values, amber for minor differences, red for material discrepancies
- All monetary values formatted as USD with commas and 2 decimal places
- Expert tier dispute letter includes: property address, lease reference, specific clause citations, requested remedy amount
- PDF is under 2MB for email attachment compatibility
- Generated PDF passes basic PDF/A validation (well-formed, readable)

## Technical Specifications

### Report Generator

```python
# backend/app/services/tenant_audit/report_generator.py
import io
import logging
from datetime import UTC, datetime
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.models.tenant_audit import TenantAudit, TenantAuditTier
from app.services.calculation.orchestrator import PropertyReconciliation
from app.services.extraction.cam_statement_models import CamStatementExtractionResult
from app.services.tenant_audit.discrepancy_detector import (
    Discrepancy,
    DiscrepancyCategory,
    DiscrepancyDetector,
)

logger = logging.getLogger(__name__)

# Brand colors (from design tokens)
BRAND_PRIMARY = colors.HexColor("#1E3A5F")
BRAND_ACCENT = colors.HexColor("#2C7BE5")
COLOR_GREEN = colors.HexColor("#28A745")
COLOR_AMBER = colors.HexColor("#FFC107")
COLOR_RED = colors.HexColor("#DC3545")
COLOR_LIGHT_GRAY = colors.HexColor("#F8F9FA")
COLOR_BORDER = colors.HexColor("#DEE2E6")


# Tier to included sections mapping
TIER_SECTIONS: dict[TenantAuditTier, set[str]] = {
    TenantAuditTier.STANDARD: {
        "executive_summary",
        "pro_rata_share",
        "gross_up",
        "cap_enforcement",
        "base_year_stop",
        "total_comparison",
    },
    TenantAuditTier.DETAILED: {
        "executive_summary",
        "pro_rata_share",
        "gross_up",
        "cap_enforcement",
        "base_year_stop",
        "total_comparison",
        "admin_fee",
        "exclusion_review",
        "occupancy_adjustment",
        "capital_classification",
        "calculation_trace",
    },
    TenantAuditTier.EXPERT: {
        "executive_summary",
        "pro_rata_share",
        "gross_up",
        "cap_enforcement",
        "base_year_stop",
        "total_comparison",
        "admin_fee",
        "exclusion_review",
        "occupancy_adjustment",
        "capital_classification",
        "calculation_trace",
        "dispute_letter",
        "line_item_breakdown",
        "methodology_notes",
    },
}


def _fmt_usd(amount: Decimal) -> str:
    """Format Decimal as USD string: $1,234.56."""
    return f"${amount:,.2f}"


def _fmt_pct(rate: Decimal) -> str:
    """Format Decimal as percentage: 5.25%."""
    return f"{rate * 100:.2f}%"


def _severity_color(severity: str) -> colors.HexColor:
    """Map severity to display color."""
    if severity == "high":
        return COLOR_RED
    if severity == "medium":
        return COLOR_AMBER
    return COLOR_GREEN


def _overall_assessment(discrepancies: list[Discrepancy]) -> str:
    """Determine overall audit assessment."""
    high_count = sum(1 for d in discrepancies if d.severity == "high")
    total_count = len(discrepancies)
    if high_count > 0:
        return "Material Discrepancies Found"
    if total_count > 0:
        return "Minor Issues Found"
    return "Clean - No Material Discrepancies"


class TenantAuditReportGenerator:
    """Generates tier-appropriate PDF audit reports using ReportLab.

    The generator produces a professional PDF with branded headers,
    discrepancy tables, and tier-specific sections. Expert tier
    includes a dispute letter draft.
    """

    def __init__(self) -> None:
        self.styles = getSampleStyleSheet()
        self._register_custom_styles()

    def _register_custom_styles(self) -> None:
        """Register custom paragraph styles for report sections."""
        self.styles.add(ParagraphStyle(
            "ReportTitle",
            parent=self.styles["Title"],
            fontSize=24,
            textColor=BRAND_PRIMARY,
            spaceAfter=12,
        ))
        self.styles.add(ParagraphStyle(
            "SectionHeader",
            parent=self.styles["Heading2"],
            fontSize=14,
            textColor=BRAND_PRIMARY,
            spaceBefore=18,
            spaceAfter=8,
            borderWidth=1,
            borderColor=BRAND_ACCENT,
            borderPadding=4,
        ))
        self.styles.add(ParagraphStyle(
            "BodyText_Custom",
            parent=self.styles["BodyText"],
            fontSize=10,
            leading=14,
            spaceAfter=6,
        ))
        self.styles.add(ParagraphStyle(
            "Verdict_Clean",
            parent=self.styles["BodyText"],
            fontSize=16,
            textColor=COLOR_GREEN,
            alignment=TA_CENTER,
            spaceBefore=12,
            spaceAfter=12,
        ))
        self.styles.add(ParagraphStyle(
            "Verdict_Issues",
            parent=self.styles["BodyText"],
            fontSize=16,
            textColor=COLOR_RED,
            alignment=TA_CENTER,
            spaceBefore=12,
            spaceAfter=12,
        ))
        self.styles.add(ParagraphStyle(
            "DisputeBody",
            parent=self.styles["BodyText"],
            fontSize=11,
            leading=16,
            leftIndent=36,
            rightIndent=36,
            spaceAfter=8,
        ))

    def generate(
        self,
        audit: TenantAudit,
        discrepancies: list[Discrepancy],
        cam_extraction: CamStatementExtractionResult,
        calculation: PropertyReconciliation,
    ) -> bytes:
        """
        Generate a complete PDF audit report.

        Args:
            audit: The tenant audit record (for metadata and tier).
            discrepancies: List of detected discrepancies.
            cam_extraction: Original CAM statement extraction.
            calculation: Calculation engine results.

        Returns:
            PDF file content as bytes.
        """
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            rightMargin=0.75 * inch,
            title=f"CAM Audit Report - {audit.property_name or 'Property'}",
            author="CapVeri",
        )

        sections = TIER_SECTIONS[audit.tier]
        story: list = []

        # Header
        story.extend(self._build_header(audit))

        # Executive Summary (all tiers)
        if "executive_summary" in sections:
            story.extend(
                self._build_executive_summary(audit, discrepancies, calculation)
            )

        # Discrepancy sections
        category_section_map = {
            "pro_rata_share": DiscrepancyCategory.PRO_RATA_SHARE,
            "gross_up": DiscrepancyCategory.GROSS_UP,
            "cap_enforcement": DiscrepancyCategory.CAP_ENFORCEMENT,
            "base_year_stop": DiscrepancyCategory.BASE_YEAR_STOP,
            "admin_fee": DiscrepancyCategory.ADMIN_FEE,
            "occupancy_adjustment": DiscrepancyCategory.OCCUPANCY_ADJUSTMENT,
            "capital_classification": DiscrepancyCategory.CAPITAL_CLASSIFICATION,
        }

        for section_key, category in category_section_map.items():
            if section_key in sections:
                relevant = [d for d in discrepancies if d.category == category]
                story.extend(self._build_discrepancy_section(category, relevant))

        # Total comparison (all tiers)
        if "total_comparison" in sections:
            total_discs = [
                d for d in discrepancies
                if d.category == DiscrepancyCategory.TOTAL
            ]
            story.extend(self._build_total_comparison(calculation, total_discs))

        # Calculation trace (detailed + expert)
        if "calculation_trace" in sections:
            story.extend(self._build_calculation_trace(calculation))

        # Line item breakdown (expert only)
        if "line_item_breakdown" in sections:
            story.extend(self._build_line_item_breakdown(cam_extraction))

        # Methodology notes (expert only)
        if "methodology_notes" in sections:
            story.extend(self._build_methodology_notes())

        # Dispute letter (expert only)
        if "dispute_letter" in sections:
            story.append(PageBreak())
            story.extend(self._build_dispute_letter(
                audit, discrepancies, cam_extraction, calculation
            ))

        # Footer / disclaimer
        story.extend(self._build_disclaimer(audit))

        doc.build(story)
        pdf_bytes = buffer.getvalue()
        buffer.close()

        logger.info(
            "Generated %s-tier report for audit %s: %d bytes, %d discrepancies",
            audit.tier.value,
            audit.id,
            len(pdf_bytes),
            len(discrepancies),
        )

        return pdf_bytes

    def _build_header(self, audit: TenantAudit) -> list:
        """Build report header with branding and metadata."""
        elements = []
        elements.append(Paragraph("CAM Audit Report", self.styles["ReportTitle"]))
        elements.append(Spacer(1, 6))

        # Metadata table
        meta_data = [
            ["Property:", audit.property_name or "Not specified"],
            ["Audit ID:", str(audit.access_token)[:8] + "..."],
            ["Tier:", audit.tier.value.title()],
            ["Generated:", datetime.now(UTC).strftime("%B %d, %Y")],
        ]
        meta_table = Table(meta_data, colWidths=[1.5 * inch, 4 * inch])
        meta_table.setStyle(TableStyle([
            ("FONT", (0, 0), (0, -1), "Helvetica-Bold", 10),
            ("FONT", (1, 0), (1, -1), "Helvetica", 10),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 18))

        return elements

    def _build_executive_summary(
        self,
        audit: TenantAudit,
        discrepancies: list[Discrepancy],
        calculation: PropertyReconciliation,
    ) -> list:
        """Build executive summary section."""
        elements = []
        elements.append(Paragraph("Executive Summary", self.styles["SectionHeader"]))

        assessment = _overall_assessment(discrepancies)
        style_key = "Verdict_Clean" if "Clean" in assessment else "Verdict_Issues"
        elements.append(Paragraph(assessment, self.styles[style_key]))

        # Summary stats
        detector = DiscrepancyDetector()
        report = detector.build_report(discrepancies)

        summary_data = [
            ["Metric", "Value"],
            ["Total Overcharge", _fmt_usd(report.total_overcharge)],
            ["Total Undercharge", _fmt_usd(abs(report.total_undercharge))],
            ["Net Impact", _fmt_usd(report.total_overcharge + report.total_undercharge)],
            ["Discrepancies Found", str(report.discrepancy_count)],
            ["Checks Performed", str(report.checks_performed)],
        ]

        summary_table = Table(summary_data, colWidths=[3 * inch, 2.5 * inch])
        summary_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 10),
            ("FONT", (0, 1), (-1, -1), "Helvetica", 10),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, COLOR_LIGHT_GRAY]),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 12))

        # Severity breakdown
        high = sum(1 for d in discrepancies if d.severity == "high")
        medium = sum(1 for d in discrepancies if d.severity == "medium")
        low = sum(1 for d in discrepancies if d.severity == "low")
        elements.append(Paragraph(
            f"Severity breakdown: {high} high, {medium} medium, {low} low",
            self.styles["BodyText_Custom"],
        ))
        elements.append(Spacer(1, 12))

        return elements

    def _build_discrepancy_section(
        self,
        category: DiscrepancyCategory,
        discrepancies: list[Discrepancy],
    ) -> list:
        """Build a section for a specific discrepancy category."""
        elements = []
        title = category.value.replace("_", " ").title()
        elements.append(Paragraph(title, self.styles["SectionHeader"]))

        if not discrepancies:
            elements.append(Paragraph(
                "No discrepancies found in this area.",
                self.styles["BodyText_Custom"],
            ))
            elements.append(Spacer(1, 8))
            return elements

        for disc in discrepancies:
            # Comparison table
            comp_data = [
                ["", "Value"],
                ["Landlord's Statement", _fmt_usd(disc.landlord_value)],
                ["Calculated (Correct)", _fmt_usd(disc.calculated_value)],
                ["Difference", _fmt_usd(disc.difference)],
                ["Impact on Tenant", _fmt_usd(disc.impact_amount)],
            ]

            comp_table = Table(comp_data, colWidths=[2.5 * inch, 2 * inch])
            severity_color = _severity_color(disc.severity)
            comp_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_PRIMARY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
                ("FONT", (0, 1), (-1, -1), "Helvetica", 10),
                ("ALIGN", (1, 0), (1, -1), "RIGHT"),
                ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
                ("BACKGROUND", (0, -1), (-1, -1), severity_color),
                ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
                ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
            ]))
            elements.append(comp_table)
            elements.append(Spacer(1, 6))

            # Explanation
            elements.append(Paragraph(disc.explanation, self.styles["BodyText_Custom"]))
            elements.append(Spacer(1, 12))

        return elements

    def _build_total_comparison(
        self,
        calculation: PropertyReconciliation,
        total_discrepancies: list[Discrepancy],
    ) -> list:
        """Build the total comparison section."""
        elements = []
        elements.append(Paragraph("Total Comparison", self.styles["SectionHeader"]))

        tenant_recon = calculation.tenant_reconciliations[0] if calculation.tenant_reconciliations else None
        if tenant_recon is None:
            elements.append(Paragraph(
                "No tenant reconciliation data available.",
                self.styles["BodyText_Custom"],
            ))
            return elements

        breakdown_data = [
            ["Component", "Amount"],
            ["Total Operating Expenses", _fmt_usd(tenant_recon.total_operating_expenses)],
            ["Grossed-Up Expenses", _fmt_usd(tenant_recon.grossed_up_expenses)],
            ["Tenant Share (before cap)", _fmt_usd(tenant_recon.tenant_share_before_cap)],
            ["Tenant Share (after cap)", _fmt_usd(tenant_recon.tenant_share_after_cap)],
            ["Admin Fee", _fmt_usd(tenant_recon.admin_fee)],
            ["Total Recovery", _fmt_usd(tenant_recon.total_recovery)],
        ]

        breakdown_table = Table(breakdown_data, colWidths=[3 * inch, 2.5 * inch])
        breakdown_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 10),
            ("FONT", (0, 1), (-1, -1), "Helvetica", 10),
            ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 10),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, COLOR_LIGHT_GRAY]),
            ("BACKGROUND", (0, -1), (-1, -1), BRAND_PRIMARY),
            ("TEXTCOLOR", (0, -1), (-1, -1), colors.white),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
        ]))
        elements.append(breakdown_table)
        elements.append(Spacer(1, 12))

        if total_discrepancies:
            for disc in total_discrepancies:
                elements.append(Paragraph(disc.explanation, self.styles["BodyText_Custom"]))

        return elements

    def _build_calculation_trace(self, calculation: PropertyReconciliation) -> list:
        """Build calculation trace section (detailed + expert tiers)."""
        elements = []
        elements.append(Paragraph("Calculation Trace", self.styles["SectionHeader"]))
        elements.append(Paragraph(
            "Step-by-step breakdown of how the correct values were calculated. "
            "This trace provides a complete audit trail for independent verification.",
            self.styles["BodyText_Custom"],
        ))

        # Property-level trace
        for step in calculation.property_trace.steps:
            step_text = (
                f"<b>{step.step_name}</b>: {step.operation} = {step.output_value}"
            )
            if step.note:
                step_text += f" <i>({step.note})</i>"
            elements.append(Paragraph(step_text, self.styles["BodyText_Custom"]))

        elements.append(Spacer(1, 12))
        return elements

    def _build_line_item_breakdown(
        self, cam_extraction: CamStatementExtractionResult
    ) -> list:
        """Build line-by-line expense breakdown (expert tier only)."""
        elements = []
        elements.append(Paragraph("Line Item Breakdown", self.styles["SectionHeader"]))

        if not cam_extraction.line_items:
            elements.append(Paragraph(
                "No line items extracted from CAM statement.",
                self.styles["BodyText_Custom"],
            ))
            return elements

        line_data = [["Category", "Description", "Amount"]]
        for item in cam_extraction.line_items:
            line_data.append([
                item.category,
                item.description or "-",
                _fmt_usd(item.amount),
            ])

        # Total row
        total = sum(item.amount for item in cam_extraction.line_items)
        line_data.append(["", "TOTAL", _fmt_usd(total)])

        line_table = Table(line_data, colWidths=[1.8 * inch, 2.7 * inch, 1.5 * inch])
        line_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_PRIMARY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONT", (0, 0), (-1, 0), "Helvetica-Bold", 9),
            ("FONT", (0, 1), (-1, -1), "Helvetica", 9),
            ("FONT", (0, -1), (-1, -1), "Helvetica-Bold", 9),
            ("ALIGN", (2, 0), (2, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.5, COLOR_BORDER),
            ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, COLOR_LIGHT_GRAY]),
            ("BACKGROUND", (0, -1), (-1, -1), COLOR_LIGHT_GRAY),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(line_table)
        elements.append(Spacer(1, 12))

        return elements

    def _build_methodology_notes(self) -> list:
        """Build methodology notes section (expert tier only)."""
        elements = []
        elements.append(Paragraph("Methodology Notes", self.styles["SectionHeader"]))
        elements.append(Paragraph(
            "This audit was performed using the CapVeri automated reconciliation engine. "
            "The methodology follows industry-standard practices for CAM reconciliation verification:",
            self.styles["BodyText_Custom"],
        ))

        notes = [
            "1. Lease terms were extracted from the uploaded lease document using OCR and "
            "AI-assisted extraction, then verified against the calculation.",
            "2. CAM statement line items were extracted from the landlord's reconciliation "
            "statement and independently categorized (operating, tax, insurance, capital).",
            "3. Gross-up calculations used the BOMA 2024 standard methodology with actual "
            "occupancy rates derived from lease term analysis.",
            "4. Expense caps were applied per the lease terms (cumulative or non-cumulative) "
            "with proper compounding where applicable.",
            "5. All calculations use deterministic decimal arithmetic with no floating-point "
            "approximation. Results are reproducible given the same inputs.",
            "6. A $1.00 tolerance is applied to all monetary comparisons to account for "
            "rounding differences between calculation systems.",
        ]
        for note in notes:
            elements.append(Paragraph(note, self.styles["BodyText_Custom"]))

        elements.append(Spacer(1, 12))
        return elements

    def _build_dispute_letter(
        self,
        audit: TenantAudit,
        discrepancies: list[Discrepancy],
        cam_extraction: CamStatementExtractionResult,
        calculation: PropertyReconciliation,
    ) -> list:
        """Build dispute letter draft (expert tier only)."""
        elements = []
        elements.append(Paragraph(
            "Draft Dispute Letter", self.styles["SectionHeader"]
        ))
        elements.append(Paragraph(
            "<i>This letter is a draft template. Review and customize before sending "
            "to your landlord or property management company.</i>",
            self.styles["BodyText_Custom"],
        ))
        elements.append(Spacer(1, 12))

        # Letter body
        today = datetime.now(UTC).strftime("%B %d, %Y")
        property_name = audit.property_name or "[Property Name]"
        tenant_name = cam_extraction.tenant_name or "[Tenant Name]"

        detector = DiscrepancyDetector()
        report = detector.build_report(discrepancies)

        letter_lines = [
            f"Date: {today}",
            "",
            "Re: CAM Reconciliation Dispute",
            f"Property: {property_name}",
            f"Reconciliation Period: {calculation.period_start} to {calculation.period_end}",
            "",
            "Dear Property Manager,",
            "",
            f"We have completed an independent audit of the CAM reconciliation statement "
            f"for the above-referenced property and period. Our analysis identified "
            f"{report.discrepancy_count} discrepancy(ies) totaling {_fmt_usd(report.total_overcharge)} "
            f"in potential overcharges.",
            "",
            "Specifically, we found the following issues:",
            "",
        ]

        for disc in discrepancies:
            if disc.impact_amount > Decimal("0"):
                letter_lines.append(
                    f"- {disc.category.value.replace('_', ' ').title()}: "
                    f"{disc.explanation} (Impact: {_fmt_usd(disc.impact_amount)})"
                )

        letter_lines.extend([
            "",
            f"We respectfully request a credit of {_fmt_usd(report.total_overcharge)} "
            f"to account for these discrepancies, or an opportunity to review the "
            f"supporting documentation per the audit rights provision of our lease.",
            "",
            "Please respond within 30 days of receipt of this letter.",
            "",
            "Sincerely,",
            f"{tenant_name}",
        ])

        for line in letter_lines:
            elements.append(Paragraph(line, self.styles["DisputeBody"]))

        elements.append(Spacer(1, 18))
        return elements

    def _build_disclaimer(self, audit: TenantAudit) -> list:
        """Build footer disclaimer."""
        elements = []
        elements.append(Spacer(1, 24))

        disclaimer_style = ParagraphStyle(
            "Disclaimer",
            parent=self.styles["BodyText"],
            fontSize=7,
            textColor=colors.gray,
            leading=9,
        )
        elements.append(Paragraph(
            "DISCLAIMER: This report is generated by CapVeri using automated extraction "
            "and calculation technology. While we strive for accuracy, this report does not "
            "constitute legal or accounting advice. Values are based on information extracted "
            "from the documents you provided. Consult with a qualified CPA or attorney before "
            "taking action based on this report. CapVeri is not responsible for errors "
            "in source documents or extraction limitations.",
            disclaimer_style,
        ))
        elements.append(Paragraph(
            f"Report generated on {datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC')} | "
            f"Audit ID: {audit.access_token} | Tier: {audit.tier.value.title()} | "
            f"CapVeri",
            disclaimer_style,
        ))

        return elements
```

## Test Cases
- Test `generate()` produces non-empty bytes for standard tier
- Test `generate()` produces non-empty bytes for detailed tier
- Test `generate()` produces non-empty bytes for expert tier
- Test standard tier report does NOT contain "Calculation Trace", "Dispute Letter", "Line Item Breakdown", or "Methodology Notes" sections
- Test detailed tier report contains "Calculation Trace" but NOT "Dispute Letter"
- Test expert tier report contains all sections including "Dispute Letter"
- Test `TIER_SECTIONS` mapping: standard has 6 sections, detailed has 11, expert has 14
- Test `_fmt_usd` formats `Decimal("1234.50")` as `"$1,234.50"`
- Test `_fmt_pct` formats `Decimal("0.0525")` as `"5.25%"`
- Test `_overall_assessment` returns "Clean" when no discrepancies
- Test `_overall_assessment` returns "Minor Issues Found" when only low/medium severity
- Test `_overall_assessment` returns "Material Discrepancies Found" when any high severity
- Test `_severity_color` returns correct colors for each severity level
- Test generated PDF is under 2MB for a typical audit with 5 discrepancies
- Test generated PDF starts with `%PDF` magic bytes (valid PDF)
- Test report header contains property name and tier badge
- Test executive summary includes total overcharge amount
- Test discrepancy section shows landlord value, calculated value, and explanation
- Test dispute letter includes property name, period, and total overcharge amount
- Test disclaimer text is present at the end of the report
- Test report with zero discrepancies still generates a valid PDF with "Clean" assessment
- Test report with 20+ discrepancies does not exceed 2MB

## Definition of Done
- [ ] `TenantAuditReportGenerator` class implemented in `backend/app/services/tenant_audit/report_generator.py`
- [ ] ReportLab-based PDF generation with branded styles
- [ ] Tier-dependent section inclusion (standard: 6, detailed: 11, expert: 14)
- [ ] Executive summary with overall assessment and severity breakdown
- [ ] Discrepancy sections with comparison tables and explanations
- [ ] Color coding: green (correct), amber (minor), red (material)
- [ ] Total comparison breakdown table
- [ ] Calculation trace section (detailed + expert)
- [ ] Line item breakdown (expert only)
- [ ] Methodology notes (expert only)
- [ ] Dispute letter draft with property context and overcharge summary (expert only)
- [ ] Footer disclaimer on all tiers
- [ ] All monetary values formatted as USD with commas and 2 decimals
- [ ] Generated PDF under 2MB
- [ ] All unit tests pass with `pytest --tb=short`
- [ ] Coverage maintained at >= 95%
