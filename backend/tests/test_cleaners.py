"""Tests for vectorized data cleaning functions.

Tests the cleaners module which handles ERP currency formats,
dates, account codes, and merged cell handling.
"""

import numpy as np
import pandas as pd
from pandas.testing import assert_series_equal


class TestCleanCurrencyColumn:
    """Tests for clean_currency_column function."""

    def test_parentheses_negative(self):
        """AC1: Handles (500.00) as negative 500."""
        from app.services.ingestion.cleaners import clean_currency_column

        series = pd.Series(["(500.00)", "(1234.56)", "(0.01)"])
        result = clean_currency_column(series)

        expected = pd.Series([-500.00, -1234.56, -0.01])
        assert_series_equal(result, expected)

    def test_currency_symbols_and_commas(self):
        """AC2: Handles $1,234.56 as 1234.56."""
        from app.services.ingestion.cleaners import clean_currency_column

        series = pd.Series(["$1,234.56", "$999.99", "$1,000,000.00"])
        result = clean_currency_column(series)

        expected = pd.Series([1234.56, 999.99, 1000000.00])
        assert_series_equal(result, expected)

    def test_cr_suffix_negative(self):
        """AC3: Handles 500 CR as negative 500."""
        from app.services.ingestion.cleaners import clean_currency_column

        series = pd.Series(["500 CR", "1234.56CR", "100.00 cr"])
        result = clean_currency_column(series)

        expected = pd.Series([-500.00, -1234.56, -100.00])
        assert_series_equal(result, expected)

    def test_dr_suffix_positive(self):
        """AC4: Handles 500 DR as positive 500."""
        from app.services.ingestion.cleaners import clean_currency_column

        series = pd.Series(["500 DR", "1234.56DR", "100.00 dr"])
        result = clean_currency_column(series)

        expected = pd.Series([500.00, 1234.56, 100.00])
        assert_series_equal(result, expected)

    def test_trailing_minus_negative(self):
        """Handles trailing minus sign (500.00-)."""
        from app.services.ingestion.cleaners import clean_currency_column

        series = pd.Series(["500.00-", "1234.56-"])
        result = clean_currency_column(series)

        expected = pd.Series([-500.00, -1234.56])
        assert_series_equal(result, expected)

    def test_leading_minus_preserved(self):
        """Handles leading minus sign normally."""
        from app.services.ingestion.cleaners import clean_currency_column

        series = pd.Series(["-500.00", "-1234.56"])
        result = clean_currency_column(series)

        expected = pd.Series([-500.00, -1234.56])
        assert_series_equal(result, expected)

    def test_currency_symbol_with_minus(self):
        """Handles currency symbol before minus sign ($-500.00)."""
        from app.services.ingestion.cleaners import clean_currency_column

        series = pd.Series(["$-500.00", "$-1,234.56", "€-100.00", "£-50.00"])
        result = clean_currency_column(series)

        expected = pd.Series([-500.00, -1234.56, -100.00, -50.00])
        assert_series_equal(result, expected)

    def test_space_thousand_separator(self):
        """Handles space as thousand separator (1 234.56)."""
        from app.services.ingestion.cleaners import clean_currency_column

        series = pd.Series(["1 234.56", "1 000 000.00"])
        result = clean_currency_column(series)

        expected = pd.Series([1234.56, 1000000.00])
        assert_series_equal(result, expected)

    def test_multiple_currency_symbols(self):
        """Handles different currency symbols."""
        from app.services.ingestion.cleaners import clean_currency_column

        series = pd.Series(["$100.00", "£200.00", "€300.00", "¥400"])
        result = clean_currency_column(series)

        expected = pd.Series([100.00, 200.00, 300.00, 400.00])
        assert_series_equal(result, expected)

    def test_empty_series(self):
        """Handles empty series."""
        from app.services.ingestion.cleaners import clean_currency_column

        series = pd.Series([], dtype=str)
        result = clean_currency_column(series)

        assert len(result) == 0
        assert result.dtype == float

    def test_nan_values_preserved(self):
        """Handles NaN/None values by converting to NaN."""
        from app.services.ingestion.cleaners import clean_currency_column

        series = pd.Series(["100.00", None, "invalid", "200.00"])
        result = clean_currency_column(series)

        assert result[0] == 100.00
        assert pd.isna(result[1])
        assert pd.isna(result[2])
        assert result[3] == 200.00

    def test_mixed_formats(self):
        """Handles mixed currency formats in same column."""
        from app.services.ingestion.cleaners import clean_currency_column

        series = pd.Series(
            [
                "$1,234.56",
                "(500.00)",
                "100 CR",
                "200 DR",
                "-50.00",
                "75.00-",
            ]
        )
        result = clean_currency_column(series)

        expected = pd.Series([1234.56, -500.00, -100.00, 200.00, -50.00, -75.00])
        assert_series_equal(result, expected)

    def test_whitespace_handling(self):
        """Handles leading/trailing whitespace."""
        from app.services.ingestion.cleaners import clean_currency_column

        series = pd.Series(["  $100.00  ", "  (500.00)  ", "  100 CR  "])
        result = clean_currency_column(series)

        expected = pd.Series([100.00, -500.00, -100.00])
        assert_series_equal(result, expected)

    def test_vectorized_performance(self):
        """AC5: Operations are vectorized (large dataset performance)."""
        import time

        from app.services.ingestion.cleaners import clean_currency_column

        # Create large dataset (50,000 rows)
        np.random.seed(42)
        values = np.random.choice(
            ["$1,234.56", "(500.00)", "100 CR", "200 DR"],
            size=50000,
        )
        series = pd.Series(values)

        # Should complete in under 1 second (vectorized)
        start = time.time()
        result = clean_currency_column(series)
        elapsed = time.time() - start

        assert len(result) == 50000
        assert elapsed < 1.0, f"Operation took {elapsed:.2f}s, expected < 1s"


