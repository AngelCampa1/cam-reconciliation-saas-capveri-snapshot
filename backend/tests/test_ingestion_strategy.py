"""Tests for the IngestionStrategy abstract base class.

Tests verify:
- AC1: Abstract class with parse() method
- AC2: parse() returns validated DataFrame with standard columns
- AC3: Output schema validates column types and required fields
- AC4: Base class cannot be instantiated directly
- AC5: Subclasses must implement parse() and can_handle() methods
"""

from datetime import date
from decimal import Decimal
from io import BytesIO
from typing import BinaryIO

import pandas as pd
import pytest

from app.services.ingestion import (
    GLEntryRow,
    IngestionMetadata,
    IngestionStrategy,
    ParseResult,
)


class TestIngestionStrategyAbstractBase:
    """Test that IngestionStrategy is properly abstract."""

    def test_cannot_instantiate_directly(self):
        """AC4: Base class cannot be instantiated directly."""
        with pytest.raises(TypeError) as exc_info:
            IngestionStrategy()

        assert "abstract" in str(exc_info.value).lower()

    def test_requires_source_system_property(self):
        """AC5: Subclasses must implement source_system property."""

        class MissingSourceSystem(IngestionStrategy):
            def can_handle(self, file_header: bytes, file_name: str) -> float:
                return 0.0

            def parse(
                self, file: BinaryIO, file_name: str, property_id: str
            ) -> ParseResult:
                return ParseResult(
                    success=True,
                    source_system="test",
                    data=pd.DataFrame(),
                    row_count=0,
                )

        with pytest.raises(TypeError) as exc_info:
            MissingSourceSystem()

        assert "source_system" in str(exc_info.value)

    def test_requires_can_handle_method(self):
        """AC5: Subclasses must implement can_handle() method."""

        class MissingCanHandle(IngestionStrategy):
            @property
            def source_system(self) -> str:
                return "test"

            def parse(
                self, file: BinaryIO, file_name: str, property_id: str
            ) -> ParseResult:
                return ParseResult(
                    success=True,
                    source_system="test",
                    data=pd.DataFrame(),
                    row_count=0,
                )

        with pytest.raises(TypeError) as exc_info:
            MissingCanHandle()

        assert "can_handle" in str(exc_info.value)

    def test_requires_parse_method(self):
        """AC1, AC5: Subclasses must implement parse() method."""

        class MissingParse(IngestionStrategy):
            @property
            def source_system(self) -> str:
                return "test"

            def can_handle(self, file_header: bytes, file_name: str) -> float:
                return 0.0

        with pytest.raises(TypeError) as exc_info:
            MissingParse()

        assert "parse" in str(exc_info.value)


class ConcreteTestStrategy(IngestionStrategy):
    """Concrete implementation for testing."""

    @property
    def source_system(self) -> str:
        return "test"

    def can_handle(self, file_header: bytes, file_name: str) -> float:
        if b"TEST" in file_header:
            return 1.0
        if "test" in file_name.lower():
            return 0.5
        return 0.0

    def parse(self, file: BinaryIO, file_name: str, property_id: str) -> ParseResult:
        # Read CSV and produce standardized output
        df = pd.DataFrame(
            {
                "account_code": ["1000", "2000"],
                "account_description": ["Cash", "Revenue"],
                "amount": [100.00, -50.00],
                "transaction_date": pd.to_datetime(["2024-01-01", "2024-01-15"]),
                "period_year": [2024, 2024],
                "period_month": [1, 1],
            }
        )

        # Use helper methods
        df = self._standardize_columns(df)
        errors = self._validate_output(df)

        return ParseResult(
            success=len(errors) == 0,
            source_system=self.source_system,
            data=df,
            row_count=len(df),
            error_count=0,
            errors=errors,
            warnings=[],
        )


