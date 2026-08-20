"""Comprehensive tests for data cleaning functions.

Tests cover all vectorized cleaning operations for ERP exports,
including currency parsing, date parsing, and data quality handling.
"""

import numpy as np
import pandas as pd
import pytest

from app.services.ingestion.cleaners import (
    clean_account_code,
    clean_currency_column,
    clean_date_column,
    detect_header_row,
    extract_period_from_date,
    filter_by_required_columns,
    filter_garbage_rows,
    forward_fill_context,
    handle_merged_cells_pattern,
    split_amount_columns,
)


class TestCleanCurrencyColumn:
    """Test currency cleaning with various formats."""

    def test_parentheses_negative(self):
        """Parentheses should convert to negative (lines 50-52)."""
        s = pd.Series(["(500.00)", "(1,234.56)", "(10.50)"])
        result = clean_currency_column(s)

        assert result[0] == -500.00
        assert result[1] == -1234.56
        assert result[2] == -10.50

    def test_cr_suffix_negative(self):
        """CR suffix should convert to negative (lines 54-55)."""
        s = pd.Series(["500.00 CR", "1234.56 cr", "10.50CR"])
        result = clean_currency_column(s)

        assert result[0] == -500.00
        assert result[1] == -1234.56
        assert result[2] == -10.50

    def test_trailing_minus_negative(self):
        """Trailing minus should convert to negative (lines 57-59)."""
        s = pd.Series(["500.00-", "1,234.56-"])
        result = clean_currency_column(s)

        assert result[0] == -500.00
        assert result[1] == -1234.56

    def test_leading_minus_negative(self):
        """Leading minus should convert to negative (lines 61-65)."""
        s = pd.Series(["-500.00", "$-1,234.56", "€-10.50"])
        result = clean_currency_column(s)

        assert result[0] == -500.00
        assert result[1] == -1234.56
        assert result[2] == -10.50

    def test_currency_symbols_removed(self):
        """Currency symbols should be removed (lines 80-81)."""
        s = pd.Series(["$1,234.56", "£500.00", "€10.50", "¥1000"])
        result = clean_currency_column(s)

        assert result[0] == 1234.56
        assert result[1] == 500.00
        assert result[2] == 10.50
        assert result[3] == 1000.00

    def test_comma_separators_removed(self):
        """Comma thousand separators should be removed (lines 81)."""
        s = pd.Series(["1,234,567.89", "10,000.00"])
        result = clean_currency_column(s)

        assert result[0] == 1234567.89
        assert result[1] == 10000.00

    def test_redos_prevention_with_max_length(self):
        """Long strings should be truncated to prevent ReDoS (lines 40-44, FIX ING-6)."""
        # Create very long string (>50 chars)
        long_string = "$" + "1" * 100 + ".00"
        s = pd.Series([long_string])
        result = clean_currency_column(s)

        # Should still parse (truncated, not rejected)
        assert not pd.isna(result[0])

    def test_empty_series_returns_empty(self):
        """Empty series should return empty float series (lines 34-35)."""
        s = pd.Series([], dtype=str)
        result = clean_currency_column(s)

        assert len(result) == 0
        assert result.dtype == float

    def test_multiple_negative_indicators_not_double_counted(self):
        """Multiple negative indicators shouldn't double-negate (lines 86-92, FIX DI-3)."""
        # This tests that we use abs() to prevent double-negation
        s = pd.Series(["($500.00)"])  # Both parens and $ with implicit handling
        result = clean_currency_column(s)

        assert result[0] == -500.00  # Should be negative once, not positive

    def test_dr_suffix_positive(self):
        """DR suffix should remain positive (lines 73-74)."""
        s = pd.Series(["500.00 DR", "1234.56 dr"])
        result = clean_currency_column(s)

        assert result[0] == 500.00
        assert result[1] == 1234.56


