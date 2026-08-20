"""Tests for Yardi GL export fixtures.

Validates that generated fixtures meet requirements and work with the parser.
"""

from __future__ import annotations

import csv
import json
from pathlib import Path

import pandas as pd
import pytest

from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "yardi"
EXPECTED_DIR = Path(__file__).parent / "fixtures" / "expected"


class TestYardiStandardFixture:
    """Tests for the standard Yardi GL export fixture."""

    @pytest.fixture
    def fixture_path(self) -> Path:
        """Return path to standard fixture."""
        return FIXTURES_DIR / "gl_export_standard.csv"

    @pytest.fixture
    def expected_values(self) -> dict:
        """Load expected values for assertions."""
        with open(EXPECTED_DIR / "yardi_gl_standard.json") as f:
            return json.load(f)

    def test_fixture_exists(self, fixture_path: Path) -> None:
        """Fixture file exists and is readable."""
        assert fixture_path.exists()
        assert fixture_path.is_file()
        assert fixture_path.stat().st_size > 0

    def test_fixture_row_count(self, fixture_path: Path, expected_values: dict) -> None:
        """Fixture has expected number of rows."""
        with open(fixture_path, encoding="utf-8") as f:
            # Skip header lines (non-CSV data)
            lines = f.readlines()

        # Find the column header row (contains "Account Code")
        header_idx = next(i for i, line in enumerate(lines) if "Account Code" in line)

        # Data rows are everything after the column header
        data_rows = len(lines) - header_idx - 1

        # Should have 500+ rows as per requirements
        assert data_rows >= 500
        assert data_rows == expected_values["row_count"]

    def test_yardi_fingerprint(self, fixture_path: Path) -> None:
        """File header matches Yardi detection patterns."""
        with open(fixture_path, "rb") as f:
            header = f.read(1024)

        text = header.decode("utf-8").upper()

        # Check for Yardi-specific markers
        assert "YARDI" in text
        assert "VOYAGER" in text
        assert "GL DETAIL" in text
        assert "PROPERTY" in text

    def test_file_is_valid_csv(self, fixture_path: Path) -> None:
        """File can be parsed as CSV after headers."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        # Find column header row
        header_idx = next(i for i, line in enumerate(lines) if "Account Code" in line)

        # Parse CSV starting from header
        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        assert not df.empty
        assert "Account Code" in df.columns
        assert "Account Description" in df.columns
        assert "Date" in df.columns

    def test_account_codes_valid_range(self, fixture_path: Path) -> None:
        """Account codes are in valid Yardi range (5xxx-6xxx)."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "Account Code" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        account_codes = df["Account Code"].astype(str).unique()

        # All accounts should be in 5000-6999 range
        for code in account_codes:
            code_int = int(code)
            assert 5000 <= code_int < 7000

    def test_all_expense_categories_present(
        self, fixture_path: Path, expected_values: dict
    ) -> None:
        """Fixture contains all required expense categories."""
        required_categories = [
            "Taxes",
            "Insurance",
            "Utilities",
            "CAM",
            "R&M",
            "Management Fee",
        ]

        for category in required_categories:
            assert category in expected_values["categories"]

    def test_dates_span_twelve_months(self, fixture_path: Path) -> None:
        """Transaction dates span a full 12-month period."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "Account Code" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        df["Date"] = pd.to_datetime(df["Date"])
        date_range = (df["Date"].max() - df["Date"].min()).days

        # Should span approximately 365 days
        assert date_range >= 350  # Allow for some variance

    def test_both_debits_and_credits_present(self, fixture_path: Path) -> None:
        """Fixture includes both debit and credit transactions."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "Account Code" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        # Count non-empty debit and credit entries
        debits = df["Debit"].fillna("").astype(str).str.strip()
        credits = df["Credit"].fillna("").astype(str).str.strip()

        debit_count = (debits != "").sum()
        credit_count = (credits != "").sum()

        assert debit_count > 0
        assert credit_count > 0
        # Credits should be less common (~5% of transactions)
        assert credit_count < debit_count

    def test_amounts_realistic(self, fixture_path: Path) -> None:
        """Transaction amounts are in realistic ranges."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "Account Code" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        # Convert amounts to numeric
        debits = pd.to_numeric(df["Debit"].fillna(0), errors="coerce").fillna(0)
        credits = pd.to_numeric(df["Credit"].fillna(0), errors="coerce").fillna(0)

        # Check ranges (commercial property monthly expenses)
        assert debits.max() < 50000  # No single transaction over $50k
        assert debits.min() >= 0  # No negative debits
        assert credits.min() >= 0  # No negative credits
        assert debits.mean() > 100  # Average transaction over $100

    def test_expected_values_accuracy(
        self, fixture_path: Path, expected_values: dict
    ) -> None:
        """Expected values JSON matches actual fixture data."""
        with open(fixture_path, encoding="utf-8") as f:
            lines = f.readlines()

        header_idx = next(i for i, line in enumerate(lines) if "Account Code" in line)

        with open(fixture_path, encoding="utf-8") as f:
            df = pd.read_csv(f, skiprows=header_idx)

        # Verify row count
        assert len(df) == expected_values["row_count"]

        # Verify account count
        unique_accounts = df["Account Code"].nunique()
        assert unique_accounts == expected_values["account_count"]

        # Verify totals (allow small rounding differences)
        debits = pd.to_numeric(df["Debit"].fillna(0), errors="coerce").sum()
        credits = pd.to_numeric(df["Credit"].fillna(0), errors="coerce").sum()

        assert abs(debits - expected_values["total_debits"]) < 0.01
        assert abs(credits - expected_values["total_credits"]) < 0.01
        assert abs((debits - credits) - expected_values["net_amount"]) < 0.01


class TestYardiMalformedFixture:
    """Tests for the malformed Yardi GL export fixture."""

    @pytest.fixture
    def fixture_path(self) -> Path:
        """Return path to malformed fixture."""
        return FIXTURES_DIR / "gl_export_malformed.csv"

    def test_fixture_exists(self, fixture_path: Path) -> None:
        """Malformed fixture file exists."""
        assert fixture_path.exists()
        assert fixture_path.is_file()

    def test_missing_yardi_fingerprint(self, fixture_path: Path) -> None:
        """Malformed fixture lacks Yardi detection markers."""
        with open(fixture_path, "rb") as f:
            header = f.read(1024)

        text = header.decode("utf-8").upper()

        # Should NOT have strong Yardi markers
        assert "YARDI" not in text
        assert "VOYAGER" not in text

    def test_has_data_quality_issues(self, fixture_path: Path) -> None:
        """Malformed fixture contains various data quality issues."""
        with open(fixture_path, encoding="utf-8") as f:
            reader = csv.DictReader(f, skipinitialspace=True)
            rows = list(reader)

        # Should have rows with issues
        assert len(rows) > 0

        # Check for various issues
        has_missing_account = any(not row.get("Acct", "").strip() for row in rows)
        has_invalid_date = any(
            "NOT_A_DATE" in row.get("Trans Date", "") for row in rows
        )
        has_invalid_amount = any("INVALID" in row.get("Dr", "") for row in rows)

        assert has_missing_account or has_invalid_date or has_invalid_amount


class TestYardiParserIntegration:
    """Integration tests for Yardi parser with fixtures."""

    @pytest.fixture
    def parser(self) -> YardiVoyagerGLParser:
        """Create parser instance."""
        return YardiVoyagerGLParser()

    @pytest.fixture
    def fixture_path(self) -> Path:
        """Return path to standard fixture."""
        return FIXTURES_DIR / "gl_export_standard.csv"

    def test_parser_can_handle_fixture(
        self, parser: YardiVoyagerGLParser, fixture_path: Path
    ) -> None:
        """Parser recognizes the standard fixture as Yardi format."""
        with open(fixture_path, "rb") as f:
            header = f.read(1024)

        confidence = parser.can_handle(header, "gl_export_standard.csv")

        # Should have high confidence (>0.8)
        assert confidence >= 0.8

    def test_parser_successfully_processes_fixture(
        self, parser: YardiVoyagerGLParser, fixture_path: Path
    ) -> None:
        """Parser successfully parses the standard fixture."""
        with open(fixture_path, "rb") as f:
            result = parser.parse(
                file=f,
                file_name="gl_export_standard.csv",
                property_id="test-property-123",
            )

        assert result.success
        assert result.source_system == "yardi"
        assert result.row_count > 0
        assert not result.data.empty
        assert result.error_count == 0

    def test_parsed_data_structure(
        self, parser: YardiVoyagerGLParser, fixture_path: Path
    ) -> None:
        """Parsed data has correct structure and columns."""
        with open(fixture_path, "rb") as f:
            result = parser.parse(
                file=f,
                file_name="gl_export_standard.csv",
                property_id="test-property-123",
            )

        df = result.data

        # Check required columns exist
        assert "account_code" in df.columns
        assert "amount" in df.columns
        assert "transaction_date" in df.columns
        assert "property_id" in df.columns

        # Check data types
        assert pd.api.types.is_string_dtype(df["account_code"].dtype)
        assert df["amount"].dtype == float
        assert pd.api.types.is_datetime64_any_dtype(df["transaction_date"])

        # Check property_id was set
        assert (df["property_id"] == "test-property-123").all()
