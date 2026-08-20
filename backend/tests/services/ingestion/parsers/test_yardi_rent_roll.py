"""Tests for Yardi Rent Roll Parser.

Tests cover file detection, parsing, metadata extraction, and edge cases.
"""

from decimal import Decimal
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pandas as pd
import pytest

from app.services.ingestion.parsers.yardi_rent_roll import YardiRentRollParser
from app.services.ingestion.schemas import RentRollParseResult


@pytest.fixture
def parser() -> YardiRentRollParser:
    """Create parser instance."""
    return YardiRentRollParser()


@pytest.fixture
def sample_rent_roll_path() -> Path:
    """Path to sample Yardi rent roll fixture."""
    # Path: tests/services/ingestion/parsers/test_yardi_rent_roll.py
    # -> tests/fixtures/rent_roll/yardi_rent_roll_sample.csv
    return (
        Path(__file__).parent.parent.parent.parent
        / "fixtures"
        / "rent_roll"
        / "yardi_rent_roll_sample.csv"
    )


@pytest.fixture
def sample_rent_roll_bytes(sample_rent_roll_path: Path) -> bytes:
    """Load sample rent roll as bytes."""
    return sample_rent_roll_path.read_bytes()


class TestCanHandle:
    """Tests for file detection."""

    def test_detects_yardi_rent_roll_header(self, parser: YardiRentRollParser) -> None:
        """Parser detects Yardi Rent Roll signature in header."""
        header = b"Yardi Voyager Rent Roll Report\nProperty: Test Building"
        score = parser.can_handle(header, "rent_roll.csv")
        assert score >= 0.5

    def test_detects_yardi_keyword(self, parser: YardiRentRollParser) -> None:
        """Parser detects 'Yardi' keyword."""
        header = b"Yardi Report\nSome data here"
        score = parser.can_handle(header, "export.csv")
        assert score >= 0.4

    def test_detects_rent_roll_with_voyager(self, parser: YardiRentRollParser) -> None:
        """Parser detects Voyager + Rent Roll keywords."""
        header = b"Voyager Rent Roll\nProperty: Downtown Tower"
        score = parser.can_handle(header, "data.csv")
        assert score >= 0.5

    def test_detects_rent_roll_columns(self, parser: YardiRentRollParser) -> None:
        """Parser detects rent roll column patterns."""
        header = b"Unit,Suite SF,Tenant Name,Lease Start,Lease End"
        score = parser.can_handle(header, "rent_roll.csv")
        assert score >= 0.3

    def test_low_score_for_gl_export(self, parser: YardiRentRollParser) -> None:
        """Parser returns low score for GL exports (different from rent roll)."""
        header = b"Yardi GL Detail Report\nAccount,Debit,Credit"
        score = parser.can_handle(header, "gl_export.csv")
        # Should prefer GL parser over rent roll parser
        assert score < 0.6

    def test_low_score_for_unrelated_file(self, parser: YardiRentRollParser) -> None:
        """Parser returns low score for unrelated files."""
        header = b"Random CSV file\nColumn1,Column2,Column3"
        score = parser.can_handle(header, "random.csv")
        assert score < 0.3

    def test_filename_boost(self, parser: YardiRentRollParser) -> None:
        """Parser gives boost for rent roll in filename."""
        header = b"Unit,SF,Tenant"
        score_generic = parser.can_handle(header, "export.csv")
        score_named = parser.can_handle(header, "rent_roll_2024.csv")
        assert score_named > score_generic


