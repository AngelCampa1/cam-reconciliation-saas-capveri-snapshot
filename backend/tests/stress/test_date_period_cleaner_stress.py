"""Property-based invariants for the date-cleaning + period-extraction pipeline.

``ingestion/cleaners.py`` turns messy ERP date strings into datetimes
(``clean_date_column``) and then derives the GL period
(``extract_period_from_date``). This is the exact lineage of BUG #20: a date that
fails to parse becomes ``NaT``, whose extracted period is a float ``NaN`` — the
sentinel the persistence layer now has to guard. Getting the parse or the
NaT→NaN propagation wrong silently mis-periods or crashes every import.

This drives the real functions (no mocks) over arbitrary and well-formed date
strings and checks totality, exact recovery for every supported format, the
NaT propagation contract, and deterministic ambiguous-date handling.

Invariants pinned here:

  * **Totality** — ``clean_date_column`` never raises on arbitrary text, returns
    a datetime64 Series of the same length and index.
  * **Exact recovery** — a date rendered in any supported format round-trips to
    the same (year, month, day).
  * **Garbage → NaT** — non-date text becomes ``NaT`` (never a wrong date).
  * **Period propagation (BUG #20 lineage)** — a parsed date's extracted period
    equals its own year/month; a ``NaT`` yields a ``NaN`` period (float), never a
    raise and never a bogus integer.
  * **Ambiguous dates are deterministic** — ``MM/DD/YYYY`` is read US-style
    (month-first), stably.

Run standalone:
    pytest tests/stress/test_date_period_cleaner_stress.py -q
"""

from __future__ import annotations

from datetime import date

import pandas as pd
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.ingestion.cleaners import (
    clean_date_column,
    extract_period_from_date,
)

STRESS = settings(max_examples=300, deadline=None)

# Every format clean_date_column claims to handle unambiguously.
_FORMATS = ["%Y-%m-%d", "%Y/%m/%d", "%d-%b-%Y", "%d %b %Y", "%b %d, %Y", "%B %d, %Y"]

_dates = st.dates(min_value=date(1990, 1, 1), max_value=date(2099, 12, 31))


@STRESS
@given(d=_dates, fmt=st.sampled_from(_FORMATS))
def test_supported_formats_round_trip(d, fmt):
    rendered = d.strftime(fmt)
    out = clean_date_column(pd.Series([rendered]))

    assert len(out) == 1
    parsed = out.iloc[0]
    assert not pd.isna(parsed)
    assert (parsed.year, parsed.month, parsed.day) == (d.year, d.month, d.day)

    # Period extraction agrees with the source date.
    years, months = extract_period_from_date(out)
    assert int(years.iloc[0]) == d.year
    assert int(months.iloc[0]) == d.month


@STRESS
@given(
    values=st.lists(
        st.one_of(
            _dates.map(lambda d: d.isoformat()),
            st.text(max_size=12),
            st.sampled_from(["", "  ", "not-a-date", "13/45/2024", "0000"]),
        ),
        min_size=1,
        max_size=8,
    )
)
def test_totality_and_nat_period_propagation(values):
    series = pd.Series(values)
    out = clean_date_column(series)

    # Total: same length/index, datetime dtype, never raises.
    assert len(out) == len(series)
    assert list(out.index) == list(series.index)
    assert pd.api.types.is_datetime64_any_dtype(out)

    years, months = extract_period_from_date(out)
    assert len(years) == len(out) and len(months) == len(out)

    # BUG #20 lineage: NaT date -> NaN period (float), parsed date -> matching int.
    for i in range(len(out)):
        dt = out.iloc[i]
        if pd.isna(dt):
            assert pd.isna(years.iloc[i]) and pd.isna(months.iloc[i])
        else:
            assert int(years.iloc[i]) == dt.year
            assert int(months.iloc[i]) == dt.month


@STRESS
@given(
    month=st.integers(min_value=1, max_value=12),
    day=st.integers(min_value=1, max_value=12),
    year=st.integers(min_value=1995, max_value=2098),
)
def test_ambiguous_dates_are_month_first(month, day, year):
    """MM/DD/YYYY is read US-style; day<=12 keeps both interpretations valid so
    the choice is observable and must be month-first, deterministically."""
    rendered = f"{month:02d}/{day:02d}/{year}"
    out = clean_date_column(pd.Series([rendered]))
    parsed = out.iloc[0]
    assert not pd.isna(parsed)
    assert parsed.month == month
    assert parsed.day == day
    assert parsed.year == year


def test_empty_series_anchor():
    out = clean_date_column(pd.Series([], dtype=object))
    assert out.empty
    assert pd.api.types.is_datetime64_any_dtype(out)


def test_garbage_is_nat_not_wrong_date():
    out = clean_date_column(pd.Series(["hello", "2024-06-15", "???"]))
    assert pd.isna(out.iloc[0])
    assert not pd.isna(out.iloc[1])
    assert pd.isna(out.iloc[2])


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