class TestCleanDateColumn:
    """Tests for clean_date_column function."""

    def test_iso_format(self):
        """Handles ISO date format (YYYY-MM-DD)."""
        from app.services.ingestion.cleaners import clean_date_column

        series = pd.Series(["2024-01-15", "2024-12-31"])
        result = clean_date_column(series)

        assert result[0] == pd.Timestamp("2024-01-15")
        assert result[1] == pd.Timestamp("2024-12-31")

    def test_us_format(self):
        """Handles US date format (MM/DD/YYYY)."""
        from app.services.ingestion.cleaners import clean_date_column

        series = pd.Series(["01/15/2024", "12/31/2024"])
        result = clean_date_column(series)

        assert result[0] == pd.Timestamp("2024-01-15")
        assert result[1] == pd.Timestamp("2024-12-31")

    def test_custom_formats(self):
        """Handles custom date formats."""
        from app.services.ingestion.cleaners import clean_date_column

        series = pd.Series(["15-Jan-2024", "31-Dec-2024"])
        result = clean_date_column(series, date_formats=["%d-%b-%Y"])

        assert result[0] == pd.Timestamp("2024-01-15")
        assert result[1] == pd.Timestamp("2024-12-31")

    def test_invalid_dates_to_nat(self):
        """Invalid dates convert to NaT."""
        from app.services.ingestion.cleaners import clean_date_column

        series = pd.Series(["2024-01-15", "invalid", "not-a-date"])
        result = clean_date_column(series)

        assert result[0] == pd.Timestamp("2024-01-15")
        assert pd.isna(result[1])
        assert pd.isna(result[2])

    def test_empty_series(self):
        """Handles empty series."""
        from app.services.ingestion.cleaners import clean_date_column

        series = pd.Series([], dtype=str)
        result = clean_date_column(series)

        assert len(result) == 0

    def test_fallback_inference(self):
        """Falls back to pandas inference for uncommon formats."""
        from app.services.ingestion.cleaners import clean_date_column

        # Format that isn't in default list but pandas can infer
        series = pd.Series(["Jan 15, 2024", "Dec 31, 2024"])
        result = clean_date_column(series)

        # Pandas should infer these dates
        assert result[0] == pd.Timestamp("2024-01-15")
        assert result[1] == pd.Timestamp("2024-12-31")


