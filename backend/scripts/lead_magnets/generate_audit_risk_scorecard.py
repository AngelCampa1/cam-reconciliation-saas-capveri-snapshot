"""Generate the Audit Risk Scorecard PDF.

Output: ``docs/assets/audit-risk-scorecard.pdf``

A 3–4 page self-assessment scoring tool for property managers to gauge their
CAM reconciliation audit risk. Each risk factor is scored 0–5; total score
maps to Low / Medium / High risk bands.
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
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT_PATH = docs_assets_dir() / "audit-risk-scorecard.pdf"
FOOTER_URL = site_url("/tools/audit-risk-scorecard")
DOC_TITLE = "CAM Audit Risk Scorecard"
LAST_UPDATED = "2026-04-27"

GREEN = colors.HexColor("#16A34A")
YELLOW = colors.HexColor("#D97706")
RED = colors.HexColor("#DC2626")
LIGHT_GREEN = colors.HexColor("#DCFCE7")
LIGHT_YELLOW = colors.HexColor("#FEF9C3")
LIGHT_RED = colors.HexColor("#FEE2E2")


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
        "table_cell": ParagraphStyle(
            "TableCell",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#1F2937"),
        ),
        "band_label": ParagraphStyle(
            "BandLabel",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=NAVY,
        ),
    }


# (Factor description, scoring guidance)
RISK_FACTORS: list[tuple[str, str]] = [
    (
        "% of leases with tenant audit rights",
        "0 = none have audit rights  |  5 = >75% of leases include audit-rights clause",
    ),
    (
        "Age of oldest open reconciliation",
        "0 = all reconciliations current  |  5 = one or more reconciliations >18 months open",
    ),
    (
        "% of reconciliations with tenant disputes in last 3 years",
        "0 = no disputes  |  5 = >30% of reconciliations disputed",
    ),
    (
        "Number of different CAM pool structures across portfolio",
        "0 = single standard structure  |  5 = 5+ materially different pool structures",
    ),
    (
        "Leases with cumulative caps not tracked in a system",
        "0 = all tracked in software  |  5 = cumulative caps managed in ad hoc spreadsheets only",
    ),
    (
        "Gross-up applied inconsistently across properties",
        "0 = consistent methodology  |  5 = no documented gross-up policy; varies by reconciliation",
    ),
    (
        "Management fee % varies by property without documentation",
        "0 = all fees documented in lease or management agreement  |  5 = undocumented variations",
    ),
    (
        "Capital expense / operating expense split not reviewed by accountant",
        "0 = reviewed by accountant every year  |  5 = never reviewed; classification not documented",
    ),
    (
        "Pro-rata denominators not updated after remeasurement",
        "0 = denominators updated immediately on remeasurement  |  5 = stale denominators in use",
    ),
    (
        "No second reviewer on reconciliations before sending",
        "0 = two-person review on every reconciliation  |  5 = no formal review process",
    ),
    (
        "Supporting invoices not filed with reconciliation",
        "0 = all major invoices filed with workpapers  |  5 = no invoice filing practice",
    ),
    (
        "Yardi / MRI recovery codes not reviewed this year",
        "0 = reviewed and certified this year  |  5 = not reviewed in >2 years",
    ),
    (
        "Admin fee calculation differs from lease language",
        "0 = admin fee matches lease language for all tenants  |  5 = systematic mismatches",
    ),
    (
        "Base year actuals not locked in system",
        "0 = base years locked and audited  |  5 = base years can be overwritten without log",
    ),
    (
        "No documented exclusion checklist per lease",
        "0 = exclusion checklist on file for every lease  |  5 = exclusions reviewed informally only",
    ),
    (
        "Tenants not acknowledged receipt of statements",
        "0 = delivery confirmation on file for all statements  |  5 = no receipt confirmation process",
    ),
    (
        "Audit window closure not tracked",
        "0 = audit deadlines tracked in a system  |  5 = audit windows not monitored",
    ),
    (
        "Prior-year comparisons not provided with statements",
        "0 = prior-year comparison included in every statement  |  5 = never provided",
    ),
    (
        "No SB 1103 compliance review for California properties",
        "0 = SB 1103 review completed (or no CA properties)  |  5 = CA properties with no review",
    ),
    (
        "No standard reconciliation format across portfolio",
        "0 = standard format used portfolio-wide  |  5 = each property uses a different format",
    ),
]

RISK_BANDS: list[tuple[str, str, str, str]] = [
    (
        "0–39",
        "Low Risk",
        "Your CAM reconciliation practices are well-controlled. Maintain current processes and schedule an annual review.",
        "green",
    ),
    (
        "40–69",
        "Medium Risk",
        "Meaningful gaps exist. Prioritize fixing cumulative cap tracking, gross-up consistency, and reviewer sign-off processes.",
        "yellow",
    ),
    (
        "70–100",
        "High Risk",
        "Significant audit exposure. Engage legal counsel to review open reconciliations and implement immediate process controls.",
        "red",
    ),
]

RECOMMENDED_ACTIONS: dict[str, list[str]] = {
    "Low": [
        "Conduct annual recovery-code review in Yardi / MRI.",
        "Confirm cumulative cap bank balances are rolled forward correctly.",
        "Archive all reconciliation workpapers for minimum 7 years.",
    ],
    "Medium": [
        "Document gross-up methodology in a written policy and apply consistently.",
        "Implement two-person review sign-off for all reconciliations.",
        "Migrate cumulative cap tracking from spreadsheets to CapVeri or property management software.",
        "Schedule a lease abstract review for all leases with audit-rights clauses.",
    ],
    "High": [
        "Engage outside counsel to review all open reconciliations before tenant contact.",
        "Conduct a full portfolio audit using CapVeri to identify all mathematical errors before tenants do.",
        "Implement immediate invoice filing and workpaper retention procedures.",
        "Prioritize SB 1103 compliance review for all California commercial properties.",
        "Freeze any disputed amounts and establish a resolution queue with legal oversight.",
    ],
}


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
        Paragraph("CAPVERI SELF-ASSESSMENT TOOL", s["eyebrow"]),
        Paragraph(DOC_TITLE, s["title"]),
        Paragraph(
            "Score each of the 20 risk factors on a scale of 0 to 5, where 0 represents "
            "full control and 5 represents maximum exposure. Add your scores and use the "
            "risk band table to interpret results and prioritize actions.",
            s["lede"],
        ),
        Table(
            [
                [
                    Paragraph(f"<b>Last updated</b><br/>{LAST_UPDATED}", s["small"]),
                    Paragraph(
                        "<b>Scoring</b><br/>0 (no risk) – 5 (maximum risk) per factor",
                        s["small"],
                    ),
                    Paragraph("<b>Max score</b><br/>100 points", s["small"]),
                ]
            ],
            colWidths=[2.0 * inch, 3.0 * inch, 1.7 * inch],
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

    # Scorecard table
    story.append(Paragraph("Risk Factor Scorecard", s["section"]))

    header = [["#", "Risk Factor", "Scoring Guide", "Your Score"]]
    rows = []
    for i, (factor, guidance) in enumerate(RISK_FACTORS, start=1):
        rows.append(
            [
                str(i),
                Paragraph(factor, s["table_cell"]),
                Paragraph(guidance, s["table_cell"]),
                "",
            ]
        )

    scorecard_table = Table(
        header + rows,
        colWidths=[0.3 * inch, 2.8 * inch, 2.9 * inch, 0.7 * inch],
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
                ("PADDING", (0, 0), (-1, -1), 5),
                ("ALIGN", (0, 0), (0, -1), "CENTER"),
                ("ALIGN", (3, 0), (3, -1), "CENTER"),
                ("BACKGROUND", (3, 1), (3, -1), colors.HexColor("#FFF9C4")),
            ]
        ),
    )
    story.append(scorecard_table)
    story.append(Spacer(1, 6))

    # Total score row
    total_table = Table(
        [["", "TOTAL SCORE (sum of all 20 factors, max 100)", "", ""]],
        colWidths=[0.3 * inch, 2.8 * inch, 2.9 * inch, 0.7 * inch],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EFF6FF")),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BOX", (0, 0), (-1, -1), 1.0, BRAND_BLUE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("PADDING", (0, 0), (-1, -1), 7),
                ("BACKGROUND", (3, 0), (3, 0), colors.HexColor("#FFF9C4")),
                ("BOX", (3, 0), (3, 0), 1.0, BRAND_BLUE),
            ]
        ),
    )
    story.append(total_table)
    story.append(Spacer(1, 12))

    # Risk Band Interpretation
    story.append(Paragraph("Score Interpretation & Recommended Actions", s["section"]))

    for score_range, label, interpretation, color_key in RISK_BANDS:
        band_bg = {"green": LIGHT_GREEN, "yellow": LIGHT_YELLOW, "red": LIGHT_RED}[
            color_key
        ]
        band_border = {"green": GREEN, "yellow": YELLOW, "red": RED}[color_key]
        actions = RECOMMENDED_ACTIONS[label.split()[0]]

        band_table = Table(
            [
                [
                    Paragraph(f"Score {score_range}", s["small"]),
                    Paragraph(f"<b>{label}</b>", s["band_label"]),
                    Paragraph(interpretation, s["body"]),
                ],
                [
                    "",
                    Paragraph("<b>Key actions:</b>", s["small"]),
                    Paragraph(
                        "<br/>".join(f"• {a}" for a in actions),
                        s["small"],
                    ),
                ],
            ],
            colWidths=[0.75 * inch, 1.25 * inch, 4.7 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), band_bg),
                    ("BOX", (0, 0), (-1, -1), 1.0, band_border),
                    ("SPAN", (0, 0), (0, 1)),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("ALIGN", (0, 0), (0, -1), "CENTER"),
                    ("VALIGN", (0, 0), (0, -1), "MIDDLE"),
                    ("PADDING", (0, 0), (-1, -1), 7),
                    ("LEADING", (0, 0), (-1, -1), 12),
                ]
            ),
        )
        story.append(band_table)
        story.append(Spacer(1, 8))

    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            "<b>Get a definitive audit risk assessment.</b> CapVeri analyzes your actual lease "
            "abstracts and GL data to pinpoint specific errors before tenants find them. "
            f"Start a free portfolio audit at {app_url('/register')}.",
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