class TestParse:
    """Tests for parsing logic."""

    def test_parses_sample_rent_roll(
        self, parser: YardiRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser successfully parses sample Yardi rent roll."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "yardi_rent_roll_sample.csv")

        assert isinstance(result, RentRollParseResult)
        assert result.success is True
        assert result.source_system == "yardi_rent_roll"
        assert len(result.units) == 10  # 10 units, excluding total row
        assert result.row_count == 10

    def test_extracts_property_metadata_from_header(
        self, parser: YardiRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser extracts property name and address from header."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "yardi_rent_roll_sample.csv")

        assert result.property_metadata.name == "Downtown Tower"
        assert result.property_metadata.address_line1 == "123 Main Street"
        assert result.property_metadata.city == "Austin"
        assert result.property_metadata.state == "TX"
        assert result.property_metadata.postal_code == "78701"

    def test_extracts_unit_data(
        self, parser: YardiRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser extracts unit information correctly."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "yardi_rent_roll_sample.csv")

        # Find unit 101
        unit_101 = next(u for u in result.units if u.unit_number == "101")
        assert unit_101.rentable_sqft == Decimal("1500.00")
        assert unit_101.usable_sqft == Decimal("1350.00")
        assert unit_101.floor == 1

    def test_extracts_lease_data_when_present(
        self, parser: YardiRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser extracts tenant/lease info for occupied units."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "yardi_rent_roll_sample.csv")

        # Find occupied unit
        unit_101 = next(u for u in result.units if u.unit_number == "101")
        assert unit_101.tenant_name == "Acme Corporation"
        assert unit_101.lease_start is not None
        assert unit_101.lease_end is not None
        assert unit_101.base_rent == Decimal("3500.00")
        assert unit_101.cam_share == Decimal("0.0523")

    def test_handles_vacant_units(
        self, parser: YardiRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser handles vacant units (no tenant data)."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "yardi_rent_roll_sample.csv")

        # Find vacant unit (103, 203, 303 are vacant)
        vacant_units = [u for u in result.units if u.tenant_name is None]
        assert len(vacant_units) == 3

        unit_103 = next(u for u in result.units if u.unit_number == "103")
        assert unit_103.tenant_name is None
        assert unit_103.lease_start is None
        assert unit_103.lease_end is None
        assert unit_103.base_rent is None
        # But should still have unit info
        assert unit_103.rentable_sqft == Decimal("1000.00")
        assert unit_103.cam_share == Decimal("0.0349")

    def test_skips_total_rows(
        self, parser: YardiRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser skips total/summary rows."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "yardi_rent_roll_sample.csv")

        # Should not include the Total row
        unit_numbers = [u.unit_number for u in result.units]
        assert "Total" not in unit_numbers
        assert len(result.units) == 10

    def test_handles_different_date_formats(self, parser: YardiRentRollParser) -> None:
        """Parser handles various date formats."""
        csv_content = b"""Yardi Rent Roll
Property: Test Building

Unit,Suite SF,Tenant,Lease Start,Lease End,Rent
101,1000,Tenant A,01/15/2024,12/31/2026,2000
102,1500,Tenant B,2024-03-01,2027-02-28,3000
103,800,Tenant C,15-Jan-2024,31-Dec-2025,1500
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        assert result.success is True
        # All dates should be parsed
        for unit in result.units:
            if unit.tenant_name:
                assert unit.lease_start is not None

    def test_handles_currency_formatting(self, parser: YardiRentRollParser) -> None:
        """Parser handles currency with $, commas, etc."""
        csv_content = b"""Yardi Rent Roll
Property: Test Building

Unit,Suite SF,Tenant,Lease Start,Lease End,Monthly Rent
101,1000,Tenant A,01/01/2024,12/31/2025,"$2,500.00"
102,1500,Tenant B,01/01/2024,12/31/2025,3500
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        assert result.success is True
        unit_101 = next(u for u in result.units if u.unit_number == "101")
        assert unit_101.base_rent == Decimal("2500.00")


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_handles_empty_file(self, parser: YardiRentRollParser) -> None:
        """Parser handles empty file gracefully."""
        file = BytesIO(b"")
        result = parser.parse(file, "empty.csv")

        assert result.success is False
        assert len(result.errors) > 0

    def test_handles_header_only_file(self, parser: YardiRentRollParser) -> None:
        """Parser handles file with only headers."""
        csv_content = b"Unit,Suite SF,Tenant,Lease Start,Lease End,Rent\n"
        file = BytesIO(csv_content)
        result = parser.parse(file, "headers_only.csv")

        assert result.success is True
        assert len(result.units) == 0
        assert result.row_count == 0

    def test_handles_missing_optional_columns(
        self, parser: YardiRentRollParser
    ) -> None:
        """Parser works when optional columns are missing."""
        csv_content = b"""Yardi Rent Roll
Property: Minimal Building

Unit,Suite SF,Tenant
101,1000,Tenant A
102,1500,
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "minimal.csv")

        assert result.success is True
        assert len(result.units) == 2

    def test_returns_warnings_for_parsing_issues(
        self, parser: YardiRentRollParser
    ) -> None:
        """Parser returns warnings when data has issues."""
        csv_content = b"""Yardi Rent Roll
Property: Test Building

Unit,Suite SF,Tenant,Lease Start,Lease End,Rent
101,invalid_sqft,Tenant A,01/01/2024,12/31/2025,2000
102,1500,Tenant B,bad_date,12/31/2025,3000
103,1000,Tenant C,01/01/2024,12/31/2025,2500
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        # Should still succeed with valid rows
        assert result.success is True
        # Should have warnings or errors for bad rows
        assert result.error_count > 0 or len(result.warnings) > 0

    def test_source_system_property(self, parser: YardiRentRollParser) -> None:
        """Parser returns correct source system."""
        assert parser.source_system == "yardi_rent_roll"


class TestEncodingAndExceptions:
    """Tests for encoding fallback and exception handling."""

    def test_latin1_encoding_fallback(self, parser: YardiRentRollParser) -> None:
        """Parser falls back to latin-1 when utf-8 fails."""
        # Build a CSV with latin-1 encoded accented char that's invalid utf-8
        csv_header = "Property: Test Building\n\nUnit,Suite SF,Tenant\n"
        csv_row = "101,1000,Caf\xe9 Corp\n"
        csv_content = (csv_header + csv_row).encode("latin-1")

        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")
        assert result.success is True
        assert len(result.units) == 1

    def test_top_level_exception_returns_failure(
        self, parser: YardiRentRollParser
    ) -> None:
        """Parser returns failure on unexpected top-level exception."""

        class BadFile:
            def read(self):
                raise RuntimeError("disk read error")

        result = parser.parse(BadFile(), "bad.csv")  # type: ignore[arg-type]
        assert result.success is False
        assert any("Parse error" in e for e in result.errors)

    def test_row_exception_adds_warning(self, parser: YardiRentRollParser) -> None:
        """Exception during row parsing adds warning and continues."""
        csv_content = b"Unit,Suite SF,Tenant\n101,1000,Tenant A\n102,1500,Tenant B\n"
        file = BytesIO(csv_content)

        with patch.object(
            parser,
            "_parse_row",
            side_effect=[RuntimeError("row exploded"), None],
        ):
            result = parser.parse(file, "test.csv")

        assert result.success is True
        assert result.error_count > 0

    def test_find_header_row_returns_none_uses_row_0(
        self, parser: YardiRentRollParser
    ) -> None:
        """When no header row found, defaults to row 0."""
        # Content with no rent roll keyword columns
        csv_content = b"ColA,ColB,ColC\n101,1000,foo\n"
        file = BytesIO(csv_content)
        # Should not crash - will attempt to parse from row 0
        result = parser.parse(file, "test.csv")
        assert isinstance(result, RentRollParseResult)

    def test_duplicate_unit_number_skipped(self, parser: YardiRentRollParser) -> None:
        """Second occurrence of same unit number is skipped with warning."""
        csv_content = (
            b"Unit,Suite SF,Tenant\n101,1000,First\n101,2000,Second\n102,1500,Third\n"
        )
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        assert result.success is True
        assert any("Duplicate" in w for w in result.warnings)
        unit_numbers = [u.unit_number for u in result.units]
        assert unit_numbers.count("101") == 1


class TestAddressParsing:
    """Tests for _parse_address edge cases."""

    def test_empty_address_string(self, parser: YardiRentRollParser) -> None:
        """_parse_address handles empty string."""
        result = parser._parse_address("")
        assert result["address_line1"] is None
        assert result["city"] is None

    def test_address_two_parts(self, parser: YardiRentRollParser) -> None:
        """_parse_address handles address with only street and city."""
        result = parser._parse_address("123 Main St, Austin")
        assert result["address_line1"] == "123 Main St"
        assert result["city"] == "Austin"
        assert result["state"] is None

    def test_address_zip_only_in_third_part(self, parser: YardiRentRollParser) -> None:
        """_parse_address extracts zip from third part with no state."""
        result = parser._parse_address("123 Main St, Austin, 78701")
        assert result["postal_code"] == "78701"

    def test_address_state_only_in_third_part(
        self, parser: YardiRentRollParser
    ) -> None:
        """_parse_address extracts state when no zip present."""
        result = parser._parse_address("123 Main St, Austin, TX")
        assert result["state"] == "TX"
        assert result["postal_code"] is None


class TestHelperEdgeCasesYardi:
    """Tests for helper method edge cases in Yardi parser."""

    def test_get_string_value_nan_string(self, parser: YardiRentRollParser) -> None:
        """_get_string_value returns None for literal 'nan' string."""
        row = pd.Series({"unit_number": "nan"})
        assert parser._get_string_value(row, "unit_number") is None

    def test_get_decimal_value_nan_string(self, parser: YardiRentRollParser) -> None:
        """_get_decimal_value returns None for 'nan' string."""
        row = pd.Series({"rentable_sqft": "nan"})
        assert parser._get_decimal_value(row, "rentable_sqft") is None

    def test_get_decimal_value_invalid_string(
        self, parser: YardiRentRollParser
    ) -> None:
        """_get_decimal_value returns None for unparseable string."""
        row = pd.Series({"rentable_sqft": "not_a_number"})
        assert parser._get_decimal_value(row, "rentable_sqft") is None

    def test_get_int_value_string_error(self, parser: YardiRentRollParser) -> None:
        """_get_int_value returns None for non-numeric string."""
        row = pd.Series({"floor": "penthouse"})
        assert parser._get_int_value(row, "floor") is None

    def test_get_date_value_all_formats_fail(self, parser: YardiRentRollParser) -> None:
        """_get_date_value adds warning when all formats fail."""
        row = pd.Series({"lease_start": "not-a-date-at-all-xyz"})
        warnings: list[str] = []
        result = parser._get_date_value(row, "lease_start", warnings, 0)
        assert result is None
        assert len(warnings) > 0
