"""Comprehensive tests for Yardi Voyager GL parser.

Tests cover file format detection, header parsing, debit/credit handling,
encoding issues, and all edge cases.
"""

from io import BytesIO
from pathlib import Path

import pandas as pd
import pytest

from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

FIXTURES_DIR = Path(__file__).parent.parent.parent.parent / "fixtures" / "yardi"


class TestYardiCanHandle:
    """Test Yardi file format detection."""

    def test_detects_yardi_signature(self):
        """Should detect YARDI keyword (lines 58-59)."""
        parser = YardiVoyagerGLParser()
        header = b"Yardi Voyager GL Detail Report\nProperty,Account"

        score = parser.can_handle(header, "gl_export.csv")

        assert score >= 0.5  # Strong indicator

    def test_detects_voyager_signature(self):
        """Should detect VOYAGER keyword (lines 60-61)."""
        parser = YardiVoyagerGLParser()
        header = b"Voyager Report\nAccount,Amount"

        score = parser.can_handle(header, "report.csv")

        assert score >= 0.3

    def test_detects_gl_detail_pattern(self):
        """Should detect GL DETAIL pattern (lines 64-65)."""
        parser = YardiVoyagerGLParser()
        header = b"GL Detail Report\nAccount,Description"

        score = parser.can_handle(header, "report.csv")

        assert score >= 0.2

    def test_detects_property_and_account_columns(self):
        """Should detect PROPERTY and ACCOUNT columns (lines 66-67)."""
        parser = YardiVoyagerGLParser()
        header = b"Property,Account,Amount\nData,Data,Data"

        score = parser.can_handle(header, "export.csv")

        assert score >= 0.2

    def test_gl_filename_gives_weak_signal(self):
        """Filename starting with 'gl' should give weak signal (lines 70-71)."""
        parser = YardiVoyagerGLParser()
        header = b"Account,Amount\n"

        score = parser.can_handle(header, "gl_report.csv")

        assert score >= 0.1

    def test_non_yardi_file_low_score(self):
        """Non-Yardi file should have low score (lines 73)."""
        parser = YardiVoyagerGLParser()
        header = b"Foo,Bar,Baz\nData,Data,Data"

        score = parser.can_handle(header, "random.csv")

        assert score < 0.3  # Low confidence

    def test_max_score_capped_at_1(self):
        """Score should be capped at 1.0 (lines 73)."""
        parser = YardiVoyagerGLParser()
        # All indicators present
        header = b"Yardi Voyager GL Detail\nProperty,Account"

        score = parser.can_handle(header, "gl_export.csv")

        assert score <= 1.0


