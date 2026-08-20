"""Tests for MRI Rent Roll Parser.

Tests cover file detection, parsing, metadata extraction, and edge cases.
"""

from decimal import Decimal
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pandas as pd
import pytest

from app.services.ingestion.parsers.mri_rent_roll import MRIRentRollParser
from app.services.ingestion.schemas import RentRollParseResult


@pytest.fixture
def parser() -> MRIRentRollParser:
    """Create parser instance."""
    return MRIRentRollParser()


@pytest.fixture
def sample_rent_roll_path() -> Path:
    """Path to sample MRI rent roll fixture."""
    # Path: tests/services/ingestion/parsers/test_mri_rent_roll.py
    # -> tests/fixtures/rent_roll/mri_rent_roll_sample.csv
    return (
        Path(__file__).parent.parent.parent.parent
        / "fixtures"
        / "rent_roll"
        / "mri_rent_roll_sample.csv"
    )


@pytest.fixture
def sample_rent_roll_bytes(sample_rent_roll_path: Path) -> bytes:
    """Load sample rent roll as bytes."""
    return sample_rent_roll_path.read_bytes()


class TestCanHandle:
    """Tests for file detection."""

    def test_detects_mri_rent_roll_header(self, parser: MRIRentRollParser) -> None:
        """Parser detects MRI Software signature in header."""
        header = b"MRI Software Rent Roll\nProperty Code: TEST001"
        score = parser.can_handle(header, "rent_roll.csv")
        assert score >= 0.5

    def test_detects_mri_keyword(self, parser: MRIRentRollParser) -> None:
        """Parser detects 'MRI' keyword."""
        header = b"MRI Rent Roll Report\nSome data here"
        score = parser.can_handle(header, "export.csv")
        assert score >= 0.4

    def test_detects_property_code_pattern(self, parser: MRIRentRollParser) -> None:
        """Parser detects Property Code pattern (MRI-specific)."""
        header = b"Property Code: ABC123\nRent Roll Report"
        score = parser.can_handle(header, "data.csv")
        assert score >= 0.3

    def test_detects_mri_column_patterns(self, parser: MRIRentRollParser) -> None:
        """Parser detects MRI-style column names."""
        header = b"Unit Code,RSF,USF,Tenant Code,Tenant Name,Start Date"
        score = parser.can_handle(header, "rent_roll.csv")
        assert score >= 0.3

    def test_low_score_for_yardi_export(self, parser: MRIRentRollParser) -> None:
        """Parser returns low score for Yardi exports."""
        header = b"Yardi Voyager Rent Roll\nProperty: Downtown Tower"
        score = parser.can_handle(header, "yardi_export.csv")
        # Should prefer Yardi parser over MRI parser
        assert score < 0.5

    def test_low_score_for_unrelated_file(self, parser: MRIRentRollParser) -> None:
        """Parser returns low score for unrelated files."""
        header = b"Random CSV file\nColumn1,Column2,Column3"
        score = parser.can_handle(header, "random.csv")
        assert score < 0.3

    def test_filename_boost(self, parser: MRIRentRollParser) -> None:
        """Parser gives boost for MRI or rent roll in filename."""
        header = b"Unit Code,RSF,Tenant"
        score_generic = parser.can_handle(header, "export.csv")
        score_named = parser.can_handle(header, "mri_rent_roll_2024.csv")
        assert score_named > score_generic


