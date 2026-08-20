"""Generate the NNN Lease CAM Reconciliation Statement Template PDF.

Output: ``docs/assets/nnn-lease-cam-reconciliation.pdf``

A 4-5 page statement template for property managers with triple-net leases
(retail, industrial, freestanding). In a NNN lease the tenant pays base rent
plus property taxes, insurance, and CAM/operating expenses directly.
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
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

OUTPUT_PATH = docs_assets_dir() / "nnn-lease-cam-reconciliation.pdf"
FOOTER_URL = site_url("/resources/nnn-lease-cam-reconciliation")
DOC_TITLE = "NNN Lease CAM Reconciliation Statement"
LAST_UPDATED = "2026-04-27"

INPUT_YELLOW = colors.HexColor("#FFF2CC")
CALC_GRAY = colors.HexColor("#F2F2F2")
SECTION_BLUE = colors.HexColor("#D9E8FF")


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
            spaceAfter=4,
        ),
        "title": ParagraphStyle(
            "Title",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=NAVY,
            alignment=0,
            spaceAfter=6,
        ),
        "subtitle": ParagraphStyle(
            "Subtitle",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=13,
            textColor=SLATE,
            spaceAfter=8,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=BRAND_BLUE,
            spaceBefore=10,
            spaceAfter=6,
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
            fontSize=8,
            leading=10,
            textColor=SLATE,
        ),
        "small_bold": ParagraphStyle(
            "SmallBold",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=10,
            textColor=NAVY,
        ),
        "note": ParagraphStyle(
            "Note",
            parent=base["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            leading=11,
            textColor=SLATE,
            spaceAfter=6,
        ),
    }


def _cover_fields(s: dict) -> Table:
    fields = [
        ("Property Name:", "[PROPERTY NAME]"),
        ("Property Address:", "[STREET, CITY, STATE ZIP]"),
        ("Tenant Name:", "[TENANT LEGAL NAME]"),
        ("Suite / Space:", "[SUITE / SPACE #]"),
        ("Lease Commencement:", "[MM/DD/YYYY]"),
        ("Lease Expiration:", "[MM/DD/YYYY]"),
        ("Reconciliation Year:", "[YYYY]"),
        ("Statement Date:", "[MM/DD/YYYY]"),
        ("Prepared By:", "[PROPERTY MANAGER / LANDLORD]"),
    ]
    rows = [[Paragraph(lbl, s["label"]), Paragraph(v, s["field"])] for lbl, v in fields]
    t = Table(rows, colWidths=[2.1 * inch, 4.6 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (0, -1), SECTION_BLUE),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    return t


def _nnn_summary_table(s: dict) -> Table:
    """Section 1 — NNN Expense Summary: Taxes | Insurance | CAM."""
    header = [
        "Expense Component",
        "Budget / Prior Year ($)",
        "Actual ($)",
        "Variance ($)",
        "Tenant Share (%)",
    ]
    rows = [
        ["Property Taxes", "", "", "", ""],
        ["Property Insurance", "", "", "", ""],
        ["CAM / Operating Expenses", "", "", "", ""],
        ["TOTAL NNN EXPENSES", "", "", "", ""],
    ]
    table_rows = [[Paragraph(h, s["small_bold"]) for h in header]]
    for row in rows:
        bold = row[0].startswith("TOTAL")
        ps = s["small_bold"] if bold else s["small"]
        table_rows.append([Paragraph(c, ps) for c in row])
    t = Table(
        table_rows,
        colWidths=[2.2 * inch, 1.2 * inch, 1.0 * inch, 1.0 * inch, 1.3 * inch],
    )
    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("BACKGROUND", (1, 1), (-1, -2), INPUT_YELLOW),
        ("BACKGROUND", (0, -1), (-1, -1), CALC_GRAY),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
    ]
    t.setStyle(TableStyle(style_cmds))
    return t


def _property_tax_table(s: dict) -> Table:
    header = ["Item", "Value"]
    rows = [
        ["Tax Parcel ID(s):", "[PARCEL NUMBER(S)]"],
        ["Tax Year:", "[YYYY]"],
        ["Total Tax Bill Amount:", "$__________"],
        ["Tenant's Allocated Share (%):", "__________%"],
        ["Tenant's Tax Responsibility:", "$__________"],
        ["Less: Monthly Tax Deposits Collected (×12):", "$__________"],
        ["TAX TRUE-UP (Due / Credit):", "$__________"],
    ]
    table_rows = [[Paragraph(h, s["small_bold"]) for h in header]]
    for row in rows:
        bold = (
            row[0].startswith("TAX TRUE-UP")
            or row[0].startswith("Total")
            or row[0].startswith("Tenant's Tax")
        )
        ps = s["small_bold"] if bold else s["small"]
        table_rows.append([Paragraph(c, ps) for c in row])
    t = Table(table_rows, colWidths=[4.0 * inch, 2.7 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("ALIGN", (1, 1), (1, -1), "RIGHT"),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("BACKGROUND", (1, 1), (1, -2), INPUT_YELLOW),
                ("BACKGROUND", (0, -1), (-1, -1), CALC_GRAY),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ]
        )
    )
    return t


def _insurance_table(s: dict) -> Table:
    header = [
        "Policy Type",
        "Policy #",
        "Annual Premium ($)",
        "Tenant Share (%)",
        "Tenant's Portion ($)",
    ]
    rows = [
        ["Property / Fire", "", "", "", ""],
        ["General Liability", "", "", "", ""],
        ["Umbrella / Excess Liability", "", "", "", ""],
        ["Other: __________", "", "", "", ""],
        ["TOTAL INSURANCE", "", "", "", ""],
        ["Less: Monthly Insurance Deposits (×12)", "", "N/A", "N/A", ""],
        ["INSURANCE TRUE-UP (Due / Credit)", "", "N/A", "N/A", ""],
    ]
    table_rows = [[Paragraph(h, s["small_bold"]) for h in header]]
    for row in rows:
        bold = row[0].startswith("TOTAL") or row[0].startswith("INSURANCE TRUE-UP")
        ps = s["small_bold"] if bold else s["small"]
        table_rows.append([Paragraph(c, ps) for c in row])
    t = Table(
        table_rows,
        colWidths=[1.9 * inch, 0.8 * inch, 1.1 * inch, 0.9 * inch, 1.0 * inch],
    )
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("BACKGROUND", (1, 1), (-1, -3), INPUT_YELLOW),
                ("BACKGROUND", (0, -2), (-1, -1), CALC_GRAY),
                ("FONTNAME", (0, -2), (-1, -1), "Helvetica-Bold"),
            ]
        )
    )
    return t


def _cam_nnn_table(s: dict) -> Table:
    header = [
        "Expense Category",
        "Actual ($)",
        "Landlord-Only Exclusion",
        "Tenant Recoverable ($)",
    ]
    rows = [
        ["Janitorial / Cleaning", "", "", ""],
        ["Landscaping / Grounds Maintenance", "", "", ""],
        ["HVAC & Building Systems Maintenance", "", "", ""],
        ["Utilities — Common Areas", "", "", ""],
        ["Security / Access Control", "", "", ""],
        ["Pest Control", "", "", ""],
        ["Parking Lot / Exterior Maintenance", "", "", ""],
        ["Roof Maintenance (if lease-allowable)", "", "", ""],
        ["Management Fee", "", "", ""],
        ["Administrative Fee", "", "", ""],
        ["Repairs & General Maintenance", "", "", ""],
        ["Other Operating Expenses", "", "", ""],
        ["TOTAL CAM / OPERATING EXPENSES", "", "", ""],
    ]
    table_rows = [[Paragraph(h, s["small_bold"]) for h in header]]
    for row in rows:
        bold = row[0].startswith("TOTAL")
        ps = s["small_bold"] if bold else s["small"]
        table_rows.append([Paragraph(c, ps) for c in row])
    t = Table(table_rows, colWidths=[2.5 * inch, 1.0 * inch, 1.6 * inch, 1.6 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("BACKGROUND", (1, 1), (-1, -2), INPUT_YELLOW),
                ("BACKGROUND", (0, -1), (-1, -1), CALC_GRAY),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ]
        )
    )
    return t


def _trueup_table(s: dict) -> Table:
    header = [
        "Component",
        "Total Actual ($)",
        "Deposits Collected ($)",
        "Balance Due / (Credit) ($)",
    ]
    rows = [
        ["Property Taxes", "", "", ""],
        ["Property Insurance", "", "", ""],
        ["CAM / Operating Expenses", "", "", ""],
        ["TOTAL NNN TRUE-UP", "", "", ""],
    ]
    table_rows = [[Paragraph(h, s["small_bold"]) for h in header]]
    for row in rows:
        bold = row[0].startswith("TOTAL")
        ps = s["small_bold"] if bold else s["small"]
        table_rows.append([Paragraph(c, ps) for c in row])
    t = Table(table_rows, colWidths=[2.0 * inch, 1.4 * inch, 1.5 * inch, 1.8 * inch])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BRAND_BLUE),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, 0), 8),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("BACKGROUND", (1, 1), (-1, -2), INPUT_YELLOW),
                ("BACKGROUND", (0, -1), (-1, -1), CALC_GRAY),
                ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ]
        )
    )
    return t


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=letter,
        leftMargin=0.7 * inch,
        rightMargin=0.7 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.85 * inch,
        title=DOC_TITLE,
        author="CapVeri",
    )
    s = _styles()
    story: list = []

    # ── Cover page ────────────────────────────────────────────────────────────
    story += [
        Paragraph("CAPVERI TEMPLATE", s["eyebrow"]),
        Paragraph(DOC_TITLE, s["title"]),
        Paragraph(
            "Triple-Net (NNN) Lease: Property Taxes + Insurance + CAM/Operating Expenses",
            s["subtitle"],
        ),
        HRFlowable(width="100%", thickness=1, color=BRAND_BLUE, spaceAfter=10),
        Paragraph("Statement Details", s["section"]),
        _cover_fields(s),
        Spacer(1, 12),
        Table(
            [
                [
                    Paragraph("<b>Lease type</b><br/>Triple-Net (NNN)", s["small"]),
                    Paragraph(
                        "<b>Use cases</b><br/>Retail, industrial, freestanding",
                        s["small"],
                    ),
                    Paragraph(f"<b>Last updated</b><br/>{LAST_UPDATED}", s["small"]),
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
        PageBreak(),
    ]

    # ── Section 1 — NNN Expense Summary ──────────────────────────────────────
    story += [
        Paragraph("Section 1 — NNN Expense Summary", s["section"]),
        Paragraph(
            "This section provides a high-level comparison of budgeted vs. actual NNN "
            "expenses across the three components: property taxes, insurance, and "
            "CAM/operating expenses.",
            s["body"],
        ),
        _nnn_summary_table(s),
        Spacer(1, 10),
        PageBreak(),
    ]

    # ── Section 2 — Property Tax Detail ──────────────────────────────────────
    story += [
        Paragraph("Section 2 — Property Tax Detail", s["section"]),
        Paragraph(
            "Enter each tax parcel separately if the property spans multiple parcels. "
            "The tenant's allocated share is the pro-rata percentage specified in the lease "
            "(for freestanding single-tenant properties this is typically 100%).",
            s["body"],
        ),
        _property_tax_table(s),
        Spacer(1, 8),
        Paragraph(
            "<b>Note:</b> Attach copies of the county/municipality tax bills. For "
            "properties in states with supplemental tax bills (e.g., California), "
            "include supplemental assessments in the total bill amount.",
            s["note"],
        ),
    ]

    # ── Section 3 — Insurance Detail ─────────────────────────────────────────
    story += [
        Paragraph("Section 3 — Insurance Detail", s["section"]),
        Paragraph(
            "List each insurance policy separately. For single-tenant NNN properties, "
            "tenant's share is typically 100%. For multi-tenant properties, allocate by "
            "pro-rata share per the lease.",
            s["body"],
        ),
        _insurance_table(s),
        Spacer(1, 8),
        Paragraph(
            "<b>Note:</b> Attach declaration pages for all policies. If the landlord "
            "self-insures any coverage, attach the actuarial report or self-insurance "
            "certificate per the lease requirement.",
            s["note"],
        ),
        PageBreak(),
    ]

    # ── Section 4 — CAM/Operating Expenses ───────────────────────────────────
    story += [
        Paragraph("Section 4 — CAM / Operating Expenses", s["section"]),
        Paragraph(
            "In a NNN lease, nearly all operating expenses pass through to the tenant. "
            "The following landlord-only exclusions are typical regardless of lease language: "
            "leasing commissions, depreciation, corporate overhead, income taxes, debt "
            "service, costs arising from landlord negligence. All other categories are "
            "generally recoverable unless your specific lease excludes them.",
            s["body"],
        ),
        _cam_nnn_table(s),
        Spacer(1, 8),
        Paragraph(
            "<b>Landlord-Only Exclusions (standard for NNN):</b> leasing commissions, "
            "depreciation, corporate overhead, financing costs, income/entity taxes, "
            "costs caused by landlord negligence or willful misconduct, costs covered by "
            "insurance proceeds.",
            s["note"],
        ),
        PageBreak(),
    ]

    # ── Section 5 — True-Up Summary ───────────────────────────────────────────
    story += [
        Paragraph("Section 5 — True-Up Summary", s["section"]),
        Paragraph(
            "Compare total NNN actuals to the monthly deposits collected during the "
            "reconciliation year. The difference is the balance due from the tenant or "
            "a credit to be applied.",
            s["body"],
        ),
        _trueup_table(s),
        Spacer(1, 10),
        Paragraph(
            "<b>Expense Stop / Cap Note:</b> If the lease contains an expense stop, "
            "enter the stop amount below and subtract it from the tenant's total "
            "NNN responsibility above.",
            s["body"],
        ),
        Table(
            [
                [
                    Paragraph("Expense Stop Amount (if applicable):", s["label"]),
                    Paragraph("$__________", s["field"]),
                ],
                [
                    Paragraph(
                        "Tenant NNN Responsibility after Expense Stop:", s["label"]
                    ),
                    Paragraph("$__________", s["field"]),
                ],
                [
                    Paragraph("Deposits Collected:", s["label"]),
                    Paragraph("$__________", s["field"]),
                ],
                [
                    Paragraph("FINAL BALANCE DUE / (CREDIT):", s["label"]),
                    Paragraph("$__________", s["field"]),
                ],
            ],
            colWidths=[3.5 * inch, 3.2 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                    ("BACKGROUND", (0, -1), (-1, -1), CALC_GRAY),
                    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E2E8F0")),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("BACKGROUND", (1, 0), (1, -2), INPUT_YELLOW),
                ]
            ),
        ),
        Spacer(1, 14),
        HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#CBD5E1")),
        Spacer(1, 8),
        Paragraph(
            "<b>Tenant Audit Rights:</b> Pursuant to Section [__] of the lease, tenant has "
            "[__] days from receipt of this statement to request an audit. Please submit "
            "written requests to [PROPERTY MANAGER EMAIL / ADDRESS].",
            s["note"],
        ),
        Paragraph(
            "<b>Automate NNN reconciliation across your portfolio:</b> CapVeri handles "
            "property taxes, insurance, and CAM in a single workflow — import from Yardi or "
            "MRI and generate audit-ready statements. "
            f"Start at {app_url('/register')}.",
            s["small"],
        ),
    ]

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
