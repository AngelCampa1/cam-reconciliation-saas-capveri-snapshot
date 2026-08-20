"""Generate the MRI Recovery Billing Error Checklist PDF.

Output: ``docs/assets/mri-recovery-billing-qa-checklist.pdf``

A 4–5 page QA checklist for property managers using MRI Residential /
MRI Commercial for CAM recovery billing.
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
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT_PATH = docs_assets_dir() / "mri-recovery-billing-qa-checklist.pdf"
FOOTER_URL = site_url("/tools/mri-recovery-billing-qa-checklist")
DOC_TITLE = "MRI Recovery Billing Error Checklist"
LAST_UPDATED = "2026-04-27"
CHECKBOX = "☐"


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
            spaceAfter=6,
        ),
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            textColor=NAVY,
            alignment=0,
            spaceAfter=8,
        ),
        "lede": ParagraphStyle(
            "Lede",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=14,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=12,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=BRAND_BLUE,
            spaceBefore=14,
            spaceAfter=8,
        ),
        "item_title": ParagraphStyle(
            "ItemTitle",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12.5,
            textColor=NAVY,
            spaceAfter=2,
        ),
        "item_body": ParagraphStyle(
            "ItemBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=11.5,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=4,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=SLATE,
        ),
    }


SECTIONS: list[tuple[str, list[str]]] = [
    (
        "Section 1 — MRI GL Export QA",
        [
            "Date range matches the lease reconciliation period — confirm MRI Cost Center posting dates are within scope.",
            "Cost Centers filtered to CAM-recoverable categories only; non-recoverable Cost Centers (marketing, leasing, owner overhead) excluded.",
            "Journal entries reviewed for duplicates — MRI period-end reversals can create double-counted entries if the prior-period accrual was not cleared.",
            "Intercompany Cost Center transactions eliminated before aggregating the recovery pool.",
            "Accruals confirmed in MRI Property Database for accrual-basis leases; accrual schedule reconciled to GL postings.",
            "Prepaid amortization confirmed across all months — MRI straight-line amortization rules reviewed for each prepaid account.",
            "Capital vs. expense classification verified in MRI fixed-asset module; only allowable amortized capital included in pool.",
            "Management fee Cost Center confirmed against the management agreement — base and percentage match.",
            "Admin fee calculated per lease abstract stored in MRI, not the MRI system-default configuration.",
            "Insurance premium balance cross-checked against the insurance invoice and declarations page.",
        ],
    ),
    (
        "Section 2 — Recovery Billing Setup QA",
        [
            "MRI Lease Abstract recovery pool assignment matches the lease type and recovery article.",
            "MRI expense pool definitions reviewed — only recoverable accounts are mapped to each pool; pool boundaries have not drifted since last reconciliation.",
            "MRI pro-rata share calculation method setting (GLA-based, fixed percentage, or custom formula) matches the lease language.",
            "MRI cap tracker confirmed: cap type, base year amount, percentage, and cumulative vs. non-cumulative setting.",
            "Exclusion matrix in MRI lease abstract matches the lease exhibit — line-by-line comparison performed.",
            "Base year actuals locked in MRI so no retroactive postings alter the base-year recovery pool.",
            "Tenant GLA in MRI Lease Abstract matches executed lease and any remeasurement amendments.",
            "Reconciliation period in MRI matches the tenant lease commencement anniversary.",
        ],
    ),
    (
        "Section 3 — Output Validation",
        [
            "Recovery billing run totals tie to the MRI GL trial balance for the same period and Cost Centers.",
            "Tenant share percentage produced by MRI Recovery Billing module matches an independent manual calculation.",
            "Prior-year comparison exported from MRI alongside current-year statement.",
            "PDF statement generated from MRI and reviewed before sending — formatting, line items, and math confirmed.",
            "Backup schedules (expense pool detail, exclusions, gross-up, cap worksheet, pro-rata math) attached to the statement package.",
            "Second reviewer sign-off obtained and documented prior to distribution.",
        ],
    ),
]

PITFALLS: list[tuple[str, str]] = [
    (
        "Expense pool includes non-recoverable accounts",
        "MRI expense pools are configured manually and can silently accumulate non-recoverable accounts over time as the chart of accounts evolves. Review pool account membership annually against the lease exclusion list.",
    ),
    (
        "Recovery billing run before all invoices posted",
        "If the MRI Recovery Billing module is run before all vendor invoices for the reconciliation period are posted, the output will under-recover. Confirm the AP subledger is fully closed for the period before running recovery billing.",
    ),
    (
        "Prior-year adjustment posted to wrong period",
        "MRI allows retroactive postings. Prior-year adjustments inadvertently posted to the current reconciliation period inflate the pool. Review the MRI period-close log and confirm no prior-period adjustments exist in the current-year pool.",
    ),
]


def _build_check_item(text: str, styles: dict[str, ParagraphStyle]) -> KeepTogether:
    return KeepTogether(
        [
            Table(
                [
                    [
                        Paragraph(
                            f'<font size="13">{CHECKBOX}</font>', styles["item_title"]
                        ),
                        Paragraph(text, styles["item_body"]),
                    ]
                ],
                colWidths=[0.3 * inch, 6.4 * inch],
                style=TableStyle(
                    [
                        ("VALIGN", (0, 0), (-1, -1), "TOP"),
                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                        ("TOPPADDING", (0, 0), (-1, -1), 1),
                        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                    ]
                ),
            ),
        ]
    )


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=letter,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.85 * inch,
        title=DOC_TITLE,
        author="CapVeri",
    )
    s = _styles()

    story: list = [
        Paragraph("CAPVERI OPERATOR CHECKLIST", s["eyebrow"]),
        Paragraph(DOC_TITLE, s["title"]),
        Paragraph(
            "Use this checklist every time you run MRI recovery billing before distributing "
            "a CAM reconciliation statement. Catching errors in the MRI setup and output "
            "prevents tenant disputes, refund demands, and audit findings.",
            s["lede"],
        ),
        Table(
            [
                [
                    Paragraph(f"<b>Last updated</b><br/>{LAST_UPDATED}", s["small"]),
                    Paragraph(
                        "<b>Platform</b><br/>MRI Residential / MRI Commercial",
                        s["small"],
                    ),
                    Paragraph(
                        "<b>Audience</b><br/>Property managers &amp; accountants",
                        s["small"],
                    ),
                ]
            ],
            colWidths=[2.0 * inch, 2.8 * inch, 1.9 * inch],
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
    ]

    for section_title, items in SECTIONS:
        story.append(Paragraph(section_title, s["section"]))
        for item in items:
            story.append(_build_check_item(item, s))
        story.append(Spacer(1, 6))

    story.append(Paragraph("Section 4 — Common MRI Pitfalls", s["section"]))
    story.append(
        Paragraph(
            "These three MRI-specific errors survive standard QA and surface only during "
            "tenant audits. Verify each before finalizing the recovery billing run.",
            s["item_body"],
        )
    )
    story.append(Spacer(1, 6))

    pitfall_data = [["Pitfall", "What Goes Wrong"]]
    for pitfall, description in PITFALLS:
        pitfall_data.append([pitfall, description])

    pitfall_table = Table(
        pitfall_data,
        colWidths=[2.0 * inch, 4.7 * inch],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 9),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 1), (-1, -1), 8.5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("PADDING", (0, 0), (-1, -1), 7),
                ("LEADING", (0, 0), (-1, -1), 12),
            ]
        ),
    )
    story.append(pitfall_table)
    story.append(Spacer(1, 12))
    story.append(
        Paragraph(
            "<b>Automate this checklist across your portfolio.</b> CapVeri ingests MRI exports "
            "directly and runs every QA check deterministically — no manual cross-referencing. "
            f"Start a 30-day trial at {app_url('/auth/register')}.",
            s["small"],
        )
    )

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