class TestParse:
    """Tests for parsing logic."""

    def test_parses_sample_rent_roll(
        self, parser: MRIRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser successfully parses sample MRI rent roll."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "mri_rent_roll_sample.csv")

        assert isinstance(result, RentRollParseResult)
        assert result.success is True
        assert result.source_system == "mri_rent_roll"
        assert len(result.units) == 10  # 10 units, excluding total row
        assert result.row_count == 10

    def test_extracts_property_metadata_from_header(
        self, parser: MRIRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser extracts property name and address from header."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "mri_rent_roll_sample.csv")

        assert result.property_metadata.name == "Downtown Tower"
        assert result.property_metadata.address_line1 == "123 Main Street"
        assert result.property_metadata.city == "Austin"
        assert result.property_metadata.state == "TX"
        assert result.property_metadata.postal_code == "78701"

    def test_extracts_unit_data(
        self, parser: MRIRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser extracts unit information correctly."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "mri_rent_roll_sample.csv")

        # Find unit 101
        unit_101 = next(u for u in result.units if u.unit_number == "101")
        assert unit_101.rentable_sqft == Decimal("1500.00")
        assert unit_101.usable_sqft == Decimal("1350.00")
        assert unit_101.floor == 1

    def test_extracts_lease_data_when_present(
        self, parser: MRIRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser extracts tenant/lease info for occupied units."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "mri_rent_roll_sample.csv")

        # Find occupied unit
        unit_101 = next(u for u in result.units if u.unit_number == "101")
        assert unit_101.tenant_name == "Acme Corporation"
        assert unit_101.lease_start is not None
        assert unit_101.lease_end is not None
        assert unit_101.base_rent == Decimal("3500.00")
        assert unit_101.cam_share == Decimal("0.0523")

    def test_handles_vacant_units(
        self, parser: MRIRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser handles vacant units (no tenant data)."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "mri_rent_roll_sample.csv")

        # Find vacant unit (103, 203, 303 are vacant)
        vacant_units = [u for u in result.units if u.tenant_name is None]
        assert len(vacant_units) == 3

        unit_103 = next(u for u in result.units if u.unit_number == "103")
        assert unit_103.tenant_name is None
        assert unit_103.lease_start is None
        assert unit_103.lease_end is None
        # MRI shows 0.00 for vacant units, which we interpret as None
        assert unit_103.base_rent is None or unit_103.base_rent == Decimal("0.00")
        # But should still have unit info
        assert unit_103.rentable_sqft == Decimal("1000.00")
        assert unit_103.cam_share == Decimal("0.0349")

    def test_skips_total_rows(
        self, parser: MRIRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser skips total/summary rows."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "mri_rent_roll_sample.csv")

        # Should not include the Totals row
        unit_numbers = [u.unit_number for u in result.units]
        assert "Totals" not in unit_numbers
        assert "Total" not in unit_numbers
        assert len(result.units) == 10

    def test_handles_percentage_cam_share(self, parser: MRIRentRollParser) -> None:
        """Parser converts percentage CAM share to decimal."""
        csv_content = b"""MRI Software Rent Roll
Property Name: Test Building

Unit Code,RSF,Tenant Name,Start Date,End Date,Base Rent,CAM %
101,1000,Tenant A,2024-01-01,2026-12-31,2000,5.25
102,1500,Tenant B,2024-01-01,2026-12-31,3000,10.00
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        assert result.success is True
        unit_101 = next(u for u in result.units if u.unit_number == "101")
        # 5.25% should become 0.0525
        assert unit_101.cam_share == Decimal("0.0525")

    def test_handles_different_date_formats(self, parser: MRIRentRollParser) -> None:
        """Parser handles various date formats."""
        csv_content = b"""MRI Rent Roll
Property Name: Test Building

Unit Code,RSF,Tenant Name,Start Date,End Date,Base Rent
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


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_handles_empty_file(self, parser: MRIRentRollParser) -> None:
        """Parser handles empty file gracefully."""
        file = BytesIO(b"")
        result = parser.parse(file, "empty.csv")

        assert result.success is False
        assert len(result.errors) > 0

    def test_handles_header_only_file(self, parser: MRIRentRollParser) -> None:
        """Parser handles file with only headers."""
        csv_content = b"Unit Code,RSF,Tenant Name,Start Date,End Date,Base Rent\n"
        file = BytesIO(csv_content)
        result = parser.parse(file, "headers_only.csv")

        assert result.success is True
        assert len(result.units) == 0
        assert result.row_count == 0

    def test_handles_missing_optional_columns(self, parser: MRIRentRollParser) -> None:
        """Parser works when optional columns are missing."""
        csv_content = b"""MRI Rent Roll
Property Name: Minimal Building

Unit Code,RSF,Tenant Name
101,1000,Tenant A
102,1500,
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "minimal.csv")

        assert result.success is True
        assert len(result.units) == 2

    def test_returns_warnings_for_parsing_issues(
        self, parser: MRIRentRollParser
    ) -> None:
        """Parser returns warnings when data has issues."""
        csv_content = b"""MRI Rent Roll
Property Name: Test Building

Unit Code,RSF,Tenant Name,Start Date,End Date,Base Rent
101,invalid_sqft,Tenant A,2024-01-01,2026-12-31,2000
102,1500,Tenant B,bad_date,2026-12-31,3000
103,1000,Tenant C,2024-01-01,2026-12-31,2500
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        # Should still succeed with valid rows
        assert result.success is True
        # Should have warnings or errors for bad rows
        assert result.error_count > 0 or len(result.warnings) > 0

    def test_source_system_property(self, parser: MRIRentRollParser) -> None:
        """Parser returns correct source system."""
        assert parser.source_system == "mri_rent_roll"


class TestEncodingAndExceptionsMRI:
    """Tests for encoding fallback and exception handling."""

    def test_latin1_encoding_fallback(self, parser: MRIRentRollParser) -> None:
        """Parser falls back to latin-1 when utf-8 fails."""
        csv_header = "MRI Software\nProperty Code: TEST\n\nUnit Code,RSF,Tenant Name\n"
        csv_row = "101,1000,Caf\xe9 Corp\n"
        csv_content = (csv_header + csv_row).encode("latin-1")

        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")
        assert result.success is True
        assert len(result.units) == 1

    def test_top_level_exception_returns_failure(
        self, parser: MRIRentRollParser
    ) -> None:
        """Parser returns failure on unexpected top-level exception."""

        class BadFile:
            def read(self):
                raise RuntimeError("disk read error")

        result = parser.parse(BadFile(), "bad.csv")  # type: ignore[arg-type]
        assert result.success is False
        assert any("Parse error" in e for e in result.errors)

    def test_row_exception_adds_warning(self, parser: MRIRentRollParser) -> None:
        """Exception during row parsing adds warning and continues."""
        csv_content = (
            b"Unit Code,RSF,Tenant Name\n101,1000,Tenant A\n102,1500,Tenant B\n"
        )
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
        self, parser: MRIRentRollParser
    ) -> None:
        """When no header row found, defaults to row 0."""
        csv_content = b"ColA,ColB,ColC\nA1,1000,foo\n"
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")
        assert isinstance(result, RentRollParseResult)

    def test_duplicate_unit_number_skipped(self, parser: MRIRentRollParser) -> None:
        """Second occurrence of same unit number is skipped."""
        csv_content = b"Unit Code,RSF,Tenant Name\n101,1000,First\n101,2000,Second\nB-102,1500,Third\n"
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        assert result.success is True
        assert any("Duplicate" in w for w in result.warnings)
        unit_numbers = [u.unit_number for u in result.units]
        assert unit_numbers.count("101") == 1


class TestHelperEdgeCasesMRI:
    """Tests for helper method edge cases in MRI parser."""

    def test_get_string_value_nan_string(self, parser: MRIRentRollParser) -> None:
        """_get_string_value returns None for literal 'nan' string."""
        row = pd.Series({"unit_number": "nan"})
        assert parser._get_string_value(row, "unit_number") is None

    def test_get_decimal_value_nan_string(self, parser: MRIRentRollParser) -> None:
        """_get_decimal_value returns None for 'nan' string."""
        row = pd.Series({"rentable_sqft": "nan"})
        assert parser._get_decimal_value(row, "rentable_sqft") is None

    def test_get_decimal_value_invalid_string(self, parser: MRIRentRollParser) -> None:
        """_get_decimal_value returns None for unparseable string."""
        row = pd.Series({"rentable_sqft": "not_a_number"})
        assert parser._get_decimal_value(row, "rentable_sqft") is None

    def test_get_int_value_string_error(self, parser: MRIRentRollParser) -> None:
        """_get_int_value returns None for non-numeric string."""
        row = pd.Series({"floor": "penthouse"})
        assert parser._get_int_value(row, "floor") is None

    def test_get_date_value_all_formats_fail(self, parser: MRIRentRollParser) -> None:
        """_get_date_value adds warning when all formats fail."""
        row = pd.Series({"lease_start": "not-a-date-at-all-xyz"})
        warnings: list[str] = []
        result = parser._get_date_value(row, "lease_start", warnings, 0)
        assert result is None
        assert len(warnings) > 0

    def test_get_cam_share_missing_column(self, parser: MRIRentRollParser) -> None:
        """_get_cam_share returns None when column is absent."""
        row = pd.Series({"unit_number": "101"})
        assert parser._get_cam_share(row) is None

    def test_get_cam_share_numeric_greater_than_one(
        self, parser: MRIRentRollParser
    ) -> None:
        """_get_cam_share converts percentage >1 to decimal."""
        row = pd.Series({"cam_share": 5.23})
        result = parser._get_cam_share(row)
        assert result == Decimal("0.0523")

    def test_get_cam_share_string_with_percent(self, parser: MRIRentRollParser) -> None:
        """_get_cam_share parses string with % sign."""
        row = pd.Series({"cam_share": "5.23%"})
        result = parser._get_cam_share(row)
        assert result == Decimal("0.0523")

    def test_get_cam_share_already_decimal(self, parser: MRIRentRollParser) -> None:
        """_get_cam_share returns value <=1 unchanged."""
        row = pd.Series({"cam_share": 0.0523})
        result = parser._get_cam_share(row)
        assert result == Decimal("0.0523")
