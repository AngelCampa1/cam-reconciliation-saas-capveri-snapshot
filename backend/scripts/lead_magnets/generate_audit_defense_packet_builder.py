"""Generate the Audit Defense Packet Builder PDF.

Output: ``docs/assets/audit-defense-packet-builder.pdf``

A 5–6 page guide for property managers assembling documentation to defend
a CAM reconciliation against a tenant audit.
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

OUTPUT_PATH = docs_assets_dir() / "audit-defense-packet-builder.pdf"
FOOTER_URL = site_url("/resources/audit-defense-packet-builder")
DOC_TITLE = "Audit Defense Packet Builder"
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
        "h3": ParagraphStyle(
            "H3",
            parent=base["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=10.5,
            leading=13,
            textColor=NAVY,
            spaceBefore=10,
            spaceAfter=4,
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
        "mono": ParagraphStyle(
            "Mono",
            parent=base["BodyText"],
            fontName="Courier",
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#374151"),
            leftIndent=12,
            spaceAfter=2,
        ),
        "cover_body": ParagraphStyle(
            "CoverBody",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=14,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=8,
        ),
    }


REQUIRED_DOCS: list[str] = [
    "Signed lease (with CAM exhibit and all amendments)",
    "Prior-year CAM reconciliation statements (minimum 3 years)",
    "Annual GL trial balance — CAM-recoverable accounts only",
    "Vendor invoices for major expense categories (janitorial, landscaping, utilities, insurance, taxes)",
    "Management agreement or management fee schedule",
    "Insurance policy declarations page and premium invoice",
    "Property tax bills for all applicable tax years",
    "Gross-up calculation worksheet showing occupancy rate and variable/fixed expense split",
    "Cap calculation worksheet showing base year amount, cap percentage, and ceiling by tenant",
    "Pro-rata share calculation showing GLA, denominator, and each tenant's percentage",
    "BOMA measurement certification (if applicable or if remeasurement occurred)",
    "Board or ownership approval documentation for capital expenses and admin fee changes",
]

FOLDER_STRUCTURE = [
    "01_Lease_Documents/",
    "   01a_Executed_Lease.pdf",
    "   01b_Amendments/",
    "   01c_CAM_Exhibit.pdf",
    "02_Reconciliation_Statements/",
    "   02a_Current_Year_Statement.pdf",
    "   02b_Prior_Year_Statements/",
    "03_GL_Support/",
    "   03a_Trial_Balance.xlsx",
    "   03b_Pool_Detail.xlsx",
    "   03c_Exclusions_Workpaper.xlsx",
    "04_Calculations/",
    "   04a_Gross_Up_Worksheet.xlsx",
    "   04b_Cap_Worksheet.xlsx",
    "   04c_Pro_Rata_Worksheet.xlsx",
    "05_Vendor_Invoices/",
    "   [sorted by expense category]",
    "06_Insurance_and_Tax/",
    "   06a_Insurance_Declarations.pdf",
    "   06b_Property_Tax_Bills.pdf",
    "07_Management_Docs/",
    "   07a_Management_Agreement.pdf",
    "   07b_Fee_Schedule.pdf",
]

TIMELINE_DATA = [
    ["Day", "Milestone", "Responsible Party"],
    ["Day 0", "Tenant audit request received", "Property Manager"],
    [
        "Day 3",
        "Acknowledge receipt in writing; confirm audit scope and period",
        "Property Manager",
    ],
    [
        "Day 14",
        "Provide complete audit defense packet to tenant / tenant's auditor",
        "Property Manager + Accounting",
    ],
    [
        "Day 30",
        "Respond to tenant's initial questions and document requests",
        "Property Manager + Legal",
    ],
    [
        "Day 45",
        "Provide supplemental documentation if requested",
        "Property Manager + Accounting",
    ],
    [
        "Day 60",
        "Target issue resolution; if unresolved, escalate to legal counsel",
        "Asset Manager + Legal",
    ],
    ["Day 90", "Final resolution deadline (check lease audit-rights clause)", "Legal"],
]

COMMON_ISSUES: list[tuple[str, str, str]] = [
    (
        "Excluded expense included in pool",
        "Review each lease exhibit before distribution; use CapVeri exclusion checker",
        "Exclusions workpaper, annotated lease exhibit",
    ),
    (
        "Wrong pro-rata denominator",
        "Reconcile denominator to current rent roll before sending statement",
        "Rent roll as of reconciliation year-end, BOMA measurement letter",
    ),
    (
        "Cap applied incorrectly",
        "Track cumulative cap bank roll-forward per tenant; review each lease year definition",
        "Cap calculation worksheet with prior-year roll-forward",
    ),
    (
        "Gross-up applied to fixed expenses",
        "Flag fixed vs. variable accounts in pool setup; apply gross-up only to variable",
        "Gross-up worksheet showing variable/fixed split",
    ),
    (
        "Capital expense included without amortization",
        "Review GL detail for capitalized items; amortize over useful life per lease",
        "Fixed asset register, amortization schedule",
    ),
    (
        "Management fee calculated on wrong base",
        "Confirm fee base definition in lease; exclude taxes, insurance from base if required",
        "Management agreement, fee calculation workpaper",
    ),
    (
        "Base year actuals incorrect or not locked",
        "Lock base year in system; document base year actuals in signed workpaper",
        "Original base year reconciliation, system lock confirmation",
    ),
    (
        "No prior-year statements available",
        "Maintain 7-year reconciliation archive; provide 3 years minimum in audit packet",
        "Reconciliation archive (minimum 3 prior years)",
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
        Paragraph("CAPVERI RESOURCE GUIDE", s["eyebrow"]),
        Paragraph(DOC_TITLE, s["title"]),
        Paragraph(
            "When a tenant exercises their audit rights, the quality of your response packet "
            "determines whether the audit resolves quickly or escalates to litigation. This "
            "guide walks you through assembling a complete, defensible audit packet from "
            "document collection through cover letter.",
            s["lede"],
        ),
        Table(
            [
                [
                    Paragraph(f"<b>Last updated</b><br/>{LAST_UPDATED}", s["small"]),
                    Paragraph(
                        "<b>Use case</b><br/>Tenant CAM audit response", s["small"]
                    ),
                    Paragraph(
                        "<b>Audience</b><br/>Property managers &amp; asset managers",
                        s["small"],
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

    # What is an Audit Defense Packet?
    story.append(Paragraph("What Is an Audit Defense Packet?", s["section"]))
    story.append(
        Paragraph(
            "An audit defense packet is the complete set of documents you provide when a tenant "
            "exercises their contractual right to audit CAM reconciliation charges. A well-organized "
            "packet accomplishes three goals:",
            s["body"],
        )
    )
    goal_data = [
        [
            "1. Prove accuracy",
            "Every dollar in the reconciliation is traceable to a GL entry and a vendor invoice.",
        ],
        [
            "2. Demonstrate compliance",
            "The reconciliation follows the lease language on exclusions, caps, gross-up, and pro-rata.",
        ],
        [
            "3. Reduce dispute liability",
            "Proactive disclosure of supporting math reduces the scope of tenant challenges and accelerates resolution.",
        ],
    ]
    story.append(
        Table(
            goal_data,
            colWidths=[2.0 * inch, 4.7 * inch],
            style=TableStyle(
                [
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                    ("ROWBACKGROUNDS", (0, 0), (-1, -1), [LIGHT_GRAY, colors.white]),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("PADDING", (0, 0), (-1, -1), 7),
                    ("LEADING", (0, 0), (-1, -1), 13),
                ]
            ),
        )
    )
    story.append(Spacer(1, 8))

    # Required Documents Checklist
    story.append(Paragraph("Required Documents Checklist", s["section"]))
    story.append(
        Paragraph(
            "Assemble all items below before responding to the tenant. Missing any item "
            "invites follow-up requests and extends the audit timeline.",
            s["body"],
        )
    )
    for doc_item in REQUIRED_DOCS:
        story.append(_build_check_item(doc_item, s))
    story.append(Spacer(1, 8))

    # Document Organization Guide
    story.append(Paragraph("Document Organization Guide", s["section"]))
    story.append(
        Paragraph(
            "Use a consistent folder structure whether your packet is delivered physically or "
            "digitally. The structure below keeps auditors oriented and signals professionalism.",
            s["body"],
        )
    )
    story.append(Paragraph("<b>Recommended folder structure:</b>", s["item_body"]))
    for line in FOLDER_STRUCTURE:
        story.append(Paragraph(line, s["mono"]))
    story.append(Spacer(1, 6))
    story.append(
        Paragraph(
            "<b>File naming convention:</b> Use the format "
            "<i>YYYY_TenantName_PropertyCode_DocumentType_v1.pdf</i>. "
            "Example: <i>2025_AcmeCorp_OAK101_CAMStatement_v1.pdf</i>. "
            "Version numbers prevent confusion when documents are revised during the audit.",
            s["body"],
        )
    )

    # Response Timeline Template
    story.append(Paragraph("Response Timeline Template", s["section"]))
    story.append(
        Paragraph(
            "The timeline below is a best-practice guide. Always check the audit-rights clause "
            "in the specific lease — some leases impose shorter response windows.",
            s["body"],
        )
    )

    timeline_table = Table(
        TIMELINE_DATA,
        colWidths=[0.75 * inch, 3.2 * inch, 2.75 * inch],
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
                ("PADDING", (0, 0), (-1, -1), 6),
                ("LEADING", (0, 0), (-1, -1), 12),
            ]
        ),
    )
    story.append(timeline_table)
    story.append(Spacer(1, 10))

    # Common Audit Issues
    story.append(
        Paragraph("Common Audit Issues & Pre-emptive Documentation", s["section"])
    )
    issues_header = [["Issue", "How to Prevent", "Documentation to Include"]]
    issues_rows = [
        [issue, prevention, docs] for issue, prevention, docs in COMMON_ISSUES
    ]
    issues_table = Table(
        issues_header + issues_rows,
        colWidths=[1.8 * inch, 2.5 * inch, 2.4 * inch],
        style=TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8.5),
                ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ("FONTSIZE", (0, 1), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("PADDING", (0, 0), (-1, -1), 5),
                ("LEADING", (0, 0), (-1, -1), 11),
            ]
        ),
    )
    story.append(issues_table)
    story.append(Spacer(1, 10))

    # Cover Letter Template
    story.append(Paragraph("Cover Letter Template", s["section"]))
    story.append(
        Paragraph(
            "Use this template as the first page of your audit packet. Replace bracketed "
            "placeholders with property-specific information.",
            s["body"],
        )
    )

    letter_text = (
        "[Date]\n\n"
        "[Tenant Name]\n"
        "[Tenant Address]\n\n"
        "Re: CAM Reconciliation Audit — [Property Name], Lease dated [Lease Date]\n"
        "Reconciliation Period: [Period Start] – [Period End]\n\n"
        "Dear [Tenant Contact Name],\n\n"
        "We have received your notice dated [Audit Request Date] requesting an audit of "
        "Common Area Maintenance charges for the above-referenced property and lease. We "
        "welcome the opportunity to demonstrate the accuracy of our reconciliation.\n\n"
        "Enclosed please find the complete audit defense packet, which includes:\n\n"
        "  • Executed lease and all amendments\n"
        "  • CAM reconciliation statements for [Year 1], [Year 2], and [Year 3]\n"
        "  • Annual GL trial balance for CAM-recoverable accounts\n"
        "  • Vendor invoices for major expense categories\n"
        "  • Gross-up, cap, and pro-rata calculation workpapers\n"
        "  • Management agreement and fee schedule\n\n"
        "We have organized these materials in the order of the reconciliation methodology "
        "to facilitate your review. Should you require additional documentation or have "
        "questions regarding any line item, please direct inquiries to [Contact Name] at "
        "[Contact Email] or [Contact Phone].\n\n"
        "We are committed to resolving any questions promptly and respectfully. Please "
        "acknowledge receipt of this packet at your earliest convenience.\n\n"
        "Sincerely,\n\n"
        "[Property Manager Name]\n"
        "[Title]\n"
        "[Company Name]\n"
        "[Date]"
    )

    for line in letter_text.split("\n"):
        story.append(Paragraph(line if line.strip() else "&nbsp;", s["cover_body"]))

    story.append(Spacer(1, 12))
    story.append(
        Paragraph(
            "<b>Build audit-ready packets in minutes.</b> CapVeri generates the full supporting "
            "workpaper set automatically from your GL export. Start a free portfolio audit at "
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
