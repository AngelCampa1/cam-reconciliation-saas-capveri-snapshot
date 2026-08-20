"""Fiscal year utilities for period calculation.

Commercial properties may use fiscal years starting in any month.
This module converts (start_month, year) into concrete date ranges
and infers the fiscal year from a set of GL transaction dates.
"""

from collections import Counter
from datetime import date, timedelta


def get_fiscal_year_period(start_month: int, year: int) -> tuple[date, date]:
    """Return the (start, end) dates for a fiscal year.

    Args:
        start_month: Month the fiscal year begins (1-12).
        year: The fiscal year label (e.g. 2025).

    Returns:
        (first_day_of_period, last_day_of_period)

    Examples:
        (1, 2025) → (2025-01-01, 2025-12-31)
        (4, 2025) → (2025-04-01, 2026-03-31)
    """
    fy_start = date(year, start_month, 1)

    # End = one day before the start of the *next* fiscal year
    next_fy_start = date(year + 1, start_month, 1)
    fy_end = next_fy_start - timedelta(days=1)
    return fy_start, fy_end


def infer_fiscal_year(gl_dates: list[date], start_month: int) -> int | None:
    """Infer the most relevant fiscal year from GL entry dates.

    Maps each date to its fiscal year, then returns the most common one.

    Args:
        gl_dates: Transaction dates from GL entries.
        start_month: Fiscal year start month for the property.

    Returns:
        The fiscal year (as an integer label), or None if no dates provided.
    """
    if not gl_dates:
        return None

    fiscal_years: list[int] = []
    for d in gl_dates:
        if d.month >= start_month:
            fiscal_years.append(d.year)
        else:
            fiscal_years.append(d.year - 1)

    # Return the most common fiscal year
    counter = Counter(fiscal_years)
    return counter.most_common(1)[0][0]