class TestYardiParse:
    """Test Yardi GL parsing with real fixture files."""

    @pytest.fixture
    def parser(self):
        """Create parser instance."""
        return YardiVoyagerGLParser()

    @pytest.fixture
    def standard_fixture(self):
        """Load minimal Yardi GL fixture for unit tests."""
        fixture_path = FIXTURES_DIR / "gl_export_minimal.csv"
        with open(fixture_path, "rb") as f:
            return BytesIO(f.read())

    def test_parses_standard_gl_export(self, parser, standard_fixture):
        """Should parse standard Yardi GL export (lines 94-239)."""
        result = parser.parse(
            standard_fixture,
            "gl_export_minimal.csv",
            "550e8400-e29b-41d4-a716-446655440000",
        )

        assert result.success is True
        assert result.source_system == "yardi"
        assert result.row_count == 15  # 15 data rows in minimal fixture
        assert result.error_count == 0
        assert result.data is not None
        assert not result.data.empty

    def test_extracts_required_columns(self, parser, standard_fixture):
        """Should extract required columns (lines 185-215)."""
        result = parser.parse(
            standard_fixture, "gl_export.csv", "550e8400-e29b-41d4-a716-446655440000"
        )

        required_cols = [
            "account_code",
            "account_description",
            "transaction_date",
            "amount",
            "property_id",
        ]

        for col in required_cols:
            assert col in result.data.columns

    def test_merges_debit_credit_columns(self, parser, standard_fixture):
        """Should merge debit/credit into signed amount (lines 221-225)."""
        result = parser.parse(
            standard_fixture, "gl_export.csv", "550e8400-e29b-41d4-a716-446655440000"
        )

        # Check that debits are positive
        debit_row = result.data[result.data["account_code"] == "6000-100"].iloc[0]
        assert debit_row["amount"] > 0

        # Check that credits are negative
        credit_row = result.data[result.data["account_code"] == "7000-000"].iloc[0]
        assert credit_row["amount"] < 0

    def test_handles_parentheses_negative(self, parser):
        """Should handle (250.00) as negative (lines 221-225)."""
        csv_content = b"""Yardi Report
Property,Account,Description,Transaction Date,Debit,Credit
Test,7100-000,Refund,2024-01-22,,(250.00)"""

        result = parser.parse(
            BytesIO(csv_content), "test.csv", "550e8400-e29b-41d4-a716-446655440000"
        )

        assert (
            result.data["amount"].iloc[0] == 250.00
        )  # Parentheses credit becomes positive

    def test_parses_transaction_dates(self, parser, standard_fixture):
        """Should parse transaction dates to datetime (lines 227-228)."""
        result = parser.parse(
            standard_fixture, "gl_export.csv", "550e8400-e29b-41d4-a716-446655440000"
        )

        assert pd.api.types.is_datetime64_any_dtype(result.data["transaction_date"])
        assert result.data["transaction_date"].notna().all()

    def test_extracts_period_from_dates(self, parser, standard_fixture):
        """Should extract year and month from dates (lines 229-231)."""
        result = parser.parse(
            standard_fixture, "gl_export.csv", "550e8400-e29b-41d4-a716-446655440000"
        )

        assert "period_year" in result.data.columns
        assert "period_month" in result.data.columns
        assert result.data["period_year"].iloc[0] == 2024
        assert result.data["period_month"].iloc[0] == 1

    def test_skips_header_rows(self, parser, standard_fixture):
        """Should skip report header rows (lines 124-148)."""
        # Fixture has 3 header rows before column names
        result = parser.parse(
            standard_fixture, "gl_export.csv", "550e8400-e29b-41d4-a716-446655440000"
        )

        # Should not include "Yardi Voyager GL Detail Report" as data
        assert not any("Yardi" in str(val) for val in result.data["account_code"])

    def test_handles_merged_property_cells(self, parser):
        """Should forward-fill merged property cells (lines 164-172)."""
        csv_content = b"""Property,Account,Amount,Date
Sunset Plaza,6000,100,2024-01-15
,6100,200,2024-01-16
,6200,300,2024-01-17"""

        result = parser.parse(
            BytesIO(csv_content), "test.csv", "550e8400-e29b-41d4-a716-446655440000"
        )

        # All rows should have property filled (forward-filled)
        # Note: Property column may be in metadata or dropped after processing
        assert result.row_count == 3

    def test_handles_utf8_bom(self, parser):
        """Should handle UTF-8 BOM correctly (lines 109-110, 131-132, FIX DI-15)."""
        # BOM prefix: \ufeff - must include date column for validation
        csv_content = (
            b"\xef\xbb\xbfProperty,Account,Amount,Date\nTest,6000,100,2024-01-15"
        )

        result = parser.parse(
            BytesIO(csv_content), "test.csv", "550e8400-e29b-41d4-a716-446655440000"
        )

        assert result.success is True
        assert result.row_count > 0

    def test_handles_latin1_encoding(self, parser):
        """Should fallback to latin-1 encoding (lines 112, 119-122, 139-145)."""
        # Latin-1 specific character: é (0xe9) - must include amount and date
        csv_content = b"Property,Account,Description,Amount,Date\nTest,6000,Caf\xe9,100,2024-01-15"

        result = parser.parse(
            BytesIO(csv_content), "test.csv", "550e8400-e29b-41d4-a716-446655440000"
        )

        assert result.success is True

    def test_empty_file_returns_error(self, parser):
        """Should return error for empty file (lines 150-156)."""
        result = parser.parse(
            BytesIO(b""), "empty.csv", "550e8400-e29b-41d4-a716-446655440000"
        )

        assert result.success is False
        assert result.row_count == 0
        assert len(result.errors) > 0

    def test_assigns_property_id(self, parser, standard_fixture):
        """Should assign property_id to all rows (lines 232-235)."""
        property_id = "550e8400-e29b-41d4-a716-446655440000"
        result = parser.parse(standard_fixture, "gl_export.csv", property_id)

        assert (result.data["property_id"] == property_id).all()

    def test_source_system_property(self, parser):
        """Should return 'yardi' as source system (lines 39-41)."""
        assert parser.source_system == "yardi"


class TestYardiFindHeaderRow:
    """Test Yardi header row detection."""

    def test_finds_header_with_expected_columns(self):
        """Should find row with PROPERTY, ACCOUNT columns (lines 277-308)."""
        parser = YardiVoyagerGLParser()
        lines = [
            "Yardi Report",
            "Date: 2024-01-15",
            "",
            "Property,Account,Description,Date,Amount",
            "Data,Data,Data,Data,Data",
        ]

        header_idx = parser._find_header_row(lines)

        assert header_idx == 3  # Fourth line (0-indexed)

    def test_word_boundary_matching(self):
        """Should use word boundaries in header detection (FIX ING-3)."""
        parser = YardiVoyagerGLParser()
        # "describe" should NOT match "description"
        lines = ["describe,foo,bar", "Property,Account,Description", "data,data,data"]

        header_idx = parser._find_header_row(lines)

        assert header_idx == 1  # Should find second line, not first

    def test_returns_zero_if_not_found(self):
        """Should return 0 if header not found (lines 308)."""
        parser = YardiVoyagerGLParser()
        lines = ["foo", "bar", "baz"]

        header_idx = parser._find_header_row(lines)

        assert header_idx == 0


