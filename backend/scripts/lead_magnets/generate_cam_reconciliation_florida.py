"""Generate the Florida CAM Reconciliation Statement Template PDF.

Output: ``docs/assets/cam-reconciliation-florida.pdf``

A 4-6 page template for property managers in Florida sending year-end CAM
reconciliation statements to commercial tenants. Covers Florida Statute
Chapter 83 statutory framework, hurricane/windstorm insurance line items,
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

OUTPUT_PATH = docs_assets_dir() / "cam-reconciliation-florida.pdf"
FOOTER_URL = site_url("/resources/cam-reconciliation-florida")
DOC_TITLE = "Florida CAM Reconciliation Statement Template"
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
            "commercial tenants in Florida. Florida commercial lease law is primarily "
            "lease-driven under Chapter 83 of the Florida Statutes. Florida-specific "
            "CAM items — including hurricane/windstorm insurance and flood insurance — "
            "are addressed in Section 1 and the CAM pool summary.",
            s["lede"],
        )
    )

    meta_data = [
        [
            Paragraph("<b>Last updated</b><br/>2026-04-27", s["small"]),
            Paragraph("<b>Jurisdiction</b><br/>Florida", s["small"]),
            Paragraph(
                "<b>Statute reference</b><br/>FL Stat. Ch. 83 / §83.001 / §83.43",
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
        ["County:", FILL_BRACKET],
        ["Tenant Name:", FILL_BRACKET],
        ["Tenant Suite / Unit:", FILL_BRACKET],
        ["Reconciliation Period:", "[January 1, 20XX – December 31, 20XX]"],
        ["Hurricane Season Coverage Year:", "[20XX]"],
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
            colWidths=[2.5 * inch, 4.2 * inch],
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


def _section1_florida_framework(s: dict) -> list:
    story: list = []
    story.append(Paragraph("Section 1 — Florida Statutory Framework", s["section"]))
    story.append(
        Paragraph(
            "Florida commercial leases are governed primarily by Chapter 83 of the Florida "
            "Statutes, which is less prescriptive than California's commercial tenant "
            "protection statutes. Key statutory references:",
            s["body"],
        )
    )

    statutes = [
        (
            "FL Stat. §83.001",
            "Establishes the scope of Chapter 83 (Landlord and Tenant). The chapter "
            "covers both residential and commercial landlord-tenant relationships; "
            "Part I (§§83.001–83.251) applies to nonresidential tenancies. "
            "CAM obligations are governed by the lease, not by Part I mandates.",
        ),
        (
            "FL Stat. §83.43",
            "Provides definitions applicable to residential tenancies. For commercial "
            "leases, definitional terms follow the lease agreement. Property managers "
            "should ensure that CAM definitions in the lease (recoverable expenses, "
            "controllable expenses, gross-up, etc.) are clearly defined and consistently "
            "applied in each statement.",
        ),
        (
            "Lease-Driven Obligations",
            "Florida commercial leases typically specify: (a) CAM pool definitions and "
            "exclusions; (b) gross-up provisions; (c) expense cap structure; (d) base year "
            "or expense stop; (e) audit rights window and procedure; (f) insurance "
            "pass-through obligations. Review each of these provisions before finalizing "
            "this statement.",
        ),
    ]
    story.append(
        Table(
            [
                [Paragraph(f"<b>{t}</b>", s["label"]), Paragraph(d, s["body"])]
                for t, d in statutes
            ],
            colWidths=[1.65 * inch, 5.05 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#FFF7ED")),
                    (
                        "ROWBACKGROUNDS",
                        (1, 0),
                        (1, -1),
                        [colors.white, colors.HexColor("#F8FAFC")],
                    ),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#FED7AA")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#FDBA74")),
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
            "<b>Florida-Specific CAM Considerations — Hurricane & Storm Expenses</b>",
            s["subsection"],
        )
    )
    story.append(
        Paragraph(
            "Florida's geographic exposure to hurricanes and tropical storms creates CAM "
            "line items that are uncommon in other states. Review the following before "
            "finalizing the CAM pool:",
            s["body"],
        )
    )
    fl_items = [
        (
            "Hurricane / Windstorm Insurance",
            "Wind and hurricane insurance is a standard, separately quoted policy in "
            "Florida (unlike most other states where it is bundled with property insurance). "
            "Many Florida commercial leases explicitly require the landlord to carry "
            "windstorm coverage and pass the full premium through to tenants. Confirm "
            "the lease's insurance pass-through clause covers windstorm. Attach the "
            "windstorm policy declarations page as an exhibit.",
        ),
        (
            "Flood Insurance",
            "Depending on the property's FEMA flood zone designation, flood insurance "
            "may be required by lender or carried voluntarily. Confirm the lease's "
            "insurance recovery clause extends to flood coverage. Attach FEMA FIRM panel "
            "and flood policy declarations if applicable.",
        ),
        (
            "Hurricane Shutter Maintenance & Replacement",
            "Properties with hurricane shutters, impact windows, or storm panels incur "
            "maintenance and periodic replacement costs. These are commonly recoverable "
            "as operating expenses if the lease defines them as such. Confirm whether "
            "the lease excludes capital replacements above a dollar threshold.",
        ),
        (
            "Storm Debris Removal & Landscaping Restoration",
            "Post-storm landscaping restoration and debris removal are recoverable in "
            "the year incurred if the lease permits. Document the storm event and "
            "attach vendor invoices. If costs are extraordinary (major named storm), "
            "consider whether the lease has a force majeure or insurance-proceeds "
            "offset provision.",
        ),
        (
            "Property Taxes — No Homestead Exemption",
            "Florida's homestead exemption (Article VII, §6 of the Florida Constitution) "
            "applies only to residential property. Commercial properties receive no "
            "homestead exemption. Property taxes are fully assessable and recoverable "
            "under the lease. Note that Florida property taxes are assessed as of "
            "January 1 each year and paid the following November through March.",
        ),
    ]
    for title, body in fl_items:
        story.append(
            KeepTogether(
                [
                    Paragraph(f"<b>{title}</b>", s["label"]),
                    Paragraph(body, s["body"]),
                    Spacer(1, 4),
                ]
            )
        )
    story.append(PageBreak())
    return story


def _section2_cam_pool(s: dict) -> list:
    story: list = []
    story.append(Paragraph("Section 2 — CAM Pool Summary", s["section"]))
    story.append(
        Paragraph(
            "Complete the gross amount from your GL. Florida-specific line items "
            "(hurricane/windstorm insurance, flood insurance, hurricane shutter maintenance) "
            "are included in the standard pool below.",
            s["body"],
        )
    )

    pool_header = [
        Paragraph("<b>Expense Category</b>", s["label"]),
        Paragraph("<b>Gross Amount ($)</b>", s["label"]),
        Paragraph("<b>Excluded ($)</b>", s["label"]),
        Paragraph("<b>Recoverable ($)</b>", s["label"]),
        Paragraph("<b>FL Notes</b>", s["label"]),
    ]
    pool_rows = [
        ["Janitorial Services", "[          ]", "[          ]", "[          ]", ""],
        [
            "Landscaping & Groundskeeping",
            "[          ]",
            "[          ]",
            "[          ]",
            "Incl. storm restoration",
        ],
        [
            "HVAC Maintenance (Common)",
            "[          ]",
            "[          ]",
            "[          ]",
            "High cost in FL",
        ],
        [
            "Insurance — Property & General Liability",
            "[          ]",
            "[          ]",
            "[          ]",
            "",
        ],
        [
            "Insurance — Hurricane / Windstorm",
            "[          ]",
            "[          ]",
            "[          ]",
            "FL-specific; attach decl.",
        ],
        [
            "Insurance — Flood (if applicable)",
            "[          ]",
            "[          ]",
            "[          ]",
            "Attach FEMA zone / policy",
        ],
        [
            "Hurricane Shutter Maintenance",
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
            "Utilities — Common Areas",
            "[          ]",
            "[          ]",
            "[          ]",
            "",
        ],
        [
            "Property Taxes (No homestead exemption)",
            "[          ]",
            "[          ]",
            "[          ]",
            "Paid Nov–Mar",
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
                    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFF7ED")),
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
        "Owner overhead not attributable to property operations",
        "Mortgage interest, debt service, and depreciation",
        "Insurance proceeds received for any insured loss (reduces the net recoverable)",
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
                    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FFF7ED")),
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
            "Provide a completed schedule for each major expense category. Attach "
            "insurance declarations pages (property, windstorm, flood) and the "
            "county property tax bill as exhibits.",
            s["body"],
        )
    )
    categories = [
        "Janitorial Services",
        "Landscaping & Groundskeeping (incl. storm restoration)",
        "HVAC Maintenance (Common Areas)",
        "Insurance — Property & General Liability",
        "Insurance — Hurricane / Windstorm",
        "Insurance — Flood",
        "Hurricane Shutter Maintenance",
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
                                    colors.HexColor("#FFF7ED"),
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
            'lease (the "Lease"). Your rights to audit, dispute, and inspect supporting '
            "documentation are governed by your Lease.",
            s["body"],
        )
    )
    rights_items = [
        (
            "Inspection Window",
            "Tenant must submit a written request to inspect supporting documentation "
            "within [X] days of this statement date. Requests received after this deadline "
            "may be declined in accordance with Lease §[__].",
        ),
        (
            "Documents Available for Inspection",
            "Landlord will make available: (a) GL trial balance; (b) vendor invoices for "
            "all line items over $[X]; (c) insurance declarations pages including windstorm "
            "and flood policies; (d) county property tax bill; (e) hurricane shutter "
            "maintenance invoices; (f) management fee calculation; (g) gross-up and "
            "pro-rata worksheets.",
        ),
        (
            "How to Request Inspection",
            "Submit written request to:\n"
            "Property Manager Name: [PROPERTY MANAGER NAME]\n"
            "Email: [EMAIL ADDRESS]\n"
            "Mailing Address: [MAILING ADDRESS]\n"
            "Landlord will respond within [Y] business days.",
        ),
        (
            "Dispute Procedure",
            "If Tenant disputes any line item, Tenant must deliver written notice "
            "specifying each disputed amount and the basis for dispute within [Z] days "
            "of this statement date. Undisputed amounts remain due and payable by "
            "the Payment Due Date shown in Section 3.",
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
            "constitute legal advice. Florida law and FEMA flood zone maps change frequently. "
            "Consult qualified legal counsel to confirm compliance with your specific lease "
            "terms and current Florida statutes before sending any CAM reconciliation statement.",
            s["disclaimer"],
        )
    )
    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "<b>Automate this process with CapVeri.</b> CapVeri generates Florida CAM "
            "reconciliation statements — including hurricane insurance line items, gross-up, "
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
    story.extend(_section1_florida_framework(s))
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
