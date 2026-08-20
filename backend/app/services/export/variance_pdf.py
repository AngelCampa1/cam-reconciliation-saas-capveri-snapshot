"""
Variance PDF generation service.

Extracted from backend/app/api/v1/export.py to allow reuse by the
tax protest data package endpoint.
"""

from datetime import UTC, datetime
from decimal import Decimal
from io import BytesIO
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


def _money(amount: Decimal) -> str:
    """Render a recovery total as currency, negatives as ``-$X`` not ``$-X``.

    A year's total recovery can be a net credit (negative) when tenants overpaid
    estimates, so the minus must lead the symbol to read correctly on the report.
    """
    if amount < 0:
        return f"-${-amount:,.2f}"
    return f"${amount:,.2f}"


def generate_variance_pdf(
    snapshots_current: list[dict],
    snapshots_prior: list[dict],
    current_year: int,
    prior_year: int,
    threshold_percent: float,
    property_data: dict,
) -> BytesIO:
    """Generate a PDF comparing current vs prior year CAM recovery totals.

    If snapshots_prior is empty a single-year summary is produced with a note.
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    story: list[Flowable] = []

    prop_name = escape(str(property_data.get("name", "Property")))
    story.append(Paragraph(f"Variance Report — {prop_name}", styles["Title"]))
    story.append(
        Paragraph(
            f"{current_year} vs {prior_year} | Threshold: {threshold_percent}%",
            styles["Normal"],
        )
    )
    story.append(Spacer(1, 0.25 * inch))

    def _total_recovery(snapshots: list[dict]) -> Decimal:
        return sum(
            (Decimal(str(s.get("total_recovery", "0"))) for s in snapshots),
            Decimal("0"),
        )

    current_total = _total_recovery(snapshots_current)
    prior_total = _total_recovery(snapshots_prior)

    if not snapshots_prior:
        story.append(
            Paragraph(
                f"No finalized prior-year ({prior_year}) snapshots found. "
                "Year-over-year comparison is unavailable.",
                styles["Normal"],
            )
        )
        story.append(Spacer(1, 0.15 * inch))
        data = [
            ["Period", "Total Recovery"],
            [str(current_year), _money(current_total)],
        ]
        table = Table(data, colWidths=[2 * inch, 2.5 * inch])
    else:
        if prior_total != 0:
            variance_pct = (current_total - prior_total) / prior_total * 100
        else:
            variance_pct = Decimal("0")

        data = [
            ["Period", "Total Recovery", "Variance"],
            [str(current_year), _money(current_total), f"{variance_pct:.2f}%"],
            [str(prior_year), _money(prior_total), ""],
        ]
        table = Table(data, colWidths=[2 * inch, 2.5 * inch, 2 * inch])

    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c5282")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
            ]
        )
    )
    story.append(table)
    story.append(Spacer(1, 0.2 * inch))

    timestamp = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")
    story.append(Paragraph(f"Generated: {timestamp}", styles["Normal"]))
    story.append(Spacer(1, 0.15 * inch))

    disclaimer_style = ParagraphStyle(
        "Disclaimer",
        parent=styles["Normal"],
        fontSize=7,
        leading=9,
        textColor=colors.HexColor("#6b7280"),
    )
    story.append(
        Paragraph(
            "This report is generated automatically from data you provided and "
            "may contain errors. Review and verify all figures before relying "
            "on them or billing any tenant. CapVeri is not responsible for "
            "errors in outputs you did not independently verify.",
            disclaimer_style,
        )
    )

    doc.build(story)
    buffer.seek(0)
    return buffer
