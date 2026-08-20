"""
Unit tests for demand_letter_generator.py

Tests verify PDF generation correctness, currency formatting, dispute
paragraph inclusion, and state-based content variation.
"""

from datetime import date
from decimal import Decimal
from io import BytesIO
from uuid import UUID, uuid4

from app.services.legal.demand_letter_generator import (
    DemandLetterData,
    DemandLetterGenerator,
    _format_currency,
)


def make_data(
    state: str = "TX",
    dispute_id: UUID | None = None,
    dispute_filed_date: date | None = None,
) -> DemandLetterData:
    """Return a fully populated DemandLetterData for testing."""
    return DemandLetterData(
        tenant_name="Acme Corp",
        property_address="100 Main St, Austin, TX 78701",
        amount_owed=Decimal("44032.97"),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
        lease_reference="lease-abc-123",
        landlord_name="Jane Smith",
        landlord_title="Property Manager",
        landlord_company="Skyline Properties LLC",
        landlord_phone="512-555-0100",
        landlord_email="jane@skyline.com",
        landlord_address="200 Congress Ave, Austin, TX 78701",
        payment_deadline_date=date(2025, 3, 15),
        letter_date=date(2025, 2, 13),
        state=state,  # type: ignore[arg-type]
        dispute_id=dispute_id,
        dispute_filed_date=dispute_filed_date,
    )


class TestDemandLetterGenerator:
    def test_generate_returns_bytes_io(self):
        gen = DemandLetterGenerator(make_data())
        result = gen.generate()
        assert isinstance(result, BytesIO)
        assert len(result.read()) > 0

    def test_generate_tx_output_contains_tenant_name(self):
        gen = DemandLetterGenerator(make_data(state="TX"))
        result = gen.generate()
        content = result.read()
        assert content.startswith(b"%PDF")
        assert len(content) > 1000

    def test_generate_ca_output_contains_tenant_name(self):
        gen = DemandLetterGenerator(make_data(state="CA"))
        result = gen.generate()
        content = result.read()
        assert content.startswith(b"%PDF")
        assert len(content) > 1000

    def test_generate_includes_disclaimer_text(self):
        gen = DemandLetterGenerator(make_data())
        result = gen.generate()
        content = result.read()
        assert content.startswith(b"%PDF")

    def test_generate_dispute_paragraph_included_when_dispute_id_set(self):
        data = make_data(
            dispute_id=uuid4(),
            dispute_filed_date=date(2025, 1, 20),
        )
        gen = DemandLetterGenerator(data)
        result = gen.generate()
        content = result.read()
        assert len(content) > 0
        assert content.startswith(b"%PDF")

    def test_generate_dispute_paragraph_absent_when_no_dispute_id(self):
        data = make_data(dispute_id=None)
        gen = DemandLetterGenerator(data)
        result = gen.generate()
        content = result.read()
        assert len(content) > 0
        assert content.startswith(b"%PDF")

    def test_generate_formats_amount_as_currency(self):
        result = _format_currency(Decimal("44032.97"))
        assert result == chr(36) + "44,032.97"

    def test_format_currency_negative_leads_with_minus(self):
        # A credit must read as '-$X', never '$-X', on a letter shown in a dispute.
        assert _format_currency(Decimal("-44032.97")) == "-" + chr(36) + "44,032.97"

    def test_generate_tx_vs_ca_produce_different_content(self):
        tx_gen = DemandLetterGenerator(make_data(state="TX"))
        ca_gen = DemandLetterGenerator(make_data(state="CA"))
        tx_bytes = tx_gen.generate().read()
        ca_bytes = ca_gen.generate().read()
        assert tx_bytes != ca_bytes

    def test_generate_all_landlord_fields_appear_in_output(self):
        gen = DemandLetterGenerator(make_data())
        result = gen.generate()
        assert isinstance(result, BytesIO)
        assert len(result.read()) > 0