class TestExtractPeriodFromDate:
    """Tests for extract_period_from_date function."""

    def test_extracts_year_and_month(self):
        """Extracts year and month from datetime series."""
        from app.services.ingestion.cleaners import extract_period_from_date

        series = pd.Series(pd.to_datetime(["2024-01-15", "2024-06-30", "2025-12-01"]))
        year, month = extract_period_from_date(series)

        assert list(year) == [2024, 2024, 2025]
        assert list(month) == [1, 6, 12]

    def test_handles_nat(self):
        """Handles NaT values."""
        from app.services.ingestion.cleaners import extract_period_from_date

        series = pd.Series(pd.to_datetime(["2024-01-15", pd.NaT]))
        year, month = extract_period_from_date(series)

        assert year.iloc[0] == 2024
        assert month.iloc[0] == 1
        assert pd.isna(year.iloc[1])
        assert pd.isna(month.iloc[1])


class TestCleanAccountCode:
    """Tests for clean_account_code function."""

    def test_strips_whitespace(self):
        """Strips leading/trailing whitespace."""
        from app.services.ingestion.cleaners import clean_account_code

        series = pd.Series(["  6000  ", "  7100  "])
        result = clean_account_code(series)

        assert list(result) == ["6000", "7100"]

    def test_removes_special_chars(self):
        """Removes special characters except - and ."""
        from app.services.ingestion.cleaners import clean_account_code

        series = pd.Series(["6000#", "7100!", "8000@"])
        result = clean_account_code(series)

        assert list(result) == ["6000", "7100", "8000"]

    def test_preserves_alphanumeric_dash_dot(self):
        """Preserves alphanumeric, dashes, and dots."""
        from app.services.ingestion.cleaners import clean_account_code

        series = pd.Series(["6000-100", "7100.01", "GL-8000"])
        result = clean_account_code(series)

        assert list(result) == ["6000-100", "7100.01", "GL-8000"]

    def test_handles_numeric_input(self):
        """Handles numeric input by converting to string."""
        from app.services.ingestion.cleaners import clean_account_code

        series = pd.Series([6000, 7100])
        result = clean_account_code(series)

        assert list(result) == ["6000", "7100"]


class TestForwardFillContext:
    """Tests for forward_fill_context function."""

    def test_fills_nan_values(self):
        """Forward-fills NaN values in context columns."""
        from app.services.ingestion.cleaners import forward_fill_context

        df = pd.DataFrame(
            {
                "property": ["Building A", None, None, "Building B", None],
                "amount": [100, 200, 300, 400, 500],
            }
        )
        result = forward_fill_context(df, ["property"])

        expected_property = [
            "Building A",
            "Building A",
            "Building A",
            "Building B",
            "Building B",
        ]
        assert list(result["property"]) == expected_property
        assert list(result["amount"]) == [100, 200, 300, 400, 500]

    def test_multiple_context_columns(self):
        """Forward-fills multiple context columns."""
        from app.services.ingestion.cleaners import forward_fill_context

        df = pd.DataFrame(
            {
                "property": ["Building A", None, None],
                "category": ["Utilities", None, None],
                "amount": [100, 200, 300],
            }
        )
        result = forward_fill_context(df, ["property", "category"])

        assert list(result["property"]) == ["Building A", "Building A", "Building A"]
        assert list(result["category"]) == ["Utilities", "Utilities", "Utilities"]

    def test_does_not_modify_original(self):
        """Does not modify the original DataFrame."""
        from app.services.ingestion.cleaners import forward_fill_context

        df = pd.DataFrame(
            {
                "property": ["Building A", None],
                "amount": [100, 200],
            }
        )
        result = forward_fill_context(df, ["property"])

        assert pd.isna(df.loc[1, "property"])  # Original unchanged
        assert result.loc[1, "property"] == "Building A"  # Result changed

    def test_ignores_missing_columns(self):
        """Ignores columns not present in DataFrame."""
        from app.services.ingestion.cleaners import forward_fill_context

        df = pd.DataFrame(
            {
                "property": ["Building A", None],
                "amount": [100, 200],
            }
        )
        # Should not raise error for missing "category" column
        result = forward_fill_context(df, ["property", "category"])

        assert list(result["property"]) == ["Building A", "Building A"]


