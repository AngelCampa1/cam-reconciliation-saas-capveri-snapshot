"""Tests for Generic Rent Roll Parser.

Tests cover flexible column mapping, parsing, and edge cases.
"""

from decimal import Decimal
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

import pandas as pd
import pytest

from app.services.ingestion.parsers.generic_rent_roll import GenericRentRollParser
from app.services.ingestion.schemas import RentRollParseResult


@pytest.fixture
def parser() -> GenericRentRollParser:
    """Create parser instance."""
    return GenericRentRollParser()


@pytest.fixture
def sample_rent_roll_path() -> Path:
    """Path to sample generic rent roll fixture."""
    # Path: tests/services/ingestion/parsers/test_generic_rent_roll.py
    # -> tests/fixtures/rent_roll/generic_rent_roll_sample.csv
    return (
        Path(__file__).parent.parent.parent.parent
        / "fixtures"
        / "rent_roll"
        / "generic_rent_roll_sample.csv"
    )


@pytest.fixture
def sample_rent_roll_bytes(sample_rent_roll_path: Path) -> bytes:
    """Load sample rent roll as bytes."""
    return sample_rent_roll_path.read_bytes()


class TestCanHandle:
    """Tests for file detection."""

    def test_always_returns_baseline_score(self, parser: GenericRentRollParser) -> None:
        """Generic parser always returns a baseline score as fallback."""
        header = b"Some random CSV content"
        score = parser.can_handle(header, "data.csv")
        # Should return low baseline score as fallback
        assert score > 0
        assert score < 0.5

    def test_boosts_score_for_rent_roll_keywords(
        self, parser: GenericRentRollParser
    ) -> None:
        """Parser boosts score when rent roll keywords are present."""
        header = b"Suite Number,Square Feet,Tenant,Lease Start,Rent"
        score = parser.can_handle(header, "rent_roll.csv")
        assert score >= 0.3

    def test_boosts_score_for_rent_roll_filename(
        self, parser: GenericRentRollParser
    ) -> None:
        """Parser boosts score for rent_roll in filename."""
        header = b"Unit,SF,Tenant"
        score_generic = parser.can_handle(header, "data.csv")
        score_named = parser.can_handle(header, "rent_roll_2024.csv")
        assert score_named > score_generic

    def test_lower_than_yardi_for_yardi_content(
        self, parser: GenericRentRollParser
    ) -> None:
        """Generic parser scores lower than Yardi parser for Yardi content."""
        header = b"Yardi Voyager Rent Roll Report\nProperty: Test"
        score = parser.can_handle(header, "yardi.csv")
        # Should be lower than Yardi parser's score
        assert score < 0.5

    def test_lower_than_mri_for_mri_content(
        self, parser: GenericRentRollParser
    ) -> None:
        """Generic parser scores lower than MRI parser for MRI content."""
        header = b"MRI Software Rent Roll\nProperty Code: ABC"
        score = parser.can_handle(header, "mri.csv")
        # Should be lower than MRI parser's score
        assert score < 0.5


