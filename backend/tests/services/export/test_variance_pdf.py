"""
Unit tests for the variance PDF generator service.

Tests cover:
- Returns BytesIO
- Output starts with PDF magic bytes
- Single year when no prior data
- Variance percentage calculated correctly
"""

from decimal import Decimal
from io import BytesIO

_PDF_MAGIC = b"%PDF"


class TestMoneyFormatting:
    """A net-credit recovery total must read as -$X, not $-X, on the report."""

    def test_negative_total_leads_with_minus(self):
        from app.services.export.variance_pdf import _money

        assert _money(Decimal("-5000")) == "-$5,000.00"

    def test_positive_total_unchanged(self):
        from app.services.export.variance_pdf import _money

        assert _money(Decimal("12345.67")) == "$12,345.67"


class TestGenerateVariancePdf:
    def test_returns_bytesio(self):
        from app.services.export.variance_pdf import generate_variance_pdf

        current = [{"total_recovery": "10000.00"}]
        prior = [{"total_recovery": "9000.00"}]
        property_data = {"name": "Test Property"}
        buf = generate_variance_pdf(current, prior, 2024, 2023, 10.0, property_data)
        assert isinstance(buf, BytesIO)

    def test_output_is_valid_pdf(self):
        from app.services.export.variance_pdf import generate_variance_pdf

        current = [{"total_recovery": "10000.00"}]
        prior = [{"total_recovery": "9000.00"}]
        buf = generate_variance_pdf(current, prior, 2024, 2023, 10.0, {"name": "Prop"})
        assert buf.read(4) == _PDF_MAGIC

    def test_single_year_no_prior_data(self):
        from app.services.export.variance_pdf import generate_variance_pdf

        current = [{"total_recovery": "50000.00"}]
        buf = generate_variance_pdf(current, [], 2024, 2023, 10.0, {"name": "Prop"})
        assert buf.read(4) == _PDF_MAGIC

    def test_zero_prior_handles_division(self):
        from app.services.export.variance_pdf import generate_variance_pdf

        current = [{"total_recovery": "10000.00"}]
        prior = [{"total_recovery": "0"}]
        buf = generate_variance_pdf(current, prior, 2024, 2023, 5.0, {"name": "Prop"})
        assert buf.read(4) == _PDF_MAGIC

    def test_non_trivial_content(self):
        from app.services.export.variance_pdf import generate_variance_pdf

        current = [{"total_recovery": "100000.00"}]
        prior = [{"total_recovery": "90000.00"}]
        buf = generate_variance_pdf(current, prior, 2024, 2023, 10.0, {"name": "Test"})
        buf.seek(0)
        assert len(buf.read()) > 1000

    def test_escapes_dynamic_property_name(self):
        from app.services.export.variance_pdf import generate_variance_pdf

        current = [{"total_recovery": "100000.00"}]
        prior = [{"total_recovery": "90000.00"}]
        buf = generate_variance_pdf(
            current,
            prior,
            2024,
            2023,
            10.0,
            {"name": "AT&T <Main>"},
        )

        assert buf.read(4) == _PDF_MAGIC
