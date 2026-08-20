"""Generate the CAM Estimate / Budget Letter PDF.

Output: ``docs/assets/cam-estimate-letter.pdf``

A 2-3 page forward-looking CAM estimate letter for property managers sending
the annual CAM budget letter to tenants at the start of each lease year.
This is NOT a reconciliation — it is the estimate of upcoming CAM charges.
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
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT_PATH = docs_assets_dir() / "cam-estimate-letter.pdf"
FOOTER_URL = site_url("/tools/cam-estimate-letter")
DOC_TITLE = "CAM Estimate / Budget Letter"
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
            fontSize=20,
            leading=24,
            textColor=NAVY,
            alignment=0,
            spaceAfter=6,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=BRAND_BLUE,
            spaceBefore=10,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13.5,
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
            spaceAfter=4,
        ),
    }


def _header_fields(s: dict) -> Table:
    fields = [
        ("Property Name:", "[PROPERTY NAME]"),
        ("Property Address:", "[STREET, CITY, STATE ZIP]"),
        ("Tenant Name:", "[TENANT LEGAL NAME]"),
        ("Suite / Unit:", "[SUITE #]"),
        ("Lease Date:", "[MM/DD/YYYY]"),
        ("Estimate Year:", "[YYYY]"),
        ("Effective Date of New Monthly Estimate:", "[MM/DD/YYYY]"),
        ("Prepared By:", "[PROPERTY MANAGER NAME]"),
        ("Preparer Contact:", "[EMAIL / PHONE]"),
    ]
    rows = [[Paragraph(lbl, s["label"]), Paragraph(v, s["field"])] for lbl, v in fields]
    t = Table(rows, colWidths=[2.4 * inch, 4.3 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), SECTION_BLUE),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return t


def _estimate_table(s: dict) -> Table:
    header = [
        "Expense Category",
        "Prior Year Actual ($)",
        "Budget Year Estimate ($)",
        "% Change",
        "Notes",
    ]
    rows = [
        ["Janitorial / Cleaning", "", "", "", ""],
        ["Landscaping / Grounds", "", "", "", ""],
        ["HVAC Maintenance", "", "", "", ""],
        ["Utilities — Common Areas", "", "", "", ""],
        ["Security", "", "", "", ""],
        ["Property Insurance", "", "", "", ""],
        ["Management Fee", "", "", "", ""],
        ["Administrative Fee", "", "", "", ""],
        ["Property Taxes (if included)", "", "", "", ""],
        ["Repairs & Maintenance", "", "", "", ""],
        ["Other Operating Expenses", "", "", "", ""],
        ["TOTAL ESTIMATED CAM POOL", "", "", "", ""],
        ["Tenant Pro-Rata Share (%)", "", "N/A", "", ""],
        ["ESTIMATED TENANT ANNUAL SHARE", "", "", "", ""],
        ["NEW MONTHLY ESTIMATE (÷ 12)", "", "", "", "Effective [DATE]"],
    ]
    table_rows = [[Paragraph(h, s["small_bold"]) for h in header]]
    for row in rows:
        bold = (
            row[0].startswith("TOTAL")
            or row[0].startswith("NEW ")
            or row[0].startswith("ESTIMATED TENANT")
        )
        ps = s["small_bold"] if bold else s["small"]
        table_rows.append([Paragraph(c, ps) for c in row])
    t = Table(
        table_rows,
        colWidths=[2.2 * inch, 1.1 * inch, 1.3 * inch, 0.65 * inch, 1.45 * inch],
    )
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("ALIGN", (1, 0), (3, -1), "RIGHT"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        # Input columns for data rows
        ("BACKGROUND", (1, 1), (4, -4), INPUT_YELLOW),
        # Calculated/total rows
        ("BACKGROUND", (0, 12), (-1, 12), CALC_GRAY),
        ("BACKGROUND", (0, 13), (-1, 13), CALC_GRAY),
        ("BACKGROUND", (0, 14), (-1, 14), CALC_GRAY),
        ("BACKGROUND", (0, 15), (-1, 15), CALC_GRAY),
        ("FONTNAME", (0, 12), (-1, 15), "Helvetica-Bold"),
    ]
    t.setStyle(TableStyle(style_cmds))
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

    # ── Page 1 — Cover Letter ─────────────────────────────────────────────────
    story += [
        Paragraph("CAPVERI TEMPLATE", s["eyebrow"]),
        Paragraph(DOC_TITLE, s["title"]),
        Paragraph(
            "Annual CAM Budget Letter — Forward-Looking Estimate (Not a Reconciliation)",
            s["body"],
        ),
        HRFlowable(width="100%", thickness=1, color=BRAND_BLUE, spaceAfter=10),
        Paragraph("Letter Details", s["section"]),
        _header_fields(s),
        Spacer(1, 12),
    ]

    # Letter body
    story += [
        Paragraph("[DATE]", s["body"]),
        Spacer(1, 4),
        Paragraph(
            "[TENANT LEGAL NAME]<br/>[TENANT MAILING ADDRESS]",
            s["body"],
        ),
        Spacer(1, 8),
        Paragraph(
            "Re: CAM Estimate for [ESTIMATE YEAR] — [PROPERTY NAME], Suite [SUITE #]",
            s["body"],
        ),
        Spacer(1, 6),
        Paragraph("Dear [TENANT CONTACT NAME],", s["body"]),
        Paragraph(
            "Pursuant to Section [__] of your lease dated [LEASE DATE], please find "
            "enclosed our estimated Common Area Maintenance (CAM) charges for the lease "
            'year commencing [EFFECTIVE DATE] ("Estimate Year [YYYY]"). These estimates '
            "are based on our projected operating budget for [PROPERTY NAME] and reflect "
            "current vendor contracts, insurance renewals, utility projections, and "
            "anticipated maintenance requirements.",
            s["body"],
        ),
        Paragraph(
            "This letter is an estimate only and does not constitute a final reconciliation. "
            "At the conclusion of the estimate year, we will send a year-end CAM reconciliation "
            "statement comparing actual expenses to estimated expenses billed. Any resulting "
            "true-up balance will be addressed at that time per the terms of your lease.",
            s["body"],
        ),
    ]

    # Change notice
    story += [
        Paragraph("Change Notice", s["section"]),
        Paragraph(
            "Your new monthly CAM estimate effective [EFFECTIVE DATE] is $[NEW MONTHLY AMOUNT], "
            "compared to $[PRIOR MONTHLY AMOUNT] in the prior estimate year. Key drivers of the "
            "change include:",
            s["body"],
        ),
        Table(
            [
                [
                    Paragraph("Expense Driver", s["small_bold"]),
                    Paragraph("Direction", s["small_bold"]),
                    Paragraph("Explanation", s["small_bold"]),
                ],
                [
                    Paragraph("Insurance Premium", s["small"]),
                    Paragraph("Increase", s["small"]),
                    Paragraph(
                        "Property insurance premium increased [X]% at renewal due to [market conditions / "
                        "increased replacement cost valuations / claims history].",
                        s["small"],
                    ),
                ],
                [
                    Paragraph("Landscaping Contract", s["small"]),
                    Paragraph("Decrease", s["small"]),
                    Paragraph(
                        "Landscaping contract was rebid at lower cost; new vendor commences [DATE].",
                        s["small"],
                    ),
                ],
                [
                    Paragraph("Utilities", s["small"]),
                    Paragraph("Increase", s["small"]),
                    Paragraph(
                        "Utility rates increased [X]% effective [DATE] per [UTILITY PROVIDER] tariff schedule.",
                        s["small"],
                    ),
                ],
                [
                    Paragraph("[ADD ADDITIONAL DRIVERS AS NEEDED]", s["small"]),
                    Paragraph("", s["small"]),
                    Paragraph("", s["small"]),
                ],
            ],
            colWidths=[1.8 * inch, 0.8 * inch, 4.1 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ]
            ),
        ),
        Spacer(1, 10),
        Paragraph(
            "If you have questions regarding this estimate or the underlying budget, please "
            "contact us at the information below. We are happy to discuss any line item in detail.",
            s["body"],
        ),
        Spacer(1, 8),
        Paragraph("Sincerely,", s["body"]),
        Spacer(1, 28),
        Table(
            [
                [Paragraph("Signature:", s["label"]), Paragraph("_" * 38, s["field"])],
                [
                    Paragraph("Printed Name:", s["label"]),
                    Paragraph("_" * 38, s["field"]),
                ],
                [Paragraph("Title:", s["label"]), Paragraph("_" * 38, s["field"])],
                [Paragraph("Company:", s["label"]), Paragraph("_" * 38, s["field"])],
                [Paragraph("Phone:", s["label"]), Paragraph("_" * 30, s["field"])],
                [Paragraph("Email:", s["label"]), Paragraph("_" * 30, s["field"])],
                [Paragraph("Date:", s["label"]), Paragraph("_" * 20, s["field"])],
            ],
            colWidths=[1.5 * inch, 5.2 * inch],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                    ("TOPPADDING", (0, 0), (-1, -1), 9),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ]
            ),
        ),
        PageBreak(),
    ]

    # ── Page 2 — CAM Estimate Table ───────────────────────────────────────────
    story += [
        Paragraph("CAPVERI TEMPLATE", s["eyebrow"]),
        Paragraph("Exhibit A — CAM Budget Estimate Detail", s["title"]),
        Paragraph(
            f"{DOC_TITLE}  |  [PROPERTY NAME]  |  Suite [SUITE #]  |  Estimate Year [YYYY]",
            s["body"],
        ),
        HRFlowable(width="100%", thickness=1, color=BRAND_BLUE, spaceAfter=8),
        _estimate_table(s),
        Spacer(1, 10),
        Paragraph(
            "<b>Pro-Rata Share Note:</b> Tenant's pro-rata share is calculated as "
            "[TENANT GLA] sq ft ÷ [PROJECT GLA] sq ft = [X]%. The denominator reflects "
            "the total rentable area of [PROPERTY NAME] as of [DATE].",
            s["note"],
        ),
        Paragraph(
            "<b>Estimate Methodology:</b> Budget estimates are based on prior-year actual "
            "expenses adjusted for known contract changes, insurance renewal premiums, "
            "CPI escalation on applicable contracts, and anticipated maintenance requirements. "
            "These estimates are not a guarantee of actual expenses for the estimate year.",
            s["note"],
        ),
        Spacer(1, 12),
    ]

    # Tenant acknowledgment
    story += [
        Paragraph("Tenant Acknowledgment of Receipt", s["section"]),
        Paragraph(
            "Tenant's signature below confirms receipt of this CAM estimate letter and the "
            "new monthly CAM estimate of $[NEW MONTHLY AMOUNT] effective [EFFECTIVE DATE]. "
            "Signature does not constitute agreement with the estimate or waiver of any "
            "rights under the lease.",
            s["body"],
        ),
        Spacer(1, 10),
        Table(
            [
                [
                    Paragraph("Tenant Signature:", s["label"]),
                    Paragraph("_" * 40, s["field"]),
                ],
                [
                    Paragraph("Printed Name:", s["label"]),
                    Paragraph("_" * 40, s["field"]),
                ],
                [Paragraph("Title:", s["label"]), Paragraph("_" * 40, s["field"])],
                [
                    Paragraph("Date Received:", s["label"]),
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
        Spacer(1, 18),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#CBD5E1")),
        Spacer(1, 6),
        Paragraph(
            "<b>Questions or disputes?</b> Contact [PROPERTY MANAGER NAME] at "
            "[PHONE] or [EMAIL]. Disputes regarding the estimate methodology must be "
            "submitted in writing within [__] days of receipt per Section [__] of your lease.",
            s["note"],
        ),
        Paragraph(
            "<b>Automate your CAM budget letters:</b> CapVeri generates estimate letters "
            "for your full tenant roster directly from your operating budget — no manual "
            f"data entry. Start at {app_url('/register')}.",
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
