"""Tests for fiscal year utility functions."""

from datetime import date

from app.services.calculation.fiscal_year import (
    get_fiscal_year_period,
    infer_fiscal_year,
)


class TestGetFiscalYearPeriod:
    """Tests for get_fiscal_year_period."""

    def test_calendar_year(self) -> None:
        """January start = standard calendar year."""
        start, end = get_fiscal_year_period(1, 2025)
        assert start == date(2025, 1, 1)
        assert end == date(2025, 12, 31)

    def test_april_fiscal_year(self) -> None:
        """April start → Apr 2025 to Mar 2026."""
        start, end = get_fiscal_year_period(4, 2025)
        assert start == date(2025, 4, 1)
        assert end == date(2026, 3, 31)

    def test_july_fiscal_year(self) -> None:
        """July start → Jul 2025 to Jun 2026."""
        start, end = get_fiscal_year_period(7, 2025)
        assert start == date(2025, 7, 1)
        assert end == date(2026, 6, 30)

    def test_october_fiscal_year(self) -> None:
        """October start → Oct 2025 to Sep 2026 (US government FY)."""
        start, end = get_fiscal_year_period(10, 2025)
        assert start == date(2025, 10, 1)
        assert end == date(2026, 9, 30)

    def test_december_fiscal_year(self) -> None:
        """December start → Dec 2025 to Nov 2026."""
        start, end = get_fiscal_year_period(12, 2025)
        assert start == date(2025, 12, 1)
        assert end == date(2026, 11, 30)

    def test_february_leap_year(self) -> None:
        """February start in a year where the end lands on leap year."""
        start, end = get_fiscal_year_period(2, 2025)
        assert start == date(2025, 2, 1)
        assert end == date(2026, 1, 31)


class TestInferFiscalYear:
    """Tests for infer_fiscal_year."""

    def test_calendar_year_gl_dates(self) -> None:
        """GL dates spanning Jan-Dec → fiscal year = that year."""
        dates = [date(2025, 1, 15), date(2025, 6, 1), date(2025, 12, 20)]
        assert infer_fiscal_year(dates, start_month=1) == 2025

    def test_april_fy_dates_in_same_range(self) -> None:
        """GL dates in Apr-Dec 2025 with April FY → FY 2025."""
        dates = [date(2025, 4, 1), date(2025, 9, 15), date(2025, 12, 31)]
        assert infer_fiscal_year(dates, start_month=4) == 2025

    def test_april_fy_dates_spanning_calendar_years(self) -> None:
        """GL dates Apr 2025 – Mar 2026 with April FY → FY 2025."""
        dates = [date(2025, 5, 1), date(2026, 2, 15)]
        assert infer_fiscal_year(dates, start_month=4) == 2025

    def test_empty_dates_returns_none(self) -> None:
        """No dates → None."""
        assert infer_fiscal_year([], start_month=1) is None

    def test_single_date(self) -> None:
        """Single date → infer that fiscal year."""
        assert infer_fiscal_year([date(2025, 8, 15)], start_month=7) == 2025

    def test_single_date_before_fy_start(self) -> None:
        """Date before FY start month → previous FY."""
        assert infer_fiscal_year([date(2025, 2, 15)], start_month=4) == 2024
