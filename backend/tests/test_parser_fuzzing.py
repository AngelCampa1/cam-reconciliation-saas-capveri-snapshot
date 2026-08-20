"""Property-based fuzz tests for GL data cleaners.

Uses Hypothesis to generate random inputs and verify:
1. Functions never crash on arbitrary input
2. Functions produce valid output types
3. Roundtrip behavior for formatted numbers
"""

from datetime import date

import pandas as pd
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.cleaners import (
    clean_account_code,
    clean_currency_column,
    clean_date_column,
)

CURRENCY_TEXT = st.text(
    alphabet="0123456789$€£¥,.()-+ CRcr\t\n ",
    max_size=20,
)


class TestCleanCurrencyFuzzing:
    """Fuzz tests for clean_currency_column."""

    @given(st.text(max_size=20))
    @settings(max_examples=25)
    def test_clean_currency_never_crashes(self, s: str):
        """Currency cleaner handles any string without crashing."""
        series = pd.Series([s])
        result = clean_currency_column(series)

        # Should return a series of same length
        assert len(result) == 1
        # Result should be numeric (may be NaN for invalid input)
        assert result.dtype in ["float64", "int64", "Float64"]

    @given(
        st.floats(allow_nan=False, allow_infinity=False, min_value=-1e9, max_value=1e9)
    )
    @settings(max_examples=100)
    def test_clean_currency_parses_formatted_numbers(self, n: float):
        """Formatted currency strings (positive and negative) parse correctly.

        Tests both positive ($1,234.56) and negative ($-1,234.56) formats.
        """
        # Format as currency with commas
        formatted = f"${n:,.2f}"
        result = clean_currency_column(pd.Series([formatted]))

        # Should parse to approximately the same value (within rounding)
        assert abs(result.iloc[0] - n) < 0.01

    @given(
        st.floats(allow_nan=False, allow_infinity=False, min_value=0.01, max_value=1e9)
    )
    @settings(max_examples=100)
    def test_clean_currency_parses_parentheses_negative(self, n: float):
        """Parentheses format parses as negative."""
        formatted = f"(${n:,.2f})"
        result = clean_currency_column(pd.Series([formatted]))

        # Should be negative
        assert result.iloc[0] < 0
        # Should be approximately -n
        assert abs(result.iloc[0] + n) < 0.01

    @given(
        st.floats(allow_nan=False, allow_infinity=False, min_value=0.01, max_value=1e9)
    )
    @settings(max_examples=100)
    def test_clean_currency_parses_cr_suffix(self, n: float):
        """CR suffix parses as negative."""
        formatted = f"${n:,.2f} CR"
        result = clean_currency_column(pd.Series([formatted]))

        # Should be negative
        assert result.iloc[0] < 0
        # Should be approximately -n
        assert abs(result.iloc[0] + n) < 0.01

    @given(
        st.floats(allow_nan=False, allow_infinity=False, min_value=0.01, max_value=1e9)
    )
    @settings(max_examples=100)
    def test_clean_currency_parses_trailing_minus(self, n: float):
        """Trailing minus parses as negative."""
        formatted = f"{n:,.2f}-"
        result = clean_currency_column(pd.Series([formatted]))

        # Should be negative
        assert result.iloc[0] < 0
        # Should be approximately -n
        assert abs(result.iloc[0] + n) < 0.01

    @given(
        st.floats(allow_nan=False, allow_infinity=False, min_value=0.01, max_value=1e9)
    )
    @settings(max_examples=100)
    def test_clean_currency_parses_leading_minus(self, n: float):
        """Leading minus (without dollar sign prefix) parses as negative."""
        formatted = f"-{n:,.2f}"
        result = clean_currency_column(pd.Series([formatted]))

        # Should be negative
        assert result.iloc[0] < 0
        # Should be approximately -n
        assert abs(result.iloc[0] + n) < 0.01

    @given(st.lists(CURRENCY_TEXT, min_size=0, max_size=20))
    @settings(max_examples=25)
    def test_clean_currency_handles_mixed_input(self, values: list[str]):
        """Currency cleaner handles lists of mixed strings."""
        if not values:
            # Empty series handling
            result = clean_currency_column(pd.Series(dtype=str))
            assert len(result) == 0
        else:
            series = pd.Series(values)
            result = clean_currency_column(series)

            # Should return series of same length
            assert len(result) == len(values)