class TestParse:
    """Tests for parsing logic."""

    def test_parses_sample_rent_roll(
        self, parser: GenericRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser successfully parses sample generic rent roll."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "generic_rent_roll_sample.csv")

        assert isinstance(result, RentRollParseResult)
        assert result.success is True
        assert result.source_system == "generic_rent_roll"
        assert len(result.units) == 10
        assert result.row_count == 10

    def test_maps_nonstandard_column_names(
        self, parser: GenericRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser maps non-standard column names correctly."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "generic_rent_roll_sample.csv")

        # Find unit A-101
        unit = next(u for u in result.units if u.unit_number == "A-101")
        assert unit.rentable_sqft == Decimal("1500.00")
        assert unit.tenant_name == "Acme Corporation"

    def test_extracts_lease_data(
        self, parser: GenericRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser extracts tenant/lease info correctly."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "generic_rent_roll_sample.csv")

        unit = next(u for u in result.units if u.unit_number == "A-101")
        assert unit.lease_start is not None
        assert unit.lease_end is not None
        assert unit.base_rent == Decimal("3500.00")

    def test_handles_vacant_units(
        self, parser: GenericRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Parser handles vacant units (empty tenant data)."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "generic_rent_roll_sample.csv")

        # Find vacant units (A-103, B-203, C-303)
        vacant_units = [u for u in result.units if u.tenant_name is None]
        assert len(vacant_units) == 3

        unit_a103 = next(u for u in result.units if u.unit_number == "A-103")
        assert unit_a103.tenant_name is None
        assert unit_a103.rentable_sqft == Decimal("1000.00")

    def test_handles_percentage_format(self, parser: GenericRentRollParser) -> None:
        """Parser handles CAM share with percentage sign."""
        csv_content = b"""Unit,Square Feet,Tenant,Share Percentage
101,1000,Tenant A,5.25%
102,1500,Tenant B,10%
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        assert result.success is True
        unit_101 = next(u for u in result.units if u.unit_number == "101")
        # 5.25% should become 0.0525
        assert unit_101.cam_share == Decimal("0.0525")

    def test_handles_various_column_name_formats(
        self, parser: GenericRentRollParser
    ) -> None:
        """Parser handles various column naming conventions."""
        csv_content = b"""Space ID,Rentable Area,Lessee Name,Start,Expiration,Base Monthly
101,1000,Tenant A,2024-01-01,2026-12-31,2000.00
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        assert result.success is True
        assert len(result.units) == 1
        assert result.units[0].unit_number == "101"
        assert result.units[0].rentable_sqft == Decimal("1000.00")
        assert result.units[0].tenant_name == "Tenant A"

    def test_handles_different_date_formats(
        self, parser: GenericRentRollParser
    ) -> None:
        """Parser handles various date formats."""
        csv_content = b"""Unit,SF,Tenant,Start,End
101,1000,Tenant A,01/15/2024,12/31/2026
102,1500,Tenant B,2024-03-01,2027-02-28
103,800,Tenant C,15-Jan-2024,31-Dec-2025
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        assert result.success is True
        for unit in result.units:
            if unit.tenant_name:
                assert unit.lease_start is not None

    def test_no_property_metadata_for_generic(
        self, parser: GenericRentRollParser, sample_rent_roll_bytes: bytes
    ) -> None:
        """Generic parser returns empty property metadata (no header parsing)."""
        file = BytesIO(sample_rent_roll_bytes)
        result = parser.parse(file, "generic_rent_roll_sample.csv")

        # Generic files typically don't have property metadata in header
        # Metadata will be empty or extracted from filename
        assert result.property_metadata is not None


class TestEdgeCases:
    """Tests for edge cases and error handling."""

    def test_handles_empty_file(self, parser: GenericRentRollParser) -> None:
        """Parser handles empty file gracefully."""
        file = BytesIO(b"")
        result = parser.parse(file, "empty.csv")

        assert result.success is False
        assert len(result.errors) > 0

    def test_handles_header_only_file(self, parser: GenericRentRollParser) -> None:
        """Parser handles file with only headers."""
        csv_content = b"Unit,SF,Tenant,Lease Start,Lease End,Rent\n"
        file = BytesIO(csv_content)
        result = parser.parse(file, "headers_only.csv")

        assert result.success is True
        assert len(result.units) == 0
        assert result.row_count == 0

    def test_handles_minimal_columns(self, parser: GenericRentRollParser) -> None:
        """Parser works with minimal columns (unit + sqft only)."""
        csv_content = b"""Unit,SF
101,1000
102,1500
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "minimal.csv")

        assert result.success is True
        assert len(result.units) == 2

    def test_returns_warnings_for_parsing_issues(
        self, parser: GenericRentRollParser
    ) -> None:
        """Parser returns warnings when data has issues."""
        csv_content = b"""Unit,SF,Tenant,Lease Start
101,invalid_sqft,Tenant A,2024-01-01
102,1500,Tenant B,bad_date
103,1000,Tenant C,2024-01-01
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        # Should still succeed with valid rows
        assert result.success is True
        # Should have warnings or errors for bad rows
        assert result.error_count > 0 or len(result.warnings) > 0

    def test_source_system_property(self, parser: GenericRentRollParser) -> None:
        """Parser returns correct source system."""
        assert parser.source_system == "generic_rent_roll"

    def test_handles_currency_formatting(self, parser: GenericRentRollParser) -> None:
        """Parser handles currency with $, commas."""
        csv_content = b"""Unit,SF,Tenant,Rent
101,1000,Tenant A,"$2,500.00"
102,1500,Tenant B,3500
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        assert result.success is True
        unit_101 = next(u for u in result.units if u.unit_number == "101")
        assert unit_101.base_rent == Decimal("2500.00")


class TestDuplicateDetection:
    """Tests for duplicate unit number detection."""

    def test_warns_on_duplicate_unit_numbers(
        self, parser: GenericRentRollParser
    ) -> None:
        """Parser warns when same unit number appears multiple times."""
        csv_content = b"""Unit,SF,Tenant
101,1000,Tenant A
101,2000,Tenant B
102,1500,Tenant C
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        assert result.success is True
        # Should have a warning about duplicate unit
        assert any("Duplicate" in w or "duplicate" in w for w in result.warnings)

    def test_skips_duplicate_units_keeps_first(
        self, parser: GenericRentRollParser
    ) -> None:
        """Parser skips duplicate units and keeps the first occurrence."""
        csv_content = b"""Unit,SF,Tenant
101,1000,First Tenant
101,2000,Second Tenant
102,1500,Third Tenant
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        assert result.success is True
        # Should only have 2 unique units
        assert len(result.units) == 2

        # First occurrence should be kept (1000 sqft, First Tenant)
        unit_101 = next(u for u in result.units if u.unit_number == "101")
        assert unit_101.rentable_sqft == Decimal("1000.00")
        assert unit_101.tenant_name == "First Tenant"

    def test_no_warning_for_unique_units(self, parser: GenericRentRollParser) -> None:
        """Parser does not warn when all units are unique."""
        csv_content = b"""Unit,SF,Tenant
101,1000,Tenant A
102,1500,Tenant B
103,2000,Tenant C
"""
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")

        assert result.success is True
        assert len(result.units) == 3
        # No duplicate warnings
        assert not any("Duplicate" in w or "duplicate" in w for w in result.warnings)


class TestCanHandleScoring:
    """Additional scoring tests for can_handle."""

    def test_single_keyword_match_boosts_score(
        self, parser: GenericRentRollParser
    ) -> None:
        """One keyword match boosts score by 0.1."""
        # Only "UNIT" in content - one keyword match
        header = b"UNIT,Value,Other"
        score = parser.can_handle(header, "data.csv")
        # Base 0.1 + 0.1 keyword = 0.2
        assert score >= 0.2

    def test_rentroll_concatenated_filename_boost(
        self, parser: GenericRentRollParser
    ) -> None:
        """RENTROLL in filename boosts score."""
        header = b"Some data"
        score = parser.can_handle(header, "RENTROLL_2024.csv")
        score_generic = parser.can_handle(header, "data.csv")
        assert score > score_generic

    def test_rent_and_roll_separate_in_filename(
        self, parser: GenericRentRollParser
    ) -> None:
        """RENT and ROLL separately in filename boosts score."""
        header = b"Some data"
        score = parser.can_handle(header, "MY_RENT_DOCUMENT_ROLL.csv")
        score_generic = parser.can_handle(header, "data.csv")
        assert score > score_generic

    def test_score_capped_at_045(self, parser: GenericRentRollParser) -> None:
        """Score is capped at 0.45 regardless of keyword count."""
        # Many keywords to push score high
        header = b"UNIT SUITE SPACE SQFT SF TENANT LEASE RENT OCCUPANT"
        score = parser.can_handle(header, "RENT_ROLL_data.csv")
        assert score <= 0.45

    def test_score_floored_at_005(self, parser: GenericRentRollParser) -> None:
        """Score is floored at 0.05 (Yardi penalty brings it down)."""
        header = b"YARDI VOYAGER MRI SOFTWARE PROPERTY CODE:"
        score = parser.can_handle(header, "data.csv")
        assert score >= 0.05


class TestEncodingFallback:
    """Tests for encoding fallback during CSV parsing."""

    def test_latin1_encoding_fallback(self, parser: GenericRentRollParser) -> None:
        """Parser falls back to latin-1 when utf-8 fails."""
        # Create CSV with latin-1 characters that aren't valid UTF-8
        csv_header = "Unit,SF,Tenant\n"
        csv_row = "101,1000,Caf\xe9 Corp\n"  # \xe9 is é in latin-1, invalid in utf-8
        csv_content = (csv_header + csv_row).encode("latin-1")

        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")
        assert result.success is True
        assert len(result.units) == 1

    def test_completely_invalid_csv_returns_failure(
        self, parser: GenericRentRollParser
    ) -> None:
        """Parser returns failure when CSV cannot be parsed at all."""
        # Patch both read_csv calls to raise so we hit the innermost except
        with patch("pandas.read_csv", side_effect=Exception("unreadable binary")):
            file = BytesIO(b"some binary data")
            result = parser.parse(file, "bad.csv")

        assert result.success is False
        assert any("Could not parse CSV" in e for e in result.errors)

    def test_top_level_exception_returns_failure(
        self, parser: GenericRentRollParser
    ) -> None:
        """Parser returns failure result on unexpected top-level exception."""

        # Mock file.read() to raise
        class BadFile:
            def read(self):
                raise RuntimeError("disk read error")

        result = parser.parse(BadFile(), "bad.csv")  # type: ignore[arg-type]
        assert result.success is False
        assert any("Parse error" in e for e in result.errors)

    def test_row_exception_adds_warning(self, parser: GenericRentRollParser) -> None:
        """Exception during row parsing adds warning and continues."""
        csv_content = b"Unit,SF,Tenant\n101,1000,Tenant A\n102,1500,Tenant B\n"
        file = BytesIO(csv_content)

        with patch.object(
            parser,
            "_parse_row",
            side_effect=[RuntimeError("row exploded"), None],
        ):
            result = parser.parse(file, "test.csv")

        assert result.success is True
        assert result.error_count > 0


class TestHelperEdgeCases:
    """Tests for helper method edge cases."""

    def test_get_string_value_nan_string(self, parser: GenericRentRollParser) -> None:
        """_get_string_value returns None for literal 'nan' string."""
        row = pd.Series({"unit_number": "nan"})
        assert parser._get_string_value(row, "unit_number") is None

    def test_get_decimal_value_float_nan(self, parser: GenericRentRollParser) -> None:
        """_get_decimal_value returns None for float NaN."""
        row = pd.Series({"rentable_sqft": float("nan")})
        assert parser._get_decimal_value(row, "rentable_sqft") is None

    def test_get_decimal_value_nan_string(self, parser: GenericRentRollParser) -> None:
        """_get_decimal_value returns None for 'nan' string."""
        row = pd.Series({"rentable_sqft": "nan"})
        assert parser._get_decimal_value(row, "rentable_sqft") is None

    def test_get_decimal_value_invalid_operation(
        self, parser: GenericRentRollParser
    ) -> None:
        """_get_decimal_value returns None for unparseable strings."""
        row = pd.Series({"rentable_sqft": "not_a_number"})
        assert parser._get_decimal_value(row, "rentable_sqft") is None

    def test_get_cam_share_missing_column(self, parser: GenericRentRollParser) -> None:
        """_get_cam_share returns None when column is absent."""
        row = pd.Series({"unit_number": "101"})
        assert parser._get_cam_share(row) is None

    def test_get_cam_share_string_with_spaces_and_percent(
        self, parser: GenericRentRollParser
    ) -> None:
        """_get_cam_share parses '  50%  ' correctly."""
        row = pd.Series({"cam_share": "  50%  "})
        result = parser._get_cam_share(row)
        assert result == Decimal("0.5000")

    def test_get_cam_share_numeric_greater_than_one(
        self, parser: GenericRentRollParser
    ) -> None:
        """_get_cam_share converts numeric >1 from percentage to decimal."""
        row = pd.Series({"cam_share": 5.23})
        result = parser._get_cam_share(row)
        assert result is not None
        assert result == Decimal("0.0523")

    def test_get_cam_share_decimal_already(self, parser: GenericRentRollParser) -> None:
        """_get_cam_share returns value <=1 unchanged."""
        row = pd.Series({"cam_share": 0.0523})
        result = parser._get_cam_share(row)
        assert result is not None
        assert result == Decimal("0.0523")

    def test_get_int_value_string_error(self, parser: GenericRentRollParser) -> None:
        """_get_int_value returns None for non-numeric string."""
        row = pd.Series({"floor": "penthouse"})
        assert parser._get_int_value(row, "floor") is None

    def test_get_date_value_pandas_fallback(
        self, parser: GenericRentRollParser
    ) -> None:
        """_get_date_value uses pandas auto-detection as fallback."""
        row = pd.Series({"lease_start": "January 15, 2024"})
        warnings: list[str] = []
        result = parser._get_date_value(row, "lease_start", warnings, 0)
        # pandas can parse this format
        assert result is not None

    def test_get_date_value_all_formats_fail_returns_none(
        self, parser: GenericRentRollParser
    ) -> None:
        """_get_date_value returns None and adds warning when all formats fail."""
        row = pd.Series({"lease_start": "not-a-date-at-all-xyz"})
        warnings: list[str] = []
        result = parser._get_date_value(row, "lease_start", warnings, 0)
        assert result is None
        assert len(warnings) > 0


class TestColumnMappingEdgeCases:
    """Tests for column mapping edge cases."""

    def test_multiple_sf_columns_maps_first_to_rentable(
        self, parser: GenericRentRollParser
    ) -> None:
        """When multiple SF columns exist, first non-labeled maps to rentable_sqft."""
        csv_content = b"Unit,Rentable SF,Usable SF,Tenant\n101,1000,900,Tenant A\n"
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")
        assert result.success is True
        assert result.units[0].rentable_sqft == Decimal("1000.00")
        assert result.units[0].usable_sqft == Decimal("900.00")

    def test_floor_exact_match_mapping(self, parser: GenericRentRollParser) -> None:
        """'floor' column maps to floor field via exact match."""
        csv_content = b"Unit,SF,Tenant,floor\n101,1000,Tenant A,3\n"
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")
        assert result.success is True
        assert result.units[0].floor == 3

    def test_row_with_no_unit_number_skipped(
        self, parser: GenericRentRollParser
    ) -> None:
        """Rows with no unit number are skipped."""
        # Use string unit number to prevent pandas float inference
        csv_content = b"Unit,SF,Tenant\n,1000,Tenant A\nB-101,1500,Tenant B\n"
        file = BytesIO(csv_content)
        result = parser.parse(file, "test.csv")
        assert result.success is True
        assert len(result.units) == 1
        assert result.units[0].unit_number == "B-101"
