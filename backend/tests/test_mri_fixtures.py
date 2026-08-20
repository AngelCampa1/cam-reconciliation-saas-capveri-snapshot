"""Tests for MRI rent roll fixtures.

Validates that generated fixtures meet requirements and work with the parser.
"""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pytest

from app.services.ingestion.parsers.mri import MRIRentRollParser

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "mri"
EXPECTED_DIR = Path(__file__).parent / "fixtures" / "expected"


class TestMRIStandardFixture:
    """Tests for the standard MRI rent roll fixture."""

    @pytest.fixture
    def fixture_path(self) -> Path:
        """Return path to standard fixture."""
        return FIXTURES_DIR / "rent_roll_standard.csv"

    @pytest.fixture
    def expected_values(self) -> dict:
        """Load expected values for assertions."""
        with open(EXPECTED_DIR / "mri_rent_roll_standard.json") as f:
            return json.load(f)

    def test_fixture_exists(self, fixture_path: Path) -> None:
        """Fixture file exists and is readable."""
        assert fixture_path.exists()
        assert fixture_path.is_file()
        assert fixture_path.stat().st_size > 0

    def test_fixture_unit_count(
        self, fixture_path: Path, expected_values: dict
    ) -> None:
        """Fixture has expected number of units (50+)."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        # Find the column header row (contains "PERIOD")
        header_idx = next(i for i, line in enumerate(lines) if "PERIOD" in line)

        # Data rows are everything after the column header
        data_rows = len(lines) - header_idx - 1

        # Should have 50+ units as per requirements
        assert data_rows >= 50
        assert data_rows == expected_values["row_count"]

    def test_mri_fingerprint(self, fixture_path: Path) -> None:
        """File header matches MRI detection patterns."""
        with open(fixture_path, "rb") as f:
            header = f.read(1024)

        text = header.decode("utf-8").upper()

        # Check for MRI-specific markers
        assert "MRI" in text
        assert "SOFTWARE" in text or "COMMERCIAL" in text
        assert "RENT ROLL" in text
        assert "PROPERTY" in text
        assert "PERIOD" in text

    def test_file_is_valid_csv(self, fixture_path: Path) -> None:
        """File can be parsed as CSV after headers."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        # Find column header row
        header_idx = next(i for i, line in enumerate(lines) if "PERIOD" in line)

        # Parse CSV starting from header
        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        assert not df.empty
        assert "PERIOD" in df.columns
        assert "REF NUM" in df.columns
        assert "SOURCE" in df.columns
        assert "UNIT" in df.columns
        assert "TENANT" in df.columns
        assert "DEBIT" in df.columns
        assert "CREDIT" in df.columns

    def test_all_mri_columns_present(self, fixture_path: Path) -> None:
        """Fixture contains all required MRI-specific columns."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "PERIOD" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        required_columns = [
            "PERIOD",
            "REF NUM",
            "SOURCE",
            "UNIT",
            "TENANT",
            "SQFT",
            "DEBIT",
            "CREDIT",
        ]

        for col in required_columns:
            assert col in df.columns, f"Missing required column: {col}"

    def test_period_format(self, fixture_path: Path) -> None:
        """PERIOD column has correct format (YYYY-MM)."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "PERIOD" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        # Check period format
        periods = df["PERIOD"].unique()
        for period in periods:
            # Should match YYYY-MM format
            assert len(str(period)) == 7
            assert "-" in str(period)
            parts = str(period).split("-")
            assert len(parts) == 2
            assert len(parts[0]) == 4  # Year
            assert len(parts[1]) == 2  # Month

    def test_mixed_occupancy(self, fixture_path: Path, expected_values: dict) -> None:
        """Fixture includes both occupied and vacant units."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "PERIOD" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        # Count occupied (has tenant name) vs vacant (empty tenant)
        occupied = df["TENANT"].fillna("").astype(str).str.strip() != ""
        occupied_count = occupied.sum()
        vacant_count = (~occupied).sum()

        assert occupied_count > 0
        assert vacant_count > 0
        assert occupied_count == expected_values["occupied_units"]
        assert vacant_count == expected_values["vacant_units"]

    def test_all_lease_statuses_included(self, fixture_path: Path) -> None:
        """Fixture includes various lease statuses."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "PERIOD" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        statuses = df["STATUS"].unique()

        # Should have mix of statuses
        assert len(statuses) >= 2
        # Active should be most common
        assert "ACTIVE" in statuses

    def test_square_footage_realistic(self, fixture_path: Path) -> None:
        """Square footage values are in realistic ranges."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "PERIOD" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        sqft_values = pd.to_numeric(df["SQFT"], errors="coerce")

        # Check realistic ranges (800-5000 sqft per requirements)
        assert sqft_values.min() >= 800
        assert sqft_values.max() <= 5000
        assert sqft_values.mean() > 1000  # Average should be reasonable

    def test_rents_calculated_correctly(self, fixture_path: Path) -> None:
        """Rent amounts are realistic and calculated properly."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "PERIOD" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        # Filter to occupied units only
        occupied = df[df["TENANT"].fillna("").astype(str).str.strip() != ""]

        debits = pd.to_numeric(occupied["DEBIT"], errors="coerce").fillna(0)
        sqft_values = pd.to_numeric(occupied["SQFT"], errors="coerce")

        # Calculate PSF (monthly rent / sqft * 12 for annual)
        monthly_psf = debits / sqft_values
        annual_psf = monthly_psf * 12

        # Should be in $25-45 PSF range (with 15% variance = $21-52)
        assert annual_psf.min() >= 20
        assert annual_psf.max() <= 55
        assert annual_psf.mean() >= 25

    def test_debit_credit_pattern(self, fixture_path: Path) -> None:
        """Debit/credit columns follow expected pattern."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "PERIOD" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        # Debits should have values for occupied units
        debits = df["DEBIT"].fillna("").astype(str).str.strip()
        credits = df["CREDIT"].fillna("").astype(str).str.strip()

        debit_count = (debits != "").sum()
        credit_count = (credits != "").sum()

        # All occupied units should have debits
        assert debit_count > 0
        # Credits should be rare or non-existent (rent roll typically all debits)
        assert credit_count <= debit_count

    def test_expected_values_accuracy(
        self, fixture_path: Path, expected_values: dict
    ) -> None:
        """Expected values JSON matches actual fixture data."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "PERIOD" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        # Verify row count
        assert len(df) == expected_values["row_count"]

        # Verify occupancy
        occupied = df["TENANT"].fillna("").astype(str).str.strip() != ""
        assert occupied.sum() == expected_values["occupied_units"]
        assert (~occupied).sum() == expected_values["vacant_units"]

        # Verify occupancy rate (allow small rounding difference)
        actual_rate = occupied.sum() / len(df)
        assert abs(actual_rate - expected_values["occupancy_rate"]) < 0.01


