"""Generate the CAM Dispute Response Letter Template PDF.

Output: ``docs/assets/cam-dispute-response-template.pdf``

A 3-4 page template for PROPERTY MANAGERS (landlord side) responding to a
tenant's CAM dispute letter. Includes a point-by-point response table,
documents-enclosed list, proposed resolution options, and a standard
response language library.
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

OUTPUT_PATH = docs_assets_dir() / "cam-dispute-response-template.pdf"
FOOTER_URL = site_url("/resources/cam-dispute-response-template")
DOC_TITLE = "CAM Dispute Response Letter Template"
LAST_UPDATED = "2026-04-27"

CHECKBOX = "☐"
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
        "response_body": ParagraphStyle(
            "ResponseBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#1F2937"),
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
        "lib_heading": ParagraphStyle(
            "LibHeading",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            textColor=BRAND_BLUE,
            spaceBefore=8,
            spaceAfter=3,
        ),
        "lib_body": ParagraphStyle(
            "LibBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#374151"),
            spaceAfter=6,
        ),
    }


def _header_fields(s: dict) -> Table:
    fields = [
        ("To (Tenant Company):", "[TENANT COMPANY NAME]"),
        ("Attention:", "[TENANT CONTACT NAME / TITLE]"),
        ("Property:", "[PROPERTY NAME & ADDRESS]"),
        ("Suite / Unit:", "[SUITE #]"),
        ("Dispute Letter Date:", "[MM/DD/YYYY]"),
        ("Disputed Amount:", "$[AMOUNT]"),
        ("Response Date:", "[MM/DD/YYYY]"),
        ("Prepared By:", "[PROPERTY MANAGER NAME]"),
    ]
    rows = [[Paragraph(lbl, s["label"]), Paragraph(v, s["field"])] for lbl, v in fields]
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


def _response_table(s: dict) -> Table:
    header = [
        "#",
        "Tenant's Concern",
        "Property Manager's Response",
        "Supporting Document",
    ]
    rows = [
        (
            "1",
            "Pro-rata denominator is incorrect — tenant claims denominator is overstated.",
            "The denominator used is [X sq ft], reflecting the total rentable area per "
            "the current rent roll and BOMA measurement letter dated [DATE]. This is "
            "consistent with the lease definition in Section [__], which defines the "
            "denominator as [QUOTE RELEVANT LEASE LANGUAGE].",
            "Exhibit A: Rent Roll; Exhibit B: BOMA SF Certificate",
        ),
        (
            "2",
            "Capital expense included in CAM pool — tenant asserts [ITEM] is capital.",
            "The expense identified ([DESCRIPTION], $[AMOUNT]) was coded as a repair and "
            "maintenance item per [LEASE SECTION]. It does not extend the useful life of the "
            "asset and does not meet the capitalization threshold of $[THRESHOLD] set by our "
            "accounting policy. The expense is recoverable under [LEASE CLAUSE].",
            "Exhibit C: Vendor Invoice; Exhibit D: Accounting Policy; GL Detail",
        ),
        (
            "3",
            "Management fee exceeds lease cap.",
            "The management fee of $[AMOUNT] represents [X]% of recoverable operating "
            "expenses of $[BASE AMOUNT], consistent with the [X]% cap in Section [__] of "
            "the lease. The fee was not applied to property taxes, insurance, or utilities, "
            "which are excluded from the fee base per Section [__].",
            "Exhibit E: Management Fee Calculation Worksheet",
        ),
        (
            "4",
            "Gross-up was applied incorrectly — tenant claims gross-up inflated pool.",
            "Gross-up was applied to variable expenses only (janitorial, landscaping, "
            "HVAC, and utilities), consistent with Section [__] of the lease and standard "
            "practice. Fixed expenses (insurance, taxes, management fee) were excluded from "
            "the gross-up calculation. Occupancy during the reconciliation year was [X]%, "
            "below the [Y]% threshold in the lease.",
            "Exhibit F: Gross-Up Calculation Worksheet; Exhibit G: Occupancy Report",
        ),
    ]
    table_rows = [[Paragraph(h, s["small_bold"]) for h in header]]
    for row in rows:
        table_rows.append([Paragraph(c, s["response_body"]) for c in row])
    t = Table(
        table_rows,
        colWidths=[0.25 * inch, 1.5 * inch, 3.1 * inch, 1.85 * inch],
    )
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ]
        )
    )
    return t


def _docs_enclosed_table(s: dict) -> Table:
    docs = [
        (CHECKBOX, "Exhibit A — General Ledger Excerpt (recoverable expense accounts)"),
        (CHECKBOX, "Exhibit B — Vendor Invoices (all items over $[THRESHOLD])"),
        (CHECKBOX, "Exhibit C — Tenant Allocation Schedule (pro-rata detail)"),
        (CHECKBOX, "Exhibit D — Gross-Up Calculation Worksheet"),
        (CHECKBOX, "Exhibit E — CAP Calculation Worksheet (if applicable)"),
        (CHECKBOX, "Exhibit F — Management Fee Calculation"),
        (CHECKBOX, "Exhibit G — BOMA / SF Certificate / Rent Roll"),
        (CHECKBOX, "Exhibit H — Prior-Year Reconciliation (for comparison)"),
    ]
    rows = [
        [Paragraph(c, s["response_body"]), Paragraph(d, s["response_body"])]
        for c, d in docs
    ]
    t = Table(rows, colWidths=[0.28 * inch, 6.42 * inch])
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("LEFTPADDING", (0, 0), (0, -1), 0),
            ]
        )
    )
    return t


def _resolution_table(s: dict) -> Table:
    options = [
        (
            CHECKBOX,
            "No change warranted. The CAM reconciliation is accurate per supporting documentation. "
            "Full payment of $[AMOUNT] is due within [__] days per the lease.",
        ),
        (
            CHECKBOX,
            "Credit of $[AMOUNT] to be applied to tenant's next monthly CAM installment. "
            "Amended statement enclosed.",
        ),
        (
            CHECKBOX,
            "Amended statement enclosed reflecting the following adjustment: [DESCRIBE ADJUSTMENT]. "
            "Revised balance due: $[REVISED AMOUNT].",
        ),
        (
            CHECKBOX,
            "Meet and confer proposed. We invite you to schedule a call with our property "
            "accounting team within [__] days to discuss the items noted in your dispute letter.",
        ),
    ]
    rows = [
        [Paragraph(c, s["response_body"]), Paragraph(d, s["response_body"])]
        for c, d in options
    ]
    t = Table(rows, colWidths=[0.28 * inch, 6.42 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                ("LEFTPADDING", (0, 0), (0, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )
    return t


# Standard response language library entries
LANGUAGE_LIBRARY = [
    (
        "Pro-Rata Denominator",
        "The denominator applied to this tenant's reconciliation reflects the total rentable "
        "area of [BUILDING/PROJECT] as of [DATE], per the current BOMA measurement and rent "
        "roll. The denominator is consistent with the lease definition, which specifies "
        "[QUOTE LEASE LANGUAGE]. A copy of the supporting SF schedule is enclosed. If tenant "
        "believes a remeasurement is warranted, tenant may commission a BOMA-certified "
        "remeasurement at tenant's expense per Section [__] of the lease.",
    ),
    (
        "Excluded Expenses",
        "We have reviewed the expense categories identified in tenant's dispute letter. "
        "The following items were excluded from the CAM pool prior to pro-rata allocation: "
        "[LIST EXCLUDED ITEMS AND DOLLAR AMOUNTS]. These exclusions are consistent with "
        "the exclusion list in Section [__] of the lease. No excluded expense category "
        "appears in the recoverable pool.",
    ),
    (
        "Gross-Up Calculation",
        "Gross-up was applied to variable operating expenses only, consistent with the "
        "gross-up clause in Section [__] of the lease. Occupancy during the reconciliation "
        "period was [X]%, below the [Y]% threshold in the lease. Variable expenses were "
        "normalized to [Y]% occupancy before pro-rata allocation. Fixed expenses — including "
        "property taxes, insurance, and the management fee — were excluded from the "
        "gross-up calculation per the lease and standard industry practice.",
    ),
    (
        "CAM Cap",
        "The CAM cap applicable to this tenant's lease is [X]% [cumulative / non-cumulative] "
        "per lease year, commencing [DATE]. The cap was calculated on Controllable Operating "
        "Expenses only, as defined in Section [__]. Property taxes, insurance, utilities, and "
        "[LIST ADDITIONAL CAP EXCLUSIONS] are excluded from the cap base per the lease. The "
        "cap ceiling for [YEAR] is $[AMOUNT]. The tenant's actual share before the cap was "
        "$[AMOUNT]; after applying the cap, the tenant's share is $[CAPPED AMOUNT]. A copy "
        "of the cap calculation worksheet is enclosed.",
    ),
    (
        "Management Fee",
        "The management fee included in the CAM reconciliation is [X]% of recoverable "
        "operating expenses, consistent with Section [__] of the lease. The fee base "
        "excludes property taxes, insurance, and utilities per the lease's definition "
        "of 'manageable expenses.' The management fee for [YEAR] is $[AMOUNT], representing "
        "[X]% of the recoverable operating expense base of $[BASE]. This is within the "
        "[X]% cap specified in the lease.",
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
        Paragraph("CAPVERI TEMPLATE — LANDLORD SIDE", s["eyebrow"]),
        Paragraph(DOC_TITLE, s["title"]),
        Paragraph(
            "Use this template when responding to a tenant's formal CAM dispute letter. "
            "Fill in each bracketed field. Attach exhibits as referenced.",
            s["body"],
        ),
        HRFlowable(width="100%", thickness=1, color=BRAND_BLUE, spaceAfter=10),
        _header_fields(s),
        Spacer(1, 12),
    ]

    # Opening
    story += [
        Paragraph("[DATE]", s["body"]),
        Spacer(1, 4),
        Paragraph(
            "[TENANT COMPANY NAME]<br/>[TENANT CONTACT NAME / TITLE]<br/>[ADDRESS]",
            s["body"],
        ),
        Spacer(1, 8),
        Paragraph(
            "Re: Response to CAM Dispute Letter — [PROPERTY NAME], Suite [SUITE #], "
            "Reconciliation Year [YYYY]",
            s["body"],
        ),
        Spacer(1, 6),
        Paragraph("Dear [TENANT CONTACT NAME],", s["body"]),
        Paragraph(
            "Thank you for your letter dated [DISPUTE DATE] regarding the CAM "
            "reconciliation statement for the above-referenced premises for the period "
            "ending December 31, [YYYY]. We have carefully reviewed each of the concerns "
            "raised in your letter and provide the following point-by-point response. "
            "We have also enclosed supporting documentation as referenced below.",
            s["body"],
        ),
    ]

    # Point-by-point response
    story += [
        Paragraph("Point-by-Point Response", s["section"]),
        Paragraph(
            "The table below addresses each concern raised in tenant's dispute letter. "
            "Add or remove rows as needed to match the specific disputes in the letter "
            "received.",
            s["body"],
        ),
        _response_table(s),
        PageBreak(),
    ]

    # Documents enclosed
    story += [
        Paragraph("Documents Enclosed", s["section"]),
        Paragraph(
            "The following supporting documents are enclosed with this response letter. "
            "Check each document that applies to this response.",
            s["body"],
        ),
        _docs_enclosed_table(s),
        Spacer(1, 10),
    ]

    # Proposed resolution
    story += [
        Paragraph("Proposed Resolution", s["section"]),
        Paragraph(
            "Based on our review of the tenant's concerns and the supporting documentation, "
            "we propose the following resolution (select applicable option):",
            s["body"],
        ),
        _resolution_table(s),
        Spacer(1, 12),
        Paragraph(
            "We trust the foregoing and enclosed documentation fully address the concerns "
            "raised in your dispute letter. Please do not hesitate to contact us if you "
            "have additional questions or require further clarification.",
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

    # ── Page 2 — Standard Response Language Library ───────────────────────────
    story += [
        Paragraph("CAPVERI RESOURCE", s["eyebrow"]),
        Paragraph("Standard Response Language Library", s["title"]),
        Paragraph(
            "Copy and adapt these canned paragraphs when responding to the most common "
            "CAM dispute types. Each paragraph is intended for use in a formal response "
            "letter or email. Customize bracketed fields before sending.",
            s["body"],
        ),
        Table(
            [
                [
                    Paragraph(
                        "<b>Audience</b><br/>Property managers / landlord attorneys",
                        s["small"],
                    ),
                    Paragraph(
                        "<b>Use case</b><br/>Responding to tenant CAM disputes",
                        s["small"],
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
        Spacer(1, 10),
    ]

    for topic, paragraph_text in LANGUAGE_LIBRARY:
        story.append(
            KeepTogether(
                [
                    Paragraph(topic, s["lib_heading"]),
                    HRFlowable(
                        width="100%",
                        thickness=0.5,
                        color=colors.HexColor("#BFDBFE"),
                        spaceBefore=0,
                        spaceAfter=4,
                    ),
                    Paragraph(paragraph_text, s["lib_body"]),
                ]
            )
        )

    story += [
        Spacer(1, 10),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#CBD5E1")),
        Spacer(1, 6),
        Paragraph(
            "<b>Need audit-ready documentation automatically?</b> CapVeri generates GL "
            "tie-outs, gross-up worksheets, cap calculations, and pro-rata schedules "
            "directly from your property management system export — giving you "
            "supporting documentation in minutes, not days. "
            f"Start at {app_url('/register')}.",
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
