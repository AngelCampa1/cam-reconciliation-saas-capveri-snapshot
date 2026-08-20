"""Generate the California CAM Reconciliation Statement Template PDF.

Output: ``docs/assets/cam-reconciliation-california.pdf``

A 5-7 page template for property managers in California sending year-end CAM
reconciliation statements to tenants, including SB 1103 statutory notices,
CAM pool summary, tenant allocation, expense detail schedules, and dispute
rights notice.
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

OUTPUT_PATH = docs_assets_dir() / "cam-reconciliation-california.pdf"
FOOTER_URL = site_url("/resources/cam-reconciliation-california")
DOC_TITLE = "California CAM Reconciliation Statement Template"
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
        "notice": ParagraphStyle(
            "Notice",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#1F2937"),
            backColor=colors.HexColor("#FFF7ED"),
            borderPadding=(6, 8, 6, 8),
            spaceAfter=8,
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


def _field_row(label: str, value: str = FILL_BRACKET) -> list:
    return [label, value]


def _cover_page(s: dict) -> list:
    story: list = []
    story.append(Paragraph("CAPVERI STATEMENT TEMPLATE", s["eyebrow"]))
    story.append(Paragraph(DOC_TITLE, s["title"]))
    story.append(
        Paragraph(
            "Use this template to send your year-end CAM reconciliation statement to "
            "commercial tenants in California. Complete every bracketed field before "
            "delivery. California SB 1103 (effective January 1, 2025) adds new "
            "disclosure requirements for small-business tenants — see Section 1.",
            s["lede"],
        )
    )

    meta_data = [
        [
            Paragraph("<b>Last updated</b><br/>2026-04-27", s["small"]),
            Paragraph("<b>Jurisdiction</b><br/>California", s["small"]),
            Paragraph(
                "<b>Statute reference</b><br/>SB 1103 / Civil Code §1950.7", s["small"]
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

    # Property / tenant header fields
    story.append(Paragraph("Statement Cover Fields", s["subsection"]))
    cover_fields = [
        ["Property Name:", FILL_BRACKET],
        ["Property Address:", FILL_BRACKET],
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
            colWidths=[2.3 * inch, 4.4 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.white),
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


def _section1_california_notice(s: dict) -> list:
    story: list = []
    story.append(Paragraph("Section 1 — California Statutory Notice", s["section"]))
    story.append(
        Paragraph(
            "<b>SB 1103 (Effective January 1, 2025) — Small-Business Commercial Tenant Protections</b>",
            s["subsection"],
        )
    )
    story.append(
        Paragraph(
            "California SB 1103, signed into law in September 2024, amends the California "
            "Commercial Code to extend enhanced disclosure rights to qualifying small-business "
            "commercial tenants. A qualifying tenant is one that: (1) has five (5) or fewer "
            "employees at the time of lease execution or renewal, and (2) holds a lease for "
            "premises used primarily for retail, restaurant, or service operations.",
            s["body"],
        )
    )
    story.append(Paragraph("<b>What SB 1103 Requires of Landlords:</b>", s["label"]))
    story.append(Spacer(1, 4))
    sb1103_items = [
        [
            "12-Month Advance Estimate Notice",
            "At least 12 months before the start of each reconciliation year, landlord must "
            "deliver a written itemized estimate of CAM charges to qualifying tenants. "
            "The estimate must break out each major expense category.",
        ],
        [
            "Itemized Annual Reconciliation",
            "Landlord must deliver a fully itemized year-end reconciliation within 90 days "
            "of the close of the reconciliation year (or such period as the lease specifies). "
            "The itemization must match the categories disclosed in the advance estimate.",
        ],
        [
            "Civil Code §1950.7 — Advance Notice",
            "Section 1950.7 provides that a commercial landlord may not impose a CAM charge "
            "that was not disclosed to the tenant in writing prior to the commencement of the "
            "period for which the charge is assessed. For SB 1103 tenants, any new line item "
            "introduced mid-year must be accompanied by written notice.",
        ],
        [
            "Inspection & Audit Rights",
            "Upon written request, qualifying tenants are entitled to inspect and copy "
            "supporting documentation (invoices, vendor contracts, GL extracts) for any "
            "expense line item within [X] days of the request. The landlord must respond "
            "in writing within [Y] days acknowledging the request.",
        ],
        [
            "Dispute Resolution Window",
            "Qualifying tenants must submit written disputes within [X] days of receiving "
            "the reconciliation statement. Landlord must respond within [Y] days. See "
            "Section 5 of this statement for complete dispute procedures.",
        ],
    ]
    story.append(
        Table(
            [
                [Paragraph(f"<b>{t}</b>", s["label"]), Paragraph(d, s["body"])]
                for t, d in sb1103_items
            ],
            colWidths=[1.9 * inch, 4.8 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#EFF6FF")),
                    (
                        "ROWBACKGROUNDS",
                        (1, 0),
                        (1, -1),
                        [colors.white, colors.HexColor("#F8FAFC")],
                    ),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#BFDBFE")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#DBEAFE")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("LEFTPADDING", (0, 0), (-1, -1), 7),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ]
            ),
        )
    )
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "<b>Is This Tenant a Qualifying SB 1103 Tenant?</b> "
            "Check the following before sending:",
            s["label"],
        )
    )
    story.append(Spacer(1, 4))
    checks = [
        "Tenant has 5 or fewer employees (confirm via lease rider or attestation on file)",
        "Lease is for retail, restaurant, or service use",
        "Advance estimate was delivered at least 12 months before this reconciliation year",
        "This statement itemization matches the categories in the advance estimate",
        "Inspection/audit rights notice is included (see Section 5)",
    ]
    for c in checks:
        story.append(Paragraph(f"  ☐  {c}", s["body"]))
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "Note: Even where SB 1103 does not apply (tenant has more than 5 employees), "
            "California Civil Code §1950.7 general advance-notice and itemization principles "
            "remain in effect. This statement template satisfies both standards.",
            s["disclaimer"],
        )
    )
    story.append(PageBreak())
    return story


def _section2_cam_pool(s: dict) -> list:
    story: list = []
    story.append(Paragraph("Section 2 — CAM Pool Summary", s["section"]))
    story.append(
        Paragraph(
            "The table below summarizes all expenses included in the Common Area Maintenance "
            "pool for the reconciliation period. Complete the 'Gross Amount' column from your "
            "GL, identify excluded amounts, and confirm gross-up where applicable.",
            s["body"],
        )
    )

    pool_header = [
        Paragraph("<b>Expense Category</b>", s["label"]),
        Paragraph("<b>Gross Amount ($)</b>", s["label"]),
        Paragraph("<b>Excluded Amount ($)</b>", s["label"]),
        Paragraph("<b>Recoverable Amount ($)</b>", s["label"]),
        Paragraph("<b>Notes</b>", s["label"]),
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
            "",
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
            "3–5% of recoverable",
        ],
        ["Security Services", "[          ]", "[          ]", "[          ]", ""],
        [
            "Utilities — Common Areas",
            "[          ]",
            "[          ]",
            "[          ]",
            "",
        ],
        ["Property Taxes", "[          ]", "[          ]", "[          ]", ""],
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
            colWidths=[1.95 * inch, 1.05 * inch, 1.05 * inch, 1.1 * inch, 1.55 * inch],
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
                    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#EFF6FF")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 5),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
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
    story.append(
        Paragraph("<b>Standard Exclusions Applied to This Pool:</b>", s["label"])
    )
    exclusions = [
        "Tenant improvement allowances and construction costs",
        "Capital expenditures above lease threshold (depreciable items unless amortized per lease)",
        "Leasing commissions and marketing costs",
        "Lobbying, political contributions, or charitable donations",
        "Cost of initial leasing activities (new tenant fit-out)",
        "Owner overhead not directly attributable to property operations",
        "Mortgage interest, debt service, or depreciation",
        "Any expense specifically excluded in Tenant's lease",
    ]
    for ex in exclusions:
        story.append(Paragraph(f"  •  {ex}", s["body"]))
    story.append(PageBreak())
    return story


def _section3_tenant_allocation(s: dict) -> list:
    story: list = []
    story.append(Paragraph("Section 3 — Tenant Allocation", s["section"]))
    story.append(
        Paragraph(
            "The tenant's pro-rata share is calculated by dividing the tenant's Gross Leasable "
            "Area (GLA) by the total project GLA (or as defined in the lease). Where the lease "
            "references BOMA standards, confirm the measurement year and standard (BOMA 2010 or "
            "BOMA 2024).",
            s["body"],
        )
    )
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
                    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#EFF6FF")),
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
            "Attach a completed grid for each major expense category. A template grid is "
            "provided below. Duplicate as needed for each category (janitorial, landscaping, "
            "HVAC, insurance, management fees, security, utilities, property tax, etc.).",
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
        "Utilities — Common Areas",
        "Property Taxes",
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
                                Paragraph("<b>Excluded Amount</b>", s["label"]),
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
                                    colors.HexColor("#EFF6FF"),
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
    story.append(Paragraph("Section 5 — Dispute Rights Notice", s["section"]))
    story.append(
        Paragraph(
            "NOTICE TO TENANT — INSPECTION AND DISPUTE RIGHTS",
            s["subsection"],
        )
    )
    story.append(
        Paragraph(
            "This CAM Reconciliation Statement is provided pursuant to Section [__] of your "
            'lease (the "Lease") for the above-referenced premises. Tenant has the right to '
            "inspect the supporting documentation for this statement as follows:",
            s["body"],
        )
    )

    rights_items = [
        (
            "Inspection Window",
            "Tenant must submit a written request to inspect supporting documentation within "
            "[X] days of the date of this statement. Requests submitted after this deadline "
            "may be declined at Landlord's discretion in accordance with Lease §[__].",
        ),
        (
            "Documents Available for Inspection",
            "Landlord will make available: (a) GL trial balance for the reconciliation year; "
            "(b) vendor invoices for all line items over $[X]; (c) management fee invoice "
            "and calculation; (d) property tax bills; (e) insurance certificates and premium "
            "invoices; (f) gross-up and pro-rata calculation worksheets.",
        ),
        (
            "How to Request Inspection",
            "Submit written request to:\n"
            "Property Manager Name: [PROPERTY MANAGER NAME]\n"
            "Email: [EMAIL ADDRESS]\n"
            "Mailing Address: [MAILING ADDRESS]\n"
            "Landlord will respond within [Y] business days to schedule inspection.",
        ),
        (
            "Dispute Procedure",
            "If Tenant disputes any line item, Tenant must deliver written notice specifying "
            "each disputed item and the basis for the dispute within [Z] days of this "
            "statement date. Undisputed amounts remain due and payable by the Payment Due Date "
            "shown in Section 3.",
        ),
        (
            "SB 1103 Qualifying Tenants",
            "If Tenant is a qualifying small-business tenant under California SB 1103 "
            "(5 or fewer employees), Tenant's inspection and audit rights are governed by "
            "both the Lease and California law. Contact the property manager if you have "
            "questions about your status.",
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
            "DISCLAIMER: This template is provided for informational purposes only and does "
            "not constitute legal advice. California law changes frequently. Property managers "
            "should consult qualified legal counsel to confirm compliance with current "
            "California statutes and the specific terms of each tenant's lease before sending "
            "any CAM reconciliation statement.",
            s["disclaimer"],
        )
    )
    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "<b>Automate this process with CapVeri.</b> CapVeri generates fully compliant "
            "California CAM reconciliation statements — complete with SB 1103 disclosure "
            "notices, gross-up, caps, and pro-rata calculations — from your existing GL "
            f"export. Start a free portfolio audit at {app_url('/register')}.",
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
    story.extend(_section1_california_notice(s))
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