class TestHandleMergedCellsPattern:
    """Tests for handle_merged_cells_pattern function."""

    def test_forward_fills_property_name(self):
        """AC1: Forward-fills property name when empty."""
        from app.services.ingestion.cleaners import handle_merged_cells_pattern

        df = pd.DataFrame(
            {
                "property_name": ["Building A", "", "", "Building B", ""],
                "account_code": ["6000", "6100", "6200", "6000", "6100"],
                "amount": [100, 200, 300, 400, 500],
            }
        )
        config = {
            "group_columns": ["property_name"],
            "data_indicator": "account_code",
        }
        result = handle_merged_cells_pattern(df, config)

        expected = [
            "Building A",
            "Building A",
            "Building A",
            "Building B",
            "Building B",
        ]
        assert list(result["property_name"]) == expected

    def test_forward_fills_building_name(self):
        """AC2: Forward-fills building name when empty."""
        from app.services.ingestion.cleaners import handle_merged_cells_pattern

        df = pd.DataFrame(
            {
                "property_name": ["Property 1", "", ""],
                "building_name": ["Tower A", "", ""],
                "account_code": ["6000", "6100", "6200"],
                "amount": [100, 200, 300],
            }
        )
        config = {
            "group_columns": ["property_name", "building_name"],
            "data_indicator": "account_code",
        }
        result = handle_merged_cells_pattern(df, config)

        assert list(result["property_name"]) == [
            "Property 1",
            "Property 1",
            "Property 1",
        ]
        assert list(result["building_name"]) == ["Tower A", "Tower A", "Tower A"]

    def test_filters_non_data_rows(self):
        """Filters out rows without data indicator values."""
        from app.services.ingestion.cleaners import handle_merged_cells_pattern

        df = pd.DataFrame(
            {
                "property_name": ["Building A", "", "", ""],
                "account_code": ["6000", "", "6100", ""],
                "amount": [100, 0, 200, 0],
            }
        )
        config = {
            "group_columns": ["property_name"],
            "data_indicator": "account_code",
        }
        result = handle_merged_cells_pattern(df, config)

        # Only rows with account_code should remain
        assert len(result) == 2
        assert list(result["account_code"]) == ["6000", "6100"]

    def test_filters_skip_patterns(self):
        """Filters out rows matching skip patterns (Total, Subtotal, etc.)."""
        from app.services.ingestion.cleaners import handle_merged_cells_pattern

        df = pd.DataFrame(
            {
                "property_name": ["Building A", "", "", ""],
                "account_code": ["6000", "6100", "Total", "Subtotal"],
                "amount": [100, 200, 300, 400],
            }
        )
        config = {
            "group_columns": ["property_name"],
            "data_indicator": "account_code",
            "skip_patterns": ["Total", "Subtotal"],
        }
        result = handle_merged_cells_pattern(df, config)

        assert len(result) == 2
        assert "Total" not in list(result["account_code"])
        assert "Subtotal" not in list(result["account_code"])

    def test_preserves_data_columns(self):
        """AC5: Preserves original data in all columns."""
        from app.services.ingestion.cleaners import handle_merged_cells_pattern

        df = pd.DataFrame(
            {
                "property_name": ["Building A", ""],
                "account_code": ["6000", "6100"],
                "description": ["Utilities", "Janitorial"],
                "amount": [100.50, 200.75],
            }
        )
        config = {
            "group_columns": ["property_name"],
            "data_indicator": "account_code",
        }
        result = handle_merged_cells_pattern(df, config)

        assert list(result["description"]) == ["Utilities", "Janitorial"]
        assert list(result["amount"]) == [100.50, 200.75]

    def test_handles_empty_dataframe(self):
        """Handles empty DataFrame."""
        from app.services.ingestion.cleaners import handle_merged_cells_pattern

        df = pd.DataFrame(columns=["property_name", "account_code", "amount"])
        config = {
            "group_columns": ["property_name"],
            "data_indicator": "account_code",
        }
        result = handle_merged_cells_pattern(df, config)

        assert len(result) == 0

    def test_case_insensitive_skip_patterns(self):
        """Skip patterns are case-insensitive."""
        from app.services.ingestion.cleaners import handle_merged_cells_pattern

        df = pd.DataFrame(
            {
                "property_name": ["Building A", "", ""],
                "account_code": ["6000", "TOTAL", "total"],
                "amount": [100, 200, 300],
            }
        )
        config = {
            "group_columns": ["property_name"],
            "data_indicator": "account_code",
            "skip_patterns": ["Total"],
        }
        result = handle_merged_cells_pattern(df, config)

        assert len(result) == 1
        assert list(result["account_code"]) == ["6000"]


