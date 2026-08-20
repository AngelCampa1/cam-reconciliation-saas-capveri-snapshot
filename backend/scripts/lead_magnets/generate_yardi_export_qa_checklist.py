"""Generate the Yardi Export Error Checklist PDF.

Output: ``docs/assets/yardi-export-qa-checklist.pdf``

A 4–5 page QA checklist for property managers and accountants who export
CAM data from Yardi Voyager / Yardi Commercial CAM for reconciliation.
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

OUTPUT_PATH = docs_assets_dir() / "yardi-export-qa-checklist.pdf"
FOOTER_URL = site_url("/tools/yardi-export-qa-checklist")
DOC_TITLE = "Yardi Export Error Checklist"
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
        "pitfall": ParagraphStyle(
            "Pitfall",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#7C3AED"),
            leftIndent=12,
            spaceAfter=4,
        ),
        "pitfall_label": ParagraphStyle(
            "PitfallLabel",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#7C3AED"),
        ),
    }


SECTIONS: list[tuple[str, list[str]]] = [
    (
        "Section 1 — GL Export QA",
        [
            "Date range matches the lease reconciliation period (not calendar year unless lease year = calendar year).",
            "Account codes filtered to CAM-recoverable accounts only; marketing, leasing, and owner overhead accounts excluded.",
            "Journal entries verified — no duplicate entries from period-close or month-end reposting.",
            "Intercompany eliminations applied before totaling the CAM pool.",
            "Accruals included if the lease is on an accrual basis; confirmed against year-end accrual schedule.",
            "Prepaid expenses correctly amortized across the reconciliation period (not expensed in full in one month).",
            "Capital vs. expense split verified against capitalization policy and lease capital recovery clause.",
            "Management fee account matches the fee agreement — percentage and base confirmed.",
            "Admin fee calculated per individual lease language, not the Yardi system-default percentage.",
            "Insurance premium amount cross-checked against the actual invoice or declarations page.",
        ],
    ),
    (
        "Section 2 — Recovery Setup QA",
        [
            "Recovery code in Yardi matches the lease type (full-service, NNN, modified gross, base-year stop).",
            "Pro-rata denominator (Gross Buildable Area) reflects current tenant GLA — not a stale value from prior year.",
            "Vacancy / gross-up flag set correctly in Yardi recovery setup; variable expense gross-up applies at the correct occupancy threshold.",
            "Cap setup confirmed: type (cumulative or non-cumulative), base year amount, cap percentage, and any cap exclusions.",
            "Exclusion list in Yardi recovery setup matches the lease exhibit — item-by-item comparison.",
            "Base year actuals locked in Yardi so no retroactive postings alter the base-year pool.",
            "Lease GLA in Yardi matches the executed lease and any remeasurement amendments.",
            "Reconciliation period matches lease commencement anniversary, not the landlord's fiscal year.",
        ],
    ),
    (
        "Section 3 — Output Validation",
        [
            "Export totals tie to the GL trial balance for the same period and accounts.",
            "Tenant share percentage produced by Yardi matches an independent manual calculation.",
            "Prior-year comparison exported alongside current-year statement for tenant review.",
            "PDF statement generated from Yardi and reviewed for accuracy before sending to tenant.",
            "Backup schedules (pool detail, exclusions, gross-up, cap worksheet) attached to the statement package.",
            "Second reviewer sign-off obtained and documented before distribution.",
        ],
    ),
]

PITFALLS: list[tuple[str, str]] = [
    (
        "Wrong CAM pool code",
        "Yardi supports multiple recovery pool codes. Using the wrong pool silently includes or excludes entire GL account groups. Confirm the pool code on every export against the lease recovery article.",
    ),
    (
        "Management fee set at company level overriding lease",
        "Yardi allows a company-level default management fee percentage. If a specific lease has a different fee cap, the company default overrides lease language unless explicitly overridden in the lease setup screen.",
    ),
    (
        "Gross-up applying to fixed expenses",
        "Yardi’s gross-up flag applies to all expenses in the pool unless individual accounts are flagged as fixed. Applying gross-up to insurance, property tax, and other fixed-cost accounts inflates the recovery calculation and creates tenant refund liability.",
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
            "Use this checklist every time you export CAM data from Yardi Voyager or Yardi "
            "Commercial CAM before beginning a reconciliation. Errors caught here prevent "
            "tenant disputes, refund demands, and audit findings downstream.",
            s["lede"],
        ),
        Table(
            [
                [
                    Paragraph(f"<b>Last updated</b><br/>{LAST_UPDATED}", s["small"]),
                    Paragraph(
                        "<b>Platform</b><br/>Yardi Voyager / Yardi Commercial CAM",
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

    # Section 4 — Common Pitfalls
    story.append(Paragraph("Section 4 — Common Yardi Pitfalls", s["section"]))
    story.append(
        Paragraph(
            "These are the three most frequent Yardi-specific errors that survive standard QA "
            "and surface only during tenant audits. Review each before finalizing the export.",
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
            "<b>Automate this checklist across your portfolio.</b> CapVeri ingests Yardi exports "
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
