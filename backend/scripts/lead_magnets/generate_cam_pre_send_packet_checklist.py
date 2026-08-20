"""Generate the CAM Pre-Send Packet Checklist PDF.

Output: ``docs/assets/cam-pre-send-packet-checklist.pdf``

A 4-6 page operator checklist for property managers reviewing a year-end CAM
reconciliation packet before it goes to tenants. Each item carries a "why this
matters" justification and a "where to verify" cross-reference.
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

OUTPUT_PATH = docs_assets_dir() / "cam-pre-send-packet-checklist.pdf"
FOOTER_URL = site_url("/resources/cam-pre-send-packet-checklist")
DOC_TITLE = "CAM Pre-Send Packet Checklist"
LAST_UPDATED = "2026-04-27"

CHECKBOX = "☐"  # ☐


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
        ),
        "verify": ParagraphStyle(
            "Verify",
            parent=base["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            leading=10.5,
            textColor=SLATE,
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
    }


# Sections: (section title, [(item_title, why_it_matters, where_to_verify), ...])
SECTIONS: list[tuple[str, list[tuple[str, str, str]]]] = [
    (
        "1. Lease abstract review",
        [
            (
                "Confirm CAM exclusions match the signed lease",
                "Recovering an excluded expense (capital, leasing commissions, owner overhead, "
                "mortgage interest) is the single most common audit finding and triggers refund "
                "demands plus interest.",
                "Verify in: lease Article on Operating Expenses, Exhibit A exclusion list, signed "
                "amendments and side letters.",
            ),
            (
                "Verify cap structure (cumulative vs non-cumulative, compounding vs flat)",
                "A 5% cumulative compounding cap can produce a ceiling 30%+ different from a 5% "
                "non-cumulative cap by Year 5. Wrong cap math is recoverable by tenant under audit.",
                "Verify in: CAM cap clause, definitions of 'Lease Year' and 'Controllable Operating "
                "Expenses', any cap exclusions list.",
            ),
            (
                "Identify the gross-up clause and threshold",
                "If the lease permits gross-up to a stated occupancy (commonly 90% or 95%), variable "
                "expenses must be normalized BEFORE caps and pro-rata are applied.",
                "Verify in: gross-up clause, definition of variable vs fixed expenses, any list of "
                "expense categories subject to gross-up.",
            ),
            (
                "Confirm audit-rights window and notice requirements",
                "The audit window (commonly 90-180 days from statement delivery) determines when the "
                "reconciliation can still be challenged. Send statements with the wrong reference "
                "date and tenant gains additional dispute time.",
                "Verify in: audit-rights clause, statement-delivery clause, notice provisions.",
            ),
            (
                "Confirm base year (if any) and stop amount",
                "Base year leases recover only the EXCESS over the base year amount. Confusing base "
                "year with full pass-through is a six-figure error on a single tenant.",
                "Verify in: base year definition, expense stop clause, any subsequent base year "
                "resets in renewal amendments.",
            ),
        ],
    ),
    (
        "2. GL tie-out",
        [
            (
                "Reconcile CAM pool to GL trial balance",
                "If the CAM pool does not foot to the underlying GL, the entire reconciliation is "
                "unsupportable on audit. Tie out by GL account and by month.",
                "Verify in: GL trial balance for the reconciliation year, CAM pool worksheet, vendor "
                "subledger for any high-dollar accounts.",
            ),
            (
                "Back out non-recoverable expenses before pool aggregation",
                "Marketing, leasing commissions, capital improvements above the lease threshold, "
                "owner-paid taxes, and intercompany charges must be removed BEFORE the pool is "
                "calculated, not after pro-rata.",
                "Verify in: GL detail for marketing, leasing, capital, owner-fee, and intercompany "
                "accounts; coding worksheet from accounting.",
            ),
            (
                "Remove capitalized items per lease threshold and amortize allowable",
                "Most leases allow amortization of capital expenditures that reduce operating costs, "
                "over the asset's useful life or the period stated in the lease. Lump-sum recovery "
                "of capital is the second most common audit finding.",
                "Verify in: fixed asset register, capitalization policy, lease capital recovery "
                "clause, amortization schedule.",
            ),
            (
                "Verify management fee base and percentage",
                "Most leases cap the management fee at a percentage of recoverable operating "
                "expenses (commonly 3-5%) and prohibit it from being applied to taxes, insurance, "
                "and utilities. Wrong base inflates fees.",
                "Verify in: management fee clause, definition of 'recoverable expenses' for fee "
                "purposes, vendor invoice from property management company.",
            ),
        ],
    ),
    (
        "3. Allocation accuracy",
        [
            (
                "Confirm pro-rata denominator is current",
                "Denominators change with new leases, suite reconfigurations, and BOMA "
                "remeasurements. A stale denominator under-recovers from current tenants and over-"
                "recovers from new tenants.",
                "Verify in: current rent roll as of the reconciliation date, BOMA measurement file, "
                "stacking plan, suite-by-suite SF schedule.",
            ),
            (
                "Apply BOMA 2024 remeasurement to denominators where adopted",
                "BOMA 2024 changes the treatment of certain inter-floor and amenity areas. If the "
                "building has been remeasured but the denominator still reflects the prior standard, "
                "tenant share percentages are wrong.",
                "Verify in: BOMA measurement letter, architect SF letter, remeasurement adoption "
                "notice to tenants.",
            ),
            (
                "Apply gross-up before pro-rata when occupancy is below threshold",
                "Variable expenses must be grossed up FIRST, then the grossed-up pool is allocated "
                "by pro-rata share. Reversing the order under-recovers from full-pay tenants when "
                "the building is partially occupied.",
                "Verify in: occupancy report for the reconciliation year, gross-up worksheet, lease "
                "gross-up clause.",
            ),
            (
                "Confirm anchor / shadow anchor exclusions are netted out of denominator",
                "Many retail leases exclude anchor SF from the CAM denominator (anchor pays direct "
                "or fixed CAM). Forgetting to net out anchor SF dramatically under-allocates pool to "
                "in-line tenants.",
                "Verify in: anchor lease, REA (Reciprocal Easement Agreement), CAM denominator "
                "worksheet.",
            ),
        ],
    ),
    (
        "4. Cap and base-year application",
        [
            (
                "Apply per-tenant caps using each tenant's lease year start",
                "Tenant lease years rarely match the calendar reconciliation year. Applying the cap "
                "off the calendar-year ceiling rather than the tenant-specific lease-year ceiling is "
                "a recurring error.",
                "Verify in: each tenant's lease commencement date, prior-year reconciliation "
                "statement (for last year's ceiling), cap calculation worksheet.",
            ),
            (
                "Confirm cumulative cap bank balance carries from prior year",
                "If the lease has a cumulative cap, unused room from prior years must carry into the "
                "current year's ceiling. Resetting the bank or using the wrong roll-forward is "
                "audit-recoverable.",
                "Verify in: prior-year reconciliation file, cap roll-forward worksheet, the "
                "Cumulative CAM Cap Bank Calculator (capveri.com/tools/cumulative-cap-bank-calculator).",
            ),
            (
                "Confirm base year CAM is correctly defined and not improperly grossed-up",
                "Base year math is fragile: if the base year was a partial-occupancy year and was "
                "grossed up, every subsequent year's excess must use the SAME grossed-up base. "
                "Shifting between grossed and ungrossed base years under-recovers in perpetuity.",
                "Verify in: original base year reconciliation, gross-up assumptions in base year, "
                "any amendments resetting the base year.",
            ),
            (
                "Confirm escalations on base year amount track lease language exactly",
                "Some base year leases escalate the base by CPI, others do not. Mishandling base "
                "year escalation creates the most common arbitration claim in office leases.",
                "Verify in: base year clause, CPI definition, any rider on base year escalation.",
            ),
        ],
    ),
    (
        "5. Statement format and supporting schedules",
        [
            (
                "Use a consistent line-item taxonomy across years",
                "If 'Landscaping' is one line item this year and split into 'Landscaping' and "
                "'Snow Removal' next year, year-over-year comparisons by tenants and auditors will "
                "trigger questions even when the math is correct.",
                "Verify in: prior-year statement, current statement, GL-to-statement mapping.",
            ),
            (
                "Attach supporting schedules: pool, exclusions, gross-up, cap, pro-rata",
                "Tenants and auditors expect at minimum: total pool reconciled to GL, exclusions "
                "list, gross-up calculation, cap calculation, and pro-rata math. Missing any of "
                "these triggers immediate audit demand.",
                "Verify in: statement back-up workpaper file, exhibits page references on the "
                "statement.",
            ),
            (
                "Include audit-rights notice with statement",
                "Most leases require the statement itself to advise tenant of the audit-rights "
                "window and the dispute notice procedure. Missing this language can extend the "
                "tenant's audit window indefinitely under some state laws (e.g., CA).",
                "Verify in: lease audit-rights clause, statement template, statement cover letter.",
            ),
            (
                "Reconcile total billed estimates to total recoverable",
                "True-up math: actual recoverable minus prior estimates billed = amount due (refund "
                "or balance). Math errors in this final step are visible to every tenant and erode "
                "trust if recurring.",
                "Verify in: estimate billing schedule, prior-year true-up, current-year true-up "
                "calculation.",
            ),
            (
                "Sign-off log: who reviewed, what date, what version",
                "If a statement is challenged, you need a clear chain of internal review showing "
                "lease abstract owner, accounting owner, and asset manager all reviewed the final "
                "version. Verbal sign-off is unrecoverable.",
                "Verify in: review log, version control on the statement file, email approvals.",
            ),
        ],
    ),
]


def _build_item(item: tuple[str, str, str], styles: dict[str, ParagraphStyle]):
    title, why, where = item
    return KeepTogether(
        [
            Table(
                [
                    [
                        Paragraph(
                            f'<font size="13">{CHECKBOX}</font>', styles["item_title"]
                        ),
                        Paragraph(title, styles["item_title"]),
                    ]
                ],
                colWidths=[0.3 * inch, 6.4 * inch],
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
            Paragraph(f"<b>Why this matters:</b> {why}", styles["item_body"]),
            Paragraph(where, styles["verify"]),
            Spacer(1, 6),
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

    story = [
        Paragraph("CAPVERI OPERATOR CHECKLIST", s["eyebrow"]),
        Paragraph(DOC_TITLE, s["title"]),
        Paragraph(
            "Use this checklist before sending the year-end CAM reconciliation packet to any "
            "tenant. Each item names a recurring failure mode that drives audit findings, "
            "tenant disputes, and recoverable refund demands. Walk every section in order — "
            "the order is the workflow.",
            s["lede"],
        ),
        Table(
            [
                [
                    Paragraph(f"<b>Last updated</b><br/>{LAST_UPDATED}", s["small"]),
                    Paragraph("<b>Use case</b><br/>Year-end CAM packet QA", s["small"]),
                    Paragraph(
                        "<b>Time to complete</b><br/>30-45 min per packet", s["small"]
                    ),
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

    for section_title, items in SECTIONS:
        story.append(Paragraph(section_title, s["section"]))
        for item in items:
            story.append(_build_item(item, s))

    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "<b>Need help automating these checks across a portfolio?</b> CapVeri runs every "
            "lease abstract, GL tie-out, gross-up, cap, and pro-rata test deterministically and "
            "produces an audit-ready packet automatically. Start a free portfolio audit at "
            f"{app_url('/register')}.",
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
