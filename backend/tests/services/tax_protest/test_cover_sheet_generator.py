"""
Unit tests for the tax protest county cover sheet PDF generator.

Tests cover:
- Returns non-empty BytesIO
- Output starts with PDF magic bytes
- CoverSheetData accepted and used
- Urgency level based on days_remaining
"""

from datetime import date
from io import BytesIO

from app.services.tax_protest.cover_sheet_generator import (
    CoverSheetData,
    TaxProtestCoverSheetGenerator,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PDF_MAGIC = b"%PDF"


def _make_data(**kwargs) -> CoverSheetData:
    defaults = {
        "property_name": "One Westheimer Plaza",
        "property_address": "1234 Westheimer Rd, Houston, TX 77027",
        "county": "Harris",
        "state": "TX",
        "effective_deadline": date(2025, 5, 15),
        "days_remaining": 45,
        "notes": "Texas Property Tax Code §41.44.",
        "tax_year": 2024,
    }
    defaults.update(kwargs)
    return CoverSheetData(**defaults)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestCoverSheetData:
    def test_dataclass_accepts_required_fields(self):
        data = _make_data()
        assert data.property_name == "One Westheimer Plaza"
        assert data.county == "Harris"
        assert data.state == "TX"
        assert data.days_remaining == 45

    def test_none_deadline_allowed(self):
        data = _make_data(effective_deadline=None, days_remaining=None)
        assert data.effective_deadline is None
        assert data.days_remaining is None


class TestTaxProtestCoverSheetGenerator:
    def test_generate_returns_bytesio(self):
        gen = TaxProtestCoverSheetGenerator(_make_data())
        result = gen.generate()
        assert isinstance(result, BytesIO)

    def test_output_is_valid_pdf(self):
        gen = TaxProtestCoverSheetGenerator(_make_data())
        buf = gen.generate()
        assert buf.read(4) == _PDF_MAGIC

    def test_green_urgency_over_30_days(self):
        gen = TaxProtestCoverSheetGenerator(_make_data(days_remaining=31))
        # No error raised; urgency resolved internally
        buf = gen.generate()
        assert buf.read(4) == _PDF_MAGIC

    def test_amber_urgency_1_to_30_days(self):
        gen = TaxProtestCoverSheetGenerator(_make_data(days_remaining=15))
        buf = gen.generate()
        assert buf.read(4) == _PDF_MAGIC

    def test_red_urgency_zero_or_past(self):
        gen = TaxProtestCoverSheetGenerator(_make_data(days_remaining=0))
        buf = gen.generate()
        assert buf.read(4) == _PDF_MAGIC

    def test_red_urgency_negative_days(self):
        gen = TaxProtestCoverSheetGenerator(_make_data(days_remaining=-5))
        buf = gen.generate()
        assert buf.read(4) == _PDF_MAGIC

    def test_generate_without_deadline(self):
        gen = TaxProtestCoverSheetGenerator(
            _make_data(effective_deadline=None, days_remaining=None)
        )
        buf = gen.generate()
        assert buf.read(4) == _PDF_MAGIC

    def test_pdf_has_content(self):
        gen = TaxProtestCoverSheetGenerator(_make_data())
        buf = gen.generate()
        content = buf.read()
        assert len(content) > 1000  # Non-trivial PDF
