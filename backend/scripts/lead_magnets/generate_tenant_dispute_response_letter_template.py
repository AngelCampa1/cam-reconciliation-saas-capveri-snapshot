"""Generate the Tenant CAM Dispute Response Letter PDF.

Output: ``docs/assets/tenant-dispute-response-letter-template.pdf``

A 3-page tenant-side response letter template for disputing a CAM
reconciliation statement. Includes a long-form formal letter, a short cover
letter alternate, a documentation request attachment cover sheet, and a
glossary of CAM audit terms.

All merge fields use bracketed placeholders (e.g., ``[TENANT NAME]``) so the
PDF can be opened in any annotation tool, the placeholders search-replaced,
and the letter sent.
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

OUTPUT_PATH = docs_assets_dir() / "tenant-dispute-response-letter-template.pdf"
FOOTER_URL = site_url("/resources/tenant-dispute-response-letter-template")
DOC_TITLE = "Tenant CAM Dispute Response Letter"
LAST_UPDATED = "2026-04-27"


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
            fontSize=20,
            leading=24,
            textColor=NAVY,
            alignment=0,
            spaceAfter=8,
        ),
        "section": ParagraphStyle(
            "Section",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=12.5,
            leading=15,
            textColor=BRAND_BLUE,
            spaceBefore=12,
            spaceAfter=6,
        ),
        "letter_meta": ParagraphStyle(
            "LetterMeta",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=2,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#1F2937"),
            spaceAfter=8,
        ),
        "instruction": ParagraphStyle(
            "Instruction",
            parent=base["BodyText"],
            fontName="Helvetica-Oblique",
            fontSize=8.5,
            leading=11,
            textColor=SLATE,
            spaceAfter=10,
        ),
        "small": ParagraphStyle(
            "Small",
            parent=base["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=11.5,
            textColor=SLATE,
        ),
        "merge": ParagraphStyle(
            "Merge",
            parent=base["BodyText"],
            fontName="Helvetica-Bold",
            fontSize=9,
            leading=11,
            textColor=BRAND_BLUE,
        ),
    }


def _full_letter(s: dict[str, ParagraphStyle]) -> list:
    parts: list = [
        Paragraph(
            "Replace bracketed placeholders before sending. Send via certified mail and email "
            "to preserve the dispute date.",
            s["instruction"],
        ),
        Paragraph("[DATE]", s["letter_meta"]),
        Spacer(1, 8),
        Paragraph("[LANDLORD NAME]", s["letter_meta"]),
        Paragraph("Attn: Property Manager / Lease Administration", s["letter_meta"]),
        Paragraph("[LANDLORD ADDRESS]", s["letter_meta"]),
        Spacer(1, 8),
        Paragraph(
            "<b>Re: Notice of Dispute and Audit-Rights Invocation — "
            "[RECONCILIATION YEAR] CAM Reconciliation Statement</b>",
            s["body"],
        ),
        Paragraph(
            "Property: [PROPERTY ADDRESS], Suite [SUITE NUMBER]<br/>"
            "Tenant: [TENANT NAME]<br/>"
            "Statement dated: [STATEMENT DATE]<br/>"
            "Disputed amount: [DISPUTED AMOUNT]",
            s["body"],
        ),
        Paragraph("Dear Landlord:", s["body"]),
        # 1. Acknowledgement of receipt
        Paragraph("1. Acknowledgement of Receipt.", s["section"]),
        Paragraph(
            "Tenant acknowledges receipt on [STATEMENT DATE] of the [RECONCILIATION YEAR] "
            "Common Area Maintenance reconciliation statement issued by Landlord (the "
            "&quot;Statement&quot;). This letter is delivered within the audit-rights window "
            "of [AUDIT WINDOW DAYS] days established under [LEASE SECTION REFERENCES] of the "
            "lease between Tenant and Landlord (the &quot;Lease&quot;) and constitutes timely "
            "written notice of dispute as required thereunder.",
            s["body"],
        ),
        # 2. Audit invocation
        Paragraph("2. Invocation of Audit Rights.", s["section"]),
        Paragraph(
            "Pursuant to [LEASE SECTION REFERENCES], Tenant hereby formally exercises its "
            "right to inspect and audit Landlord's books, records, supporting documentation, "
            "and calculation methodology underlying the Statement. Tenant requests that "
            "Landlord designate a date within thirty (30) days for Tenant or Tenant's "
            "designated independent third-party auditor to commence such inspection at the "
            "property management office or such other location as the Lease provides.",
            s["body"],
        ),
        # 3. Documentation request
        Paragraph("3. Request for Backup Documentation.", s["section"]),
        Paragraph(
            "In aid of the audit and pursuant to Tenant's express rights under the Lease, "
            "Tenant requests that Landlord produce the following materials within fifteen "
            "(15) business days:",
            s["body"],
        ),
        Paragraph(
            "(a) The complete general ledger and trial balance for the property covering "
            "[RECONCILIATION YEAR], reconciled to the CAM expense pool reflected in the "
            "Statement.<br/>"
            "(b) Vendor invoices, contracts, and supporting documentation for each line item "
            "in the Statement, including but not limited to the line items identified in "
            "[LINE ITEMS IN DISPUTE].<br/>"
            "(c) Landlord's written allocation and gross-up methodology, including the "
            "occupancy percentage applied, the threshold used, and the categorization of "
            "expenses as fixed or variable.<br/>"
            "(d) The cap calculation for the [RECONCILIATION YEAR] reconciliation, including "
            "the prior-year cap ceiling, the current-year cap ceiling, and any cumulative-"
            "cap bank roll-forward.<br/>"
            "(e) The current rent roll and SF schedule used to compute Tenant's pro-rata "
            "share, including the denominator, exclusions, and any anchor or shadow-anchor "
            "carve-outs.<br/>"
            "(f) Reconciliation statements for the three (3) most recent prior fiscal years "
            "to permit trend analysis.<br/>"
            "(g) Documentation supporting any capital expenditure included in the pool, "
            "including amortization schedule and identification of the lease provision "
            "permitting such recovery.<br/>"
            "(h) Calculation of management fees, including the base on which fees were "
            "computed and the percentage applied.",
            s["body"],
        ),
        # 4. Payment under protest
        Paragraph("4. Payment Under Protest; Reservation of Rights.", s["section"]),
        Paragraph(
            "To the extent any amount is due under the Statement, Tenant remits payment "
            "under protest and expressly reserves all rights to recover overpayments, "
            "including the right to a refund of any amount determined upon audit to have "
            "been improperly billed, together with interest as provided by the Lease and "
            "applicable law. Nothing in this letter, and no payment made by Tenant pending "
            "resolution of this dispute, shall be construed as a waiver of any right or as "
            "acceptance of any disputed charge.",
            s["body"],
        ),
        # 5. Meet and confer
        Paragraph("5. Request for Meet-and-Confer.", s["section"]),
        Paragraph(
            "Tenant requests a meet-and-confer with Landlord and Landlord's accounting "
            "representative within twenty (20) days of the date of this letter to review "
            "the Statement, discuss the disputed line items in [LINE ITEMS IN DISPUTE], and "
            "attempt to resolve this matter without escalation. Tenant is prepared to "
            "appear in person or by videoconference at Landlord's election.",
            s["body"],
        ),
        # 6. Signature
        Paragraph("6. Signature and Notice.", s["section"]),
        Paragraph(
            "Please direct all correspondence regarding this matter to the undersigned. "
            "Tenant looks forward to Landlord's prompt response.",
            s["body"],
        ),
        Spacer(1, 8),
        Paragraph("Sincerely,", s["body"]),
        Spacer(1, 30),
        Paragraph(
            "_______________________________<br/>"
            "[TENANT NAME] — Authorized Signatory<br/>"
            "Title: ____________________<br/>"
            "Date: ____________________",
            s["body"],
        ),
        Spacer(1, 6),
        Paragraph(
            "cc: [Tenant Counsel]<br/>cc: [Tenant's Broker]<br/>cc: [Tenant's Independent CAM Auditor]",
            s["small"],
        ),
    ]
    return parts


def _short_letter(s: dict[str, ParagraphStyle]) -> list:
    return [
        Paragraph("PAGE 2 — SHORT-FORM COVER LETTER (ALTERNATE)", s["eyebrow"]),
        Paragraph("Short-Form Dispute Letter", s["title"]),
        Paragraph(
            "Use the short form when the dispute is narrow and the relationship is "
            "constructive. The full-form letter on page 1 is preferred when significant "
            "dollars are at stake, when capital recovery or cap math is involved, or when "
            "you anticipate escalation to counsel.",
            s["instruction"],
        ),
        Paragraph("[DATE]", s["letter_meta"]),
        Spacer(1, 8),
        Paragraph(
            "[LANDLORD NAME]<br/>[LANDLORD ADDRESS]",
            s["letter_meta"],
        ),
        Spacer(1, 8),
        Paragraph(
            "<b>Re: [RECONCILIATION YEAR] CAM Reconciliation Statement — Notice of Dispute</b>",
            s["body"],
        ),
        Paragraph("Dear Landlord:", s["body"]),
        Paragraph(
            "Tenant [TENANT NAME], occupying Suite [SUITE NUMBER] at [PROPERTY ADDRESS], "
            "received the [RECONCILIATION YEAR] CAM reconciliation statement dated "
            "[STATEMENT DATE]. Tenant disputes [DISPUTED AMOUNT] of the charges, "
            "specifically with respect to [LINE ITEMS IN DISPUTE].",
            s["body"],
        ),
        Paragraph(
            "This letter is delivered within the [AUDIT WINDOW DAYS]-day audit window "
            "established under [LEASE SECTION REFERENCES] and serves as Tenant's formal "
            "notice of dispute and request for backup documentation. Tenant requests "
            "Landlord produce supporting general-ledger detail, vendor invoices, "
            "allocation methodology, and cap calculations within fifteen (15) business "
            "days. Tenant remits any undisputed amounts under protest and reserves all "
            "rights to recovery upon audit.",
            s["body"],
        ),
        Paragraph(
            "Please contact the undersigned to schedule a meet-and-confer.",
            s["body"],
        ),
        Spacer(1, 8),
        Paragraph(
            "Sincerely,<br/><br/>_______________________________<br/>[TENANT NAME]",
            s["body"],
        ),
        Spacer(1, 16),
        Paragraph("Attachment Cover Sheet (page 2 footer)", s["section"]),
        Table(
            [
                ["Tenant:", "[TENANT NAME]"],
                ["Property:", "[PROPERTY ADDRESS], Suite [SUITE NUMBER]"],
                ["Reconciliation Year:", "[RECONCILIATION YEAR]"],
                ["Statement Date:", "[STATEMENT DATE]"],
                ["Audit Window:", "[AUDIT WINDOW DAYS] days"],
                ["Lease Reference:", "[LEASE SECTION REFERENCES]"],
                ["Disputed Amount:", "[DISPUTED AMOUNT]"],
                ["Line Items:", "[LINE ITEMS IN DISPUTE]"],
                ["Landlord:", "[LANDLORD NAME]"],
                ["Landlord Address:", "[LANDLORD ADDRESS]"],
            ],
            colWidths=[1.8 * inch, 4.7 * inch],
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (0, -1), LIGHT_GRAY),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#CBD5E1")),
                    ("PADDING", (0, 0), (-1, -1), 6),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 9),
                ]
            ),
        ),
    ]


GLOSSARY: list[tuple[str, str]] = [
    (
        "Audit window",
        "Period (commonly 90-180 days from statement delivery) during which a tenant may "
        "deliver written notice of dispute and exercise audit rights. Missing the window "
        "typically waives the right to challenge.",
    ),
    (
        "Base year",
        "Year against which excess operating expenses are measured. Tenant pays only for "
        "expenses ABOVE the base year amount, not the full pool. Common in office leases.",
    ),
    (
        "Cap (cumulative vs non-cumulative)",
        "Lease ceiling on year-over-year CAM increases. CUMULATIVE caps allow unused room "
        "to bank into later years; NON-CUMULATIVE caps reset annually. Material to "
        "ceiling math by Year 3 of the lease.",
    ),
    (
        "Controllable vs uncontrollable",
        "Caps usually apply only to CONTROLLABLE expenses (landscaping, janitorial, "
        "management). UNCONTROLLABLE expenses (taxes, insurance, utilities, snow removal) "
        "are typically excluded from the cap.",
    ),
    (
        "Gross-up",
        "Adjustment to variable expenses to reflect what they would have been at a "
        "stated occupancy level (commonly 90% or 95%). Required before pro-rata when "
        "the building is below threshold occupancy.",
    ),
    (
        "Pro-rata share",
        "Tenant's percentage of the recoverable pool, typically tenant SF divided by "
        "total leasable building SF (the &quot;denominator&quot;). Anchor exclusions and "
        "BOMA remeasurements affect this.",
    ),
    (
        "Pool",
        "Total recoverable operating expenses for the building in the reconciliation "
        "year, after exclusions, before pro-rata allocation.",
    ),
    (
        "Payment under protest",
        "Doctrine permitting a tenant to pay a disputed amount while preserving the "
        "right to recover the overpayment upon resolution of the dispute. Without it, "
        "payment may be deemed acceptance of the charge.",
    ),
]


def _glossary_page(s: dict[str, ParagraphStyle]) -> list:
    parts: list = [
        Paragraph("PAGE 3 — REFERENCE", s["eyebrow"]),
        Paragraph("Glossary of CAM Audit Terms", s["title"]),
        Paragraph(
            "These terms appear repeatedly in CAM reconciliation statements, lease audit "
            "clauses, and dispute correspondence. Use them precisely in any letter to "
            "Landlord — vague language gives Landlord room to delay or deflect.",
            s["instruction"],
        ),
    ]
    for term, definition in GLOSSARY:
        parts.append(
            KeepTogether(
                [
                    Paragraph(f"<b>{term}.</b> {definition}", s["body"]),
                ]
            )
        )
    parts.append(Spacer(1, 16))
    parts.append(
        Paragraph(
            "<b>Need this dispute reviewed by an independent CAM auditor?</b> CapVeri runs a "
            "deterministic re-computation of every CAM reconciliation against the lease "
            "abstract and the GL detail in hours, not weeks. Learn more at "
            f"{site_url('/resources/tenant-cam-audit-landlord-side')}.",
            s["small"],
        )
    )
    return parts


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=letter,
        leftMargin=0.85 * inch,
        rightMargin=0.85 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.85 * inch,
        title=DOC_TITLE,
        author="CapVeri",
    )
    s = _styles()

    story: list = [
        Paragraph("CAPVERI TENANT TEMPLATE", s["eyebrow"]),
        Paragraph(DOC_TITLE, s["title"]),
        Paragraph(
            "A formal letter template to dispute a CAM reconciliation statement, invoke "
            "audit rights, request backup documentation, and reserve payment under protest. "
            "Replace the bracketed merge fields with property-specific values and send by "
            "certified mail plus email. Page 1 is the full letter; page 2 is a short-form "
            "alternate plus an attachment cover sheet; page 3 is a glossary of terms.",
            s["instruction"],
        ),
    ]
    story.extend(_full_letter(s))
    story.append(PageBreak())
    story.extend(_short_letter(s))
    story.append(PageBreak())
    story.extend(_glossary_page(s))

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
