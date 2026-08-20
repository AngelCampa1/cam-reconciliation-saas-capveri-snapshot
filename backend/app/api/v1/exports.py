"""
Export endpoints for reconciliation data.

Provides endpoints for exporting reconciliation snapshots to various formats
including PDF tenant packets and ERP write-back files.
"""

import csv
import logging
import zipfile
from abc import ABC, abstractmethod
from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO, StringIO
from typing import Annotated, Any, Literal
from uuid import UUID
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.auth.dependencies import OrgContext, get_current_admin_user
from app.exceptions import BadRequestError, NotFoundError
from app.models import ERPFormat, ReconciliationStatus
from app.models.user import User
from app.services.export.csv_safety import neutralize_formula, strip_control_chars
from app.services.formatting import format_trace_value

logger = logging.getLogger(__name__)

router = APIRouter()


def _coerce_date(date_value: date | datetime | str) -> date:
    """Normalize DB/API date values for export rendering."""
    if isinstance(date_value, datetime):
        return date_value.date()
    if isinstance(date_value, date):
        return date_value
    return datetime.fromisoformat(date_value).date()


class TenantPacketGenerator:
    """
    Generates professional PDF tenant reconciliation packets.

    Uses ReportLab to create formatted PDF documents with company branding,
    expense breakdowns, and calculation summaries.
    """

    def __init__(
        self,
        snapshot_data: dict[str, Any],
        lease_data: dict[str, Any],
        property_data: dict[str, Any],
        org_data: dict[str, Any],
    ):
        """
        Initialize generator with all required data.

        Args:
            snapshot_data: Reconciliation snapshot dictionary
            lease_data: Lease information dictionary
            property_data: Property information dictionary
            org_data: Organization information dictionary
        """
        self.snapshot = snapshot_data
        self.lease = lease_data
        self.property = property_data
        self.org = org_data
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()

    def _setup_custom_styles(self) -> None:
        """Create custom paragraph styles for professional formatting."""
        # Header style
        self.styles.add(
            ParagraphStyle(
                name="CustomHeader",
                parent=self.styles["Heading1"],
                fontSize=18,
                textColor=colors.HexColor("#1a365d"),
                spaceAfter=12,
                alignment=1,  # Center
            )
        )

        # Subheader style
        self.styles.add(
            ParagraphStyle(
                name="CustomSubheader",
                parent=self.styles["Heading2"],
                fontSize=14,
                textColor=colors.HexColor("#2c5282"),
                spaceAfter=8,
            )
        )

        # Info style
        self.styles.add(
            ParagraphStyle(
                name="InfoText",
                parent=self.styles["Normal"],
                fontSize=10,
                spaceAfter=6,
            )
        )

    def _format_currency(self, amount: Decimal | str) -> str:
        """
        Format a decimal amount as a tenant-facing currency string.

        A reconciliation can land as a credit (the tenant overpaid estimates),
        so ``total_recovery`` is negative. Render that as ``-$5,000.00`` rather
        than ``$-5,000.00`` -- the latter floats the minus between the symbol
        and the digits and reads as a typo on a document a tenant receives.
        """
        if isinstance(amount, str):
            amount = Decimal(amount)
        if amount < 0:
            return f"-${-amount:,.2f}"
        return f"${amount:,.2f}"

    def _format_date(self, date_value: date | datetime | str) -> str:
        """Format ISO date string to readable format."""
        return _coerce_date(date_value).strftime("%B %d, %Y")

    def _paragraph_text(self, value: Any) -> str:
        """Escape dynamic text before passing it to ReportLab Paragraph."""
        return escape(str(value))

    def generate(self) -> BytesIO:
        """
        Generate PDF and return as BytesIO buffer.

        Returns:
            BytesIO: PDF file buffer ready for streaming
        """
        buffer = BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
        )

        # Build document content
        story = []
        story.extend(self._build_header())
        story.append(Spacer(1, 0.3 * inch))
        story.extend(self._build_property_info())
        story.append(Spacer(1, 0.2 * inch))
        story.extend(self._build_tenant_info())
        story.append(Spacer(1, 0.3 * inch))
        story.extend(self._build_expense_summary())
        story.append(Spacer(1, 0.3 * inch))
        story.extend(self._build_calculation_breakdown())
        story.append(Spacer(1, 0.3 * inch))
        story.extend(self._build_footer())

        # Build PDF
        doc.build(story)
        buffer.seek(0)
        return buffer

    def _build_header(self) -> list[Any]:
        """Build PDF header with organization and period information."""
        elements = []

        # Organization name
        org_name = self.org.get("name", "Organization")
        elements.append(
            Paragraph(self._paragraph_text(org_name), self.styles["CustomHeader"])
        )

        # Document title
        elements.append(
            Paragraph("Tenant Reconciliation Statement", self.styles["CustomSubheader"])
        )

        # Period information
        period_start = self._format_date(self.snapshot["period_start_date"])
        period_end = self._format_date(self.snapshot["period_end_date"])
        period_text = f"Period: {period_start} - {period_end}"
        elements.append(Paragraph(period_text, self.styles["InfoText"]))

        return elements

    def _build_property_info(self) -> list[Any]:
        """Build property information section."""
        elements = []
        elements.append(
            Paragraph("Property Information", self.styles["CustomSubheader"])
        )

        property_name = self.property.get("name", "N/A")
        property_address = self.property.get("address", "N/A")

        info_text = (
            f"<b>Property:</b> {self._paragraph_text(property_name)}"
            f"<br/><b>Address:</b> {self._paragraph_text(property_address)}"
        )
        elements.append(Paragraph(info_text, self.styles["InfoText"]))

        return elements

    def _build_tenant_info(self) -> list[Any]:
        """Build tenant information section."""
        elements = []
        elements.append(Paragraph("Tenant Information", self.styles["CustomSubheader"]))

        tenant_info = (
            f"<b>Tenant:</b> "
            f"{self._paragraph_text(self.lease.get('tenant_name', 'N/A'))}"
        )
        elements.append(Paragraph(tenant_info, self.styles["InfoText"]))

        return elements

    def _build_expense_summary(self) -> list[Any]:
        """Build expense summary table."""
        elements: list[Any] = []
        elements.append(Paragraph("Expense Summary", self.styles["CustomSubheader"]))

        # Build table data
        data = [
            ["Description", "Amount"],
            [
                "Total Operating Expenses",
                self._format_currency(self.snapshot["total_operating_expenses"]),
            ],
            [
                "Grossed-Up Expenses",
                self._format_currency(self.snapshot["grossed_up_expenses"]),
            ],
            [
                "Base Year Amount",
                self._format_currency(self.snapshot["base_year_amount"]),
            ],
            [
                "Tenant Share (Before Cap)",
                self._format_currency(self.snapshot["tenant_share_before_cap"]),
            ],
            [
                "Tenant Share (After Cap)",
                self._format_currency(self.snapshot["tenant_share_after_cap"]),
            ],
            ["Administrative Fee", self._format_currency(self.snapshot["admin_fee"])],
            ["", ""],  # Separator
            [
                "Total Amount Due",
                self._format_currency(self.snapshot["total_recovery"]),
            ],
        ]

        # Create table with styling
        table = Table(data, colWidths=[4 * inch, 2 * inch])
        table.setStyle(
            TableStyle(
                [
                    # Header row
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2c5282")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 11),
                    ("ALIGN", (0, 0), (-1, 0), "CENTER"),
                    # Data rows
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 1), (-1, -1), 10),
                    ("ALIGN", (1, 1), (1, -1), "RIGHT"),
                    # Alternating row colors
                    (
                        "ROWBACKGROUNDS",
                        (0, 1),
                        (-1, -3),
                        [colors.white, colors.HexColor("#f7fafc")],
                    ),
                    # Total row
                    ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#edf2f7")),
                    ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
                    ("FONTSIZE", (0, -1), (-1, -1), 11),
                    # Grid
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                    ("LINEABOVE", (0, -1), (-1, -1), 1.5, colors.HexColor("#2c5282")),
                ]
            )
        )

        elements.append(table)
        return elements

    def _build_calculation_breakdown(self) -> list[Any]:
        """Build calculation breakdown with one row per trace step."""
        elements = []
        elements.append(
            Paragraph("Calculation Summary", self.styles["CustomSubheader"])
        )

        calc_trace = self.snapshot.get("calculation_trace", [])

        if not calc_trace:
            elements.append(
                Paragraph(
                    "No detailed calculation trace available for this snapshot.",
                    self.styles["InfoText"],
                )
            )
            return elements

        for step in calc_trace:
            if not isinstance(step, dict):
                continue
            step_name = step.get("step_name", "")
            operation = step.get("operation", "")
            output = step.get("output_value", "")
            output_unit = step.get("output_unit")
            note = step.get("note")

            # Render the value by its unit tag so the tenant-facing audit trail
            # matches the in-app trace (and the summary table above): a currency
            # step prints "$5,000.00", not bare "5000.00"; an area prints
            # "10,000 sq ft"; a ratio keeps its decimals.
            line = (
                f"<b>{self._paragraph_text(step_name)}:</b> "
                f"{self._paragraph_text(format_trace_value(output, output_unit))}"
            )
            if operation:
                line += f" ({self._paragraph_text(operation)})"
            elements.append(Paragraph(line, self.styles["InfoText"]))
            if note:
                elements.append(
                    Paragraph(
                        f"  Note: {self._paragraph_text(note)}",
                        self.styles["InfoText"],
                    )
                )

        return elements

    def _build_footer(self) -> list[Any]:
        """Build PDF footer with disclaimers."""
        elements = []

        footer_style = ParagraphStyle(
            name="Footer",
            parent=self.styles["Normal"],
            fontSize=8,
            textColor=colors.grey,
            spaceAfter=4,
        )

        disclaimer = (
            "This reconciliation statement is provided for "
            "informational purposes. "
            "Please review all calculations and contact us with any "
            "questions or concerns. "
            "Payment is due within 30 days of receipt unless otherwise "
            "specified in your lease agreement."
        )
        elements.append(Paragraph(disclaimer, footer_style))

        # Generation timestamp
        timestamp = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")
        timestamp_text = f"Generated: {timestamp}"
        elements.append(Paragraph(timestamp_text, footer_style))

        return elements