class TestConcreteStrategyImplementation:
    """Test that a concrete implementation works correctly."""

    def test_concrete_strategy_can_be_instantiated(self):
        """Verify that concrete implementations can be instantiated."""
        strategy = ConcreteTestStrategy()
        assert strategy.source_system == "test"

    def test_can_handle_returns_confidence_score(self):
        """AC1: can_handle returns 0.0-1.0 confidence score."""
        strategy = ConcreteTestStrategy()

        # High confidence when header matches
        assert strategy.can_handle(b"TEST file content", "data.csv") == 1.0

        # Medium confidence from filename
        assert strategy.can_handle(b"random content", "test_export.csv") == 0.5

        # No confidence
        assert strategy.can_handle(b"random content", "other.csv") == 0.0

    def test_parse_returns_parse_result(self):
        """AC2: parse() returns ParseResult with DataFrame."""
        strategy = ConcreteTestStrategy()
        result = strategy.parse(
            BytesIO(b"test data"),
            "test.csv",
            "550e8400-e29b-41d4-a716-446655440000",
        )

        assert isinstance(result, ParseResult)
        assert result.success is True
        assert result.source_system == "test"
        assert isinstance(result.data, pd.DataFrame)
        assert result.row_count == 2
        assert result.error_count == 0

    def test_parse_result_has_standard_columns(self):
        """AC2: DataFrame has standard columns."""
        strategy = ConcreteTestStrategy()
        result = strategy.parse(BytesIO(b""), "test.csv", "prop-123")

        expected_columns = {
            "account_code",
            "account_description",
            "amount",
            "transaction_date",
            "accrual_date",
            "period_year",
            "period_month",
            "vendor_name",
            "description",
            "raw_row_data",
        }
        assert set(result.data.columns) == expected_columns


class TestValidateOutput:
    """Test the _validate_output helper method."""

    def test_validates_required_columns_present(self):
        """AC3: Validation checks required columns exist."""
        strategy = ConcreteTestStrategy()

        # Missing columns
        df_missing = pd.DataFrame({"account_code": ["1000"]})
        errors = strategy._validate_output(df_missing)

        assert any("account_description" in e for e in errors)
        assert any("amount" in e for e in errors)
        assert any("transaction_date" in e for e in errors)
        assert any("period_year" in e for e in errors)
        assert any("period_month" in e for e in errors)

    def test_validates_column_types(self):
        """AC3: Validation checks column types."""
        strategy = ConcreteTestStrategy()

        # Wrong types
        df_bad_types = pd.DataFrame(
            {
                "account_code": ["1000"],
                "account_description": ["Cash"],
                "amount": ["not-a-number"],  # Should be numeric
                "transaction_date": ["2024-01-01"],  # Should be datetime
                "period_year": ["2024"],  # Should be integer
                "period_month": [1.5],  # Should be integer
            }
        )
        errors = strategy._validate_output(df_bad_types)

        assert any("amount" in e and "numeric" in e for e in errors)
        assert any("transaction_date" in e and "datetime" in e for e in errors)

    def test_valid_dataframe_passes(self):
        """Valid DataFrame produces no errors."""
        strategy = ConcreteTestStrategy()

        df_valid = pd.DataFrame(
            {
                "account_code": ["1000"],
                "account_description": ["Cash"],
                "amount": [100.00],
                "transaction_date": pd.to_datetime(["2024-01-01"]),
                "period_year": pd.array([2024], dtype="Int64"),
                "period_month": pd.array([1], dtype="Int64"),
            }
        )
        errors = strategy._validate_output(df_valid)
        assert errors == []