class TestMRILargeFixture:
    """Tests for the large MRI rent roll fixture (performance testing)."""

    @pytest.fixture
    def fixture_path(self) -> Path:
        """Return path to large fixture."""
        return FIXTURES_DIR / "rent_roll_large.csv"

    @pytest.fixture
    def expected_values(self) -> dict:
        """Load expected values for assertions."""
        with open(EXPECTED_DIR / "mri_rent_roll_large.json") as f:
            return json.load(f)

    def test_fixture_exists(self, fixture_path: Path) -> None:
        """Large fixture file exists."""
        assert fixture_path.exists()
        assert fixture_path.is_file()

    def test_has_200_plus_units(
        self, fixture_path: Path, expected_values: dict
    ) -> None:
        """Large fixture has 200+ units for performance testing."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "PERIOD" in line)
        data_rows = len(lines) - header_idx - 1

        assert data_rows >= 200
        assert data_rows == expected_values["row_count"]

    def test_maintains_data_quality(self, fixture_path: Path) -> None:
        """Large fixture maintains same quality as standard fixture."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "PERIOD" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        # Should have all required columns
        required_columns = ["PERIOD", "REF NUM", "SOURCE", "UNIT", "DEBIT"]
        for col in required_columns:
            assert col in df.columns

        # Should have valid data
        assert not df.empty
        assert df["UNIT"].nunique() == len(df)  # Each unit is unique


class TestMRIParserIntegration:
    """Integration tests for MRI parser with fixtures."""

    @pytest.fixture
    def parser(self) -> MRIRentRollParser:
        """Create parser instance."""
        return MRIRentRollParser()

    @pytest.fixture
    def fixture_path(self) -> Path:
        """Return path to standard fixture."""
        return FIXTURES_DIR / "rent_roll_standard.csv"

    def test_parser_can_handle_fixture(
        self, parser: MRIRentRollParser, fixture_path: Path
    ) -> None:
        """Parser recognizes the standard fixture as MRI format."""
        with open(fixture_path, "rb") as f:
            header = f.read(1024)

        confidence = parser.can_handle(header, "rent_roll_standard.csv")

        # Should have high confidence (>0.8)
        assert confidence >= 0.8

    def test_parser_successfully_processes_fixture(
        self, parser: MRIRentRollParser, fixture_path: Path
    ) -> None:
        """Parser successfully parses the standard fixture."""
        with open(fixture_path, "rb") as f:
            result = parser.parse(
                file=f,
                file_name="rent_roll_standard.csv",
                property_id="test-property-123",
            )

        assert result.success
        assert result.source_system == "mri"
        assert result.row_count > 0
        assert not result.data.empty
        assert result.error_count == 0

    def test_parsed_data_structure(
        self, parser: MRIRentRollParser, fixture_path: Path
    ) -> None:
        """Parsed data has correct structure and columns."""
        with open(fixture_path, "rb") as f:
            result = parser.parse(
                file=f,
                file_name="rent_roll_standard.csv",
                property_id="test-property-123",
            )

        df = result.data

        # Check required columns exist
        assert "account_code" in df.columns
        assert "amount" in df.columns
        assert "property_id" in df.columns
        assert "period" in df.columns

        # Check data types
        assert pd.api.types.is_string_dtype(df["account_code"].dtype)
        assert df["amount"].dtype == float

        # Check property_id was set
        assert (df["property_id"] == "test-property-123").all()

    def test_parser_handles_large_fixture(self, parser: MRIRentRollParser) -> None:
        """Parser can handle large fixture efficiently."""
        fixture_path = FIXTURES_DIR / "rent_roll_large.csv"

        with open(fixture_path, "rb") as f:
            result = parser.parse(
                file=f,
                file_name="rent_roll_large.csv",
                property_id="test-property-large",
            )

        assert result.success
        assert result.row_count >= 200
        assert not result.data.empty
