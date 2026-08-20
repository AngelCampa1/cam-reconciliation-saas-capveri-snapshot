"""
Demand letter PDF generator using ReportLab.

Builds a professional demand letter PDF from DemandLetterData, injecting
the appropriate jurisdiction template and optional dispute paragraph.
"""

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from io import BytesIO
from typing import Literal
from uuid import UUID
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import HRFlowable, Paragraph, SimpleDocTemplate, Spacer

from app.services.legal.demand_letter_templates import (
    CA_DEMAND_BODY,
    DISPUTE_PARAGRAPH,
    LEGAL_DISCLAIMER,
    TX_DEMAND_BODY,
)


@dataclass
class DemandLetterData:
    """All data required to render a demand letter PDF."""

    tenant_name: str
    property_address: str
    amount_owed: Decimal
    period_start: date
    period_end: date
    lease_reference: str
    landlord_name: str
    landlord_title: str
    landlord_company: str
    landlord_phone: str
    landlord_email: str
    landlord_address: str
    payment_deadline_date: date
    letter_date: date
    state: Literal["TX", "CA"]
    dispute_id: UUID | None = field(default=None)
    dispute_filed_date: date | None = field(default=None)


def _format_currency(amount: Decimal) -> str:
    """Format a Decimal as a USD currency string, e.g. '$44,032.97'.

    Negative amounts lead with the minus ('-$44,032.97'), never '$-44,032.97',
    so the figure reads correctly on a letter that may be presented in a dispute.
    """
    if amount < 0:
        return f"-${-amount:,.2f}"
    return f"${amount:,.2f}"


class DemandLetterGenerator:
    """Generates a demand letter PDF as a BytesIO object.

    Usage::

        generator = DemandLetterGenerator(data)
        pdf_bytes_io = generator.generate()
    """

    def __init__(self, data: DemandLetterData) -> None:
        self._data = data

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate(self) -> BytesIO:
        """Build the PDF and return it as a seeked-to-zero BytesIO."""
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=1.0 * inch,
            leftMargin=1.0 * inch,
            topMargin=1.0 * inch,
            bottomMargin=1.0 * inch,
        )
        story = self._build_story()
        doc.build(story)
        buffer.seek(0)
        return buffer

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _build_story(self) -> list:
        """Assemble all flowables for the document."""
        styles = getSampleStyleSheet()
        body_style = ParagraphStyle(
            name="LetterBody",
            parent=styles["Normal"],
            fontSize=11,
            leading=16,
            spaceAfter=10,
        )
        disclaimer_style = ParagraphStyle(
            name="Disclaimer",
            parent=styles["Normal"],
            fontSize=8,
            leading=11,
            textColor=colors.grey,
        )

        substitution_map = self._build_substitution_map()

        # Select jurisdiction body
        raw_body = TX_DEMAND_BODY if self._data.state == "TX" else CA_DEMAND_BODY
        body_text = raw_body.format_map(substitution_map)

        story: list = []

        # Letter body - render each paragraph separately to preserve line breaks
        for para in body_text.split("\n\n"):
            para = para.strip()
            if para:
                # Convert single newlines within a paragraph to <br/>
                para_html = para.replace("\n", "<br/>")
                story.append(Paragraph(para_html, body_style))
                story.append(Spacer(1, 0.05 * inch))

        # Optional dispute paragraph
        if self._data.dispute_id is not None:
            dispute_text = DISPUTE_PARAGRAPH.format(
                dispute_id=str(self._data.dispute_id),
                dispute_filed_date=(
                    self._data.dispute_filed_date.isoformat()
                    if self._data.dispute_filed_date
                    else ""
                ),
            )
            story.append(Spacer(1, 0.15 * inch))
            story.append(Paragraph(dispute_text, body_style))

        # Divider + disclaimer
        story.append(Spacer(1, 0.2 * inch))
        story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey))
        story.append(Spacer(1, 0.1 * inch))
        story.append(Paragraph(LEGAL_DISCLAIMER, disclaimer_style))

        return story

    def _build_substitution_map(self) -> dict:
        """Build the substitution dict for str.format_map()."""
        d = self._data
        return {
            "tenant_name": escape(d.tenant_name),
            "property_address": escape(d.property_address),
            "amount_owed": _format_currency(d.amount_owed),
            "period_start": d.period_start.isoformat(),
            "period_end": d.period_end.isoformat(),
            "deadline_date": d.payment_deadline_date.isoformat(),
            "landlord_name": escape(d.landlord_name),
            "landlord_title": escape(d.landlord_title),
            "landlord_company": escape(d.landlord_company),
            "landlord_phone": escape(d.landlord_phone),
            "landlord_email": escape(d.landlord_email),
            "landlord_address": escape(d.landlord_address),
            "lease_reference": escape(d.lease_reference),
            "letter_date": d.letter_date.isoformat(),
        }