class TestStandardizeColumns:
    """Test the _standardize_columns helper method."""

    def test_adds_missing_optional_columns(self):
        """_standardize_columns adds vendor_name, description, raw_row_data."""
        strategy = ConcreteTestStrategy()

        df = pd.DataFrame(
            {
                "account_code": ["1000"],
                "account_description": ["Cash"],
                "amount": [100.00],
                "transaction_date": pd.to_datetime(["2024-01-01"]),
                "period_year": [2024],
                "period_month": [1],
            }
        )

        result = strategy._standardize_columns(df)

        assert "vendor_name" in result.columns
        assert "description" in result.columns
        assert "raw_row_data" in result.columns

    def test_converts_types(self):
        """_standardize_columns converts numeric and integer types."""
        strategy = ConcreteTestStrategy()

        df = pd.DataFrame(
            {
                "account_code": ["1000"],
                "account_description": ["Cash"],
                "amount": ["100.00"],  # String that should convert
                "transaction_date": pd.to_datetime(["2024-01-01"]),
                "period_year": ["2024"],  # String
                "period_month": ["1"],  # String
            }
        )

        result = strategy._standardize_columns(df)

        assert pd.api.types.is_numeric_dtype(result["amount"])
        assert result["amount"].iloc[0] == 100.00

    def test_does_not_modify_original(self):
        """_standardize_columns returns a copy, not modifying original."""
        strategy = ConcreteTestStrategy()

        df = pd.DataFrame({"account_code": ["1000"], "amount": [100]})
        original_columns = list(df.columns)

        result = strategy._standardize_columns(df)

        assert list(df.columns) == original_columns
        assert "vendor_name" in result.columns
        assert "vendor_name" not in df.columns


class TestGLEntryRowSchema:
    """Test the GLEntryRow Pydantic schema."""

    def test_valid_entry_parses(self):
        """GLEntryRow accepts valid data."""
        entry = GLEntryRow(
            account_code="1000",
            account_description="Cash",
            amount=Decimal("100.00"),
            transaction_date=date(2024, 1, 15),
            period_year=2024,
            period_month=1,
        )
        assert entry.account_code == "1000"
        assert entry.amount == Decimal("100.00")

    def test_optional_fields(self):
        """GLEntryRow optional fields work correctly."""
        entry = GLEntryRow(
            account_code="1000",
            account_description="Cash",
            amount=Decimal("100.00"),
            transaction_date=date(2024, 1, 15),
            period_year=2024,
            period_month=1,
            vendor_name="Acme Corp",
            description="Payment for services",
            raw_row_data={"original_col": "value"},
        )
        assert entry.vendor_name == "Acme Corp"
        assert entry.raw_row_data == {"original_col": "value"}

    def test_rejects_invalid_period(self):
        """GLEntryRow validates period constraints."""
        with pytest.raises(Exception):
            GLEntryRow(
                account_code="1000",
                account_description="Cash",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 1, 15),
                period_year=1899,  # Too early (< 1990)
                period_month=1,
            )

        with pytest.raises(Exception):
            GLEntryRow(
                account_code="1000",
                account_description="Cash",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 1, 15),
                period_year=2024,
                period_month=13,  # Invalid month
            )


class TestParseResultSchema:
    """Test the ParseResult Pydantic schema."""

    def test_accepts_dataframe(self):
        """ParseResult can store pandas DataFrame."""
        df = pd.DataFrame({"col": [1, 2, 3]})
        result = ParseResult(
            success=True,
            source_system="test",
            data=df,
            row_count=3,
        )
        assert isinstance(result.data, pd.DataFrame)
        assert len(result.data) == 3

    def test_default_values(self):
        """ParseResult has correct defaults."""
        result = ParseResult(
            success=True,
            source_system="test",
            data=pd.DataFrame(),
            row_count=0,
        )
        assert result.error_count == 0
        assert result.errors == []
        assert result.warnings == []


class TestIngestionMetadataSchema:
    """Test the IngestionMetadata Pydantic schema."""

    def test_creates_metadata(self):
        """IngestionMetadata can be created with required fields."""
        metadata = IngestionMetadata(
            source_system="yardi",
            file_name="gl_export_2024.csv",
            row_count=1547,
        )
        assert metadata.source_system == "yardi"
        assert metadata.file_name == "gl_export_2024.csv"
        assert metadata.row_count == 1547
        assert metadata.error_count == 0
        assert metadata.warnings == []

    def test_metadata_with_warnings(self):
        """IngestionMetadata can store warnings."""
        metadata = IngestionMetadata(
            source_system="mri",
            file_name="rent_roll.xlsx",
            row_count=250,
            error_count=3,
            warnings=["Row 10: Missing vendor name", "Row 25: Duplicate entry"],
        )
        assert metadata.error_count == 3
        assert len(metadata.warnings) == 2