class TestDetectHeaderRow:
    """Tests for detect_header_row function."""

    def test_detects_header_in_first_row(self):
        """AC3: Identifies header row when it's first row."""
        from app.services.ingestion.cleaners import detect_header_row

        df = pd.DataFrame(
            [
                ["Account", "Description", "Amount"],
                ["6000", "Utilities", "100.00"],
                ["6100", "Janitorial", "200.00"],
            ]
        )
        result = detect_header_row(df, ["account", "description", "amount"])

        assert result == 0

    def test_detects_header_after_title_rows(self):
        """Detects header row after title/summary rows."""
        from app.services.ingestion.cleaners import detect_header_row

        df = pd.DataFrame(
            [
                ["Yardi Report - Property Summary", "", ""],
                ["Run Date: 01/15/2024", "", ""],
                ["", "", ""],
                ["Account", "Description", "Amount"],
                ["6000", "Utilities", "100.00"],
            ]
        )
        result = detect_header_row(df, ["account", "description", "amount"])

        assert result == 3

    def test_partial_header_match(self):
        """Detects header with partial match (60% threshold)."""
        from app.services.ingestion.cleaners import detect_header_row

        df = pd.DataFrame(
            [
                ["Account Code", "Desc", "Amt", "Extra"],
                ["6000", "Utilities", "100.00", "X"],
            ]
        )
        # Only 2 of 3 expected headers match exactly
        result = detect_header_row(df, ["account", "description", "amount"])

        # Should still find row 0 since "account" is in "Account Code"
        assert result == 0

    def test_returns_zero_when_not_found(self):
        """Returns 0 when header row not found."""
        from app.services.ingestion.cleaners import detect_header_row

        df = pd.DataFrame(
            [
                ["6000", "Utilities", "100.00"],
                ["6100", "Janitorial", "200.00"],
            ]
        )
        result = detect_header_row(df, ["account", "description", "amount"])

        assert result == 0

    def test_respects_max_rows_to_check(self):
        """Respects max_rows_to_check limit."""
        from app.services.ingestion.cleaners import detect_header_row

        df = pd.DataFrame(
            [
                ["garbage"] * 3,
                ["garbage"] * 3,
                ["garbage"] * 3,
                ["garbage"] * 3,
                ["garbage"] * 3,
                ["Account", "Description", "Amount"],  # Row 5
            ]
        )
        # With max_rows=3, should not find header at row 5
        result = detect_header_row(
            df, ["account", "description", "amount"], max_rows_to_check=3
        )

        assert result == 0

    def test_case_insensitive_matching(self):
        """Header matching is case-insensitive."""
        from app.services.ingestion.cleaners import detect_header_row

        df = pd.DataFrame(
            [
                ["ACCOUNT", "DESCRIPTION", "AMOUNT"],
                ["6000", "Utilities", "100.00"],
            ]
        )
        result = detect_header_row(df, ["account", "description", "amount"])

        assert result == 0


