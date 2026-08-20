"""Generate the Tenant CAM Reconciliation Cover Letter PDF.

Output: ``docs/assets/tenant-cam-reconciliation-letter.pdf``

A 2-3 page document for TENANTS (not landlords) who have received a CAM
reconciliation statement and need to: acknowledge receipt, identify items
under review, declare payment intention, and use a 10-item checklist to
verify the statement.
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

OUTPUT_PATH = docs_assets_dir() / "tenant-cam-reconciliation-letter.pdf"
FOOTER_URL = site_url("/resources/tenant-cam-reconciliation-letter")
DOC_TITLE = "Tenant CAM Reconciliation Letter"
LAST_UPDATED = "2026-04-27"

CHECKBOX = "☐"
SECTION_BLUE = colors.HexColor("#D9E8FF")
INPUT_YELLOW = colors.HexColor("#FFF2CC")


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
        "section": ParagraphStyle(
            "Section",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=BRAND_BLUE,
            spaceBefore=12,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13.5,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=8,
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
        "item_title": ParagraphStyle(
            "ItemTitle",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9.5,
            leading=12,
            textColor=NAVY,
            spaceAfter=2,
        ),
        "item_body": ParagraphStyle(
            "ItemBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#1F2937"),
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8,
            leading=10,
            textColor=SLATE,
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


def _header_fields_table(s: dict) -> Table:
    fields = [
        ("Tenant Company:", "[TENANT COMPANY NAME]"),
        ("Tenant Address:", "[TENANT MAILING ADDRESS]"),
        ("", ""),
        ("Property Address:", "[PROPERTY ADDRESS]"),
        ("Suite / Unit:", "[SUITE #]"),
        ("Reconciliation Year:", "[YYYY]"),
        ("Statement Receipt Date:", "[MM/DD/YYYY]"),
        ("Balance Due / (Credit):", "$ [AMOUNT]  — see statement"),
    ]
    rows = [
        [Paragraph(lbl, s["label"]), Paragraph(val, s["field"])] for lbl, val in fields
    ]
    t = Table(rows, colWidths=[2.1 * inch, 4.6 * inch])
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


def _review_items_table(s: dict) -> Table:
    header = ["#", "Expense Category Under Review", "Specific Concern / Question"]
    rows = [[str(i), "", ""] for i in range(1, 7)]
    table_rows = [[Paragraph(h, s["label"]) for h in header]]
    for row in rows:
        table_rows.append([Paragraph(c, s["item_body"]) for c in row])
    t = Table(table_rows, colWidths=[0.3 * inch, 2.8 * inch, 3.6 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("BACKGROUND", (0, 1), (-1, -1), INPUT_YELLOW),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return t


def _checklist_item(title: str, detail: str, s: dict) -> KeepTogether:
    return KeepTogether(
        [
            Table(
                [
                    [
                        Paragraph(
                            f'<font size="12">{CHECKBOX}</font>', s["item_title"]
                        ),
                        Paragraph(title, s["item_title"]),
                    ]
                ],
                colWidths=[0.28 * inch, 6.4 * inch],
                style=TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                        ("TOPPADDING", (0, 0), (-1, -1), 0),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                    ]
                ),
            ),
            Paragraph(detail, s["item_body"]),
            Spacer(1, 6),
        ]
    )


CHECKLIST_ITEMS = [
    (
        "Does the statement match your lease's CAM definition?",
        "Compare the expense categories on the statement to the 'Operating Expenses' or "
        "'CAM' definition in your lease. Any category not listed or not explicitly permitted "
        "should be flagged.",
    ),
    (
        "Is the pro-rata denominator correct?",
        "Confirm the total project GLA (denominator) matches what your lease specifies — "
        "some leases use a fixed denominator, others use the occupied or leasable area. "
        "A higher denominator lowers your share; a lower one raises it.",
    ),
    (
        "Were all required exclusions applied?",
        "Your lease likely excludes capital improvements, leasing commissions, depreciation, "
        "owner overhead, debt service, and income taxes. Verify each exclusion category "
        "appears in the statement's exclusion memo.",
    ),
    (
        "Was gross-up applied only to variable expenses?",
        "Gross-up normalizes costs when the building is under-occupied. It should only apply "
        "to variable expenses (janitorial, landscaping, utilities, HVAC) — never to fixed "
        "costs like insurance, taxes, or the management fee.",
    ),
    (
        "Is the base year amount correct (if your lease has one)?",
        "Base year leases recover only the EXCESS over the base year amount. Verify the base "
        "year figure used matches your original lease and any amendments.",
    ),
    (
        "Are capital items excluded or properly amortized?",
        "One-time capital expenditures should either be excluded or amortized over the "
        "asset's useful life. Lump-sum recovery of a capital item in a single year is "
        "typically impermissible under standard lease language.",
    ),
    (
        "Is the admin / administrative fee within the lease limit?",
        "Many leases cap the administrative fee at a stated percentage (e.g., 15% of "
        "recoverable operating expenses, or a fixed dollar amount). Verify the fee on the "
        "statement does not exceed your lease cap.",
    ),
    (
        "Are management fees within the lease limit?",
        "Management fees are commonly capped at 3-5% of recoverable operating expenses and "
        "are often prohibited from being applied to property taxes, insurance, or utilities. "
        "Check both the rate and the fee base.",
    ),
    (
        "Is your audit window still open?",
        "Your lease specifies a window (typically 90-180 days from statement receipt) during "
        "which you can request a formal audit. Confirm the window is still open before "
        "signing or paying without reservation.",
    ),
    (
        "Are prior-year statements available for trend comparison?",
        "Year-over-year expense increases of more than 10-15% in a single category often "
        "indicate a coding change, a new expense type, or a math error. Request prior-year "
        "statements and compare line-by-line.",
    ),
]


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
        Paragraph("CAPVERI TENANT TEMPLATE", s["eyebrow"]),
        Paragraph(DOC_TITLE, s["title"]),
        Paragraph(
            "Use this letter to formally acknowledge receipt of a CAM reconciliation "
            "statement, identify items under review, declare your payment intention, and "
            "document any backup documentation requested from the landlord.",
            s["body"],
        ),
        HRFlowable(width="100%", thickness=1, color=BRAND_BLUE, spaceAfter=10),
        _header_fields_table(s),
        Spacer(1, 14),
    ]

    # Opening paragraph
    story += [
        Paragraph(
            "[DATE]",
            s["body"],
        ),
        Spacer(1, 4),
        Paragraph(
            "[PROPERTY MANAGER NAME / LANDLORD REPRESENTATIVE]<br/>"
            "[COMPANY NAME]<br/>"
            "[ADDRESS]",
            s["body"],
        ),
        Spacer(1, 8),
        Paragraph(
            "Re: CAM Reconciliation Statement — [PROPERTY ADDRESS], Suite [SUITE #], "
            "Reconciliation Year [YYYY]",
            s["body"],
        ),
        Spacer(1, 8),
        Paragraph(
            "Dear [PROPERTY MANAGER NAME],",
            s["body"],
        ),
        Paragraph(
            "We write to acknowledge receipt of your CAM reconciliation statement for the "
            "above-referenced premises for the reconciliation period ending December 31, [YYYY], "
            "received on [STATEMENT RECEIPT DATE]. We have reviewed the statement and provide "
            "the following response pursuant to Section [__] of our lease dated [LEASE DATE].",
            s["body"],
        ),
    ]

    # Line items under review
    story += [
        Paragraph("Items Under Review", s["section"]),
        Paragraph(
            "The following expense categories and/or calculations are under review. "
            "We are not disputing the full statement at this time but reserve all rights "
            "pending our review of the items below.",
            s["body"],
        ),
        _review_items_table(s),
        Spacer(1, 10),
    ]

    # Payment intention
    story += [
        Paragraph("Payment Intention", s["section"]),
        Paragraph(
            "Please indicate your payment intention by checking the applicable box:",
            s["body"],
        ),
        Table(
            [
                [
                    Paragraph(CHECKBOX, s["item_title"]),
                    Paragraph(
                        "<b>Paying in full.</b> We will remit the balance due of "
                        "$[AMOUNT] on or before [DATE] per the payment terms in our lease.",
                        s["item_body"],
                    ),
                ],
                [
                    Paragraph(CHECKBOX, s["item_title"]),
                    Paragraph(
                        "<b>Paying under protest / requesting audit.</b> We dispute "
                        "the statement and are requesting a formal audit pursuant to "
                        "Section [__] of our lease. We will remit the undisputed "
                        "portion of $[UNDISPUTED AMOUNT] by [DATE] and submit a formal "
                        "audit demand letter within [X] days.",
                        s["item_body"],
                    ),
                ],
            ],
            colWidths=[0.35 * inch, 6.35 * inch],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (0, -1), 0),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            ),
        ),
        Spacer(1, 10),
    ]

    # Documents requested
    story += [
        Paragraph("Documentation Requested", s["section"]),
        Paragraph(
            "Pursuant to the audit-rights clause in our lease, we request copies of the "
            "following supporting documents within [__] business days:",
            s["body"],
        ),
        Table(
            [
                [
                    Paragraph(CHECKBOX, s["item_body"]),
                    Paragraph(
                        "General ledger for recoverable expense accounts, full reconciliation year",
                        s["item_body"],
                    ),
                ],
                [
                    Paragraph(CHECKBOX, s["item_body"]),
                    Paragraph(
                        "Vendor invoices for all expenses over $[THRESHOLD]",
                        s["item_body"],
                    ),
                ],
                [
                    Paragraph(CHECKBOX, s["item_body"]),
                    Paragraph(
                        "Management fee calculation and base used", s["item_body"]
                    ),
                ],
                [
                    Paragraph(CHECKBOX, s["item_body"]),
                    Paragraph(
                        "Gross-up calculation worksheet and occupancy report",
                        s["item_body"],
                    ),
                ],
                [
                    Paragraph(CHECKBOX, s["item_body"]),
                    Paragraph(
                        "CAP calculation worksheet (if applicable)", s["item_body"]
                    ),
                ],
                [
                    Paragraph(CHECKBOX, s["item_body"]),
                    Paragraph(
                        "Pro-rata denominator detail (rent roll / SF schedule)",
                        s["item_body"],
                    ),
                ],
                [
                    Paragraph(CHECKBOX, s["item_body"]),
                    Paragraph(
                        "Exclusion detail (list of excluded items and dollar amounts)",
                        s["item_body"],
                    ),
                ],
                [
                    Paragraph(CHECKBOX, s["item_body"]),
                    Paragraph(
                        "Prior-year CAM reconciliation statements for comparison",
                        s["item_body"],
                    ),
                ],
            ],
            colWidths=[0.28 * inch, 6.42 * inch],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                    ("TOPPADDING", (0, 0), (-1, -1), 3),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ]
            ),
        ),
        Spacer(1, 14),
    ]

    # Signature block
    story += [
        Paragraph(
            "Please direct any questions or the requested documentation to the contact below. "
            "We look forward to your prompt response.",
            s["body"],
        ),
        Spacer(1, 8),
        Paragraph("Sincerely,", s["body"]),
        Spacer(1, 30),
        Table(
            [
                [Paragraph("Signature:", s["label"]), Paragraph("_" * 38, s["field"])],
                [
                    Paragraph("Printed Name:", s["label"]),
                    Paragraph("_" * 38, s["field"]),
                ],
                [Paragraph("Title:", s["label"]), Paragraph("_" * 38, s["field"])],
                [Paragraph("Company:", s["label"]), Paragraph("_" * 38, s["field"])],
                [
                    Paragraph("Phone / Email:", s["label"]),
                    Paragraph("_" * 38, s["field"]),
                ],
                [Paragraph("Date:", s["label"]), Paragraph("_" * 20, s["field"])],
            ],
            colWidths=[1.5 * inch, 5.2 * inch],
            style=TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
                    ("TOPPADDING", (0, 0), (-1, -1), 10),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ]
            ),
        ),
        PageBreak(),
    ]

    # ── Page 2 — 10-Item Tenant Checklist ─────────────────────────────────────
    story += [
        Paragraph("CAPVERI TENANT RESOURCE", s["eyebrow"]),
        Paragraph("CAM Reconciliation Checklist for Tenants", s["title"]),
        Paragraph(
            "Use this checklist whenever you receive a year-end CAM reconciliation statement "
            "from your landlord. Work through each item before deciding whether to pay, "
            "pay under protest, or request a formal audit.",
            s["body"],
        ),
        Table(
            [
                [
                    Paragraph(
                        "<b>Audience</b><br/>Tenants reviewing a received statement",
                        s["small"],
                    ),
                    Paragraph(
                        "<b>Timing</b><br/>Within 30 days of receipt", s["small"]
                    ),
                    Paragraph(f"<b>Last updated</b><br/>{LAST_UPDATED}", s["small"]),
                ]
            ],
            colWidths=[2.4 * inch, 2.2 * inch, 2.1 * inch],
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
        Spacer(1, 12),
    ]

    for i, (title, detail) in enumerate(CHECKLIST_ITEMS, start=1):
        story.append(_checklist_item(f"{i}. {title}", detail, s))

    story += [
        Spacer(1, 10),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#CBD5E1")),
        Spacer(1, 6),
        Paragraph(
            "<b>Need help auditing your CAM statement?</b> CapVeri's tenant-side audit tools "
            "let you verify every line item against your lease automatically. "
            f"Learn more at {site_url('/resources/tenant-cam-reconciliation-letter')}.",
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
