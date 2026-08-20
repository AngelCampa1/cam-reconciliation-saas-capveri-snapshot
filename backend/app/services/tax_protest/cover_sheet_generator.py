"""
Tax protest county cover sheet PDF generator.

Produces a professional one-page cover sheet for the tax protest data package,
including property info, county/state, deadline banner, preparer instructions,
and an accuracy disclaimer.
"""

from dataclasses import dataclass
from datetime import date
from io import BytesIO
from typing import Literal
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# Urgency colour palette
_GREEN = colors.HexColor("#276749")  # >30 days
_AMBER = colors.HexColor("#B7791F")  # 1-30 days
_RED = colors.HexColor("#C53030")  # 0 or past

_UrgencyLevel = Literal["green", "amber", "red"]


def _urgency(days_remaining: int | None) -> _UrgencyLevel:
    if days_remaining is None:
        return "green"
    if days_remaining > 30:
        return "green"
    if days_remaining >= 1:
        return "amber"
    return "red"


def _urgency_color(level: _UrgencyLevel) -> colors.Color:
    return {"green": _GREEN, "amber": _AMBER, "red": _RED}[level]


@dataclass
class CoverSheetData:
    property_name: str
    property_address: str
    county: str
    state: str
    effective_deadline: date | None
    days_remaining: int | None
    notes: str
    tax_year: int


class TaxProtestCoverSheetGenerator:
    """Generate a ReportLab PDF cover sheet for the tax protest data package."""

    def __init__(self, data: CoverSheetData) -> None:
        self._data = data
        self._styles = getSampleStyleSheet()
        self._setup_styles()

    def _setup_styles(self) -> None:
        self._styles.add(
            ParagraphStyle(
                "CoverTitle",
                parent=self._styles["Title"],
                fontSize=20,
                textColor=colors.HexColor("#1a365d"),
                spaceAfter=6,
                alignment=1,
            )
        )
        self._styles.add(
            ParagraphStyle(
                "CoverSubtitle",
                parent=self._styles["Normal"],
                fontSize=12,
                textColor=colors.HexColor("#2c5282"),
                spaceAfter=4,
                alignment=1,
            )
        )
        self._styles.add(
            ParagraphStyle(
                "SectionHeader",
                parent=self._styles["Heading2"],
                fontSize=11,
                textColor=colors.HexColor("#2c5282"),
                spaceBefore=8,
                spaceAfter=4,
            )
        )
        self._styles.add(
            ParagraphStyle(
                "BodyText2",
                parent=self._styles["Normal"],
                fontSize=10,
                spaceAfter=3,
            )
        )
        self._styles.add(
            ParagraphStyle(
                "DisclaimerText",
                parent=self._styles["Normal"],
                fontSize=8,
                textColor=colors.grey,
                spaceAfter=3,
            )
        )

    def generate(self) -> BytesIO:
        """Build and return the cover sheet PDF as a BytesIO buffer."""
        buf = BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=letter,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
        )
        story = []
        story.extend(self._build_header())
        story.append(Spacer(1, 0.2 * inch))
        story.extend(self._build_property_section())
        story.append(Spacer(1, 0.15 * inch))
        story.extend(self._build_deadline_banner())
        story.append(Spacer(1, 0.15 * inch))
        story.extend(self._build_instructions())
        story.append(Spacer(1, 0.2 * inch))
        story.extend(self._build_disclaimer())
        doc.build(story)
        buf.seek(0)
        return buf

    def _build_header(self) -> list:
        d = self._data
        return [
            Paragraph("TAX PROTEST DATA PACKAGE", self._styles["CoverTitle"]),
            Paragraph(
                f"Tax Year {d.tax_year} — {escape(d.county)} County, "
                f"{escape(d.state)}",
                self._styles["CoverSubtitle"],
            ),
        ]

    def _build_property_section(self) -> list:
        d = self._data
        rows = [
            ["Property", d.property_name],
            ["Address", d.property_address],
            ["County / State", f"{d.county} County, {d.state}"],
            ["Tax Year", str(d.tax_year)],
        ]
        table = Table(rows, colWidths=[1.5 * inch, 5.5 * inch])
        table.setStyle(
            TableStyle(
                [
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        return [table]

    def _build_deadline_banner(self) -> list:
        d = self._data
        level = _urgency(d.days_remaining)
        banner_color = _urgency_color(level)

        if d.effective_deadline is not None:
            deadline_text = d.effective_deadline.strftime("%B %d, %Y")
            if d.days_remaining is not None:
                if d.days_remaining > 0:
                    status = f"{d.days_remaining} days remaining"
                elif d.days_remaining == 0:
                    status = "Deadline is TODAY"
                else:
                    status = f"Deadline passed {abs(d.days_remaining)} days ago"
            else:
                status = ""
            banner_line = f"FILING DEADLINE: {deadline_text}   {status}"
        else:
            banner_line = (
                "FILING DEADLINE: Not configured — see county assessor for deadline"
            )

        banner_style = ParagraphStyle(
            "Banner",
            parent=self._styles["Normal"],
            fontSize=12,
            textColor=colors.white,
            fontName="Helvetica-Bold",
            alignment=1,
            spaceAfter=0,
        )
        table = Table(
            [[Paragraph(banner_line, banner_style)]],
            colWidths=[7 * inch],
        )
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), banner_color),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                    ("LEFTPADDING", (0, 0), (-1, -1), 12),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 12),
                    ("ROUNDEDCORNERS", [4, 4, 4, 4]),
                ]
            )
        )
        elements: list = [table]
        if d.notes:
            elements.append(Spacer(1, 0.05 * inch))
            elements.append(
                Paragraph(f"Note: {escape(d.notes)}", self._styles["BodyText2"])
            )
        return elements

    def _build_instructions(self) -> list:
        return [
            Paragraph("Preparer Instructions", self._styles["SectionHeader"]),
            Paragraph(
                "This package contains four documents for your tax protest filing:",
                self._styles["BodyText2"],
            ),
            Paragraph(
                "1. <b>01_Expense_Summary.pdf</b> — CAM expense summary with tenant "
                "reconciliation details for the tax year.",
                self._styles["BodyText2"],
            ),
            Paragraph(
                "2. <b>02_GL_by_Category.csv</b> — General ledger expenses categorised "
                "by CAM pool. Import into your appraisal district's portal or provide "
                "to tax counsel.",
                self._styles["BodyText2"],
            ),
            Paragraph(
                "3. <b>03_Year_Over_Year_Comparison.pdf</b> — Year-over-year variance "
                "report comparing the current tax year to the prior year.",
                self._styles["BodyText2"],
            ),
            Paragraph(
                "4. <b>04_County_Cover_Sheet.pdf</b> — This document. Attach as a "
                "cover page to your protest submission.",
                self._styles["BodyText2"],
            ),
        ]

    def _build_disclaimer(self) -> list:
        return [
            Paragraph(
                "Accuracy Disclaimer",
                self._styles["SectionHeader"],
            ),
            Paragraph(
                "This package was generated by CapVeri from reconciliation data "
                "entered by your organisation. All calculations are deterministic and "
                "based solely on the data you have provided. CapVeri does not "
                "warrant the accuracy of the underlying data and this document does "
                "not constitute legal, tax, or appraisal advice. Consult qualified "
                "tax counsel before filing a formal protest.",
                self._styles["DisclaimerText"],
            ),
        ]