class TestCleanDateFuzzing:
    """Fuzz tests for clean_date_column."""

    @given(st.text(max_size=30))
    @settings(max_examples=200, deadline=None)
    def test_clean_date_never_crashes(self, s: str):
        """Date cleaner handles any string without crashing."""
        series = pd.Series([s])
        result = clean_date_column(series)

        # Should return a series of same length
        assert len(result) == 1
        # Result should be datetime type
        assert str(result.dtype).startswith("datetime64")

    @given(st.dates(min_value=date(1990, 1, 1), max_value=date(2100, 12, 31)))
    @settings(max_examples=100, deadline=None)
    def test_clean_date_parses_iso_format(self, d: date):
        """ISO format dates always parse correctly."""
        iso = d.isoformat()  # YYYY-MM-DD
        result = clean_date_column(pd.Series([iso]))

        # Should not be NaT
        assert pd.notna(result.iloc[0])
        # Should match the date
        assert result.iloc[0].date() == d

    @given(st.dates(min_value=date(1990, 1, 1), max_value=date(2100, 12, 31)))
    @settings(max_examples=100, deadline=None)
    def test_clean_date_parses_slash_iso(self, d: date):
        """ISO with slashes (YYYY/MM/DD) parses correctly."""
        formatted = f"{d.year}/{d.month:02d}/{d.day:02d}"
        result = clean_date_column(pd.Series([formatted]))

        assert pd.notna(result.iloc[0])
        assert result.iloc[0].date() == d

    @given(st.dates(min_value=date(1990, 1, 1), max_value=date(2100, 12, 31)))
    @settings(max_examples=100, deadline=None)
    def test_clean_date_parses_named_month(self, d: date):
        """Named month format parses correctly."""
        # Format: 15-Jan-2024
        formatted = d.strftime("%d-%b-%Y")
        result = clean_date_column(pd.Series([formatted]))

        assert pd.notna(result.iloc[0])
        assert result.iloc[0].date() == d

    @given(st.lists(st.text(max_size=20), min_size=0, max_size=50))
    @settings(
        max_examples=50,
        # clean_date_column falls back to per-element dateutil parsing for
        # unrecognized strings, which is slow on arbitrary fuzzed input. That
        # makes example execution slow enough to trip Hypothesis's too_slow
        # health check intermittently. This test only asserts row-count
        # preservation, so disable the deadline and the timing health check.
        deadline=None,
        suppress_health_check=[HealthCheck.too_slow],
    )
    def test_clean_date_handles_mixed_input(self, values: list[str]):
        """Date cleaner handles lists of mixed strings."""
        if not values:
            result = clean_date_column(pd.Series(dtype=str))
            assert len(result) == 0
        else:
            series = pd.Series(values)
            result = clean_date_column(series)

            assert len(result) == len(values)


class TestCleanAccountCodeFuzzing:
    """Fuzz tests for clean_account_code."""

    @given(st.text(max_size=50))
    @settings(max_examples=200)
    def test_clean_account_code_never_crashes(self, s: str):
        """Account code cleaner handles any string without crashing."""
        series = pd.Series([s])
        result = clean_account_code(series)

        # Should return a series of same length
        assert len(result) == 1
        # Result should be string-compatible dtype (object or pandas string dtype)
        assert result.dtype == object or pd.api.types.is_string_dtype(result.dtype)

    @given(st.from_regex(r"[0-9]{4,6}", fullmatch=True))
    @settings(max_examples=100)
    def test_clean_account_code_preserves_digits(self, code: str):
        """Pure digit codes are preserved unchanged."""
        result = clean_account_code(pd.Series([code]))
        assert result.iloc[0] == code

    @given(st.from_regex(r"[0-9]{4}-[0-9]{2}", fullmatch=True))
    @settings(max_examples=100)
    def test_clean_account_code_preserves_hyphens(self, code: str):
        """Account codes with hyphens are preserved."""
        result = clean_account_code(pd.Series([code]))
        assert result.iloc[0] == code

    @given(st.text(alphabet="0123456789. -", min_size=1, max_size=20))
    @settings(max_examples=100)
    def test_clean_account_code_valid_chars_preserved(self, s: str):
        """Valid characters (digits, dots, hyphens) are preserved."""
        result = clean_account_code(pd.Series([s]))
        # Result should only contain valid characters
        cleaned = result.iloc[0]
        assert all(c.isalnum() or c in "-." for c in cleaned)

    @given(st.lists(st.text(max_size=20), min_size=0, max_size=50))
    @settings(
        max_examples=50,
        # Generating lists of up to 50 fuzzed strings is slow enough that, under
        # a CPU-saturated parallel run (`pytest -n auto`), Hypothesis can trip
        # its too_slow input-generation health check intermittently. This test
        # only asserts row-count preservation, so disable the deadline and the
        # timing health check (mirrors test_clean_date_handles_mixed_input).
        deadline=None,
        suppress_health_check=[HealthCheck.too_slow],
    )
    def test_clean_account_code_handles_mixed_input(self, values: list[str]):
        """Account code cleaner handles lists of mixed strings."""
        if not values:
            result = clean_account_code(pd.Series(dtype=str))
            assert len(result) == 0
        else:
            series = pd.Series(values)
            result = clean_account_code(series)

            assert len(result) == len(values)


class TestEdgeCases:
    """Fuzz tests for edge cases across all cleaners."""

    @given(st.integers(min_value=0, max_value=100))
    @settings(max_examples=20)
    def test_empty_series_handling(self, _: int):
        """Empty series are handled correctly by all cleaners."""
        empty = pd.Series(dtype=str)

        currency = clean_currency_column(empty)
        assert len(currency) == 0

        dates = clean_date_column(empty)
        assert len(dates) == 0

        codes = clean_account_code(empty)
        assert len(codes) == 0

    @given(st.text(alphabet="\x00\x01\x02\x03\n\r\t", max_size=20))
    @settings(max_examples=50)
    def test_control_characters_dont_crash(self, s: str):
        """Control characters in input don't crash cleaners."""
        series = pd.Series([s])

        # None of these should crash
        clean_currency_column(series)
        clean_date_column(series)
        clean_account_code(series)

    @given(st.text(alphabet="\U0001f600\U0001f601\U0001f602", max_size=10))
    @settings(max_examples=50)
    def test_unicode_emoji_dont_crash(self, s: str):
        """Unicode emoji in input don't crash cleaners."""
        series = pd.Series([s])

        # None of these should crash
        clean_currency_column(series)
        clean_date_column(series)
        clean_account_code(series)

    @given(
        st.lists(st.sampled_from([None, "", "  ", "\t", "\n"]), min_size=1, max_size=10)
    )
    @settings(max_examples=50)
    def test_whitespace_and_none_values(self, values: list):
        """Whitespace and None values are handled."""
        series = pd.Series(values)

        # Should not crash
        clean_currency_column(series)
        clean_date_column(series)
        clean_account_code(series)
