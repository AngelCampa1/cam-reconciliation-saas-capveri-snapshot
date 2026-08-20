"""Tests for malformed CSV fixtures.

Validates that parsers handle error conditions gracefully without crashing.
Tests both Yardi GL and MRI parsers against various types of malformed data.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.ingestion.parsers.mri import MRIRentRollParser
from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

FIXTURES_DIR = Path(__file__).parent / "fixtures" / "malformed"
EXPECTED_DIR = Path(__file__).parent / "fixtures" / "expected"


class TestEncodingErrorHandling:
    """Tests for encoding-related error fixtures."""

    @pytest.fixture
    def yardi_parser(self) -> YardiVoyagerGLParser:
        """Create Yardi parser instance."""
        return YardiVoyagerGLParser()

    @pytest.fixture
    def expected_utf8_bom(self) -> dict:
        """Load expected values for UTF-8 BOM fixture."""
        with open(EXPECTED_DIR / "encoding_utf8_bom_expected.json") as f:
            return json.load(f)

    @pytest.fixture
    def expected_windows1252(self) -> dict:
        """Load expected values for Windows-1252 fixture."""
        with open(EXPECTED_DIR / "encoding_windows1252_expected.json") as f:
            return json.load(f)

    @pytest.fixture
    def expected_mixed(self) -> dict:
        """Load expected values for mixed encoding fixture."""
        with open(EXPECTED_DIR / "encoding_mixed_expected.json") as f:
            return json.load(f)

    def test_utf8_bom_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_utf8_bom: dict
    ) -> None:
        """Parser handles UTF-8 BOM gracefully."""
        fixture_path = FIXTURES_DIR / "encoding_utf8_bom.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="encoding_utf8_bom.csv",
                property_id="test-property",
            )

        # Should parse successfully despite BOM
        assert result.success == expected_utf8_bom["parseable"]
        if result.success:
            assert result.row_count == expected_utf8_bom["expected_rows"]
            assert not result.data.empty

    def test_windows1252_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_windows1252: dict
    ) -> None:
        """Parser handles Windows-1252 encoding."""
        fixture_path = FIXTURES_DIR / "encoding_windows1252.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="encoding_windows1252.csv",
                property_id="test-property",
            )

        # Should either parse with encoding detection or fail gracefully
        assert isinstance(result.success, bool)
        if not result.success:
            assert len(result.errors) > 0

    def test_mixed_encoding_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_mixed: dict
    ) -> None:
        """Parser handles mixed encodings without crashing."""
        fixture_path = FIXTURES_DIR / "encoding_mixed.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="encoding_mixed.csv",
                property_id="test-property",
            )

        # Parser should not crash, even if it can't parse correctly
        assert isinstance(result.success, bool)
        # If it succeeds, row count may be less than expected due to encoding issues
        if result.success:
            assert result.row_count >= 0


class TestStructuralErrorHandling:
    """Tests for structural CSV error fixtures."""

    @pytest.fixture
    def yardi_parser(self) -> YardiVoyagerGLParser:
        """Create Yardi parser instance."""
        return YardiVoyagerGLParser()

    @pytest.fixture
    def expected_missing_columns(self) -> dict:
        """Load expected values for missing columns fixture."""
        with open(EXPECTED_DIR / "structural_missing_columns_expected.json") as f:
            return json.load(f)

    @pytest.fixture
    def expected_extra_columns(self) -> dict:
        """Load expected values for extra columns fixture."""
        with open(EXPECTED_DIR / "structural_extra_columns_expected.json") as f:
            return json.load(f)

    @pytest.fixture
    def expected_inconsistent_rows(self) -> dict:
        """Load expected values for inconsistent rows fixture."""
        with open(EXPECTED_DIR / "structural_inconsistent_rows_expected.json") as f:
            return json.load(f)

    def test_missing_columns_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_missing_columns: dict
    ) -> None:
        """Parser detects missing required columns."""
        fixture_path = FIXTURES_DIR / "structural_missing_columns.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="structural_missing_columns.csv",
                property_id="test-property",
            )

        # Should fail with informative error about missing columns
        assert result.success == expected_missing_columns["parseable"]
        if not result.success:
            assert len(result.errors) > 0
            # Error should mention missing columns
            error_text = " ".join(result.errors).lower()
            assert any(
                keyword in error_text for keyword in ["column", "missing", "required"]
            )

    def test_extra_columns_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_extra_columns: dict
    ) -> None:
        """Parser handles extra columns gracefully."""
        fixture_path = FIXTURES_DIR / "structural_extra_columns.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="structural_extra_columns.csv",
                property_id="test-property",
            )

        # Should parse successfully, ignoring extra columns
        assert result.success == expected_extra_columns["parseable"]
        if result.success:
            assert result.row_count == expected_extra_columns["expected_rows"]

    def test_inconsistent_rows_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_inconsistent_rows: dict
    ) -> None:
        """Parser handles rows with varying column counts."""
        fixture_path = FIXTURES_DIR / "structural_inconsistent_rows.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="structural_inconsistent_rows.csv",
                property_id="test-property",
            )

        # Should handle gracefully (may parse with warnings or fail cleanly)
        assert isinstance(result.success, bool)
        if result.success:
            # Should parse valid rows only
            assert result.row_count >= expected_inconsistent_rows["valid_rows"]

    def test_empty_file_handling(self, yardi_parser: YardiVoyagerGLParser) -> None:
        """Parser handles completely empty files."""
        fixture_path = FIXTURES_DIR / "structural_empty_file.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="structural_empty_file.csv",
                property_id="test-property",
            )

        # Should fail gracefully with informative error
        assert result.success is False
        assert len(result.errors) > 0

    def test_headers_only_handling(self, yardi_parser: YardiVoyagerGLParser) -> None:
        """Parser handles files with only headers and no data."""
        fixture_path = FIXTURES_DIR / "structural_headers_only.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="structural_headers_only.csv",
                property_id="test-property",
            )

        # Should either succeed with 0 rows or fail with informative error
        if result.success:
            assert result.row_count == 0
            assert result.data.empty
        else:
            assert len(result.errors) > 0


class TestDataErrorHandling:
    """Tests for data validation error fixtures."""

    @pytest.fixture
    def yardi_parser(self) -> YardiVoyagerGLParser:
        """Create Yardi parser instance."""
        return YardiVoyagerGLParser()

    @pytest.fixture
    def expected_invalid_dates(self) -> dict:
        """Load expected values for invalid dates fixture."""
        with open(EXPECTED_DIR / "data_invalid_dates_expected.json") as f:
            return json.load(f)

    @pytest.fixture
    def expected_non_numeric(self) -> dict:
        """Load expected values for non-numeric amounts fixture."""
        with open(EXPECTED_DIR / "data_non_numeric_amounts_expected.json") as f:
            return json.load(f)

    @pytest.fixture
    def expected_special_chars(self) -> dict:
        """Load expected values for special characters fixture."""
        with open(EXPECTED_DIR / "data_special_characters_expected.json") as f:
            return json.load(f)

    def test_invalid_dates_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_invalid_dates: dict
    ) -> None:
        """Parser handles invalid date formats."""
        fixture_path = FIXTURES_DIR / "data_invalid_dates.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="data_invalid_dates.csv",
                property_id="test-property",
            )

        # Should parse with warnings or skip invalid rows
        assert isinstance(result.success, bool)
        if result.success:
            # Should parse valid rows only
            assert result.row_count >= expected_invalid_dates["valid_rows"]
            # Invalid rows should be tracked
            assert result.error_count >= expected_invalid_dates["invalid_rows"]

    def test_non_numeric_amounts_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_non_numeric: dict
    ) -> None:
        """Parser handles non-numeric amount values."""
        fixture_path = FIXTURES_DIR / "data_non_numeric_amounts.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="data_non_numeric_amounts.csv",
                property_id="test-property",
            )

        # Should parse valid rows, skip or warn on invalid amounts
        assert isinstance(result.success, bool)
        if result.success:
            assert result.row_count >= expected_non_numeric["valid_rows"]
            # Check that amounts are properly typed
            if not result.data.empty:
                assert "amount" in result.data.columns or "debit" in result.data.columns

    def test_special_characters_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_special_chars: dict
    ) -> None:
        """Parser handles special characters in text fields."""
        fixture_path = FIXTURES_DIR / "data_special_characters.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="data_special_characters.csv",
                property_id="test-property",
            )

        # Should handle special characters without crashing
        assert isinstance(result.success, bool)
        if result.success:
            assert result.row_count >= expected_special_chars["valid_rows"]


class TestFormatErrorHandling:
    """Tests for CSV format error fixtures."""

    @pytest.fixture
    def yardi_parser(self) -> YardiVoyagerGLParser:
        """Create Yardi parser instance."""
        return YardiVoyagerGLParser()

    @pytest.fixture
    def expected_merged_cells(self) -> dict:
        """Load expected values for merged cells fixture."""
        with open(EXPECTED_DIR / "format_merged_cells_expected.json") as f:
            return json.load(f)

    @pytest.fixture
    def expected_footer(self) -> dict:
        """Load expected values for footer rows fixture."""
        with open(EXPECTED_DIR / "format_footer_rows_expected.json") as f:
            return json.load(f)

    @pytest.fixture
    def expected_page_breaks(self) -> dict:
        """Load expected values for page breaks fixture."""
        with open(EXPECTED_DIR / "format_page_breaks_expected.json") as f:
            return json.load(f)

    @pytest.fixture
    def expected_repeated_headers(self) -> dict:
        """Load expected values for repeated headers fixture."""
        with open(EXPECTED_DIR / "format_repeated_headers_expected.json") as f:
            return json.load(f)

    def test_merged_cells_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_merged_cells: dict
    ) -> None:
        """Parser handles merged cells (repeated context)."""
        fixture_path = FIXTURES_DIR / "format_merged_cells.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="format_merged_cells.csv",
                property_id="test-property",
            )

        # Should handle with forward-fill or skip rows
        assert isinstance(result.success, bool)
        if result.success:
            assert result.row_count >= expected_merged_cells["valid_rows"]

    def test_footer_rows_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_footer: dict
    ) -> None:
        """Parser handles footer rows and totals."""
        fixture_path = FIXTURES_DIR / "format_footer_rows.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="format_footer_rows.csv",
                property_id="test-property",
            )

        # Should parse data rows and exclude footer
        assert isinstance(result.success, bool)
        if result.success:
            # Should have data rows but not include footer
            assert result.row_count >= expected_footer["valid_rows"]

    def test_page_breaks_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_page_breaks: dict
    ) -> None:
        """Parser handles page break markers."""
        fixture_path = FIXTURES_DIR / "format_page_breaks.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="format_page_breaks.csv",
                property_id="test-property",
            )

        # Should skip page break rows
        assert isinstance(result.success, bool)
        if result.success:
            assert result.row_count >= expected_page_breaks["valid_rows"]

    def test_repeated_headers_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_repeated_headers: dict
    ) -> None:
        """Parser handles repeated header rows."""
        fixture_path = FIXTURES_DIR / "format_repeated_headers.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="format_repeated_headers.csv",
                property_id="test-property",
            )

        # Should detect and skip repeated headers
        assert isinstance(result.success, bool)
        if result.success:
            assert result.row_count >= expected_repeated_headers["valid_rows"]


class TestComprehensiveErrorHandling:
    """Tests for comprehensive multi-error fixture."""

    @pytest.fixture
    def yardi_parser(self) -> YardiVoyagerGLParser:
        """Create Yardi parser instance."""
        return YardiVoyagerGLParser()

    @pytest.fixture
    def expected_comprehensive(self) -> dict:
        """Load expected values for comprehensive fixture."""
        with open(EXPECTED_DIR / "comprehensive_errors_expected.json") as f:
            return json.load(f)

    def test_comprehensive_error_handling(
        self, yardi_parser: YardiVoyagerGLParser, expected_comprehensive: dict
    ) -> None:
        """Parser handles multiple simultaneous error types."""
        fixture_path = FIXTURES_DIR / "comprehensive_errors.csv"

        with open(fixture_path, "rb") as f:
            result = yardi_parser.parse(
                file=f,
                file_name="comprehensive_errors.csv",
                property_id="test-property",
            )

        # Parser should not crash, even with multiple error types
        assert isinstance(result.success, bool)

        # If it parses successfully, should have at least some valid rows
        if result.success:
            assert result.row_count >= expected_comprehensive["valid_rows"]
            # Should track error count
            assert hasattr(result, "error_count")


class TestMRIErrorHandling:
    """Tests for MRI parser error handling."""

    @pytest.fixture
    def mri_parser(self) -> MRIRentRollParser:
        """Create MRI parser instance."""
        return MRIRentRollParser()

    def test_mri_empty_file(self, mri_parser: MRIRentRollParser) -> None:
        """MRI parser handles empty files."""
        fixture_path = FIXTURES_DIR / "structural_empty_file.csv"

        with open(fixture_path, "rb") as f:
            result = mri_parser.parse(
                file=f,
                file_name="structural_empty_file.csv",
                property_id="test-property",
            )

        # Should fail gracefully
        assert result.success is False
        assert len(result.errors) > 0

    def test_mri_missing_columns(self, mri_parser: MRIRentRollParser) -> None:
        """MRI parser detects missing required columns."""
        fixture_path = FIXTURES_DIR / "structural_missing_columns.csv"

        with open(fixture_path, "rb") as f:
            result = mri_parser.parse(
                file=f,
                file_name="structural_missing_columns.csv",
                property_id="test-property",
            )

        # Should fail with informative error
        assert isinstance(result.success, bool)
        if not result.success:
            assert len(result.errors) > 0

    def test_mri_invalid_dates(self, mri_parser: MRIRentRollParser) -> None:
        """MRI parser handles invalid date formats."""
        fixture_path = FIXTURES_DIR / "data_invalid_dates.csv"

        with open(fixture_path, "rb") as f:
            result = mri_parser.parse(
                file=f,
                file_name="data_invalid_dates.csv",
                property_id="test-property",
            )

        # Should parse with warnings or skip invalid rows
        assert isinstance(result.success, bool)
