"""Property-based stress tests for export text sanitisation.

BUG CLASS
---------
Tenant-facing export generators write user-derived text (property/tenant/vendor
names, descriptions — all reachable from messy Yardi/MRI CSV imports) directly
into file formats without sanitizing:

* **openpyxl (.xlsx)** — a control character (e.g. ``\\x1f``) in a cell raises
  ``IllegalCharacterError``, crashing the entire export.
* **ReportLab PDF** — an unbalanced angle-bracket sequence (e.g. a name like
  ``Building <A>`` or ``</b>``) inside a ``Paragraph`` raises ``ValueError``
  from the XML paraparser, crashing the entire export.

This test suite generates adversarial text that mixes normal characters with
those dangerous tokens, feeds them into every user-text field of each of the
four generators that were fixed, and asserts that ``generate()`` (or
``generate_excel_export()``) completes without raising and returns non-empty
output.  Money / date fields always use valid values; only TEXT fields receive
adversarial input.
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from io import BytesIO
from uuid import uuid4

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.models.denominator_change import (
    DenominatorChange,
    DenominatorChangeReport,
    DenominatorChangeType,
    TenantShareImpact,
)
from app.models.sb1103 import SB1103ExportData, SB1103GLEntry, SB1103Request
from app.services.compliance.sb1103_service import (
    compute_window_start,
    generate_excel_export,
)
from app.services.legal.demand_letter_generator import (
    DemandLetterData,
    DemandLetterGenerator,
)
from app.services.reports.denominator_change_report import (
    DenominatorChangeReportGenerator,
)

# ---------------------------------------------------------------------------
# Shared settings
# ---------------------------------------------------------------------------

STRESS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# ---------------------------------------------------------------------------
# Adversarial text strategy
#
# The alphabet deliberately includes the two classes that previously crashed:
#   - Unbalanced XML markup: <, >, /, complete tags like </b>, <i
#   - Control characters tolerated by ReportLab but rejected by openpyxl: \x00,
#     \x1f, \x0b
#   - Ampersands (tolerated by both; included to prove no false positive)
# ---------------------------------------------------------------------------

_FRAGMENTS = list("abc 0123<>&/") + [
    "</b>",
    "<i",
    chr(31),
    chr(0),
    chr(11),
    "&amp;",
    "<unclosed",
    "Tom <Jerry",
    "Building <A>",
    ">bad",
    "<<>>",
]

adversarial = st.lists(
    st.sampled_from(_FRAGMENTS),
    min_size=0,
    max_size=10,
).map("".join)


# ---------------------------------------------------------------------------
# FIX 1 — SB 1103 Excel export (openpyxl)
# ---------------------------------------------------------------------------


def _make_sb1103_export_data(
    property_name: str,
    property_address: str,
    tenant_name: str,
    requested_by_name: str,
    requested_by_email: str,
    account_code: str,
    account_description: str,
    vendor_name: str,
    description: str,
    category: str,
) -> SB1103ExportData:
    request_date = date(2025, 1, 15)
    req = SB1103Request(
        id=uuid4(),
        organization_id=uuid4(),
        property_id=uuid4(),
        lease_id=uuid4(),
        requested_by_name=requested_by_name,
        requested_by_email=requested_by_email,
        request_date=request_date,
        response_deadline=request_date,
        window_start_date=compute_window_start(request_date),
        window_end_date=request_date,
        status="pending",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    entry = SB1103GLEntry(
        id=uuid4(),
        transaction_date=date(2024, 6, 15),
        account_code=account_code,
        account_description=account_description,
        vendor_name=vendor_name,
        description=description,
        amount=Decimal("1000.00"),
        import_batch_id=uuid4(),
        tenant_share_amount=Decimal("100.00"),
    )
    return SB1103ExportData(
        request=req,
        property_address=property_address,
        property_name=property_name,
        tenant_name=tenant_name,
        pro_rata_share=Decimal("0.10"),
        gl_entries=[entry],
        category_subtotals={category: Decimal("100.00")},
        is_ca_property=True,
        total_cam_expenses=Decimal("1000.00"),
        total_tenant_share=Decimal("100.00"),
    )


@STRESS
@given(
    property_name=adversarial,
    property_address=adversarial,
    tenant_name=adversarial,
    account_code=adversarial,
    account_description=adversarial,
    vendor_name=adversarial,
    description=adversarial,
    category=adversarial,
)
def test_sb1103_excel_export_survives_adversarial_text(
    property_name: str,
    property_address: str,
    tenant_name: str,
    account_code: str,
    account_description: str,
    vendor_name: str,
    description: str,
    category: str,
) -> None:
    """generate_excel_export must not raise on any combination of dirty text.

    requested_by_name / requested_by_email are fixed to valid values because
    SB1103Request validates them (min length + email format).  The cover sheet
    does write those two fields to the worksheet so they ARE covered by the
    fix, but the Pydantic model enforces them to be valid strings before the
    data ever reaches the generator.
    """
    export_data = _make_sb1103_export_data(
        property_name=property_name,
        property_address=property_address,
        tenant_name=tenant_name,
        requested_by_name="Jane Smith",
        requested_by_email="jane@tenant.com",
        account_code=account_code,
        account_description=account_description,
        vendor_name=vendor_name,
        description=description,
        category=category,
    )
    result = generate_excel_export(export_data)
    assert isinstance(result, BytesIO)
    assert result.read(4) == b"PK\x03\x04"  # xlsx ZIP magic


# ---------------------------------------------------------------------------
# FIX 2 — Demand letter PDF (ReportLab)
# ---------------------------------------------------------------------------


@STRESS
@given(
    tenant_name=adversarial,
    property_address=adversarial,
    lease_reference=adversarial,
    landlord_name=adversarial,
    landlord_title=adversarial,
    landlord_company=adversarial,
    landlord_phone=adversarial,
    landlord_email=adversarial,
    landlord_address=adversarial,
    state=st.sampled_from(["TX", "CA"]),
)
def test_demand_letter_pdf_survives_adversarial_text(
    tenant_name: str,
    property_address: str,
    lease_reference: str,
    landlord_name: str,
    landlord_title: str,
    landlord_company: str,
    landlord_phone: str,
    landlord_email: str,
    landlord_address: str,
    state: str,
) -> None:
    """DemandLetterGenerator.generate() must not raise on any dirty text input."""
    data = DemandLetterData(
        tenant_name=tenant_name,
        property_address=property_address,
        amount_owed=Decimal("44032.97"),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        lease_reference=lease_reference,
        landlord_name=landlord_name,
        landlord_title=landlord_title,
        landlord_company=landlord_company,
        landlord_phone=landlord_phone,
        landlord_email=landlord_email,
        landlord_address=landlord_address,
        payment_deadline_date=date(2025, 3, 15),
        letter_date=date(2025, 2, 13),
        state=state,  # type: ignore[arg-type]
    )
    result = DemandLetterGenerator(data).generate()
    assert isinstance(result, BytesIO)
    content = result.read()
    assert len(content) > 0
    assert content[:4] == b"%PDF"


# ---------------------------------------------------------------------------
# FIX 4 — Denominator change report PDF (ReportLab)
# ---------------------------------------------------------------------------


@STRESS
@given(
    property_name=adversarial,
    prior_period=adversarial,
    current_period=adversarial,
    summary=adversarial,
    change_description=adversarial,
)
def test_denominator_change_report_survives_adversarial_text(
    property_name: str,
    prior_period: str,
    current_period: str,
    summary: str,
    change_description: str,
) -> None:
    """DenominatorChangeReportGenerator.generate() must not raise on dirty text."""
    report = DenominatorChangeReport(
        property_id=uuid4(),
        property_name=property_name,
        prior_period=prior_period,
        current_period=current_period,
        prior_total_rsf=Decimal("100000"),
        current_total_rsf=Decimal("105000"),
        rsf_delta=Decimal("5000"),
        rsf_delta_percent=Decimal("5.00"),
        changes=[
            DenominatorChange(
                change_type=DenominatorChangeType.RSF_REMEASUREMENT,
                description=change_description,
                prior_value="100,000 RSF",
                current_value="105,000 RSF",
                impact_description="5% increase",
            )
        ],
        tenant_impacts=[
            TenantShareImpact(
                lease_id=uuid4(),
                tenant_name="Tenant A",  # Table cell — not a Paragraph, not escaped
                prior_pro_rata_share=Decimal("0.10"),
                current_pro_rata_share=Decimal("0.12"),
                share_delta_pct_points=Decimal("2.00"),
                prior_estimated_recovery=Decimal("50000"),
                current_estimated_recovery=Decimal("60000"),
                recovery_delta=Decimal("10000"),
                contributing_changes=[DenominatorChangeType.RSF_REMEASUREMENT],
            )
        ],
        summary=summary,
        generated_at=datetime.now(UTC),
    )
    result = DenominatorChangeReportGenerator().generate(report)
    assert isinstance(result, bytes)
    assert len(result) > 0
    assert result[:4] == b"%PDF"
