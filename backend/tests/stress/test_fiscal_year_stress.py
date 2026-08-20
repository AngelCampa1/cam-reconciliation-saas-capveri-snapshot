"""Property-based stress for fiscal-year period math and inference.

``get_fiscal_year_period`` turns ``(start_month, year)`` into a concrete date
range; ``infer_fiscal_year`` maps a set of GL dates back to a fiscal-year label.
These two must be mutually consistent — the period a fiscal year *covers* and the
inference that *recovers* it are the same definition viewed from two sides, and a
drift between them would silently bucket GL entries into the wrong reconciliation
period. This harness fuzzes all 12 start months across a wide year range and
proves the round-trip and the structural invariants.

Invariants:
  * the period starts on the 1st of ``start_month`` and ends the day before the
    next fiscal year begins; start <= end always;
  * a 12-month period: the end is in the following calendar year unless the
    fiscal year starts in January (then it's the calendar year);
  * **round-trip**: every date inside the period infers back to ``year``;
  * ``infer_fiscal_year`` is empty-safe (None), returns one of the modal fiscal
    years (its count equals the maximum), and is permutation-stable on that
    count.

Run standalone:
    pytest tests/stress/test_fiscal_year_stress.py -q
"""

from __future__ import annotations

from collections import Counter
from datetime import date, timedelta

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.fiscal_year import (
    get_fiscal_year_period,
    infer_fiscal_year,
)

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

start_month = st.integers(min_value=1, max_value=12)
# year + 1 must stay a valid date year (<= 9999).
fiscal_year_label = st.integers(min_value=1, max_value=9998)


@STRESS
@given(month=start_month, year=fiscal_year_label)
def test_period_structure(month, year):
    fy_start, fy_end = get_fiscal_year_period(month, year)

    assert fy_start == date(year, month, 1)
    assert fy_end == date(year + 1, month, 1) - timedelta(days=1)
    assert fy_start <= fy_end

    # A fiscal year is exactly 12 months: the end lands in the next calendar
    # year for any non-January start, and in the same year for January.
    if month == 1:
        assert fy_end == date(year, 12, 31)
        assert fy_end.year == year
    else:
        assert fy_end.year == year + 1


@STRESS
@given(month=start_month, year=fiscal_year_label, offset_seed=st.integers(0, 400))
def test_every_date_in_period_infers_back_to_year(month, year, offset_seed):
    """The period and the inference share one definition: any date covered by
    fiscal year `year` must infer back to `year`."""
    fy_start, fy_end = get_fiscal_year_period(month, year)
    span_days = (fy_end - fy_start).days
    # Map the seed into a real day inside the period.
    d = fy_start + timedelta(days=offset_seed % (span_days + 1))
    assert fy_start <= d <= fy_end
    assert infer_fiscal_year([d], month) == year


@STRESS
@given(
    dates=st.lists(
        st.dates(min_value=date(1, 1, 1), max_value=date(9998, 12, 31)),
        max_size=30,
    ),
    month=start_month,
)
def test_infer_returns_a_modal_year(dates, month):
    result = infer_fiscal_year(dates, month)

    if not dates:
        assert result is None
        return

    # Reconstruct the fiscal-year mapping and confirm the result is a true mode:
    # its frequency equals the maximum frequency (permutation-stable property).
    mapped = [d.year if d.month >= month else d.year - 1 for d in dates]
    counts = Counter(mapped)
    assert result in counts
    assert counts[result] == max(counts.values())


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