class TestSplitAmountColumns:
    """Tests for split_amount_columns function."""

    def test_combines_debit_credit_to_amount(self):
        """Combines debit/credit columns into signed amount."""
        from app.services.ingestion.cleaners import split_amount_columns

        df = pd.DataFrame(
            {
                "account": ["6000", "6100", "6200"],
                "debit": ["100.00", "0", "300.00"],
                "credit": ["0", "200.00", "0"],
            }
        )
        result, warnings = split_amount_columns(df)

        # Debit positive, credit negative
        assert list(result["amount"]) == [100.0, -200.0, 300.0]
        assert len(warnings) == 0  # No rows with both values

    def test_preserves_original_columns(self):
        """Preserves original debit/credit columns."""
        from app.services.ingestion.cleaners import split_amount_columns

        df = pd.DataFrame(
            {
                "account": ["6000"],
                "debit": ["100.00"],
                "credit": ["0"],
            }
        )
        result, _ = split_amount_columns(df)

        assert "debit" in result.columns
        assert "credit" in result.columns

    def test_handles_currency_formats(self):
        """Handles currency-formatted debit/credit values."""
        from app.services.ingestion.cleaners import split_amount_columns

        df = pd.DataFrame(
            {
                "account": ["6000", "6100"],
                "debit": ["$1,000.00", "(500.00)"],
                "credit": ["$0.00", "$200.00"],
            }
        )
        result, _ = split_amount_columns(df)

        # $1,000 debit - $0 credit = 1000
        # (500) debit = -500 (parentheses), - 200 credit = -700
        assert result["amount"].iloc[0] == 1000.0
        assert result["amount"].iloc[1] == -700.0

    def test_custom_column_names(self):
        """Works with custom column names."""
        from app.services.ingestion.cleaners import split_amount_columns

        df = pd.DataFrame(
            {
                "account": ["6000"],
                "dr": ["100.00"],
                "cr": ["50.00"],
            }
        )
        result, warnings = split_amount_columns(
            df,
            debit_col="dr",
            credit_col="cr",
            amount_col="net_amount",
        )

        assert "net_amount" in result.columns
        assert result["net_amount"].iloc[0] == 50.0  # 100 - 50
        # Both dr and cr have values, so warning expected
        assert len(warnings) == 1
        assert "1 row(s) have both debit and credit values" in warnings[0]

    def test_missing_columns_no_change(self):
        """Returns unchanged DataFrame if columns missing."""
        from app.services.ingestion.cleaners import split_amount_columns

        df = pd.DataFrame(
            {
                "account": ["6000"],
                "amount": [100.00],
            }
        )
        result, warnings = split_amount_columns(df)

        # No debit/credit columns, so no change
        assert "amount" in result.columns
        assert result["amount"].iloc[0] == 100.0
        assert len(warnings) == 0

    def test_handles_nan_values(self):
        """Handles NaN values in debit/credit columns."""
        from app.services.ingestion.cleaners import split_amount_columns

        df = pd.DataFrame(
            {
                "account": ["6000", "6100"],
                "debit": ["100.00", None],
                "credit": [None, "200.00"],
            }
        )
        result, warnings = split_amount_columns(df)

        assert result["amount"].iloc[0] == 100.0  # 100 - 0
        assert result["amount"].iloc[1] == -200.0  # 0 - 200
        assert len(warnings) == 0  # NaN doesn't count as "both filled"

    def test_warns_when_both_debit_and_credit_have_values(self):
        """FIX DI-1: Warns when both debit and credit have non-zero values."""
        from app.services.ingestion.cleaners import split_amount_columns

        df = pd.DataFrame(
            {
                "account": ["6000", "6100", "6200"],
                "debit": ["100.00", "200.00", "0"],
                "credit": ["50.00", "0", "300.00"],  # First row has both
            }
        )
        result, warnings = split_amount_columns(df)

        # First row has both debit AND credit with non-zero values
        assert len(warnings) == 1
        assert "1 row(s) have both debit and credit values" in warnings[0]
        assert "Review for errors" in warnings[0]
        # Amount should still be calculated correctly (net)
        assert result["amount"].iloc[0] == 50.0  # 100 - 50

    def test_can_disable_both_filled_warning(self):
        """Can disable the both-filled warning."""
        from app.services.ingestion.cleaners import split_amount_columns

        df = pd.DataFrame(
            {
                "account": ["6000"],
                "debit": ["100.00"],
                "credit": ["50.00"],  # Both have values
            }
        )
        result, warnings = split_amount_columns(df, warn_both_filled=False)

        assert len(warnings) == 0  # Warning disabled


