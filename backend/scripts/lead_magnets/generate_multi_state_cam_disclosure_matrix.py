"""Generate the Multi-State CAM Disclosure Requirements Matrix PDF.

Output: ``docs/assets/multi-state-cam-disclosure-matrix.pdf``

A 6-8 page reference guide for property managers and asset managers with
multi-state CRE portfolios. Covers 15 key states, California SB 1103
deep-dive, Texas/Florida brief notes, and a practical pre-send checklist.
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

OUTPUT_PATH = docs_assets_dir() / "multi-state-cam-disclosure-matrix.pdf"
FOOTER_URL = site_url("/resources/multi-state-cam-disclosure")
DOC_TITLE = "Multi-State CAM Disclosure Requirements Matrix"
LAST_UPDATED = "2026-04-27"

CHECKBOX = "☐"

YES = "Yes"
NO = "No"
LEASE = "Lease-dep."
NA = "N/A"


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
        "matrix_hdr": ParagraphStyle(
            "MatrixHdr",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9.5,
            textColor=colors.white,
        ),
        "matrix_cell": ParagraphStyle(
            "MatrixCell",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=7.5,
            leading=9.5,
            textColor=colors.HexColor("#1F2937"),
        ),
        "matrix_state": ParagraphStyle(
            "MatrixState",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=7.5,
            leading=9.5,
            textColor=NAVY,
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
        "item_title": ParagraphStyle(
            "ItemTitle",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=10,
            leading=12.5,
            textColor=NAVY,
            spaceAfter=2,
        ),
    }


# Multi-state matrix data:
# State | Key Statutes | Written stmt req? | Delivery Deadline | Audit Rights | Advance Notice for Estimates? | Notable Obligations
STATE_MATRIX = [
    (
        "CA",
        "Civil Code §1950.7; SB 1103 (2025)",
        YES,
        "90 days post year-end (lease may shorten)",
        YES,
        "Yes — 12-mo advance for SB 1103 tenants",
        "SB 1103 small-biz protections (≤5 employees). Itemized estimate required. Strongest tenant rights in the US.",
    ),
    (
        "TX",
        "Prop. Code §93.012; §93.002",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "Primarily lease-driven. No mandatory disclosure statute. HCAD tax assessments are major cost driver.",
    ),
    (
        "FL",
        "FL Stat. Ch. 83 §83.001; §83.43",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "Hurricane/windstorm insurance is FL-specific recoverable item. No homestead exemption on commercial. Lease-driven.",
    ),
    (
        "NY",
        "RPL §226-b (residential only); commercial = lease-driven",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "NYC commercial leases typically specify 6–12 mo audit window. High management fee scrutiny in NYC market.",
    ),
    (
        "IL",
        "765 ILCS 720 (Landlord-Tenant); commercial = lease-driven",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "Chicago RPBSA applies only to residential. Commercial obligations are entirely lease-driven.",
    ),
    (
        "GA",
        "O.C.G.A. §44-7 (commercial = lease-driven)",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "Atlanta market has well-developed lease standards; audit rights commonly 12–24 months. No state disclosure mandate.",
    ),
    (
        "CO",
        "CRS §38-12 (residential); commercial = lease-driven",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "Denver market trending toward stronger audit-rights provisions. No state-level mandatory CAM disclosure.",
    ),
    (
        "WA",
        "RCW 59.18 (residential); commercial = lease-driven",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "Seattle commercial market. No mandatory CAM disclosure statute. Lease audit rights standard practice.",
    ),
    (
        "AZ",
        "ARS §33-1315; §33-361 (commercial provisions)",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "Phoenix/Scottsdale market. ARS §33-361 governs commercial tenancy defaults. No specific CAM disclosure mandate.",
    ),
    (
        "NC",
        "NCGS §42-14 (notice); commercial = lease-driven",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "Charlotte/Raleigh market. Lease-driven. Standard commercial lease audit rights provisions apply.",
    ),
    (
        "NJ",
        "NJSA 46:8-1 (residential); commercial = lease-driven",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "NJ commercial leases vary by market (NYC metro vs. suburban). No mandatory CAM disclosure statute.",
    ),
    (
        "OH",
        "ORC §5321 (residential); commercial = lease-driven",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "Columbus/Cleveland markets. Lease-driven. Standard CAM practices; no state disclosure statute.",
    ),
    (
        "PA",
        "68 P.S. §250.101 (Landlord-Tenant Act — limited commercial scope)",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "Philadelphia/Pittsburgh markets. PA Landlord-Tenant Act has limited commercial scope. Primarily lease-driven.",
    ),
    (
        "VA",
        "VA Code §55.1-1200 (residential); commercial = lease-driven",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "Northern VA / DC metro. No mandatory commercial CAM disclosure. Lease terms govern audit window.",
    ),
    (
        "MA",
        "MGL c.186 (Landlord-Tenant); commercial = lease-driven",
        LEASE,
        "Lease-defined",
        LEASE,
        "Lease-defined",
        "Boston market. MA c.186 has limited commercial application. No CAM disclosure mandate; strong lease audit practice.",
    ),
]


def _exec_summary(s: dict) -> list:
    story: list = []
    story.append(Paragraph("CAPVERI REFERENCE GUIDE", s["eyebrow"]))
    story.append(Paragraph(DOC_TITLE, s["title"]))
    story.append(
        Paragraph(
            "This matrix summarizes CAM disclosure requirements, tenant audit rights, and "
            "key compliance obligations across 15 states where commercial real estate "
            "portfolios are commonly concentrated. Use it to confirm your reconciliation "
            "process meets the requirements in each jurisdiction before sending year-end "
            "statements.",
            s["lede"],
        )
    )

    meta_data = [
        [
            Paragraph("<b>Last updated</b><br/>2026-04-27", s["small"]),
            Paragraph(
                "<b>States covered</b><br/>15 (CA, TX, FL, NY, IL, GA, CO, WA, AZ, NC, NJ, OH, PA, VA, MA)",
                s["small"],
            ),
            Paragraph(
                "<b>Audience</b><br/>Multi-state property managers, asset managers",
                s["small"],
            ),
        ]
    ]
    story.append(
        Table(
            meta_data,
            colWidths=[1.5 * inch, 3.3 * inch, 2.0 * inch],
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

    story.append(Paragraph("What Is CAM Disclosure?", s["subsection"]))
    story.append(
        Paragraph(
            "Common Area Maintenance (CAM) disclosure refers to a landlord's obligation — "
            "whether statutory or contractual — to provide commercial tenants with an "
            "itemized accounting of operating expenses charged to them as part of their "
            "annual CAM reconciliation. CAM typically includes janitorial, landscaping, "
            "HVAC maintenance, insurance, management fees, utilities for common areas, "
            "and property taxes.",
            s["body"],
        )
    )
    story.append(
        Paragraph("Why Disclosure Requirements Vary by State", s["subsection"])
    )
    story.append(
        Paragraph(
            "The United States has no federal commercial landlord-tenant statute governing "
            "CAM disclosure. Obligations arise from three sources: (1) state statute — only "
            "a handful of states have enacted meaningful commercial tenant disclosure laws, "
            "with California leading the way via SB 1103; (2) local ordinance — some "
            "cities (e.g., San Francisco, New York City) have enacted local protections; "
            "and (3) the lease agreement itself — in most states, the lease is the primary "
            "and sometimes exclusive source of CAM reconciliation obligations.",
            s["body"],
        )
    )
    story.append(Paragraph("How to Use This Matrix", s["subsection"]))
    story.append(
        Paragraph(
            "1. Find each state where you hold properties in the matrix on pages 2-3. "
            "2. Note whether a written statement is mandatory or lease-driven. "
            "3. Check the delivery deadline and audit rights columns. "
            "4. Review the 'Notable Obligations' column for jurisdiction-specific "
            "compliance flags. "
            "5. Before sending any statement, complete the practical checklist on the "
            "final page of this guide.",
            s["body"],
        )
    )
    story.append(
        Paragraph(
            "IMPORTANT: This matrix is for general informational purposes. Laws change; "
            "consult legal counsel for your specific jurisdiction before sending any "
            "CAM reconciliation statement.",
            s["disclaimer"],
        )
    )
    story.append(PageBreak())
    return story


def _matrix_table(s: dict) -> list:
    story: list = []
    story.append(Paragraph("State-by-State CAM Disclosure Matrix", s["section"]))

    header = [
        Paragraph("<b>State</b>", s["matrix_hdr"]),
        Paragraph("<b>Key Statute(s)</b>", s["matrix_hdr"]),
        Paragraph("<b>Written Stmt Required?</b>", s["matrix_hdr"]),
        Paragraph("<b>Delivery Deadline</b>", s["matrix_hdr"]),
        Paragraph("<b>Tenant Audit Rights</b>", s["matrix_hdr"]),
        Paragraph("<b>Advance Notice for Estimates?</b>", s["matrix_hdr"]),
        Paragraph("<b>Notable Obligations / Landlord Risk</b>", s["matrix_hdr"]),
    ]

    def _yes_no_style(val: str) -> ParagraphStyle:
        if val == YES:
            return ParagraphStyle(
                "_yes",
                parent=s["matrix_cell"],
                textColor=colors.HexColor("#166534"),
                fontName="Helvetica-Bold",
            )
        if val == NO:
            return ParagraphStyle(
                "_no",
                parent=s["matrix_cell"],
                textColor=colors.HexColor("#991B1B"),
                fontName="Helvetica-Bold",
            )
        return s["matrix_cell"]

    rows = [header]
    for i, (state, statutes, written, deadline, audit, advance, notable) in enumerate(
        STATE_MATRIX
    ):
        rows.append(
            [
                Paragraph(state, s["matrix_state"]),
                Paragraph(statutes, s["matrix_cell"]),
                Paragraph(written, _yes_no_style(written)),
                Paragraph(deadline, s["matrix_cell"]),
                Paragraph(audit, _yes_no_style(audit)),
                Paragraph(advance, s["matrix_cell"]),
                Paragraph(notable, s["matrix_cell"]),
            ]
        )

    col_widths = [
        0.38 * inch,
        1.3 * inch,
        0.72 * inch,
        0.72 * inch,
        0.72 * inch,
        0.78 * inch,
        2.58 * inch,
    ]
    table_style = TableStyle(
        [
            ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
            (
                "ROWBACKGROUNDS",
                (0, 1),
                (-1, -1),
                [colors.white, colors.HexColor("#F8FAFC")],
            ),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]
    )
    story.append(Table(rows, colWidths=col_widths, style=table_style, repeatRows=1))
    story.append(Spacer(1, 8))
    story.append(
        Paragraph(
            "Legend: Yes = statutory obligation; Lease-dep. = obligation arises from lease, "
            "not statute; N/A = not applicable. This matrix reflects the state of the law as "
            "of April 2026. Laws change; verify current requirements with legal counsel.",
            s["small"],
        )
    )
    story.append(PageBreak())
    return story


def _california_deep_dive(s: dict) -> list:
    story: list = []
    story.append(Paragraph("California Deep-Dive — SB 1103", s["section"]))
    story.append(
        Paragraph(
            "California is the only U.S. state with a comprehensive, mandatory commercial "
            "tenant disclosure statute for CAM charges. SB 1103, signed in September 2024 "
            "and effective January 1, 2025, is the most significant change to California "
            "commercial landlord-tenant law in a decade.",
            s["body"],
        )
    )

    sb_items = [
        (
            "Who Is Protected?",
            "Qualifying tenants are commercial lessees with five (5) or fewer employees "
            "at the time of lease execution or renewal. The business must occupy the "
            "premises for retail, restaurant, or service operations. Industrial, office, "
            "and warehouse tenants may not qualify depending on business classification.",
        ),
        (
            "12-Month Advance Estimate Requirement",
            "At least 12 months before the start of each reconciliation year, landlords "
            "must deliver a written, itemized estimate of projected CAM charges to "
            "qualifying tenants. The estimate must break out each major expense category "
            "in the same format as the year-end reconciliation statement. Failure to "
            "deliver the advance estimate on time exposes the landlord to challenge of "
            "any charge not previously estimated.",
        ),
        (
            "Itemized Annual Reconciliation",
            "Landlords must deliver a fully itemized reconciliation statement within "
            "90 days of the close of the reconciliation year (or such shorter period "
            "as the lease specifies). The itemization must match the categories in the "
            "advance estimate. New line items introduced mid-year must be disclosed "
            "with advance written notice per Civil Code §1950.7.",
        ),
        (
            "Civil Code §1950.7 — Advance Notice Principle",
            "Section 1950.7 provides that a commercial landlord may not impose a CAM "
            "charge that was not disclosed in writing to the tenant before the period "
            "for which the charge is assessed. SB 1103 operationalizes this principle "
            "for qualifying tenants via the 12-month advance estimate requirement.",
        ),
        (
            "Inspection and Audit Rights",
            "Upon written request, qualifying tenants have the right to inspect and copy "
            "supporting documentation (invoices, vendor contracts, GL extracts) for any "
            "expense line item. Landlord must acknowledge the request in writing and "
            "make documentation available within a commercially reasonable time.",
        ),
        (
            "Dispute Resolution",
            "Qualifying tenants must submit written disputes within the window specified "
            "in the lease (typically 60–180 days of statement delivery). Landlord must "
            "respond in writing. Where SB 1103 and the lease conflict, California courts "
            "will generally apply the more protective of the two standards.",
        ),
        (
            "Landlord Risk Profile Under SB 1103",
            "Failure to comply with SB 1103 can result in: (1) loss of the right to "
            "collect the undisclosed charge; (2) tenant claims for overpaid amounts; "
            "(3) extended dispute windows; (4) exposure in unlawful detainer proceedings "
            "if the tenant withholds disputed amounts. California is the highest-risk "
            "jurisdiction for CAM reconciliation compliance in the U.S.",
        ),
    ]

    for title, body in sb_items:
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


def _tx_fl_notes(s: dict) -> list:
    story: list = []
    story.append(Paragraph("Texas and Florida — Brief Notes", s["section"]))

    story.append(Paragraph("Texas", s["subsection"]))
    story.append(
        Paragraph(
            "Texas Property Code §93.012 and §93.002 establish basic commercial landlord-"
            "tenant rules but do not mandate CAM disclosure. CAM obligations are "
            "contractual. Key Texas-specific factors:",
            s["body"],
        )
    )
    tx_bullets = [
        "HCAD (Harris County), DCAD (Dallas), BCAD (Bexar), TCAD (Travis) property tax "
        "assessments are a major CAM cost driver and should be attached as exhibits.",
        "Texas energy costs (ERCOT grid) make electricity a disproportionate share of "
        "common area utilities — ensure your lease specifies passthrough scope.",
        "Audit rights provisions in Texas leases commonly run 12–24 months. Confirm the "
        "window with each tenant's lease before sending.",
        "Texas has no state income tax, which simplifies some expense calculations but "
        "does not reduce property tax exposure.",
        "If a property tax protest is pending, note the under-protest status in the "
        "reconciliation and use a contingent liability reserve.",
    ]
    for b in tx_bullets:
        story.append(Paragraph(f"  •  {b}", s["body"]))

    story.append(Spacer(1, 10))
    story.append(Paragraph("Florida", s["subsection"]))
    story.append(
        Paragraph(
            "Florida Statute Chapter 83 governs commercial landlord-tenant relationships "
            "but does not impose mandatory CAM disclosure requirements. Key Florida-"
            "specific factors:",
            s["body"],
        )
    )
    fl_bullets = [
        "Hurricane and windstorm insurance is a standard separately-billed line item in "
        "Florida. Most Florida commercial leases explicitly pass through windstorm premiums.",
        "Flood insurance may be required by lender or carried voluntarily — confirm "
        "the lease's insurance pass-through language covers flood.",
        "Hurricane shutter maintenance and storm debris removal are commonly recoverable "
        "operating expenses; confirm the lease's capital threshold.",
        "Florida property taxes are assessed as of January 1 and paid November–March of "
        "the following year. The Florida homestead exemption does not apply to commercial "
        "property.",
        "Post-storm extraordinary expenses (named hurricane events) may require separate "
        "disclosure if material; confirm whether the lease has a force majeure or "
        "insurance-proceeds offset provision.",
    ]
    for b in fl_bullets:
        story.append(Paragraph(f"  •  {b}", s["body"]))
    story.append(PageBreak())
    return story


def _checklist_page(s: dict) -> list:
    story: list = []
    story.append(
        Paragraph("Practical Checklist — Multi-State CAM Pre-Send Review", s["section"])
    )
    story.append(
        Paragraph(
            "Before sending your CAM reconciliation statement to any tenant in a multi-state "
            "portfolio, verify the following for each property:",
            s["body"],
        )
    )
    checklist_items = [
        (
            "Identify the governing jurisdiction",
            "Confirm which state (and county/city) law applies to each property. Check "
            "for any local ordinances that supplement or override state law.",
        ),
        (
            "Check for statutory disclosure obligations",
            "California (SB 1103) is currently the only state with mandatory itemized "
            "CAM disclosure requirements for qualifying tenants. Confirm whether each "
            "California tenant qualifies under the 5-employee threshold.",
        ),
        (
            "Review lease CAM provisions",
            "For every tenant in every jurisdiction: confirm pool definitions, exclusion "
            "list, gross-up clause, cap type, base year (if any), statement delivery "
            "deadline, and audit rights window.",
        ),
        (
            "Deliver California advance estimates on time",
            "SB 1103 requires a 12-month advance itemized estimate for qualifying "
            "California tenants. Build this into your annual calendar — typically deliver "
            "by January 1 of the year preceding the next reconciliation year.",
        ),
        (
            "Flag Florida hurricane insurance line items",
            "Ensure windstorm, flood, and hurricane-related expenses are separately "
            "identified and that your lease expressly permits their passthrough.",
        ),
        (
            "Attach HCAD/DCAD/TCAD tax bills for Texas properties",
            "Attach the applicable Texas appraisal district tax notice and any under-"
            "protest documentation as exhibits to the statement.",
        ),
        (
            "Confirm audit-rights window and notice address",
            "Every statement should clearly state the audit-rights window (e.g., '90 days "
            "from the date of this statement'), the contact name, and the mailing/email "
            "address for inspection requests. Errors in this notice can extend the window.",
        ),
        (
            "Include dispute procedure in every statement",
            "Regardless of jurisdiction, best practice is to include an explicit dispute "
            "procedure in every statement. This establishes the record of notice and "
            "reduces open-ended exposure.",
        ),
    ]

    for item_title, item_body in checklist_items:
        story.append(
            KeepTogether(
                [
                    Table(
                        [
                            [
                                Paragraph(
                                    f'<font size="13">{CHECKBOX}</font>',
                                    s["item_title"],
                                ),
                                Paragraph(item_title, s["item_title"]),
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
                    Paragraph(item_body, s["body"]),
                    Spacer(1, 6),
                ]
            )
        )

    story.append(Spacer(1, 12))
    story.append(
        Paragraph(
            "DISCLAIMER: This matrix is for general informational purposes only. "
            "Laws change; consult legal counsel for your specific jurisdiction before "
            "sending any CAM reconciliation statement. This document does not constitute "
            "legal advice and does not create an attorney-client relationship. CapVeri "
            "makes no representation that the information in this guide is current or "
            "complete as of the date of use.",
            s["disclaimer"],
        )
    )
    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "<b>Automate multi-state CAM reconciliation with CapVeri.</b> CapVeri "
            "generates jurisdiction-aware CAM reconciliation statements — including "
            "California SB 1103 disclosure notices, Florida hurricane line items, Texas "
            "HCAD tax exhibits, and audit-rights notices for all 50 states — from your "
            "existing GL export. Start a free portfolio audit at "
            f"{app_url('/register')}.",
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
    story.extend(_exec_summary(s))
    story.extend(_matrix_table(s))
    story.extend(_california_deep_dive(s))
    story.extend(_tx_fl_notes(s))
    story.extend(_checklist_page(s))

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