class TestCleanDateColumn:
    """Test date parsing with various formats."""

    def test_iso_format_priority(self):
        """ISO format should be parsed first (lines 123-127, FIX DI-12)."""
        s = pd.Series(["2024-01-15", "2024-12-31"])
        result = clean_date_column(s)

        assert result[0] == pd.Timestamp("2024-01-15")
        assert result[1] == pd.Timestamp("2024-12-31")

    def test_named_month_unambiguous(self):
        """Named month formats should parse correctly (lines 128-131)."""
        s = pd.Series(["15-Jan-2024", "Jan 15, 2024", "January 15, 2024"])
        result = clean_date_column(s)

        assert result[0] == pd.Timestamp("2024-01-15")
        assert result[1] == pd.Timestamp("2024-01-15")
        assert result[2] == pd.Timestamp("2024-01-15")

    def test_ambiguous_dates_use_us_format(self):
        """Ambiguous dates should default to US format (lines 148-158, FIX DI-12)."""
        # 01/02/2024 should be January 2 (US), not February 1 (EU)
        s = pd.Series(["01/02/2024"])
        result = clean_date_column(s)

        # dayfirst=False means month/day/year (US format)
        assert result[0].month == 1
        assert result[0].day == 2

    def test_empty_series_returns_empty_datetime(self):
        """Empty series should return empty datetime series (lines 119-120)."""
        s = pd.Series([], dtype=str)
        result = clean_date_column(s)

        assert len(result) == 0
        assert result.dtype == "datetime64[ns]"

    def test_custom_date_formats(self):
        """Custom date formats should be parsed (lines 139-146)."""
        s = pd.Series(["2024-01-15"])
        result = clean_date_column(s, date_formats=["%Y-%m-%d"])

        assert result[0] == pd.Timestamp("2024-01-15")

    def test_unparseable_dates_return_nat(self):
        """Unparseable dates should return NaT (lines 141)."""
        s = pd.Series(["not-a-date", "garbage"])
        result = clean_date_column(s)

        assert pd.isna(result[0])
        assert pd.isna(result[1])

    def test_explicit_format_errors_fall_back_to_inference(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        """Explicit parser errors should not stop fallback inference."""
        original_to_datetime = pd.to_datetime

        def flaky_to_datetime(*args, **kwargs):
            if kwargs.get("format") == "%Y-%m-%d":
                raise ValueError("boom")
            return original_to_datetime(*args, **kwargs)

        monkeypatch.setattr(pd, "to_datetime", flaky_to_datetime)

        result = clean_date_column(
            pd.Series(["01/15/2024"]),
            date_formats=["%Y-%m-%d"],
        )

        assert result[0] == pd.Timestamp("2024-01-15")

    def test_inference_errors_return_nat_without_raising(
        self, monkeypatch: pytest.MonkeyPatch
    ):
        """Inference errors should be swallowed and return NaT."""
        original_to_datetime = pd.to_datetime

        def flaky_to_datetime(*args, **kwargs):
            if "format" not in kwargs:
                raise ValueError("boom")
            return original_to_datetime(*args, **kwargs)

        monkeypatch.setattr(pd, "to_datetime", flaky_to_datetime)

        result = clean_date_column(
            pd.Series(["01/15/2024"]),
            date_formats=["%Y-%m-%d"],
        )

        assert pd.isna(result[0])


class TestExtractPeriodFromDate:
    """Test period extraction from dates."""

    def test_extract_year_and_month(self):
        """Should extract year and month from datetime (lines 172)."""
        dates = pd.Series([pd.Timestamp("2024-01-15"), pd.Timestamp("2024-12-31")])
        years, months = extract_period_from_date(dates)

        assert years[0] == 2024
        assert months[0] == 1
        assert years[1] == 2024
        assert months[1] == 12


class TestCleanAccountCode:
    """Test account code cleaning."""

    def test_removes_special_characters(self):
        """Should remove special characters except - and . (lines 190-191)."""
        s = pd.Series(["6000@#$", "7000!*()", "8000 "])
        result = clean_account_code(s)

        assert result[0] == "6000"
        assert result[1] == "7000"
        assert result[2] == "8000"

    def test_preserves_dash_and_dot(self):
        """Should preserve - and . characters (lines 191)."""
        s = pd.Series(["6000-01", "7000.05"])
        result = clean_account_code(s)

        assert result[0] == "6000-01"
        assert result[1] == "7000.05"

    def test_strips_whitespace(self):
        """Should strip leading/trailing whitespace (lines 188)."""
        s = pd.Series(["  6000  ", " 7000"])
        result = clean_account_code(s)

        assert result[0] == "6000"
        assert result[1] == "7000"


class TestForwardFillContext:
    """Test forward-fill for merged cells."""

    def test_forward_fills_context_columns(self):
        """Should forward-fill specified columns (lines 217-218)."""
        df = pd.DataFrame(
            {"property": ["Building A", None, None], "amount": [100, 200, 300]}
        )
        result = forward_fill_context(df, context_columns=["property"])

        assert result["property"][1] == "Building A"
        assert result["property"][2] == "Building A"

    def test_ignores_missing_columns(self):
        """Should skip columns that don't exist (lines 216-217)."""
        df = pd.DataFrame({"amount": [100, 200]})
        result = forward_fill_context(df, context_columns=["nonexistent"])

        # Should not raise error, just return unchanged
        assert len(result) == 2


class TestHandleMergedCellsPattern:
    """Test merged cell pattern handling."""

    def test_forward_fills_group_columns(self):
        """Should forward-fill group columns (lines 250-253)."""
        df = pd.DataFrame(
            {
                "property": ["Building A", "", ""],
                "account_code": ["6000", "6100", "6200"],
                "amount": [100, 200, 300],
            }
        )
        config = {"group_columns": ["property"], "data_indicator": "account_code"}
        result = handle_merged_cells_pattern(df, config)

        assert result["property"][1] == "Building A"
        assert result["property"][2] == "Building A"

    def test_filters_skip_patterns(self):
        """Should filter rows matching skip patterns (lines 260-264)."""
        df = pd.DataFrame(
            {
                "account_code": ["6000", "Total", "6100"],
                "amount": [100, 300, 200],
            }
        )
        config = {
            "data_indicator": "account_code",
            "skip_patterns": ["Total"],
        }
        result = handle_merged_cells_pattern(df, config)

        assert len(result) == 2  # Total row removed
        assert "Total" not in result["account_code"].values

    def test_removes_empty_indicator_rows(self):
        """Should remove rows with empty indicator (lines 256-258)."""
        df = pd.DataFrame(
            {
                "account_code": ["6000", "", "6100"],
                "amount": [100, 200, 300],
            }
        )
        config = {"data_indicator": "account_code"}
        result = handle_merged_cells_pattern(df, config)

        assert len(result) == 2  # Empty account_code row removed

    def test_skips_forward_fill_when_group_columns_is_not_list(self):
        """Non-list group columns should not trigger forward fill."""
        df = pd.DataFrame(
            {
                "property": ["Building A", ""],
                "account_code": ["6000", "6100"],
            }
        )

        result = handle_merged_cells_pattern(
            df,
            {"group_columns": "property", "data_indicator": "account_code"},
        )

        assert result["property"].tolist() == ["Building A", ""]

    def test_returns_rows_unchanged_when_indicator_column_missing(self):
        """Missing indicator columns should skip row filtering safely."""
        df = pd.DataFrame({"property": ["Building A", ""], "amount": [100, 200]})

        result = handle_merged_cells_pattern(
            df,
            {"group_columns": ["property"], "data_indicator": "account_code"},
        )

        assert len(result) == 2
        assert result["property"].tolist() == ["Building A", "Building A"]

    def test_skips_pattern_filtering_when_skip_patterns_is_not_list(self):
        """Non-list skip patterns should not remove matching indicator values."""
        df = pd.DataFrame(
            {
                "account_code": ["6000", "Total", "6100"],
                "amount": [100, 200, 300],
            }
        )

        result = handle_merged_cells_pattern(
            df,
            {"data_indicator": "account_code", "skip_patterns": "Total"},
        )

        assert result["account_code"].tolist() == ["6000", "Total", "6100"]


class TestDetectHeaderRow:
    """Test header row detection with word boundaries."""

    def test_detects_header_row_with_word_boundaries(self):
        """Should detect header row using word boundaries (lines 293-308, FIX DI-9)."""
        df = pd.DataFrame(
            [
                ["Title", "Report", "Date"],
                ["Account", "Amount", "Description"],
                ["6000", "100", "Utilities"],
            ]
        )
        expected = ["Account", "Amount"]
        result = detect_header_row(df, expected)

        assert result == 1  # Second row has the headers

    def test_word_boundary_prevents_false_positives(self):
        """Word boundary should prevent 'describe' matching 'description' (FIX DI-9)."""
        df = pd.DataFrame(
            [
                ["describe", "nothing", "here"],  # Should NOT match "description"
                ["Account", "Description", "Amount"],
            ]
        )
        expected = ["description"]  # Looking for "description", not "describe"
        result = detect_header_row(df, expected)

        assert result == 1  # Should find row 1, not row 0

    def test_returns_zero_if_not_found(self):
        """Should return 0 if header not found (lines 310)."""
        df = pd.DataFrame([["foo", "bar"], ["baz", "qux"]])
        expected = ["nonexistent"]
        result = detect_header_row(df, expected)

        assert result == 0


class TestSplitAmountColumns:
    """Test debit/credit column splitting."""

    def test_combines_debit_credit_to_signed_amount(self):
        """Should combine debit/credit into signed amount (lines 340-356)."""
        df = pd.DataFrame({"debit": ["100", "0"], "credit": ["0", "50"]})
        result_df, warnings = split_amount_columns(df)

        assert result_df["amount"][0] == 100  # Debit is positive
        assert result_df["amount"][1] == -50  # Credit is negative

    def test_warns_when_both_debit_and_credit_filled(self):
        """Should warn when both columns have values (lines 346-353, FIX DI-1)."""
        df = pd.DataFrame({"debit": ["100", "200"], "credit": ["50", "0"]})
        result_df, warnings = split_amount_columns(df, warn_both_filled=True)

        assert len(warnings) == 1
        assert "both debit and credit" in warnings[0].lower()
        # Net amount should be debit - credit
        assert result_df["amount"][0] == 50  # 100 - 50

    def test_no_warning_when_warn_disabled(self):
        """Should not warn when warn_both_filled=False (lines 346)."""
        df = pd.DataFrame({"debit": ["100"], "credit": ["50"]})
        result_df, warnings = split_amount_columns(df, warn_both_filled=False)

        assert len(warnings) == 0


class TestFilterGarbageRows:
    """Test garbage row filtering."""

    def test_returns_copy_for_empty_dataframe(self):
        """Empty input should return an empty copy without error."""
        df = pd.DataFrame(columns=["col1"])

        result = filter_garbage_rows(df)

        assert result.empty
        assert list(result.columns) == ["col1"]
        assert result is not df

    def test_removes_dashed_separator_lines(self):
        """Should remove dashed separator lines (lines 396)."""
        df = pd.DataFrame({"col1": ["6000", "-----", "6100"]})
        result = filter_garbage_rows(df)

        assert len(result) == 2
        assert "-----" not in result["col1"].values

    def test_removes_page_numbers(self):
        """Should remove page number rows (lines 397)."""
        df = pd.DataFrame({"col1": ["6000", "Page 1", "Page 1 of 5", "6100"]})
        result = filter_garbage_rows(df)

        assert len(result) == 2
        assert "Page 1" not in result["col1"].values

    def test_removes_total_rows(self):
        """Should remove total/subtotal rows (lines 409-413)."""
        df = pd.DataFrame(
            {"col1": ["6000", "Total", "Subtotal", "Grand Total", "6100"]}
        )
        result = filter_garbage_rows(df)

        assert len(result) == 2  # Only data rows remain

    def test_removes_empty_rows(self):
        """Should remove completely empty rows (lines 432-434)."""
        df = pd.DataFrame(
            {"col1": ["6000", np.nan, "", "6100"], "col2": [100, np.nan, "", 200]}
        )
        result = filter_garbage_rows(df)

        assert len(result) == 2  # Empty rows removed

    def test_prevents_false_positives_with_specific_patterns(self):
        """Should not remove data with similar words (lines 391-403, FIX ING-11)."""
        # "Page 2 Building" should NOT be filtered as a page number
        df = pd.DataFrame({"col1": ["6000", "Page 2 Building", "6100"]})
        result = filter_garbage_rows(df)

        # "Page 2 Building" should remain (doesn't match strict pattern "^Page\s+\d+\s*(of\s+\d+)?$")
        assert len(result) == 3

    def test_ignores_non_list_pattern_and_column_config(self):
        """Invalid config shapes should skip pattern filtering and still remove empty rows."""
        df = pd.DataFrame(
            {
                "col1": ["6000", "Total", ""],
                "col2": [100, 200, ""],
            }
        )

        result = filter_garbage_rows(
            df,
            config={
                "garbage_patterns": "not-a-list",
                "total_patterns": "not-a-list",
                "check_columns": "col1",
            },
        )

        assert len(result) == 2
        assert "Total" in result["col1"].values

    def test_ignores_missing_check_columns(self):
        """Configured columns that do not exist should be skipped safely."""
        df = pd.DataFrame({"col1": ["6000", "Total"]})

        result = filter_garbage_rows(
            df,
            config={
                "check_columns": ["missing_column", "col1"],
            },
        )

        assert len(result) == 1
        assert result["col1"].tolist() == ["6000"]


class TestFilterByRequiredColumns:
    """Test required column filtering."""

    def test_filters_rows_without_required_values(self):
        """Should filter rows missing required column values (lines 458-466)."""
        df = pd.DataFrame(
            {
                "account_code": ["6000", np.nan, "6100"],
                "amount": [100, 200, 300],
            }
        )
        result = filter_by_required_columns(df, required_columns=["account_code"])

        assert len(result) == 2  # Row with NaN account_code removed

    def test_min_non_null_threshold(self):
        """Should respect min_non_null threshold (lines 452, 464)."""
        df = pd.DataFrame(
            {
                "col1": ["A", np.nan, "C"],
                "col2": ["B", "D", np.nan],
            }
        )
        result = filter_by_required_columns(
            df, required_columns=["col1", "col2"], min_non_null=2
        )

        # Only first row has both columns filled
        assert len(result) == 1

    def test_returns_unchanged_if_no_required_columns_exist(self):
        """Should return unchanged if required columns don't exist (lines 460-461)."""
        df = pd.DataFrame({"col1": ["A", "B"]})
        result = filter_by_required_columns(df, required_columns=["nonexistent"])

        assert len(result) == 2  # Unchanged