class TestFilterGarbageRows:
    """Tests for filter_garbage_rows function."""

    def test_removes_page_number_patterns(self):
        """AC1: Removes rows with 'Page X of Y' patterns."""
        from app.services.ingestion.cleaners import filter_garbage_rows

        df = pd.DataFrame(
            {
                "col1": ["6000", "Page 1 of 5", "6100", "Page 2 of 5"],
                "col2": ["Utilities", "", "Janitorial", ""],
                "amount": [100, 0, 200, 0],
            }
        )
        result = filter_garbage_rows(df)

        assert len(result) == 2
        assert "Page 1 of 5" not in list(result["col1"])
        assert "Page 2 of 5" not in list(result["col1"])

    def test_removes_dashed_lines(self):
        """AC2: Removes rows with dashed line separators."""
        from app.services.ingestion.cleaners import filter_garbage_rows

        df = pd.DataFrame(
            {
                "col1": ["6000", "---", "----", "6100", "=====", "***"],
                "col2": ["Utilities", "", "", "Janitorial", "", ""],
                "amount": [100, 0, 0, 200, 0, 0],
            }
        )
        result = filter_garbage_rows(df)

        assert len(result) == 2
        assert list(result["col1"]) == ["6000", "6100"]

    def test_removes_total_rows(self):
        """AC3: Removes rows with 'Total' summaries."""
        from app.services.ingestion.cleaners import filter_garbage_rows

        df = pd.DataFrame(
            {
                "col1": ["6000", "Total", "6100", "Subtotal", "Grand Total"],
                "col2": ["Utilities", "", "Janitorial", "", ""],
                "amount": [100, 500, 200, 300, 800],
            }
        )
        result = filter_garbage_rows(df)

        assert len(result) == 2
        assert list(result["col1"]) == ["6000", "6100"]

    def test_removes_empty_rows(self):
        """AC4: Removes completely empty rows."""
        from app.services.ingestion.cleaners import filter_garbage_rows

        df = pd.DataFrame(
            {
                "col1": ["6000", "", None, "6100"],
                "col2": ["Utilities", "", None, "Janitorial"],
                "amount": [100.0, np.nan, np.nan, 200.0],
            }
        )
        result = filter_garbage_rows(df)

        assert len(result) == 2
        assert list(result["col1"]) == ["6000", "6100"]

    def test_preserves_data_rows(self):
        """AC5: Preserves actual data rows accurately."""
        from app.services.ingestion.cleaners import filter_garbage_rows

        df = pd.DataFrame(
            {
                "account_code": ["6000", "6100", "6200"],
                "description": ["Utilities", "Janitorial", "Insurance"],
                "amount": [100.50, 200.75, 300.25],
            }
        )
        result = filter_garbage_rows(df)

        assert len(result) == 3
        assert list(result["account_code"]) == ["6000", "6100", "6200"]
        assert list(result["amount"]) == [100.50, 200.75, 300.25]

    def test_removes_report_headers(self):
        """Removes common report header patterns."""
        from app.services.ingestion.cleaners import filter_garbage_rows

        df = pd.DataFrame(
            {
                "col1": [
                    "Report Date: 01/15/2024",
                    "Run Date: 01/15/2024",
                    "Printed by: Admin",
                    "Confidential",
                    "6000",
                ],
                "col2": ["", "", "", "", "Utilities"],
                "amount": [0, 0, 0, 0, 100],
            }
        )
        result = filter_garbage_rows(df)

        assert len(result) == 1
        assert result["col1"].iloc[0] == "6000"

    def test_custom_garbage_patterns(self):
        """Supports custom garbage patterns via config."""
        from app.services.ingestion.cleaners import filter_garbage_rows

        df = pd.DataFrame(
            {
                "col1": ["6000", "CUSTOM_GARBAGE", "6100"],
                "col2": ["Utilities", "", "Janitorial"],
                "amount": [100, 0, 200],
            }
        )
        config = {"garbage_patterns": [r"CUSTOM_GARBAGE"]}
        result = filter_garbage_rows(df, config)

        assert len(result) == 2
        assert "CUSTOM_GARBAGE" not in list(result["col1"])

    def test_custom_total_patterns(self):
        """Supports custom total patterns via config."""
        from app.services.ingestion.cleaners import filter_garbage_rows

        df = pd.DataFrame(
            {
                "col1": ["6000", "Sum:", "6100"],
                "col2": ["Utilities", "", "Janitorial"],
                "amount": [100, 500, 200],
            }
        )
        config = {"total_patterns": [r"^Sum:"]}
        result = filter_garbage_rows(df, config)

        assert len(result) == 2
        assert "Sum:" not in list(result["col1"])

    def test_check_columns_config(self):
        """Checks specified columns for garbage patterns."""
        from app.services.ingestion.cleaners import filter_garbage_rows

        df = pd.DataFrame(
            {
                "col1": ["6000", "6100", "6200"],
                "col2": ["Utilities", "Page 1 of 5", "Janitorial"],
                "amount": [100, 200, 300],
            }
        )
        config = {"check_columns": ["col2"]}
        result = filter_garbage_rows(df, config)

        # Should find Page pattern in col2
        assert len(result) == 2

    def test_handles_empty_dataframe(self):
        """Handles empty DataFrame."""
        from app.services.ingestion.cleaners import filter_garbage_rows

        df = pd.DataFrame(columns=["col1", "col2", "amount"])
        result = filter_garbage_rows(df)

        assert len(result) == 0

    def test_case_insensitive_matching(self):
        """Pattern matching is case-insensitive."""
        from app.services.ingestion.cleaners import filter_garbage_rows

        df = pd.DataFrame(
            {
                "col1": ["6000", "TOTAL", "total", "ToTaL", "6100"],
                "col2": ["Utilities", "", "", "", "Janitorial"],
                "amount": [100, 200, 300, 400, 500],
            }
        )
        result = filter_garbage_rows(df)

        assert len(result) == 2
        assert list(result["col1"]) == ["6000", "6100"]


