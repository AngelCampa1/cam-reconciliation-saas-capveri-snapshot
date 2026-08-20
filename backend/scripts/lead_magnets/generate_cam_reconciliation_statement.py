"""Generate the CAM Reconciliation Statement Template PDF.

Output: ``docs/assets/cam-reconciliation-statement.pdf``

A 4-5 page generic (non-state-specific) year-end CAM reconciliation statement
template for property managers sending standard statements to tenants.
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from _common import (  # noqa: E402
    BRAND_BLUE,
    LIGHT_GRAY,
    NAVY,
    SLATE,
    app_url,
    deterministic_canvas,
    docs_assets_dir,
    make_page_decorator,
    site_url,
)
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.pagesizes import letter  # noqa: E402
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet  # noqa: E402
from reportlab.lib.units import inch  # noqa: E402
from reportlab.platypus import (  # noqa: E402
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT_PATH = docs_assets_dir() / "cam-reconciliation-statement.pdf"
FOOTER_URL = site_url("/tools/cam-reconciliation-statement")
DOC_TITLE = "CAM Reconciliation Statement"
LAST_UPDATED = "2026-04-27"

INPUT_YELLOW = colors.HexColor("#FFF2CC")
CALC_GRAY = colors.HexColor("#F2F2F2")
SECTION_BLUE = colors.HexColor("#D9E8FF")


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "eyebrow": ParagraphStyle(
            "Eyebrow",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=BRAND_BLUE,
            spaceAfter=4,
        ),
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=NAVY,
            alignment=0,
            spaceAfter=6,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=11,
            leading=14,
            textColor=SLATE,
            spaceAfter=10,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=BRAND_BLUE,
            spaceBefore=12,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=6,
        ),
        "label": ParagraphStyle(
            "Label",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=NAVY,
        ),
        "field": ParagraphStyle(
            "Field",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#374151"),
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=SLATE,
        ),
        "small_bold": ParagraphStyle(
            "SmallBold",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=NAVY,
        ),
        "note": ParagraphStyle(
            "Note",
            parent=base["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            leading=11,
            textColor=SLATE,
            spaceAfter=6,
        ),
    }


def _cover_fields_table(s: dict) -> Table:
    """Two-column label / value grid for the cover page."""
    fields = [
        ("Property Name:", "[PROPERTY NAME]"),
        ("Property Address:", "[STREET, CITY, STATE ZIP]"),
        ("Tenant Name:", "[TENANT LEGAL NAME]"),
        ("Suite / Unit:", "[SUITE #]"),
        ("Lease Commencement:", "[MM/DD/YYYY]"),
        ("Lease Expiration:", "[MM/DD/YYYY]"),
        ("Reconciliation Period:", "[01/01/YYYY – 12/31/YYYY]"),
        ("Statement Date:", "[MM/DD/YYYY]"),
        ("Prepared By:", "[PROPERTY MANAGER NAME]"),
        ("Preparer Contact:", "[EMAIL / PHONE]"),
    ]
    rows = [
        [Paragraph(lbl, s["label"]), Paragraph(val, s["field"])] for lbl, val in fields
    ]
    t = Table(rows, colWidths=[2.1 * inch, 4.6 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BACKGROUND", (0, 0), (0, -1), SECTION_BLUE),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return t


def _cam_pool_table(s: dict) -> Table:
    """CAM pool summary with gross-up and recoverable total."""
    header = [
        "Expense Category",
        "Gross Amount ($)",
        "Excluded Amount ($)",
        "Recoverable ($)",
    ]
    rows_data = [
        ["Janitorial / Cleaning", "", "", ""],
        ["Landscaping / Grounds", "", "", ""],
        ["HVAC Maintenance", "", "", ""],
        ["Utilities — Common Areas", "", "", ""],
        ["Security", "", "", ""],
        ["Property Insurance", "", "", ""],
        ["Management Fee", "", "", ""],
        ["Administrative / Admin Fee", "", "", ""],
        ["Property Taxes (if included)", "", "", ""],
        ["Repairs & Maintenance", "", "", ""],
        ["Other Operating Expenses", "", "", ""],
        ["Subtotal (before gross-up)", "", "", ""],
        ["Gross-Up Adjustment (to ____% occupancy)", "", "N/A", ""],
        ["TOTAL NET RECOVERABLE POOL", "", "", ""],
    ]
    table_rows = [[Paragraph(h, s["small_bold"]) for h in header]]
    for i, row in enumerate(rows_data):
        style = (
            s["small_bold"]
            if row[0].startswith("TOTAL") or row[0].startswith("Subtotal")
            else s["small"]
        )
        table_rows.append([Paragraph(cell, style) for cell in row])

    t = Table(table_rows, colWidths=[2.8 * inch, 1.3 * inch, 1.3 * inch, 1.3 * inch])
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (0, -1), "LEFT"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        # Subtotal / total rows
        ("BACKGROUND", (0, 12), (-1, 12), CALC_GRAY),
        ("BACKGROUND", (0, 13), (-1, 13), CALC_GRAY),
        ("FONTNAME", (0, 12), (-1, 13), "Helvetica-Bold"),
        # Input cells (columns 1-3 for data rows)
        ("BACKGROUND", (1, 1), (3, 11), INPUT_YELLOW),
    ]
    t.setStyle(TableStyle(style_cmds))
    return t


def _allocation_table(s: dict) -> Table:
    header = ["Item", "Value", "Notes"]
    rows = [
        [
            "Tenant Rentable Area (GLA)",
            "__________ sq ft",
            "Per lease or BOMA certificate",
        ],
        ["Total Project / Building GLA", "__________ sq ft", "Denominator — see note"],
        ["Tenant Pro-Rata Share", "__________%", "= Tenant GLA ÷ Project GLA"],
        ["Total Net Recoverable Pool", "$__________", "From CAM Pool Summary"],
        ["Tenant Annual CAM Share", "$__________", "= Pool × Pro-Rata %"],
        ["Monthly Estimate Billed (×12)", "$__________", "Prior-year monthly × 12"],
        ["True-Up Balance", "$__________", "Annual Share minus Estimates"],
        ["", "", ""],
        ["AMOUNT DUE (if positive)", "$__________", "Balance due within [__] days"],
        [
            "CREDIT TO TENANT (if negative)",
            "$__________",
            "Credit applied to next period",
        ],
    ]
    table_rows = [[Paragraph(h, s["small_bold"]) for h in header]]
    for row in rows:
        bold = row[0].startswith("AMOUNT") or row[0].startswith("CREDIT")
        ps = s["small_bold"] if bold else s["small"]
        table_rows.append([Paragraph(c, ps) for c in row])
    t = Table(table_rows, colWidths=[2.5 * inch, 1.7 * inch, 2.5 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("BACKGROUND", (1, 1), (1, -1), INPUT_YELLOW),
                ("BACKGROUND", (0, 9), (-1, 10), CALC_GRAY),
                ("FONTNAME", (0, 9), (-1, 10), "Helvetica-Bold"),
            ]
        )
    )
    return t


def _supporting_schedule_table(s: dict) -> Table:
    header = [
        "Date",
        "Vendor",
        "Description",
        "Gross Amount ($)",
        "Excluded ($)",
        "Recoverable ($)",
    ]
    placeholder_rows = [[""] * 6 for _ in range(12)]
    placeholder_rows.append(["", "", "TOTAL", "", "", ""])
    table_rows = [[Paragraph(h, s["small_bold"]) for h in header]]
    for row in placeholder_rows:
        bold = row[2] == "TOTAL"
        ps = s["small_bold"] if bold else s["small"]
        table_rows.append([Paragraph(c, ps) for c in row])
    t = Table(
        table_rows,
        colWidths=[
            0.7 * inch,
            1.3 * inch,
            1.7 * inch,
            1.0 * inch,
            0.9 * inch,
            1.1 * inch,
        ],
    )
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, LIGHT_GRAY]),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("BACKGROUND", (0, -1), (-1, -1), CALC_GRAY),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ]
        )
    )
    return t


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=letter,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.85 * inch,
        title=DOC_TITLE,
        author="CapVeri",
    )
    s = _styles()

    story: list = []

    # ── Cover page ────────────────────────────────────────────────────────────
    story += [
        Paragraph("CAPVERI TEMPLATE", s["eyebrow"]),
        Paragraph(DOC_TITLE, s["title"]),
        Paragraph(
            "Year-End Common Area Maintenance Reconciliation Statement",
            s["subtitle"],
        ),
        HRFlowable(width="100%", thickness=1, color=BRAND_BLUE, spaceAfter=10),
        Paragraph("Statement Details", s["section"]),
        _cover_fields_table(s),
        Spacer(1, 14),
        Table(
            [
                [
                    Paragraph(
                        "<b>Template type</b><br/>Generic (non-state-specific)",
                        s["small"],
                    ),
                    Paragraph(
                        "<b>Audience</b><br/>Property managers → tenants", s["small"]
                    ),
                    Paragraph(f"<b>Last updated</b><br/>{LAST_UPDATED}", s["small"]),
                ]
            ],
            colWidths=[2.0 * inch, 2.5 * inch, 2.2 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), LIGHT_GRAY),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.white),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("PADDING", (0, 0), (-1, -1), 9),
                ]
            ),
        ),
        PageBreak(),
    ]

    # ── CAM Pool Summary ──────────────────────────────────────────────────────
    story += [
        Paragraph("Section 1 — CAM Pool Summary", s["section"]),
        Paragraph(
            "List all operating expenses incurred during the reconciliation period. "
            "Enter the gross amount as booked, the excluded amount (per lease), and "
            "the resulting recoverable amount. Apply gross-up before calculating the "
            "recoverable pool if occupancy was below the lease threshold.",
            s["body"],
        ),
        _cam_pool_table(s),
        Spacer(1, 8),
        Paragraph(
            "<b>Gross-Up Note:</b> Occupancy during the reconciliation period: ______%. "
            "Lease gross-up threshold: ______%. If actual occupancy is below the threshold, "
            "variable expenses are normalized to the threshold percentage before pro-rata "
            "allocation. Only variable expenses (janitorial, landscaping, utilities, HVAC) "
            "are subject to gross-up; fixed expenses (insurance, taxes, management fee) are "
            "excluded from the gross-up calculation.",
            s["note"],
        ),
        Paragraph(
            "<b>Exclusions Memo:</b> The following categories were excluded from the "
            "recoverable pool per the lease: [list exclusions — e.g., capital improvements, "
            "leasing commissions, depreciation, owner overhead, marketing, ground rent, "
            "debt service, income taxes, costs of repairs caused by landlord negligence].",
            s["note"],
        ),
        PageBreak(),
    ]

    # ── Tenant Allocation ─────────────────────────────────────────────────────
    story += [
        Paragraph("Section 2 — Tenant Allocation", s["section"]),
        Paragraph(
            "Calculate the tenant's pro-rata share of the net recoverable pool. "
            "Confirm the denominator reflects the rentable area in effect during the "
            "reconciliation period per the lease and current rent roll.",
            s["body"],
        ),
        _allocation_table(s),
        Spacer(1, 8),
        Paragraph(
            "<b>Denominator Note:</b> The project GLA denominator used above is [DESCRIBE: "
            "total project GLA / occupied GLA / lease-defined denominator]. If the denominator "
            "changed during the reconciliation period (e.g., new tenant commencing mid-year), "
            "a weighted-average denominator was applied. See Exhibit A for denominator detail.",
            s["note"],
        ),
        PageBreak(),
    ]

    # ── Supporting Schedule ───────────────────────────────────────────────────
    story += [
        Paragraph("Section 3 — Supporting Expense Schedule", s["section"]),
        Paragraph(
            "This schedule itemizes individual expenses included in the CAM pool. "
            "Each line ties to the general ledger. Excluded amounts are noted per the "
            "applicable lease provision.",
            s["body"],
        ),
        _supporting_schedule_table(s),
        Spacer(1, 8),
        Paragraph(
            "Attach additional pages if necessary. Vendor invoices, GL detail, and "
            "management fee calculation are available upon written request within the "
            "audit window specified in your lease.",
            s["note"],
        ),
        PageBreak(),
    ]

    # ── Certification ─────────────────────────────────────────────────────────
    story += [
        Paragraph("Section 4 — Certification", s["section"]),
        Paragraph(
            "The undersigned property manager or authorized representative of the landlord "
            "certifies that the CAM reconciliation statement set forth herein has been "
            "prepared in accordance with the terms and conditions of the lease agreement "
            "identified above and that the information contained herein is accurate and "
            "complete to the best of their knowledge and belief.",
            s["body"],
        ),
        Spacer(1, 20),
        Table(
            [
                [
                    Paragraph("Authorized Signature:", s["label"]),
                    Paragraph("_" * 40, s["field"]),
                ],
                [
                    Paragraph("Printed Name:", s["label"]),
                    Paragraph("_" * 40, s["field"]),
                ],
                [
                    Paragraph("Title:", s["label"]),
                    Paragraph("_" * 40, s["field"]),
                ],
                [
                    Paragraph("Company:", s["label"]),
                    Paragraph("_" * 40, s["field"]),
                ],
                [
                    Paragraph("Date:", s["label"]),
                    Paragraph("_" * 20, s["field"]),
                ],
            ],
            colWidths=[1.8 * inch, 4.9 * inch],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                    ("TOPPADDING", (0, 0), (-1, -1), 12),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ]
            ),
        ),
        Spacer(1, 24),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#CBD5E1")),
        Spacer(1, 8),
        Paragraph(
            "<b>Tenant Audit Rights:</b> Pursuant to Section [__] of the lease, tenant has "
            "[__] days from receipt of this statement to request an audit of the CAM "
            "reconciliation. All requests must be submitted in writing to the address above. "
            "Supporting documentation will be made available within [__] business days of "
            "receipt of a written audit request.",
            s["note"],
        ),
        Spacer(1, 10),
        Paragraph(
            "<b>Automate this process:</b> CapVeri generates audit-ready CAM reconciliation "
            "statements directly from your GL export — no manual entry. "
            f"Start a free portfolio audit at {app_url('/register')}.",
            s["small"],
        ),
    ]

    decorator = make_page_decorator(FOOTER_URL, DOC_TITLE, LAST_UPDATED)
    doc.build(
        story,
        onFirstPage=decorator,
        onLaterPages=decorator,
        canvasmaker=deterministic_canvas,
    )
    print(f"Generated: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
