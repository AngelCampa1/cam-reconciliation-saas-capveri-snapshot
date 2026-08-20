"""Generate the SB 1103 Compliance Checker PDF.

Output: ``docs/assets/sb-1103-checker.pdf``

A 3–4 page California-specific compliance checklist for SB 1103, effective
January 1, 2025, which imposes advance notice and itemized estimate requirements
on commercial landlords whose tenants qualify as small businesses.
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

OUTPUT_PATH = docs_assets_dir() / "sb-1103-checker.pdf"
FOOTER_URL = site_url("/tools/sb-1103-checker")
DOC_TITLE = "SB 1103 Compliance Checker (California)"
LAST_UPDATED = "2026-04-27"
CHECKBOX = "☐"

WARNING_AMBER = colors.HexColor("#D97706")
WARNING_BG = colors.HexColor("#FFFBEB")
WARNING_BORDER = colors.HexColor("#FCD34D")


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
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=6,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=SLATE,
        ),
        "disclaimer": ParagraphStyle(
            "Disclaimer",
            parent=base["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=8,
            leading=10.5,
            textColor=colors.HexColor("#6B7280"),
            spaceAfter=4,
        ),
        "warning": ParagraphStyle(
            "Warning",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=12,
            textColor=WARNING_AMBER,
        ),
    }


COMPLIANCE_ITEMS: list[str] = [
    "Identify all tenants who qualify as 'small business' under SB 1103 (≤5 employees, written lease, ≤$100K/year gross receipts — verify current thresholds with legal counsel).",
    "Obtain and retain tenant employee count certification for each qualifying tenant.",
    "Provide 12-month advance notice of CAM estimate before the start of each new lease year.",
    "Ensure the notice includes an itemized estimate broken down by expense category.",
    "Deliver notice in writing — email is acceptable per the statute; retain proof of delivery.",
    "Retain proof of notice (email delivery receipt, certified mail, or signed acknowledgment) in tenant file.",
    "Confirm any CAM increase remains within the permissible cap under the statute.",
    "Mid-year CAM increase? The 12-month advance notice requirement still applies regardless of when the increase takes effect.",
    "Lease renewal? New SB 1103 notice required — prior-lease notice does not carry forward.",
    "Maintain all SB 1103 compliance records for a minimum of 5 years.",
    "Have legal counsel review your standard notice template for SB 1103 compliance.",
    "Review all lease clauses for conflicts with SB 1103 requirements; note any lease-specific issues.",
    "Audit all California commercial properties to identify every tenant who meets the qualifying threshold.",
    "Update the property management manual and lease administration procedures to include SB 1103 workflow.",
    "Ensure all property management staff responsible for lease administration are trained on SB 1103 requirements.",
]

KEY_DATES: list[tuple[str, str]] = [
    (
        "January 1, 2025",
        "SB 1103 effective date — all qualifying California commercial leases subject to requirements.",
    ),
    (
        "Ongoing — 12 months prior to each lease year start",
        "Annual CAM estimate notice due to qualifying tenants.",
    ),
    (
        "Ongoing — before any mid-year CAM increase",
        "12-month advance notice required regardless of timing.",
    ),
    (
        "Lease renewal date",
        "New SB 1103 notice required; prior notice does not satisfy renewal-year obligation.",
    ),
    (
        "Record retention",
        "Maintain all SB 1103 compliance records for minimum 5 years from each notice date.",
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
        Paragraph("CAPVERI COMPLIANCE CHECKLIST — CALIFORNIA", s["eyebrow"]),
        Paragraph(DOC_TITLE, s["title"]),
        Paragraph(
            "California SB 1103, effective January 1, 2025, imposes advance notice and "
            "itemized estimate requirements on commercial landlords whose tenants qualify "
            "as small businesses. Non-compliance creates statutory violation risk and "
            "potential tenant remedies. Use this checklist to confirm your properties meet "
            "all SB 1103 obligations.",
            s["lede"],
        ),
        Table(
            [
                [
                    Paragraph(f"<b>Last updated</b><br/>{LAST_UPDATED}", s["small"]),
                    Paragraph("<b>Jurisdiction</b><br/>California only", s["small"]),
                    Paragraph("<b>Effective date</b><br/>January 1, 2025", s["small"]),
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
    ]

    # What is SB 1103?
    story.append(Paragraph("What Is SB 1103?", s["section"]))
    story.append(
        Paragraph(
            "California SB 1103 (Smallwood) amends the Civil Code to protect qualifying "
            "small business commercial tenants from unexpected CAM charge increases. "
            "In plain language: if your tenant qualifies, you must give them 12 months' "
            "written notice before increasing CAM charges, and that notice must include an "
            "itemized estimate of each expense category.",
            s["body"],
        )
    )

    # Who must comply
    story.append(Paragraph("Who Must Comply?", s["section"]))
    qualify_data = [
        ["Requirement", "Threshold", "Notes"],
        [
            "Tenant employee count",
            "5 or fewer employees",
            "Verify with written certification from tenant.",
        ],
        [
            "Lease type",
            "Written commercial lease",
            "Oral leases are excluded from scope.",
        ],
        [
            "Tenant gross receipts",
            "≤ $100,000/year (confirm current threshold with counsel)",
            "Threshold may be indexed; verify current statutory language.",
        ],
        [
            "Property location",
            "California commercial property",
            "SB 1103 applies to CA-sited properties only.",
        ],
    ]
    qualify_table = Table(
        qualify_data,
        colWidths=[1.8 * inch, 2.2 * inch, 2.7 * inch],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8.5),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 1), (-1, -1), 8.5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("PADDING", (0, 0), (-1, -1), 6),
                ("LEADING", (0, 0), (-1, -1), 12),
            ]
        ),
    )
    story.append(qualify_table)
    story.append(Spacer(1, 6))

    # Warning box
    warning_table = Table(
        [
            [
                Paragraph(
                    "Important: The qualifying thresholds above reflect publicly available statutory language. "
                    "Always verify current thresholds with qualified California real estate legal counsel before "
                    "relying on them for compliance decisions. Regulatory guidance may update these figures.",
                    s["warning"],
                )
            ]
        ],
        colWidths=[6.7 * inch],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), WARNING_BG),
                ("BOX", (0, 0), (-1, -1), 1.0, WARNING_BORDER),
                ("PADDING", (0, 0), (-1, -1), 8),
            ]
        ),
    )
    story.append(warning_table)
    story.append(Spacer(1, 8))

    # Compliance Checklist
    story.append(Paragraph("SB 1103 Compliance Checklist", s["section"]))
    for item in COMPLIANCE_ITEMS:
        story.append(_build_check_item(item, s))
    story.append(Spacer(1, 8))

    # Key Dates
    story.append(Paragraph("Key Dates & Deadlines", s["section"]))
    dates_header = [["Date / Trigger", "Obligation"]]
    dates_rows = [[date, obligation] for date, obligation in KEY_DATES]
    dates_table = Table(
        dates_header + dates_rows,
        colWidths=[2.2 * inch, 4.5 * inch],
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
    story.append(dates_table)
    story.append(Spacer(1, 10))

    # Disclaimer
    story.append(
        Paragraph(
            "Disclaimer: This checklist is provided for general informational purposes only and "
            "does not constitute legal advice. SB 1103 requirements are subject to regulatory "
            "interpretation and may be updated by subsequent legislation or agency guidance. "
            "Consult qualified California real estate legal counsel before implementing any "
            "compliance procedures.",
            s["disclaimer"],
        )
    )
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            "<b>Track SB 1103 obligations across your California portfolio.</b> CapVeri flags "
            "qualifying tenants and monitors notice deadlines automatically. "
            f"Start a free audit at {app_url('/register')}.",
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
