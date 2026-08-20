"""Generate the Audit Risk Quiz PDF.

Output: ``docs/assets/audit-risk-quiz.pdf``

A 2–3 page quick 10-question Yes/No quiz that guides property managers to
recognize their CAM audit exposure in under 5 minutes. Each question includes
a risk interpretation for "Yes" and "No" answers, followed by a results guide.
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

OUTPUT_PATH = docs_assets_dir() / "audit-risk-quiz.pdf"
FOOTER_URL = site_url("/tools/audit-risk-quiz")
DOC_TITLE = "CAM Audit Risk Quiz"
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
        "q_number": ParagraphStyle(
            "QNumber",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=15,
            textColor=BRAND_BLUE,
        ),
        "q_text": ParagraphStyle(
            "QText",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=NAVY,
            spaceAfter=4,
        ),
        "q_interp": ParagraphStyle(
            "QInterp",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#374151"),
            spaceAfter=2,
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
        "band_label": ParagraphStyle(
            "BandLabel",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=13,
            textColor=NAVY,
        ),
    }


# (Question, if_yes_interpretation, if_no_interpretation)
QUESTIONS: list[tuple[str, str, str]] = [
    (
        "Do any of your leases give tenants the right to audit CAM expenses?",
        "If yes: your audit risk is real and time-bound. Proceed to the Audit Risk Scorecard to quantify your exposure.",
        "If no: verify this with legal counsel — audit-rights clauses are often buried in general provisions or amendments.",
    ),
    (
        "Have you received a CAM dispute or tenant inquiry about reconciliation charges in the last 24 months?",
        "If yes: you already have a live audit-target profile. Document your position before the dispute escalates.",
        "If no: lower current exposure, but absence of disputes does not mean your reconciliations are error-free.",
    ),
    (
        "Are your CAM reconciliation supporting documents organized and retrievable within 48 hours?",
        "If yes: you are positioned to respond quickly to an audit request, which typically reduces dispute scope.",
        "If no: immediate risk. Disorganized records extend audit timelines and create negotiating weakness.",
    ),
    (
        "Do you apply gross-up to variable expenses in years when building occupancy is below 90%?",
        "If yes: you are recovering appropriately from fully-occupied tenants in partial-occupancy years.",
        "If no: potential under-recovery and dispute liability — tenants who understand gross-up may claim you under-billed.",
    ),
    (
        "Do you track cumulative CAM cap bank balances year-over-year for leases with cumulative caps?",
        "If yes: cap errors are unlikely, and you can demonstrate cap compliance to an auditor.",
        "If no: cap error exposure. Cumulative cap banks that are not rolled forward produce overbillings recoverable by tenant.",
    ),
    (
        "Is your pro-rata denominator reviewed and updated annually or upon tenant changes?",
        "If yes: allocation errors are minimized and your denominator can be supported on audit.",
        "If no: allocation errors compound over time. A stale denominator is the second most common audit finding.",
    ),
    (
        "Are capital vs. operating expense splits reviewed by an accountant before sending reconciliations?",
        "If yes: capital inclusion errors are caught before they become tenant claims.",
        "If no: high dispute risk. Improperly capitalized expenses included in the pool are the most audit-recoverable item.",
    ),
    (
        "Do you send CAM estimates to California tenants 12 months in advance of each lease year? (SB 1103)",
        "If yes: you are meeting the SB 1103 advance notice requirement for qualifying small business tenants.",
        "If no: California statutory violation risk for qualifying tenants. Consult legal counsel immediately.",
    ),
    (
        "Have you reconciled all prior-year CAM statements — no open reconciliation years more than 12 months old?",
        "If yes: no dispute backlog exposure; tenants cannot claim you are delaying statements to obscure errors.",
        "If no: dispute backlog risk. Open reconciliations invite tenants to challenge multiple years simultaneously.",
    ),
    (
        "Does your management team review CAM reconciliations before they are delivered to tenants?",
        "If yes: your quality control process catches errors before tenants see them.",
        "If no: quality control gap. Without management review, errors that would be obvious to a second reader go undetected.",
    ),
]

RESULTS_BANDS: list[tuple[str, str, str, str, list[str]]] = [
    (
        "0–3 Yes answers",
        "High Audit Risk",
        "red",
        "Critical gaps in your CAM reconciliation process. Take immediate action to reduce exposure.",
        [
            "Download and complete the Audit Risk Scorecard to quantify specific exposures.",
            "Engage legal counsel to review all open reconciliations before tenant contact.",
            "Run a portfolio-wide audit using CapVeri to find errors before tenants do.",
            "Implement two-person review sign-off and document retention immediately.",
        ],
    ),
    (
        "4–6 Yes answers",
        "Moderate Risk",
        "yellow",
        "Meaningful process gaps exist. Prioritize the 'No' answers as your action list.",
        [
            "Address each 'No' answer above with a specific process improvement.",
            "Focus first on gross-up consistency, cap bank tracking, and document organization.",
            "Review all California properties for SB 1103 compliance if not already done.",
            "Schedule a CapVeri portfolio review to catch errors in existing reconciliations.",
        ],
    ),
    (
        "7–10 Yes answers",
        "Well-Managed",
        "green",
        "Your CAM reconciliation process is solid. Maintain controls and review annually.",
        [
            "Conduct an annual recovery-code review in your property management system.",
            "Use the Audit Risk Scorecard for a more detailed self-assessment.",
            "Consider CapVeri to automate your existing controls and reduce manual effort.",
        ],
    ),
]


def _build_question(
    num: int,
    question: str,
    if_yes: str,
    if_no: str,
    styles: dict[str, ParagraphStyle],
) -> KeepTogether:
    q_table = Table(
        [
            [
                Paragraph(str(num), styles["q_number"]),
                [
                    Paragraph(question, styles["q_text"]),
                    Table(
                        [
                            [
                                Table(
                                    [["☑ YES"], ["☐ NO"]],
                                    colWidths=[0.6 * inch],
                                    style=TableStyle(
                                        [
                                            (
                                                "FONTNAME",
                                                (0, 0),
                                                (-1, -1),
                                                "Helvetica-Bold",
                                            ),
                                            ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                                            (
                                                "TEXTCOLOR",
                                                (0, 0),
                                                (0, 0),
                                                colors.HexColor("#16A34A"),
                                            ),
                                            (
                                                "TEXTCOLOR",
                                                (0, 1),
                                                (0, 1),
                                                colors.HexColor("#DC2626"),
                                            ),
                                            ("PADDING", (0, 0), (-1, -1), 1),
                                            ("LEADING", (0, 0), (-1, -1), 12),
                                        ]
                                    ),
                                ),
                                [
                                    Paragraph(if_yes, styles["q_interp"]),
                                    Paragraph(if_no, styles["q_interp"]),
                                ],
                            ]
                        ],
                        colWidths=[0.65 * inch, 5.4 * inch],
                        style=TableStyle(
                            [
                                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                                ("TOPPADDING", (0, 0), (-1, -1), 0),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
                            ]
                        ),
                    ),
                ],
            ]
        ],
        colWidths=[0.35 * inch, 6.35 * inch],
        style=TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        ),
    )

    bg_color = LIGHT_GRAY if num % 2 == 0 else colors.white
    wrapper = Table(
        [[q_table]],
        colWidths=[6.7 * inch],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg_color),
                ("BOX", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("PADDING", (0, 0), (-1, -1), 8),
            ]
        ),
    )
    return KeepTogether([wrapper, Spacer(1, 4)])


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
        Paragraph("CAPVERI QUICK ASSESSMENT", s["eyebrow"]),
        Paragraph(DOC_TITLE, s["title"]),
        Paragraph(
            "Answer these 10 questions to understand your CAM audit exposure in under 5 minutes. "
            "Each question has a risk interpretation for both Yes and No answers. Count your "
            "Yes answers and find your results at the end.",
            s["lede"],
        ),
        Table(
            [
                [
                    Paragraph(f"<b>Last updated</b><br/>{LAST_UPDATED}", s["small"]),
                    Paragraph("<b>Format</b><br/>Yes / No — 10 questions", s["small"]),
                    Paragraph("<b>Time</b><br/>Under 5 minutes", s["small"]),
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

    story.append(Paragraph("The 10 Questions", s["section"]))

    for i, (question, if_yes, if_no) in enumerate(QUESTIONS, start=1):
        story.append(_build_question(i, question, if_yes, if_no, s))

    story.append(Spacer(1, 4))

    # Score tallying box
    tally_table = Table(
        [["Count your YES answers:     _______     out of 10"]],
        colWidths=[6.7 * inch],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EFF6FF")),
                ("BOX", (0, 0), (-1, -1), 1.5, BRAND_BLUE),
                ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 11),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("PADDING", (0, 0), (-1, -1), 12),
            ]
        ),
    )
    story.append(tally_table)
    story.append(Spacer(1, 10))

    # Results Guide
    story.append(Paragraph("Results Guide", s["section"]))

    for score_range, label, color_key, interpretation, actions in RESULTS_BANDS:
        band_bg = {"green": LIGHT_GREEN, "yellow": LIGHT_YELLOW, "red": LIGHT_RED}[
            color_key
        ]
        band_border = {"green": GREEN, "yellow": YELLOW, "red": RED}[color_key]

        band_table = Table(
            [
                [
                    Paragraph(score_range, s["small"]),
                    Paragraph(f"<b>{label}</b>", s["band_label"]),
                    Paragraph(interpretation, s["body"]),
                ],
                [
                    "",
                    Paragraph("<b>Next steps:</b>", s["small"]),
                    Paragraph(
                        "<br/>".join(f"• {a}" for a in actions),
                        s["small"],
                    ),
                ],
            ],
            colWidths=[0.9 * inch, 1.25 * inch, 4.55 * inch],
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

    story.append(Spacer(1, 4))
    story.append(
        Paragraph(
            "<b>Ready for a deeper analysis?</b> Use the Audit Risk Scorecard for a scored "
            "20-factor assessment, or let CapVeri audit your actual reconciliations automatically. "
            f"Start free at {app_url('/register')}.",
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