def _load_export_context(
    ctx: OrgContext,
    snapshot_data: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Load lease/property/org context for a snapshot export."""
    lease_id = snapshot_data.get("lease_id")
    lease_data: dict[str, Any] = {}
    if lease_id:
        # NOTE: leases has no organization_id column. Org scoping is guaranteed
        # by the caller: the snapshot was fetched org-scoped (so its lease_id
        # belongs to this org) and the property is org-verified below.
        lease_result = (
            ctx.table("leases")
            .select("id, property_id, tenant_name")
            .eq("id", str(lease_id))
            .execute()
        )
        lease_data = lease_result.data[0] if lease_result.data else {}

    property_id = snapshot_data.get("property_id") or lease_data.get("property_id")
    property_data: dict[str, Any] = {}
    if property_id:
        property_result = (
            ctx.table("properties")
            .select("id, name, address_line1, city, state, postal_code")
            .eq("id", str(property_id))
            .eq("organization_id", str(ctx.organization_id))
            .execute()
        )
        if property_result.data:
            prop = property_result.data[0]
            address_parts = [prop.get("address_line1", "")]
            if prop.get("city") and prop.get("state"):
                address_parts.append(f"{prop['city']}, {prop['state']}")
            if prop.get("postal_code"):
                address_parts[-1] += f" {prop['postal_code']}"
            prop["address"] = ", ".join(filter(None, address_parts))
            property_data = prop

    org_result = (
        ctx.table("organizations")
        .select("id, name")
        .eq("id", str(ctx.org_id))
        .execute()
    )
    org_data = org_result.data[0] if org_result.data else {"name": "Organization"}
    return lease_data, property_data, org_data


def _verify_snapshot_property_scope(
    ctx: OrgContext, snapshot_data: dict[str, Any], snapshot_id: UUID
) -> str:
    property_id = snapshot_data.get("property_id")
    if not property_id:
        lease_id = snapshot_data.get("lease_id")
        if lease_id:
            # NOTE: leases has no organization_id column. The property_id we
            # derive here is org-verified against properties immediately below,
            # which is the actual scope gate; the snapshot was already fetched
            # org-scoped by the caller.
            lease_result = (
                ctx.table("leases")
                .select("property_id")
                .eq("id", str(lease_id))
                .execute()
            )
            if lease_result.data:
                property_id = lease_result.data[0].get("property_id")

    if not property_id:
        raise NotFoundError("snapshot", str(snapshot_id))

    property_result = (
        ctx.table("properties")
        .select("id")
        .eq("id", str(property_id))
        .eq("organization_id", str(ctx.organization_id))
        .execute()
    )
    if not property_result.data:
        raise NotFoundError("snapshot", str(snapshot_id))
    return str(property_id)


def _build_batch_cover_page(total: int) -> BytesIO:
    """Create a single-page cover for combined batch exports."""
    cover_buffer = BytesIO()
    doc = SimpleDocTemplate(
        cover_buffer,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    story: list[Any] = [
        Paragraph("Batch Reconciliation Export", styles["Title"]),
        Spacer(1, 0.1 * inch),
        Paragraph(f"Total Packets: {total}", styles["Normal"]),
        Spacer(1, 0.1 * inch),
        Paragraph(
            f"Generated {datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S UTC')}",
            styles["Normal"],
        ),
    ]
    doc.build(story)
    cover_buffer.seek(0)
    return cover_buffer


def _build_batch_summary_pdf(
    rendered_pdfs: list[tuple[str, bytes, dict[str, Any]]],
    include_cover_page: bool,
    include_calculation_details: bool,
) -> BytesIO:
    """Build a summary PDF when PDF merge libraries are unavailable."""
    combined_buffer = BytesIO()
    doc = SimpleDocTemplate(
        combined_buffer,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
    )
    styles = getSampleStyleSheet()
    story: list[Any] = []

    if include_cover_page:
        story.append(Paragraph("Batch Reconciliation Export", styles["Title"]))
        story.append(Spacer(1, 0.1 * inch))
        story.append(
            Paragraph(
                f"Generated {datetime.now(UTC).strftime('%Y-%m-%d %H:%M:%S UTC')}",
                styles["Normal"],
            )
        )
        story.append(Spacer(1, 0.25 * inch))

    for filename, _pdf_bytes, snapshot_data in rendered_pdfs:
        story.append(Paragraph(escape(filename), styles["Heading3"]))
        story.append(
            Paragraph(
                (
                    f"Period: {snapshot_data['period_start_date']} to "
                    f"{snapshot_data['period_end_date']}"
                ),
                styles["Normal"],
            )
        )
        total_recovery = Decimal(str(snapshot_data["total_recovery"]))
        story.append(
            Paragraph(
                f"Total Recovery: ${total_recovery:,.2f}",
                styles["Normal"],
            )
        )
        if include_calculation_details:
            trace = snapshot_data.get("calculation_trace") or []
            story.append(
                Paragraph(f"Calculation steps: {len(trace)}", styles["Normal"])
            )
        story.append(Spacer(1, 0.2 * inch))

    doc.build(story)
    combined_buffer.seek(0)
    return combined_buffer


@router.get(
    "/reconciliation/snapshots/{snapshot_id}/export/pdf",
)
async def export_snapshot_pdf(
    snapshot_id: UUID,
    ctx: OrgContext,
    allow_draft: Annotated[bool, Query(...)] = False,
) -> StreamingResponse:
    """
    Export a reconciliation snapshot as a professional PDF tenant packet.

    Generates a formatted PDF document with property information, tenant details,
    expense breakdown, and calculation summary suitable for sending to tenants.

    Args:
        snapshot_id: UUID of the snapshot to export
        ctx: Organization context for RLS
        allow_draft: Allow export of draft snapshots (default: False)

    Returns:
        StreamingResponse with PDF file

    Raises:
        NotFoundError: If snapshot doesn't exist or doesn't belong to organization
        BadRequestError: If snapshot is not finalized and allow_draft is False
    """

    # Fetch snapshot (using separate queries for reliability)
    snapshot_result = (
        ctx.table("reconciliation_snapshots")
        .select("*")
        .eq("id", str(snapshot_id))
        .eq("organization_id", str(ctx.organization_id))
        .execute()
    )

    if not snapshot_result.data or len(snapshot_result.data) == 0:
        raise NotFoundError("snapshot", str(snapshot_id))

    snapshot_data = snapshot_result.data[0]
    _verify_snapshot_property_scope(ctx, snapshot_data, snapshot_id)

    # Check finalization status
    if (
        snapshot_data["status"] != ReconciliationStatus.FINALIZED.value
        and not allow_draft
    ):
        raise BadRequestError(
            "Cannot export draft snapshot. Set allow_draft=true to override."
        )

    lease_data, property_data, org_data = _load_export_context(ctx, snapshot_data)
    if not property_data:
        raise NotFoundError("snapshot", str(snapshot_id))

    # Generate PDF
    generator = TenantPacketGenerator(
        snapshot_data=snapshot_data,
        lease_data=lease_data,
        property_data=property_data,
        org_data=org_data,
    )

    pdf_buffer = generator.generate()

    # Generate filename with property/tenant info and period
    period_start = _coerce_date(snapshot_data["period_start_date"])
    year = period_start.year
    property_name = property_data.get("name", "Property").replace(" ", "_")
    filename = f"Reconciliation_{property_name}_{year}.pdf"

    # Return streaming response
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get("/reconciliation/snapshots/{snapshot_id}/export/batch-pdf")
async def export_snapshot_batch_pdf(
    snapshot_id: UUID,
    ctx: OrgContext,
    tenant_ids: Annotated[list[str] | None, Query()] = None,
    mode: Annotated[Literal["zip", "combined"], Query()] = "zip",
    include_cover_page: Annotated[bool, Query()] = True,
    include_calculation_details: Annotated[bool, Query()] = True,
) -> StreamingResponse:
    """
    Batch export reconciliation snapshots as ZIP or combined PDF.

    Note:
        `tenant_ids` filters snapshots by lease_id for the same property/period
        as the anchor snapshot.
    """

    anchor_result = (
        ctx.table("reconciliation_snapshots")
        .select("*")
        .eq("id", str(snapshot_id))
        .eq("organization_id", str(ctx.organization_id))
        .maybe_single()
        .execute()
    )
    anchor = anchor_result.data if anchor_result else None
    if not anchor:
        raise NotFoundError("snapshot", str(snapshot_id))

    anchor_property_id = _verify_snapshot_property_scope(ctx, anchor, snapshot_id)
    if anchor.get("status") != ReconciliationStatus.FINALIZED.value:
        raise BadRequestError("All selected snapshots must be finalized")

    if tenant_ids:
        requested_lease_ids = {tenant_id for tenant_id in tenant_ids if tenant_id}
        if not requested_lease_ids:
            raise BadRequestError("tenant_ids must not be empty")
        snapshot_results = (
            ctx.table("reconciliation_snapshots")
            .select("*")
            .eq("organization_id", str(ctx.organization_id))
            .eq("property_id", anchor_property_id)
            .eq("period_start_date", anchor["period_start_date"])
            .eq("period_end_date", anchor["period_end_date"])
            .eq("status", ReconciliationStatus.FINALIZED.value)
            .in_("lease_id", list(requested_lease_ids))
            .execute()
        )
        snapshots = snapshot_results.data or []
        matched_lease_ids = {str(snapshot.get("lease_id")) for snapshot in snapshots}
        missing_lease_ids = requested_lease_ids - matched_lease_ids
        if missing_lease_ids:
            raise BadRequestError(
                "One or more selected tenant_ids do not have finalized snapshots"
            )
    else:
        snapshots = [anchor]

    for snapshot in snapshots:
        _verify_snapshot_property_scope(ctx, snapshot, UUID(str(snapshot["id"])))

    rendered_pdfs: list[tuple[str, bytes, dict[str, Any]]] = []
    for snapshot in snapshots:
        snapshot_export_data = dict(snapshot)
        if not include_calculation_details:
            snapshot_export_data["calculation_trace"] = []

        lease_data, property_data, org_data = _load_export_context(
            ctx, snapshot_export_data
        )
        if not property_data:
            raise NotFoundError("snapshot", str(snapshot_export_data["id"]))
        pdf_buffer = TenantPacketGenerator(
            snapshot_data=snapshot_export_data,
            lease_data=lease_data,
            property_data=property_data,
            org_data=org_data,
        ).generate()
        pdf_bytes = pdf_buffer.getvalue()

        period_start = _coerce_date(snapshot_export_data["period_start_date"])
        year = period_start.year
        property_name = property_data.get("name", "Property").replace(" ", "_")
        export_name = (
            f"Reconciliation_{property_name}_{year}_"
            f"{snapshot_export_data['id'][:8]}.pdf"
        )
        rendered_pdfs.append((export_name, pdf_bytes, snapshot_export_data))

    total = len(rendered_pdfs)
    headers = {
        "X-Total-Tenants": str(total),
        "X-Completed-Tenants": str(total),
    }

    if mode == "zip":
        zip_buffer = BytesIO()
        with zipfile.ZipFile(
            zip_buffer, mode="w", compression=zipfile.ZIP_DEFLATED
        ) as zf:
            for name, pdf_bytes, _snapshot_data in rendered_pdfs:
                zf.writestr(name, pdf_bytes)
        zip_buffer.seek(0)

        timestamp = datetime.now(UTC).strftime("%Y%m%d")
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                **headers,
                "Content-Disposition": (
                    f'attachment; filename="reconciliation_batch_{timestamp}.zip"'
                ),
            },
        )

    # Combined mode prefers packet-level merge, with summary fallback.
    combined_buffer: BytesIO
    try:
        from PyPDF2 import PdfMerger

        merger = PdfMerger()
        if include_cover_page:
            merger.append(_build_batch_cover_page(total))
        for _name, pdf_bytes, _snapshot_data in rendered_pdfs:
            merger.append(BytesIO(pdf_bytes))

        combined_buffer = BytesIO()
        merger.write(combined_buffer)
        merger.close()
        combined_buffer.seek(0)
    except Exception:
        logger.warning(
            "PDF merge library unavailable; falling back to summary combined export"
        )
        combined_buffer = _build_batch_summary_pdf(
            rendered_pdfs=rendered_pdfs,
            include_cover_page=include_cover_page,
            include_calculation_details=include_calculation_details,
        )

    timestamp = datetime.now(UTC).strftime("%Y%m%d")
    return StreamingResponse(
        combined_buffer,
        media_type="application/pdf",
        headers={
            **headers,
            "Content-Disposition": (
                f'attachment; filename="reconciliation_batch_{timestamp}_combined.pdf"'
            ),
        },
    )


# ============================================================================
# ERP Export Functionality
# ============================================================================


def _snapshot_tenant_name(snapshot: dict[str, Any]) -> str:
    """
    Resolve the human-readable tenant name for an ERP export row.

    ERP write-back files are re-imported into the landlord's accounting system
    and reviewed by a human, so the Tenant column must carry the lease's
    tenant name -- not a fragment of CapVeri's internal UUID. The name comes
    from the lease embedded on the snapshot (`leases(tenant_name)`); callers
    that cannot join the lease fall back to an empty string so the formatter
    can substitute the lease id. Returns "" when no name is available.
    """
    leases = snapshot.get("leases")
    # PostgREST embeds a many-to-one relation as a single object, but tolerate
    # a list shape defensively so a query change can't silently blank the name.
    if isinstance(leases, list):
        leases = leases[0] if leases else {}
    if not isinstance(leases, dict):
        leases = {}
    name = leases.get("tenant_name") or snapshot.get("tenant_name") or ""
    return str(name).strip()


def _period_label(period_start: date, period_end: date) -> str:
    """
    Human-readable label for a reconciliation period, used in the ERP journal
    memo. CAM reconciliations are usually annual (Jan 1 - Dec 31), so labelling
    a posted entry from the start month alone ("Jan 2024") misreads as a
    January-only entry to the accountant reviewing it. Describe the real span:
      - single month  -> "Jan 2024"
      - single year   -> "2024"
      - spanning years -> "01/2024-12/2025"
    ASCII-only (hyphen, not en-dash) so legacy ERP imports never choke.
    """
    if period_start.year == period_end.year and period_start.month == period_end.month:
        return period_start.strftime("%b %Y")
    if period_start.year == period_end.year:
        return str(period_start.year)
    return f"{period_start.strftime('%m/%Y')}-{period_end.strftime('%m/%Y')}"


def _snapshot_token(snapshot: dict[str, Any]) -> str:
    """
    Short (8-char) snapshot identifier for traceability in narrow reference
    fields (e.g. MRI's 15-char Reference column, where a full UUID will not
    fit). Lets an auditor tie a posted entry back to the source reconciliation.
    Falls back to the lease-id fragment when no snapshot id is present.
    """
    raw = str(snapshot.get("id", "")) or str(snapshot.get("lease_id", ""))
    return raw.replace("-", "")[:8]


class ERPExportGenerator(ABC):
    """
    Base class for ERP export formatters.

    Converts reconciliation snapshots to ERP-compatible journal entry formats.
    Each subclass implements format-specific requirements for Yardi, MRI, etc.
    """

    def __init__(self, snapshots: list[dict[str, Any]]):
        """
        Initialize generator with snapshot data.

        Args:
            snapshots: List of reconciliation snapshot dictionaries
        """
        self.snapshots = snapshots

    @abstractmethod
    def generate(self) -> StringIO:
        """
        Generate export file and return as StringIO buffer.

        Returns:
            StringIO: File buffer ready for streaming
        """
        pass

    @abstractmethod
    def get_filename(self) -> str:
        """
        Generate appropriate filename for the export.

        Returns:
            str: Filename with extension
        """
        pass

    @abstractmethod
    def get_media_type(self) -> str:
        """
        Get MIME type for the export file.

        Returns:
            str: Media type (e.g., 'text/csv')
        """
        pass

    def _format_currency(self, amount: Decimal | str) -> str:
        """Format decimal amount as string without currency symbol."""
        if isinstance(amount, str):
            amount = Decimal(amount)
        return f"{amount:.2f}"

    def _format_date(self, date_value: date | datetime | str) -> str:
        """Format date for ERP import."""
        return _coerce_date(date_value).strftime("%m/%d/%Y")


class YardiFormatter(ERPExportGenerator):
    """
    Formatter for Yardi Voyager journal entry import.

    Creates balanced journal entries with AR and revenue accounts.
    """

    # Yardi account codes (these would typically come from organization settings)
    AR_ACCOUNT = "1200"  # Accounts Receivable
    CAM_RECOVERY_ACCOUNT = "4100"  # CAM Recovery Revenue

    def generate(self) -> StringIO:
        """Generate Yardi CSV format."""
        buffer = StringIO()
        writer = csv.DictWriter(
            buffer,
            fieldnames=[
                "Property",
                "Unit",
                "Tenant",
                "Account",
                "Amount",
                "Description",
                "Reference",
                "PostDate",
            ],
        )

        writer.writeheader()

        for snapshot in self.snapshots:
            property_name = neutralize_formula(
                snapshot.get("properties", {}).get("name", "N/A")
            )
            lease_id = str(snapshot.get("lease_id", ""))
            # Human-readable tenant name for the Tenant column; fall back to a
            # short lease-id fragment only when the lease name is unavailable.
            tenant = neutralize_formula(_snapshot_tenant_name(snapshot) or lease_id[:8])
            period_start = _coerce_date(snapshot["period_start_date"])
            period_end = _coerce_date(snapshot["period_end_date"])
            total_recovery = Decimal(str(snapshot["total_recovery"]))

            # Reference ties each journal entry back to the exact source
            # reconciliation snapshot so a landlord (or auditor) can trace a
            # posted Yardi entry to the CapVeri reconciliation that produced it.
            snapshot_id = str(snapshot.get("id", "")) or lease_id[:8]
            reference = f"CAM-{period_start.year}-{snapshot_id}"
            description = (
                f"CAM Reconciliation {_period_label(period_start, period_end)}"
            )
            post_date = self._format_date(period_end)

            # Debit AR (tenant owes)
            writer.writerow(
                {
                    "Property": property_name,
                    "Unit": "",
                    "Tenant": tenant,
                    "Account": self.AR_ACCOUNT,
                    "Amount": self._format_currency(total_recovery),
                    "Description": description,
                    "Reference": reference,
                    "PostDate": post_date,
                }
            )

            # Credit CAM Revenue (company earns)
            writer.writerow(
                {
                    "Property": property_name,
                    "Unit": "",
                    "Tenant": tenant,
                    "Account": self.CAM_RECOVERY_ACCOUNT,
                    "Amount": self._format_currency(-total_recovery),
                    "Description": description,
                    "Reference": reference,
                    "PostDate": post_date,
                }
            )

        buffer.seek(0)
        return buffer

    def get_filename(self) -> str:
        """Generate Yardi-compatible filename."""
        if self.snapshots:
            period_start = _coerce_date(self.snapshots[0]["period_start_date"])
            return f"Yardi_CAM_Import_{period_start.year}.csv"
        return "Yardi_CAM_Import.csv"

    def get_media_type(self) -> str:
        """Return CSV media type."""
        return "text/csv"


class MRIFormatter(ERPExportGenerator):
    """
    Formatter for MRI Commercial fixed-width format.

    Creates journal entries in MRI's specific fixed-width column format.
    """

    # MRI account codes
    AR_ACCOUNT = "11200"  # Accounts Receivable
    CAM_RECOVERY_ACCOUNT = "41100"  # CAM Recovery Revenue

    def generate(self) -> StringIO:
        """Generate MRI fixed-width format."""
        buffer = StringIO()

        for snapshot in self.snapshots:
            # Strip control chars (esp. newlines/tabs) BEFORE slicing: a line
            # break in a CSV-imported property name would otherwise split this
            # fixed-width record across physical lines and misalign every column.
            property_code = strip_control_chars(
                snapshot.get("properties", {}).get("name", "")
            )[:10]
            # Tenant/entity column: human-readable tenant name, control-char
            # stripped so it can't split the fixed-width record, truncated to
            # the 10-char Entity field. Falls back to the lease id fragment.
            entity = strip_control_chars(
                _snapshot_tenant_name(snapshot) or str(snapshot.get("lease_id", ""))
            )[:10]
            period_start = _coerce_date(snapshot["period_start_date"])
            period_end = _coerce_date(snapshot["period_end_date"])
            total_recovery = Decimal(str(snapshot["total_recovery"]))

            # Two-digit year + 8-char snapshot token keeps the reference inside
            # MRI's 15-char Reference field while staying traceable to the source
            # reconciliation (consistent with the Yardi Reference).
            reference = f"CAM{period_start.year % 100:02d}-{_snapshot_token(snapshot)}"
            description = (
                f"CAM Reconciliation {_period_label(period_start, period_end)}"
            )
            post_date = period_end.strftime("%Y%m%d")

            # Format: Property(10) Entity(10) Account(10) Amount(15)
            #         Desc(30) Ref(15) Date(8)
            # Debit AR
            debit_line = (
                f"{property_code:<10}"
                f"{entity:<10}"
                f"{self.AR_ACCOUNT:<10}"
                f"{self._format_currency(total_recovery):>15}"
                f"{description[:30]:<30}"
                f"{reference[:15]:<15}"
                f"{post_date}"
            )
            buffer.write(debit_line + "\n")

            # Credit Revenue
            credit_line = (
                f"{property_code:<10}"
                f"{entity:<10}"
                f"{self.CAM_RECOVERY_ACCOUNT:<10}"
                f"{self._format_currency(-total_recovery):>15}"
                f"{description[:30]:<30}"
                f"{reference[:15]:<15}"
                f"{post_date}"
            )
            buffer.write(credit_line + "\n")

        buffer.seek(0)
        return buffer

    def get_filename(self) -> str:
        """Generate MRI-compatible filename."""
        if self.snapshots:
            period_start = _coerce_date(self.snapshots[0]["period_start_date"])
            return f"MRI_CAM_Import_{period_start.year}.txt"
        return "MRI_CAM_Import.txt"

    def get_media_type(self) -> str:
        """Return plain text media type."""
        return "text/plain"


class GenericCSVFormatter(ERPExportGenerator):
    """
    Generic CSV formatter for systems without specific format requirements.

    Creates a standard CSV with all reconciliation fields for manual import.
    """

    def generate(self) -> StringIO:
        """Generate generic CSV format."""
        buffer = StringIO()
        writer = csv.DictWriter(
            buffer,
            fieldnames=[
                "Property",
                "Unit",
                "Tenant",
                "Period Start",
                "Period End",
                "Total Expenses",
                "Grossed Up Expenses",
                "Base Year Amount",
                "Tenant Share Before Cap",
                "Tenant Share After Cap",
                "Admin Fee",
                "Amount Due",
            ],
        )

        writer.writeheader()

        for snapshot in self.snapshots:
            property_name = neutralize_formula(
                snapshot.get("properties", {}).get("name", "N/A")
            )
            lease_id = str(snapshot.get("lease_id", ""))
            tenant = neutralize_formula(_snapshot_tenant_name(snapshot) or lease_id)

            writer.writerow(
                {
                    "Property": property_name,
                    "Unit": "",
                    "Tenant": tenant,
                    "Period Start": self._format_date(snapshot["period_start_date"]),
                    "Period End": self._format_date(snapshot["period_end_date"]),
                    "Total Expenses": self._format_currency(
                        snapshot["total_operating_expenses"]
                    ),
                    "Grossed Up Expenses": self._format_currency(
                        snapshot["grossed_up_expenses"]
                    ),
                    "Base Year Amount": self._format_currency(
                        snapshot["base_year_amount"]
                    ),
                    "Tenant Share Before Cap": self._format_currency(
                        snapshot["tenant_share_before_cap"]
                    ),
                    "Tenant Share After Cap": self._format_currency(
                        snapshot["tenant_share_after_cap"]
                    ),
                    "Admin Fee": self._format_currency(snapshot["admin_fee"]),
                    "Amount Due": self._format_currency(snapshot["total_recovery"]),
                }
            )

        buffer.seek(0)
        return buffer

    def get_filename(self) -> str:
        """Generate generic CSV filename."""
        if self.snapshots:
            period_start = _coerce_date(self.snapshots[0]["period_start_date"])
            return f"CAM_Reconciliation_{period_start.year}.csv"
        return "CAM_Reconciliation.csv"

    def get_media_type(self) -> str:
        """Return CSV media type."""
        return "text/csv"


@router.get(
    "/reconciliation/snapshots/{snapshot_id}/export/erp",
)
async def export_snapshot_erp(
    snapshot_id: UUID,
    ctx: OrgContext,
    format: Annotated[ERPFormat, Query(...)] = ERPFormat.CSV,
) -> StreamingResponse:
    """
    Export a reconciliation snapshot in ERP-compatible format.

    Generates balanced journal entries suitable for import into Yardi, MRI,
    or other property management systems.

    Args:
        snapshot_id: UUID of the snapshot to export
        ctx: Organization context for RLS
        format: Export format (yardi, mri, csv)

    Returns:
        StreamingResponse with CSV or text file

    Raises:
        NotFoundError: If snapshot doesn't exist or doesn't belong to organization
        BadRequestError: If snapshot is not finalized
    """

    # Fetch snapshot with related data
    snapshot_result = (
        ctx.table("reconciliation_snapshots")
        .select("*, properties!inner(id, name), leases!inner(tenant_name)")
        .eq("id", str(snapshot_id))
        .eq("organization_id", str(ctx.organization_id))
        .execute()
    )

    if not snapshot_result.data or len(snapshot_result.data) == 0:
        raise NotFoundError("snapshot", str(snapshot_id))

    snapshot_data = snapshot_result.data[0]
    _verify_snapshot_property_scope(ctx, snapshot_data, snapshot_id)

    # Only allow export of finalized snapshots
    if snapshot_data["status"] != ReconciliationStatus.FINALIZED.value:
        raise BadRequestError(
            "Cannot export draft snapshot. Snapshot must be finalized."
        )

    # Select formatter based on format
    formatter: YardiFormatter | MRIFormatter | GenericCSVFormatter
    if format == ERPFormat.YARDI:
        formatter = YardiFormatter([snapshot_data])
    elif format == ERPFormat.MRI:
        formatter = MRIFormatter([snapshot_data])
    else:
        formatter = GenericCSVFormatter([snapshot_data])

    # Generate export
    export_buffer = formatter.generate()
    filename = formatter.get_filename()
    media_type = formatter.get_media_type()

    # Return streaming response
    return StreamingResponse(
        export_buffer,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


@router.get(
    "/reconciliation/snapshots/export/erp/batch",
)
async def export_snapshots_batch_erp(
    ctx: OrgContext,
    property_id: Annotated[UUID, Query(...)],
    period_start: Annotated[date, Query(...)],
    period_end: Annotated[date, Query(...)],
    format: Annotated[ERPFormat, Query(...)] = ERPFormat.CSV,
) -> StreamingResponse:
    """
    Batch export all finalized snapshots for a property and period.

    Exports multiple reconciliation snapshots as a single ERP import file,
    useful for bulk journal entry import at period-end.

    Args:
        ctx: Organization context for RLS
        property_id: UUID of the property
        period_start: Start date of the period
        period_end: End date of the period
        format: Export format (yardi, mri, csv)

    Returns:
        StreamingResponse with CSV or text file

    Raises:
        NotFoundError: If no finalized snapshots found for the criteria
    """

    property_result = (
        ctx.table("properties")
        .select("id")
        .eq("id", str(property_id))
        .eq("organization_id", str(ctx.organization_id))
        .execute()
    )
    if not property_result.data:
        raise NotFoundError("property", str(property_id))

    # Fetch all finalized snapshots for property and period
    snapshots_result = (
        ctx.table("reconciliation_snapshots")
        .select("*, properties!inner(id, name), leases!inner(tenant_name)")
        .eq("property_id", str(property_id))
        .eq("status", ReconciliationStatus.FINALIZED.value)
        .eq("organization_id", str(ctx.organization_id))
        .lte("period_start_date", period_end.isoformat())
        .gte("period_end_date", period_start.isoformat())
        .execute()
    )

    if not snapshots_result.data or len(snapshots_result.data) == 0:
        raise NotFoundError("reconciliation_snapshots", str(property_id))

    snapshots_data = snapshots_result.data

    # Select formatter based on format
    formatter: YardiFormatter | MRIFormatter | GenericCSVFormatter
    if format == ERPFormat.YARDI:
        formatter = YardiFormatter(snapshots_data)
    elif format == ERPFormat.MRI:
        formatter = MRIFormatter(snapshots_data)
    else:
        formatter = GenericCSVFormatter(snapshots_data)

    # Generate export
    export_buffer = formatter.generate()
    filename = formatter.get_filename()
    media_type = formatter.get_media_type()

    # Return streaming response
    return StreamingResponse(
        export_buffer,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )


# ============================================================================
# Audit Log Export
# ============================================================================


@router.get("/audit-log")
async def export_audit_log(
    ctx: OrgContext,
    user: Annotated[User, Depends(get_current_admin_user)],
    start_date: Annotated[date | None, Query(description="Filter from date")] = None,
    end_date: Annotated[date | None, Query(description="Filter to date")] = None,
    table_name: Annotated[str | None, Query(description="Filter by table name")] = None,
    operation: Annotated[
        str | None, Query(description="Filter by operation (INSERT, UPDATE, DELETE)")
    ] = None,
    row_id: Annotated[
        UUID | None, Query(description="Filter by specific record ID")
    ] = None,
    changed_by: Annotated[
        UUID | None, Query(description="Filter by user who made the change")
    ] = None,
    limit: Annotated[
        int, Query(ge=1, le=5000, description="Maximum rows to export")
    ] = 1000,
) -> StreamingResponse:
    """
    Export audit log entries as CSV (admin only).

    Exports a CSV file of audit log entries for the organization. Supports
    filtering by date range, table name, and operation type.

    The audit log captures changes to financial data including:
    - GL entries (INSERT, DELETE)
    - Reconciliation snapshots (INSERT, UPDATE, DELETE)
    - Lease recovery profile changes (UPDATE)

    Args:
        ctx: Organization-scoped context with authenticated user
        user: Admin user (enforces admin-only access)
        start_date: Filter entries from this date (inclusive)
        end_date: Filter entries to this date (inclusive)
        table_name: Filter by specific table (gl_entries, snapshots, leases)
        operation: Filter by operation type (INSERT, UPDATE, DELETE)
        row_id: Filter by the specific record that was changed
        changed_by: Filter by the user who made the change
        limit: Maximum number of audit log rows to export

    Returns:
        StreamingResponse with CSV file containing audit entries
    """
    org_id = str(ctx.organization_id)

    # Build query with filters
    query = ctx.table("audit_log").select("*").eq("organization_id", org_id)

    if start_date:
        query = query.gte("changed_at", start_date.isoformat())

    if end_date:
        # Include the entire end date by adding one day
        end_datetime = datetime.combine(end_date, datetime.max.time())
        query = query.lte("changed_at", end_datetime.isoformat())

    if table_name:
        query = query.eq("table_name", table_name)

    if operation:
        query = query.eq("operation", operation.upper())

    if row_id:
        query = query.eq("row_id", str(row_id))

    if changed_by:
        query = query.eq("changed_by", str(changed_by))

    # Order by most recent first
    query = query.order("changed_at", desc=True).limit(limit)

    # Execute query
    result = query.execute()
    entries = result.data if result.data else []

    # Generate CSV
    buffer = StringIO()
    fieldnames = [
        "id",
        "table_name",
        "operation",
        "row_id",
        "old_data",
        "new_data",
        "changed_by",
        "changed_at",
    ]
    writer = csv.DictWriter(buffer, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()

    for entry in entries:
        # Convert JSONB fields to string for CSV
        row = {
            "id": entry.get("id"),
            "table_name": entry.get("table_name"),
            "operation": entry.get("operation"),
            "row_id": entry.get("row_id"),
            "old_data": str(entry.get("old_data")) if entry.get("old_data") else "",
            "new_data": str(entry.get("new_data")) if entry.get("new_data") else "",
            "changed_by": entry.get("changed_by"),
            "changed_at": entry.get("changed_at"),
        }
        writer.writerow(row)

    buffer.seek(0)

    # Generate filename with date
    timestamp = datetime.now(UTC).strftime("%Y%m%d")
    filename = f"audit_log_{timestamp}.csv"

    return StreamingResponse(
        buffer,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