class TestFilterByRequiredColumns:
    """Tests for filter_by_required_columns function."""

    def test_filters_missing_required_values(self):
        """Filters rows missing values in required columns."""
        from app.services.ingestion.cleaners import filter_by_required_columns

        df = pd.DataFrame(
            {
                "account_code": ["6000", None, "6200"],
                "description": ["Utilities", "Janitorial", None],
                "amount": [100, 200, 300],
            }
        )
        result = filter_by_required_columns(df, ["account_code"])

        assert len(result) == 2
        assert list(result["account_code"]) == ["6000", "6200"]

    def test_multiple_required_columns(self):
        """Checks multiple required columns."""
        from app.services.ingestion.cleaners import filter_by_required_columns

        df = pd.DataFrame(
            {
                "account_code": ["6000", "6100", None],
                "description": ["Utilities", None, "Janitorial"],
                "amount": [100, 200, 300],
            }
        )
        result = filter_by_required_columns(
            df, ["account_code", "description"], min_non_null=2
        )

        # Only first row has both required columns non-null
        assert len(result) == 1
        assert result["account_code"].iloc[0] == "6000"

    def test_min_non_null_threshold(self):
        """Respects min_non_null threshold."""
        from app.services.ingestion.cleaners import filter_by_required_columns

        df = pd.DataFrame(
            {
                "col1": ["A", None, "C"],
                "col2": ["X", "Y", None],
                "col3": [1, 2, 3],
            }
        )
        # Require at least 1 of 2 required columns to be non-null
        result = filter_by_required_columns(df, ["col1", "col2"], min_non_null=1)

        # All rows have at least one non-null in required columns
        assert len(result) == 3

    def test_ignores_missing_columns(self):
        """Ignores required columns not present in DataFrame."""
        from app.services.ingestion.cleaners import filter_by_required_columns

        df = pd.DataFrame(
            {
                "account_code": ["6000", "6100"],
                "amount": [100, 200],
            }
        )
        # "nonexistent" column doesn't exist
        result = filter_by_required_columns(df, ["account_code", "nonexistent"])

        # Should only check account_code
        assert len(result) == 2

    def test_returns_unchanged_if_no_existing_columns(self):
        """Returns unchanged if no required columns exist."""
        from app.services.ingestion.cleaners import filter_by_required_columns

        df = pd.DataFrame(
            {
                "col1": ["A", "B"],
                "col2": [1, 2],
            }
        )
        result = filter_by_required_columns(df, ["nonexistent1", "nonexistent2"])

        assert len(result) == 2

    def test_handles_empty_dataframe(self):
        """Handles empty DataFrame."""
        from app.services.ingestion.cleaners import filter_by_required_columns

        df = pd.DataFrame(columns=["account_code", "amount"])
        result = filter_by_required_columns(df, ["account_code"])

        assert len(result) == 0