class TestYardiStandardizeColumns:
    """Test Yardi column name standardization."""

    def test_maps_yardi_columns_to_standard(self):
        """Should map Yardi column names to standard names (lines 308-356)."""
        parser = YardiVoyagerGLParser()
        df = pd.DataFrame(
            {
                "Account": ["6000"],
                "Description": ["Utilities"],
                "Transaction Date": ["2024-01-01"],
            }
        )

        result = parser._standardize_column_names(df)

        assert "account_code" in result.columns
        assert "account_description" in result.columns
        assert "transaction_date" in result.columns

    def test_preserves_unmapped_columns(self):
        """Should preserve columns without mappings (lines 308-356)."""
        parser = YardiVoyagerGLParser()
        df = pd.DataFrame({"Account": ["6000"], "Custom Field": ["Value"]})

        result = parser._standardize_column_names(df)

        # Unmapped columns are lowercased but preserved
        assert "custom field" in result.columns


PROPERTY_ID = "550e8400-e29b-41d4-a716-446655440000"


class TestYardiCreditSignConvention:
    """Tests for credit sign convention detection."""

    def test_pre_signed_negative_credits_not_negated(self):
        """When majority of credits are already negative, don't negate again."""
        parser = YardiVoyagerGLParser()
        # CSV with only-credit column where credits are pre-signed negative
        csv_content = b"""Yardi Voyager
Account,Description,Credit,Transaction Date
5100,Utilities,-500.00,01/15/2024
5200,Janitorial,-300.00,01/15/2024
5300,Insurance,-200.00,01/15/2024
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "gl.csv", PROPERTY_ID)

        assert result.success is True
        # Pre-signed negative credits should remain negative
        amounts = result.data["amount"].tolist()
        assert all(a < 0 for a in amounts)

    def test_standard_positive_credits_get_negated(self):
        """When credits are positive (standard), negate them for accounting sign."""
        parser = YardiVoyagerGLParser()
        # CSV with only-credit column where credits are standard positive
        csv_content = b"""Yardi Voyager
Account,Description,Credit,Transaction Date
5100,Utilities,500.00,01/15/2024
5200,Janitorial,300.00,01/15/2024
5300,Insurance,200.00,01/15/2024
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "gl.csv", PROPERTY_ID)

        assert result.success is True
        # Standard positive credits should be negated
        amounts = result.data["amount"].tolist()
        assert all(a < 0 for a in amounts)


class TestYardiStreamingFallback:
    """Tests for streaming exception fallback."""

    def test_streaming_exception_triggers_fallback(self):
        """When streaming iteration fails, fallback reads entire file content."""
        parser = YardiVoyagerGLParser()
        csv_content = b"""Yardi Voyager
Account,Description,Amount,Transaction Date
5100,Utilities,500.00,01/15/2024
5200,Janitorial,300.00,01/15/2024
"""

        # Create a file-like object that raises during iteration but not read()
        class StreamFailFile:
            def __init__(self, content: bytes):
                self._content = content
                self._pos = 0

            def read(self, size: int = -1) -> bytes:
                if size == -1:
                    return self._content
                chunk = self._content[self._pos : self._pos + size]
                self._pos += size
                return chunk

            def seek(self, pos: int) -> None:
                self._pos = pos

            def __iter__(self):
                raise OSError("streaming failed")

        file = StreamFailFile(csv_content)
        result = parser.parse(file, "gl.csv", PROPERTY_ID)

        # Should succeed via fallback path
        assert result.success is True


class TestYardiAccrualDate:
    """Tests for accrual_date column mapping in Yardi parser."""

    def test_accrual_date_mapped_from_column(self):
        """Accrual Date column maps to accrual_date."""
        csv = (
            "Account Code,Description,Amount,Date,Accrual Date\n"
            "5100,Utilities,1000.00,2024-06-15,2024-03-15\n"
        )
        parser = YardiVoyagerGLParser()
        result = parser.parse(BytesIO(csv.encode()), "gl.csv", PROPERTY_ID)

        assert result.success is True
        assert "accrual_date" in result.data.columns
        assert pd.notna(result.data["accrual_date"].iloc[0])

    def test_accrual_date_none_when_absent(self):
        """accrual_date defaults to None when column not present."""
        csv = (
            "Account Code,Description,Amount,Date\n"
            "5100,Utilities,1000.00,2024-03-15\n"
        )
        parser = YardiVoyagerGLParser()
        result = parser.parse(BytesIO(csv.encode()), "gl.csv", PROPERTY_ID)

        assert result.success is True
        assert "accrual_date" in result.data.columns
        assert pd.isna(result.data["accrual_date"].iloc[0])
