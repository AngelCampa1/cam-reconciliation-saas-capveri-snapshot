"""Generate the Texas CAM Reconciliation Statement Template PDF.

Output: ``docs/assets/cam-reconciliation-texas.pdf``

A 4-6 page template for property managers in Texas sending year-end CAM
reconciliation statements to commercial tenants. Covers Texas Property Code
statutory framework, HCAD property tax notes, CAM pool summary, tenant
allocation, expense detail schedules, and dispute/audit rights notice.
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
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT_PATH = docs_assets_dir() / "cam-reconciliation-texas.pdf"
FOOTER_URL = site_url("/resources/cam-reconciliation-texas")
DOC_TITLE = "Texas CAM Reconciliation Statement Template"
LAST_UPDATED = "2026-04-27"

FILL_BRACKET = "[                    ]"


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
        "subsection": ParagraphStyle(
            "Subsection",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=13,
            textColor=NAVY,
            spaceBefore=8,
            spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=12.5,
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
            textColor=SLATE,
            spaceAfter=4,
        ),
    }


def _cover_page(s: dict) -> list:
    story: list = []
    story.append(Paragraph("CAPVERI STATEMENT TEMPLATE", s["eyebrow"]))
    story.append(Paragraph(DOC_TITLE, s["title"]))
    story.append(
        Paragraph(
            "Use this template to send your year-end CAM reconciliation statement to "
            "commercial tenants in Texas. Texas commercial lease law is primarily "
            "lease-driven; obligations arise from the lease agreement rather than from "
            "mandatory state-level disclosure statutes. Review your lease terms carefully "
            "before completing this statement.",
            s["lede"],
        )
    )

    meta_data = [
        [
            Paragraph("<b>Last updated</b><br/>2026-04-27", s["small"]),
            Paragraph("<b>Jurisdiction</b><br/>Texas", s["small"]),
            Paragraph(
                "<b>Statute reference</b><br/>TX Prop. Code §93.012 / §93.002",
                s["small"],
            ),
        ]
    ]
    story.append(
        Table(
            meta_data,
            colWidths=[2.0 * inch, 2.3 * inch, 2.4 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), LIGHT_GRAY),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.white),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ]
            ),
        )
    )
    story.append(Spacer(1, 14))

    story.append(Paragraph("Statement Cover Fields", s["subsection"]))
    cover_fields = [
        ["Property Name:", FILL_BRACKET],
        ["Property Address:", FILL_BRACKET],
        ["County (HCAD / DCAD / TCAD etc.):", FILL_BRACKET],
        ["Tenant Name:", FILL_BRACKET],
        ["Tenant Suite / Unit:", FILL_BRACKET],
        ["Reconciliation Period:", "[January 1, 20XX – December 31, 20XX]"],
        ["Estimated CAM Billed (Prior Year):", "$[              ]"],
        ["Actual CAM Recoverable:", "$[              ]"],
        ["Balance Due / (Credit):", "$[              ]"],
        ["Statement Prepared By:", FILL_BRACKET],
        ["Title:", FILL_BRACKET],
        ["Date of Statement:", FILL_BRACKET],
        ["Contact Phone / Email:", FILL_BRACKET],
    ]
    story.append(
        Table(
            [
                [Paragraph(r, s["label"]), Paragraph(v, s["field"])]
                for r, v in cover_fields
            ],
            colWidths=[2.7 * inch, 4.0 * inch],
            style=TableStyle(
                [
                    (
                        "ROWBACKGROUNDS",
                        (0, 0),
                        (-1, -1),
                        [colors.white, colors.HexColor("#F8FAFC")],
                    ),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ]
            ),
        )
    )
    story.append(PageBreak())
    return story


def _section1_texas_framework(s: dict) -> list:
    story: list = []
    story.append(Paragraph("Section 1 — Texas Statutory Framework", s["section"]))
    story.append(
        Paragraph(
            "Unlike California, Texas does not impose a comprehensive mandatory CAM "
            "disclosure regime for commercial tenants. The primary statutory references "
            "are as follows:",
            s["body"],
        )
    )

    statutes = [
        (
            "TX Property Code §93.012",
            "Addresses security deposits and certain payment obligations under "
            "commercial leases. Does not mandate specific CAM statement formats; "
            "landlord obligations regarding CAM reconciliation are governed primarily "
            "by the lease agreement.",
        ),
        (
            "TX Property Code §93.002",
            "Establishes general commercial landlord-tenant provisions including "
            "access rights, maintenance obligations, and remedy procedures. CAM "
            "billing obligations derive from lease covenants, not from this statute.",
        ),
        (
            "Lease-Driven Obligations",
            "Because Texas commercial lease law is largely lease-driven, the CAM "
            "reconciliation must adhere precisely to the provisions in each tenant's "
            "executed lease, including: (a) CAM pool definitions; (b) exclusion lists; "
            "(c) gross-up language; (d) cap type and structure; (e) base year (if any); "
            "(f) audit rights window and notice requirements.",
        ),
    ]
    story.append(
        Table(
            [
                [Paragraph(f"<b>{t}</b>", s["label"]), Paragraph(d, s["body"])]
                for t, d in statutes
            ],
            colWidths=[1.8 * inch, 4.9 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F0FDF4")),
                    (
                        "ROWBACKGROUNDS",
                        (1, 0),
                        (1, -1),
                        [colors.white, colors.HexColor("#F8FAFC")],
                    ),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#BBF7D0")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#D1FAE5")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ]
            ),
        )
    )
    story.append(Spacer(1, 10))

    story.append(
        Paragraph(
            "<b>Common Texas Lease CAM Provisions to Verify:</b>", s["subsection"]
        )
    )
    common_provisions = [
        (
            "Audit Rights Clause",
            "Most Texas commercial leases include an audit-rights clause allowing "
            "tenant (or tenant's CPA/consultant) to audit CAM charges within a "
            "specified window (commonly 12–24 months from statement delivery). "
            "Verify the window and the notice address.",
        ),
        (
            "CAM Cap (Controllable Expenses)",
            "Many Texas office and retail leases include a per-year cap on "
            "controllable CAM expenses (e.g., 5% annually). Confirm cap type "
            "(cumulative vs. non-cumulative) and which expenses are excluded from "
            "the cap (taxes, insurance, utilities are commonly uncapped).",
        ),
        (
            "Base-Year Escalation",
            "Some Texas leases peg tenant CAM liability to the excess over a "
            "base year amount. Confirm the base year, whether the base was "
            "grossed-up, and any subsequent amendments that reset the base.",
        ),
    ]
    for title, body in common_provisions:
        story.append(
            KeepTogether(
                [
                    Paragraph(f"<b>{title}</b>", s["label"]),
                    Paragraph(body, s["body"]),
                    Spacer(1, 4),
                ]
            )
        )

    story.append(
        Paragraph("<b>Texas-Specific CAM Considerations:</b>", s["subsection"])
    )
    tx_notes = [
        "HCAD (Harris County Appraisal District) property tax assessments can vary "
        "significantly year over year and are a major CAM cost driver in the Houston "
        "market. Attach the HCAD notice of appraised value and tax bill as exhibits.",
        "DCAD, BCAD, and TCAD serve Dallas, Bexar (San Antonio), and Travis (Austin) "
        "counties respectively. Reference the applicable appraisal district on the "
        "cover page.",
        "Texas energy costs — particularly electricity and cooling — are historically "
        "higher than the national average due to climate and grid structure (ERCOT). "
        "Common area HVAC and utilities are routinely among the largest CAM line items "
        "in Texas properties.",
        "Texas has no state income tax, which simplifies certain expense calculations, "
        "but property tax bills can be protested and may be adjusted post-statement. "
        "Note if any prior-year tax assessment is under protest.",
    ]
    for note in tx_notes:
        story.append(Paragraph(f"  •  {note}", s["body"]))
    story.append(PageBreak())
    return story


def _section2_cam_pool(s: dict) -> list:
    story: list = []
    story.append(Paragraph("Section 2 — CAM Pool Summary", s["section"]))
    story.append(
        Paragraph(
            "Complete the gross amount from your GL, identify excluded amounts, and "
            "note Texas-specific line items including HCAD property taxes and "
            "elevated energy/cooling costs.",
            s["body"],
        )
    )

    pool_header = [
        Paragraph("<b>Expense Category</b>", s["label"]),
        Paragraph("<b>Gross Amount ($)</b>", s["label"]),
        Paragraph("<b>Excluded ($)</b>", s["label"]),
        Paragraph("<b>Recoverable ($)</b>", s["label"]),
        Paragraph("<b>TX Notes</b>", s["label"]),
    ]
    pool_rows = [
        ["Janitorial Services", "[          ]", "[          ]", "[          ]", ""],
        [
            "Landscaping & Groundskeeping",
            "[          ]",
            "[          ]",
            "[          ]",
            "",
        ],
        [
            "HVAC Maintenance (Common)",
            "[          ]",
            "[          ]",
            "[          ]",
            "High cost in TX",
        ],
        [
            "Insurance — Property & Liability",
            "[          ]",
            "[          ]",
            "[          ]",
            "",
        ],
        [
            "Management Fees",
            "[          ]",
            "[          ]",
            "[          ]",
            "3–5% typical",
        ],
        ["Security Services", "[          ]", "[          ]", "[          ]", ""],
        [
            "Utilities — Common Areas (Electricity)",
            "[          ]",
            "[          ]",
            "[          ]",
            "ERCOT market",
        ],
        [
            "Utilities — Common Areas (Gas/Water)",
            "[          ]",
            "[          ]",
            "[          ]",
            "",
        ],
        [
            "Property Taxes (HCAD / DCAD / TCAD)",
            "[          ]",
            "[          ]",
            "[          ]",
            "Attach tax bill",
        ],
        [
            "Capital Reserves (per lease)",
            "[          ]",
            "[          ]",
            "[          ]",
            "",
        ],
        [
            "Administrative / Admin Fee",
            "[          ]",
            "[          ]",
            "[          ]",
            "Per lease cap",
        ],
        ["Other: [describe]", "[          ]", "[          ]", "[          ]", ""],
    ]
    subtotal_row = [
        Paragraph("<b>SUBTOTAL — Recoverable CAM Pool</b>", s["label"]),
        Paragraph("<b>[          ]</b>", s["label"]),
        Paragraph("<b>[          ]</b>", s["label"]),
        Paragraph("<b>[          ]</b>", s["label"]),
        "",
    ]

    table_data = [pool_header]
    for row in pool_rows:
        table_data.append(
            [Paragraph(row[0], s["body"])] + [Paragraph(v, s["field"]) for v in row[1:]]
        )
    table_data.append(subtotal_row)

    story.append(
        Table(
            table_data,
            colWidths=[2.0 * inch, 1.0 * inch, 0.9 * inch, 1.0 * inch, 1.8 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -2),
                        [colors.white, colors.HexColor("#F8FAFC")],
                    ),
                    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F0FDF4")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ]
            ),
        )
    )
    story.append(Spacer(1, 10))

    story.append(Paragraph("<b>Gross-Up Calculation</b>", s["subsection"]))
    grossup_data = [
        ["Actual Occupancy During Period:", "[      ]%"],
        ["Gross-Up Threshold (per lease):", "[      ]% (commonly 90% or 95%)"],
        ["Variable Expense Pool Subject to Gross-Up:", "$[              ]"],
        ["Grossed-Up Variable Pool:", "$[              ]"],
        ["Fixed Expense Pool (not grossed up):", "$[              ]"],
        ["Total CAM Pool After Gross-Up:", "$[              ]"],
    ]
    story.append(
        Table(
            [
                [Paragraph(r, s["label"]), Paragraph(v, s["field"])]
                for r, v in grossup_data
            ],
            colWidths=[3.0 * inch, 3.7 * inch],
            style=TableStyle(
                [
                    (
                        "ROWBACKGROUNDS",
                        (0, 0),
                        (-1, -1),
                        [colors.white, colors.HexColor("#F8FAFC")],
                    ),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ]
            ),
        )
    )
    story.append(Spacer(1, 8))
    story.append(Paragraph("<b>Standard Exclusions Applied:</b>", s["label"]))
    exclusions = [
        "Tenant improvement allowances and construction costs",
        "Capital expenditures above lease threshold (unless amortized per lease)",
        "Leasing commissions and marketing costs",
        "Lobbying and political contributions",
        "Owner overhead not attributable to property operations",
        "Mortgage interest, debt service, and depreciation",
        "Any expense specifically excluded in Tenant's lease",
    ]
    for ex in exclusions:
        story.append(Paragraph(f"  •  {ex}", s["body"]))
    story.append(PageBreak())
    return story


def _section3_tenant_allocation(s: dict) -> list:
    story: list = []
    story.append(Paragraph("Section 3 — Tenant Allocation", s["section"]))
    alloc_data = [
        ["Tenant Rentable Area (numerator — GLA):", "[          ] sq ft"],
        ["Total Project Rentable Area (denominator):", "[          ] sq ft"],
        ["Denominator Basis:", "[BOMA 2010 / BOMA 2024 / Lease Defined]"],
        [
            "Anchor / Excluded GLA (if any, netted from denominator):",
            "[          ] sq ft",
        ],
        ["Adjusted Denominator:", "[          ] sq ft"],
        ["Tenant Pro-Rata Share (%):", "[          ]%"],
    ]
    story.append(
        Table(
            [
                [Paragraph(r, s["label"]), Paragraph(v, s["field"])]
                for r, v in alloc_data
            ],
            colWidths=[3.5 * inch, 3.2 * inch],
            style=TableStyle(
                [
                    (
                        "ROWBACKGROUNDS",
                        (0, 0),
                        (-1, -1),
                        [colors.white, colors.HexColor("#F8FAFC")],
                    ),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ]
            ),
        )
    )
    story.append(Spacer(1, 10))
    story.append(Paragraph("<b>True-Up Calculation</b>", s["subsection"]))
    trueup_data = [
        ["Total CAM Pool After Gross-Up:", "$[              ]"],
        ["Tenant Pro-Rata Share (%):", "[          ]%"],
        ["Tenant's Annual CAM Share:", "$[              ]"],
        ["Less: CAM Cap Applied (if applicable):", "($[              ])"],
        ["Less: Prior-Year Monthly Estimates Collected:", "($[              ])"],
        ["Balance Due / (Credit to Tenant):", "$[              ]"],
        ["Payment Due Date:", "[                ]"],
    ]
    story.append(
        Table(
            [
                [Paragraph(r, s["label"]), Paragraph(v, s["field"])]
                for r, v in trueup_data
            ],
            colWidths=[3.5 * inch, 3.2 * inch],
            style=TableStyle(
                [
                    (
                        "ROWBACKGROUNDS",
                        (0, 0),
                        (-1, -2),
                        [colors.white, colors.HexColor("#F8FAFC")],
                    ),
                    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F0FDF4")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ]
            ),
        )
    )
    story.append(PageBreak())
    return story


def _section4_expense_detail(s: dict) -> list:
    story: list = []
    story.append(Paragraph("Section 4 — Expense Detail Schedules", s["section"]))
    story.append(
        Paragraph(
            "Provide a completed schedule for each major expense category. Attach the HCAD "
            "(or applicable appraisal district) tax notice and utility invoices as exhibits.",
            s["body"],
        )
    )
    categories = [
        "Janitorial Services",
        "Landscaping & Groundskeeping",
        "HVAC Maintenance (Common Areas)",
        "Insurance — Property & Liability",
        "Management Fees",
        "Security Services",
        "Utilities — Electricity (Common Areas / ERCOT)",
        "Property Taxes (HCAD / DCAD / TCAD)",
    ]
    for cat in categories:
        story.append(
            KeepTogether(
                [
                    Paragraph(f"<b>{cat}</b>", s["subsection"]),
                    Table(
                        [
                            [
                                Paragraph("<b>Vendor / Payee Name</b>", s["label"]),
                                Paragraph("<b>Description</b>", s["label"]),
                                Paragraph("<b>Invoice Date</b>", s["label"]),
                                Paragraph("<b>Gross Amount</b>", s["label"]),
                                Paragraph("<b>Excluded</b>", s["label"]),
                                Paragraph("<b>Recoverable</b>", s["label"]),
                            ],
                            *[
                                [
                                    Paragraph("[                ]", s["field"]),
                                    Paragraph("[                      ]", s["field"]),
                                    Paragraph("[          ]", s["field"]),
                                    Paragraph("$[          ]", s["field"]),
                                    Paragraph("$[          ]", s["field"]),
                                    Paragraph("$[          ]", s["field"]),
                                ]
                                for _ in range(3)
                            ],
                            [
                                Paragraph("<b>Subtotal</b>", s["label"]),
                                "",
                                "",
                                Paragraph("<b>$[          ]</b>", s["label"]),
                                Paragraph("<b>$[          ]</b>", s["label"]),
                                Paragraph("<b>$[          ]</b>", s["label"]),
                            ],
                        ],
                        colWidths=[
                            1.35 * inch,
                            1.5 * inch,
                            0.8 * inch,
                            0.9 * inch,
                            0.9 * inch,
                            0.85 * inch,
                        ],
                        style=TableStyle(
                            [
                                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                                (
                                    "BACKGROUND",
                                    (0, -1),
                                    (-1, -1),
                                    colors.HexColor("#F0FDF4"),
                                ),
                                (
                                    "ROWBACKGROUNDS",
                                    (0, 1),
                                    (-1, -2),
                                    [colors.white, colors.HexColor("#F8FAFC")],
                                ),
                                (
                                    "BOX",
                                    (0, 0),
                                    (-1, -1),
                                    0.5,
                                    colors.HexColor("#CBD5E1"),
                                ),
                                (
                                    "INNERGRID",
                                    (0, 0),
                                    (-1, -1),
                                    0.3,
                                    colors.HexColor("#E2E8F0"),
                                ),
                                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                ("TOPPADDING", (0, 0), (-1, -1), 4),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                            ]
                        ),
                    ),
                    Spacer(1, 8),
                ]
            )
        )
    story.append(PageBreak())
    return story


def _section5_dispute_rights(s: dict) -> list:
    story: list = []
    story.append(Paragraph("Section 5 — Dispute / Audit Rights Notice", s["section"]))
    story.append(
        Paragraph(
            "NOTICE TO TENANT — AUDIT AND DISPUTE RIGHTS",
            s["subsection"],
        )
    )
    story.append(
        Paragraph(
            "This CAM Reconciliation Statement is provided pursuant to Section [__] of your "
            'lease (the "Lease"). Your rights to audit, dispute, and inspect supporting '
            "documentation are set forth in your Lease and are summarized below.",
            s["body"],
        )
    )
    rights_items = [
        (
            "Audit Rights Window",
            "Under Lease §[__], Tenant has [X] days/months from the date of this statement "
            "to deliver written notice of its election to audit CAM charges. Requests "
            "submitted after the deadline are waived unless otherwise required by law.",
        ),
        (
            "Audit Scope",
            "Tenant (or Tenant's designated CPA/consultant) may audit: (a) GL accounts "
            "included in the CAM pool; (b) vendor invoices for all line items; "
            "(c) management fee calculation; (d) gross-up and pro-rata worksheets; "
            "(e) HCAD/DCAD/TCAD tax bills and any protest correspondence.",
        ),
        (
            "How to Initiate Audit or Dispute",
            "Submit written notice to:\n"
            "Property Manager Name: [PROPERTY MANAGER NAME]\n"
            "Email: [EMAIL ADDRESS]\n"
            "Mailing Address: [MAILING ADDRESS]\n"
            "Landlord will respond within [Y] business days.",
        ),
        (
            "Undisputed Amounts",
            "Undisputed CAM charges remain due and payable by the Payment Due Date shown "
            "in Section 3, regardless of any pending audit or dispute.",
        ),
    ]
    for title, body in rights_items:
        story.append(
            KeepTogether(
                [
                    Paragraph(f"<b>{title}</b>", s["label"]),
                    Paragraph(body, s["body"]),
                    Spacer(1, 4),
                ]
            )
        )
    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "DISCLAIMER: This template is for informational purposes only and does not "
            "constitute legal advice. Texas commercial lease obligations are primarily "
            "contract-driven. Consult qualified legal counsel to confirm compliance with "
            "your specific lease terms and current Texas statutes before sending any "
            "CAM reconciliation statement.",
            s["disclaimer"],
        )
    )
    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "<b>Automate this process with CapVeri.</b> CapVeri generates Texas CAM "
            "reconciliation statements — complete with HCAD tax line items, gross-up, "
            "caps, and pro-rata — from your existing GL export. Start a free portfolio "
            f"audit at {app_url('/register')}.",
            s["small"],
        )
    )
    return story


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

    story: list = []
    story.extend(_cover_page(s))
    story.extend(_section1_texas_framework(s))
    story.extend(_section2_cam_pool(s))
    story.extend(_section3_tenant_allocation(s))
    story.extend(_section4_expense_detail(s))
    story.extend(_section5_dispute_rights(s))

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
