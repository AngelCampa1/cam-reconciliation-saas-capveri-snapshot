"""Tests for unit-aware calculation-trace value formatting.

Mirrors the React ``formatByUnit`` contract so the tenant-facing PDF audit
trail renders each step value the same way the in-app trace does.
"""

from decimal import Decimal

from app.services.formatting import format_trace_value


class TestCurrency:
    def test_default_unit_is_currency(self) -> None:
        assert format_trace_value("5000.00", None) == "$5,000.00"

    def test_explicit_currency(self) -> None:
        assert format_trace_value("5000.00", "currency") == "$5,000.00"

    def test_currency_credit_minus_leads_symbol(self) -> None:
        assert format_trace_value("-5000.00", "currency") == "-$5,000.00"

    def test_unknown_unit_falls_back_to_currency(self) -> None:
        assert format_trace_value("1234.5", "bogus") == "$1,234.50"

    def test_non_numeric_currency_passes_through(self) -> None:
        assert format_trace_value("N/A", "currency") == "N/A"


class TestRatio:
    def test_ratio_four_decimals(self) -> None:
        assert format_trace_value("0.95", "ratio") == "0.9500"

    def test_negative_ratio(self) -> None:
        assert format_trace_value("-0.05", "ratio") == "-0.0500"


class TestArea:
    def test_whole_area_gets_sq_ft_no_decimals(self) -> None:
        assert format_trace_value("10000", "area") == "10,000 sq ft"

    def test_fractional_area_keeps_decimals(self) -> None:
        assert format_trace_value("10000.5", "area") == "10,000.50 sq ft"


class TestCount:
    def test_count_thousands_no_decimals(self) -> None:
        assert format_trace_value("1500", "count") == "1,500"


class TestText:
    def test_text_passthrough(self) -> None:
        assert format_trace_value("Yardi", "text") == "Yardi"

    def test_date_passthrough(self) -> None:
        assert format_trace_value("2024-01-01", "date") == "2024-01-01"


class TestTypes:
    def test_accepts_decimal(self) -> None:
        assert format_trace_value(Decimal("-5000.00"), "currency") == "-$5,000.00"

    def test_bool_not_treated_as_number(self) -> None:
        assert format_trace_value(True, "currency") == "True"
