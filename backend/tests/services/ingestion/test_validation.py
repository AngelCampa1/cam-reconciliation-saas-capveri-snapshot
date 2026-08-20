"""Tests for GL entry validation layer.

Tests the validation module that filters invalid GL entries
before database persistence. Follows "Filter & Warn" strategy.
"""

from datetime import date, timedelta
from decimal import Decimal

import pandas as pd
import pytest
from pydantic import ValidationError

from app.services.ingestion.validation import (
    GLValidationResult,
    ValidatedGLEntry,
    _safe_int,
    validate_gl_dataframe,
    validate_gl_row,
)


class TestValidatedGLEntry:
    """Tests for ValidatedGLEntry Pydantic model."""

    def test_valid_entry(self):
        """Valid GL entry passes validation."""
        entry = ValidatedGLEntry(
            account_code="5100",
            account_description="Utilities",
            amount=Decimal("1234.56"),
            transaction_date=date(2024, 1, 15),
            period_year=2024,
            period_month=1,
        )
        assert entry.account_code == "5100"
        assert entry.amount == Decimal("1234.56")

    def test_account_code_must_start_with_digit(self):
        """Account code must start with a digit."""
        with pytest.raises(ValidationError) as exc_info:
            ValidatedGLEntry(
                account_code="ABC123",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 1, 15),
            )
        assert "must start with a digit" in str(exc_info.value)

    def test_account_code_empty_rejected(self):
        """Empty account code is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ValidatedGLEntry(
                account_code="",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 1, 15),
            )
        assert "cannot be empty" in str(exc_info.value)

    def test_amount_exceeds_100m_rejected(self):
        """Amounts over $100M are rejected (likely data error)."""
        with pytest.raises(ValidationError) as exc_info:
            ValidatedGLEntry(
                account_code="5100",
                amount=Decimal("100000001.00"),  # Just over $100M
                transaction_date=date(2024, 1, 15),
            )
        assert "exceeds $100M" in str(exc_info.value)

    def test_negative_large_amount_rejected(self):
        """Large negative amounts are also rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ValidatedGLEntry(
                account_code="5100",
                amount=Decimal("-100000001.00"),
                transaction_date=date(2024, 1, 15),
            )
        assert "exceeds $100M" in str(exc_info.value)

    def test_future_date_rejected(self):
        """Transaction dates in the future are rejected."""
        future_date = date.today() + timedelta(days=30)
        with pytest.raises(ValidationError) as exc_info:
            ValidatedGLEntry(
                account_code="5100",
                amount=Decimal("100.00"),
                transaction_date=future_date,
            )
        assert "in the future" in str(exc_info.value)

    def test_today_date_accepted(self):
        """Today's date is accepted."""
        entry = ValidatedGLEntry(
            account_code="5100",
            amount=Decimal("100.00"),
            transaction_date=date.today(),
        )
        assert entry.transaction_date == date.today()

    def test_period_year_out_of_range_rejected(self):
        """Period year outside 1990-2100 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ValidatedGLEntry(
                account_code="5100",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 1, 15),
                period_year=1980,
            )
        assert "outside valid range" in str(exc_info.value)

    def test_period_month_out_of_range_rejected(self):
        """Period month outside 1-12 is rejected."""
        with pytest.raises(ValidationError) as exc_info:
            ValidatedGLEntry(
                account_code="5100",
                amount=Decimal("100.00"),
                transaction_date=date(2024, 1, 15),
                period_month=13,
            )
        assert "must be between 1-12" in str(exc_info.value)

    def test_negative_amount_accepted(self):
        """Negative amounts (credits) are valid."""
        entry = ValidatedGLEntry(
            account_code="5100",
            amount=Decimal("-500.00"),
            transaction_date=date(2024, 1, 15),
        )
        assert entry.amount == Decimal("-500.00")

    def test_zero_amount_accepted(self):
        """Zero amounts are valid (may trigger warning)."""
        entry = ValidatedGLEntry(
            account_code="5100",
            amount=Decimal("0.00"),
            transaction_date=date(2024, 1, 15),
        )
        assert entry.amount == Decimal("0.00")


class TestValidateGLRow:
    """Tests for validate_gl_row function."""

    def test_valid_row(self):
        """Valid row passes validation."""
        row = {
            "account_code": "5100",
            "account_description": "Utilities",
            "amount": 1234.56,
            "transaction_date": date(2024, 1, 15),
            "period_year": 2024,
            "period_month": 1,
        }
        is_valid, errors = validate_gl_row(row, 0)
        assert is_valid is True
        assert errors == []

    def test_missing_amount(self):
        """Missing amount is invalid."""
        row = {
            "account_code": "5100",
            "transaction_date": date(2024, 1, 15),
        }
        is_valid, errors = validate_gl_row(row, 0)
        assert is_valid is False
        assert any("amount" in e for e in errors)

    def test_missing_account_code(self):
        """Missing account code is invalid."""
        row = {
            "amount": 100.00,
            "transaction_date": date(2024, 1, 15),
        }
        is_valid, errors = validate_gl_row(row, 0)
        assert is_valid is False
        assert any("account_code" in e for e in errors)

    def test_nan_amount_is_invalid(self):
        """NaN amount is treated as missing."""
        row = {
            "account_code": "5100",
            "amount": float("nan"),
            "transaction_date": date(2024, 1, 15),
        }
        is_valid, errors = validate_gl_row(row, 0)
        assert is_valid is False
        assert any("amount" in e for e in errors)

    def test_string_date_parsed(self):
        """ISO format string dates are parsed."""
        row = {
            "account_code": "5100",
            "amount": 100.00,
            "transaction_date": "2024-01-15",
        }
        is_valid, errors = validate_gl_row(row, 0)
        assert is_valid is True


class TestValidateGLDataFrame:
    """Tests for validate_gl_dataframe function."""

    def test_all_valid_rows(self):
        """All valid rows are returned."""
        df = pd.DataFrame(
            {
                "account_code": ["5100", "5200", "5300"],
                "account_description": ["Utilities", "Janitorial", "Insurance"],
                "amount": [1000.00, 2000.00, 3000.00],
                "transaction_date": [date(2024, 1, 15)] * 3,
                "period_year": [2024] * 3,
                "period_month": [1] * 3,
                "vendor_name": [None] * 3,
                "description": [None] * 3,
            }
        )

        valid_df, result = validate_gl_dataframe(df)

        assert len(valid_df) == 3
        assert result.valid_count == 3
        assert result.invalid_count == 0
        assert result.is_valid is True
        assert len(result.errors) == 0

    def test_filters_invalid_rows(self):
        """Invalid rows are filtered out."""
        df = pd.DataFrame(
            {
                "account_code": ["5100", "ABC", "5300"],  # ABC is invalid
                "account_description": ["Utilities", "Bad", "Insurance"],
                "amount": [1000.00, 2000.00, 3000.00],
                "transaction_date": [date(2024, 1, 15)] * 3,
                "period_year": [2024] * 3,
                "period_month": [1] * 3,
                "vendor_name": [None] * 3,
                "description": [None] * 3,
            }
        )

        valid_df, result = validate_gl_dataframe(df)

        assert len(valid_df) == 2
        assert result.valid_count == 2
        assert result.invalid_count == 1
        assert result.is_valid is True
        assert len(result.errors) == 1
        assert "must start with a digit" in result.errors[0].message

    def test_all_invalid_rows(self):
        """All invalid rows returns empty DataFrame."""
        df = pd.DataFrame(
            {
                "account_code": ["ABC", "DEF"],  # Both invalid
                "account_description": ["Bad1", "Bad2"],
                "amount": [1000.00, 2000.00],
                "transaction_date": [date(2024, 1, 15)] * 2,
                "period_year": [2024] * 2,
                "period_month": [1] * 2,
                "vendor_name": [None] * 2,
                "description": [None] * 2,
            }
        )

        valid_df, result = validate_gl_dataframe(df)

        assert len(valid_df) == 0
        assert result.valid_count == 0
        assert result.invalid_count == 2
        assert result.is_valid is False

    def test_empty_dataframe(self):
        """Empty DataFrame returns empty result."""
        df = pd.DataFrame(
            columns=[
                "account_code",
                "amount",
                "transaction_date",
            ]
        )

        valid_df, result = validate_gl_dataframe(df)

        assert len(valid_df) == 0
        assert result.valid_count == 0
        assert result.invalid_count == 0
        assert result.is_valid is False

    def test_warns_on_zero_amounts(self):
        """Zero amounts generate info warning."""
        df = pd.DataFrame(
            {
                "account_code": ["5100"],
                "account_description": ["Utilities"],
                "amount": [0.00],  # Zero amount
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024],
                "period_month": [1],
                "vendor_name": [None],
                "description": [None],
            }
        )

        valid_df, result = validate_gl_dataframe(df)

        assert len(valid_df) == 1  # Still valid
        assert result.valid_count == 1
        assert len(result.warnings) == 1
        assert result.warnings[0].severity == "info"
        assert "zero" in result.warnings[0].message.lower()

    def test_warns_on_large_amounts(self):
        """Large amounts (under limit) generate warning."""
        df = pd.DataFrame(
            {
                "account_code": ["5100"],
                "account_description": ["Utilities"],
                "amount": [15000000.00],  # $15M - large but valid
                "transaction_date": [date(2024, 1, 15)],
                "period_year": [2024],
                "period_month": [1],
                "vendor_name": [None],
                "description": [None],
            }
        )

        valid_df, result = validate_gl_dataframe(df)

        assert len(valid_df) == 1  # Still valid
        assert result.valid_count == 1
        assert len(result.warnings) == 1
        assert result.warnings[0].severity == "warning"
        assert "large" in result.warnings[0].message.lower()

    def test_max_errors_to_report(self):
        """Limits number of errors reported."""
        # Create 200 invalid rows
        df = pd.DataFrame(
            {
                "account_code": ["ABC"] * 200,  # All invalid
                "account_description": ["Bad"] * 200,
                "amount": [1000.00] * 200,
                "transaction_date": [date(2024, 1, 15)] * 200,
                "period_year": [2024] * 200,
                "period_month": [1] * 200,
                "vendor_name": [None] * 200,
                "description": [None] * 200,
            }
        )

        valid_df, result = validate_gl_dataframe(df, max_errors_to_report=50)

        assert result.invalid_count == 200
        assert len(result.errors) == 50  # Capped at 50

    def test_filters_excessive_amounts(self):
        """Amounts over $100M are filtered out."""
        df = pd.DataFrame(
            {
                "account_code": ["5100", "5200"],
                "account_description": ["Normal", "Excessive"],
                "amount": [1000.00, 200000000.00],  # Second is $200M
                "transaction_date": [date(2024, 1, 15)] * 2,
                "period_year": [2024] * 2,
                "period_month": [1] * 2,
                "vendor_name": [None] * 2,
                "description": [None] * 2,
            }
        )

        valid_df, result = validate_gl_dataframe(df)

        assert len(valid_df) == 1
        assert valid_df.iloc[0]["amount"] == 1000.00
        assert result.invalid_count == 1
        assert "$100M" in result.errors[0].message

    def test_filters_future_dates(self):
        """Future dates are filtered out."""
        future_date = date.today() + timedelta(days=30)
        df = pd.DataFrame(
            {
                "account_code": ["5100", "5200"],
                "account_description": ["Past", "Future"],
                "amount": [1000.00, 2000.00],
                "transaction_date": [date(2024, 1, 15), future_date],
                "period_year": [2024] * 2,
                "period_month": [1] * 2,
                "vendor_name": [None] * 2,
                "description": [None] * 2,
            }
        )

        valid_df, result = validate_gl_dataframe(df)

        assert len(valid_df) == 1
        assert result.invalid_count == 1
        assert "future" in result.errors[0].message.lower()


class TestGLValidationResult:
    """Tests for GLValidationResult dataclass."""

    def test_is_valid_with_valid_rows(self):
        """is_valid is True when valid_count > 0."""
        result = GLValidationResult(valid_count=5, invalid_count=2)
        assert result.is_valid is True

    def test_is_valid_with_no_valid_rows(self):
        """is_valid is False when valid_count == 0."""
        result = GLValidationResult(valid_count=0, invalid_count=5)
        assert result.is_valid is False

    def test_is_valid_with_all_zero(self):
        """is_valid is False when both counts are 0."""
        result = GLValidationResult(valid_count=0, invalid_count=0)
        assert result.is_valid is False

    def test_default_empty_lists(self):
        """Default warnings and errors are empty lists."""
        result = GLValidationResult(valid_count=1, invalid_count=0)
        assert result.warnings == []
        assert result.errors == []


class TestMissingTransactionDate:
    """Tests for missing transaction_date in validate_gl_row."""

    def test_missing_transaction_date_key(self):
        """Row dict without transaction_date key is invalid."""
        row = {
            "account_code": "5100",
            "amount": 100.00,
            # transaction_date is absent
        }
        is_valid, errors = validate_gl_row(row, 0)
        assert is_valid is False
        assert any("transaction_date" in e for e in errors)

    def test_nan_transaction_date_invalid(self):
        """Row with float NaN transaction_date is invalid."""
        row = {
            "account_code": "5100",
            "amount": 100.00,
            "transaction_date": float("nan"),
        }
        is_valid, errors = validate_gl_row(row, 0)
        assert is_valid is False
        assert any("transaction_date" in e for e in errors)


class TestSafeInt:
    """Tests for the _safe_int helper function."""

    def test_float_nan_returns_none(self):
        """float('nan') returns None."""
        assert _safe_int(float("nan")) is None

    def test_invalid_string_returns_none(self):
        """Non-numeric string returns None."""
        assert _safe_int("abc") is None

    def test_none_returns_none(self):
        """None input returns None."""
        assert _safe_int(None) is None

    def test_int_returns_int(self):
        """Integer input returns integer."""
        assert _safe_int(2024) == 2024

    def test_float_returns_int(self):
        """Float input returns integer."""
        assert _safe_int(2024.0) == 2024

    def test_numeric_string_returns_int(self):
        """Numeric string returns integer."""
        assert _safe_int("2024") == 2024
