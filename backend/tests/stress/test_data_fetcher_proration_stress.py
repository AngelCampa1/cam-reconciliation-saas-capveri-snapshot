"""Property-based stress for data_fetcher's pure date-proration helpers.

``data_fetcher.py`` is mostly Supabase I/O, but three helpers are pure and carry
the day-based proration math that decides how much of a reconciliation period a
lease (and each of its term-version slices) is billed for:

  * ``_active_overlap`` — clamp a lease window to the period (or None if disjoint);
  * ``_period_proration_factor`` — segment_days / total_days, 8-dp quantized;
  * ``_build_prorated_version_terms`` — split a lease into contiguous,
    non-overlapping term-version slices, each tagged with its proration factor.

A bug here silently mis-bills tenants (double-counted days, gaps, or factors that
don't sum to the covered span), so these are exactly the deterministic-money paths
the stress goal targets. This harness pins their contracts and independently
re-derives every figure.

Run standalone:
    pytest tests/stress/test_data_fetcher_proration_stress.py -q
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import uuid4

from hypothesis import HealthCheck, assume, given, settings
from hypothesis import strategies as st

from app.services.calculation.data_fetcher import (
    _active_overlap,
    _build_prorated_version_terms,
    _period_proration_factor,
)

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# A bounded window of dates to keep day arithmetic legible.
EPOCH = date(2024, 1, 1)
day_offset = st.integers(min_value=0, max_value=900)


def _d(offset: int) -> date:
    return EPOCH + timedelta(days=offset)


@STRESS
@given(
    ls=st.one_of(st.none(), day_offset),
    le=st.one_of(st.none(), day_offset),
    ps=day_offset,
    pe=day_offset,
)
def test_active_overlap_clamps_to_period(ls, le, ps, pe):
    period_start, period_end = _d(ps), _d(pe)
    assume(period_start <= period_end)
    row = {
        "start_date": _d(ls).isoformat() if ls is not None else None,
        "end_date": _d(le).isoformat() if le is not None else None,
    }

    result = _active_overlap(row, period_start, period_end)

    # Independent re-derivation.
    lease_start = _d(ls) if ls is not None else period_start
    lease_end = _d(le) if le is not None else period_end
    exp_start = max(lease_start, period_start)
    exp_end = min(lease_end, period_end)

    if exp_start > exp_end:
        assert result is None
        return

    assert result == (exp_start, exp_end)
    overlap_start, overlap_end = result
    # Always clamped inside the period and well-formed.
    assert period_start <= overlap_start <= overlap_end <= period_end


def test_active_overlap_full_cover_equals_period():
    # Lease spanning beyond both ends -> overlap is exactly the period.
    row = {"start_date": "2023-01-01", "end_date": "2025-12-31"}
    assert _active_overlap(row, date(2024, 1, 1), date(2024, 12, 31)) == (
        date(2024, 1, 1),
        date(2024, 12, 31),
    )


@STRESS
@given(
    ss=day_offset,
    slen=st.integers(min_value=0, max_value=900),
    ps=day_offset,
    plen=st.integers(min_value=0, max_value=900),
)
def test_period_proration_factor_rederivation(ss, slen, ps, plen):
    segment_start = _d(ss)
    segment_end = segment_start + timedelta(days=slen)
    period_start = _d(ps)
    period_end = period_start + timedelta(days=plen)

    factor = _period_proration_factor(
        segment_start, segment_end, period_start, period_end
    )

    total_days = (period_end - period_start).days + 1
    segment_days = (segment_end - segment_start).days + 1
    expected = (Decimal(segment_days) / Decimal(total_days)).quantize(
        Decimal("0.00000001"), rounding=ROUND_HALF_UP
    )
    assert factor == expected
    assert factor > 0


def test_period_proration_factor_full_period_is_one():
    ps, pe = date(2024, 1, 1), date(2024, 12, 31)
    assert _period_proration_factor(ps, pe, ps, pe) == Decimal("1.00000000")
    # A single day of a 366-day leap-year period.
    one_day = _period_proration_factor(ps, ps, ps, pe)
    assert one_day == (Decimal(1) / Decimal(366)).quantize(Decimal("0.00000001"))
    assert Decimal("0") < one_day < Decimal("1")


def _row(start: date, end: date) -> dict:
    return {
        "id": str(uuid4()),
        "tenant_name": "T",
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
    }


def _version(effective: date) -> dict:
    return {
        "id": str(uuid4()),
        "effective_date": effective.isoformat(),
        "pro_rata_share": "0.10",
        "admin_fee_percentage": "0.05",
    }


@STRESS
@given(
    lease_off=st.integers(min_value=-60, max_value=60),
    lease_len=st.integers(min_value=0, max_value=500),
    version_offsets=st.lists(
        st.integers(min_value=-90, max_value=400), min_size=1, max_size=5, unique=True
    ),
)
def test_prorated_version_terms_partition(lease_off, lease_len, version_offsets):
    period_start = date(2024, 1, 1)
    period_end = date(2024, 12, 31)
    lease_start = period_start + timedelta(days=lease_off)
    lease_end = lease_start + timedelta(days=lease_len)
    row = _row(lease_start, lease_end)
    versions = [_version(_d_period(period_start, off)) for off in version_offsets]

    terms = _build_prorated_version_terms(row, versions, period_start, period_end)

    overlap = _active_overlap(row, period_start, period_end)
    if overlap is None:
        assert terms == []
        return

    active_start, active_end = overlap
    # No effective version (all start after active_end) -> no terms.
    earliest_effective = min(
        (
            date.fromisoformat(v["effective_date"])
            for v in versions
            if date.fromisoformat(v["effective_date"]) <= active_end
        ),
        default=None,
    )
    if earliest_effective is None:
        assert terms == []
        return

    assert terms, "expected at least one prorated slice"
    # Slices sorted by start; contiguous; non-overlapping; inside the active window.
    ordered = sorted(terms, key=lambda t: t.start_date)
    assert ordered == terms  # builder already emits them in order
    for t in terms:
        assert active_start <= t.start_date <= t.end_date <= active_end
        assert period_start <= t.start_date and t.end_date <= period_end
        # Each slice's factor matches the leaf helper exactly.
        assert t.proration_factor == _period_proration_factor(
            t.start_date, t.end_date, period_start, period_end
        )
    for prev, nxt in zip(ordered, ordered[1:]):
        assert nxt.start_date == prev.end_date + timedelta(days=1)

    # Slices fully cover [first_slice_start, active_end] with no internal gaps,
    # and the last slice always reaches the end of the active window.
    assert ordered[-1].end_date == active_end
    covered_days = sum((t.end_date - t.start_date).days + 1 for t in terms)
    span_days = (active_end - ordered[0].start_date).days + 1
    assert covered_days == span_days


def _d_period(base: date, off: int) -> date:
    return base + timedelta(days=off)


def test_prorated_version_terms_known_split():
    # Lease covers all of 2024; two versions: one effective at period start, one
    # effective mid-year (2024-07-01). Expect two contiguous slices:
    #   Jan 1 - Jun 30 (182 days) and Jul 1 - Dec 31 (184 days), total 366.
    row = _row(date(2024, 1, 1), date(2024, 12, 31))
    versions = [_version(date(2024, 1, 1)), _version(date(2024, 7, 1))]
    terms = _build_prorated_version_terms(
        row, versions, date(2024, 1, 1), date(2024, 12, 31)
    )
    assert len(terms) == 2
    first, second = sorted(terms, key=lambda t: t.start_date)
    assert (first.start_date, first.end_date) == (date(2024, 1, 1), date(2024, 6, 30))
    assert (second.start_date, second.end_date) == (
        date(2024, 7, 1),
        date(2024, 12, 31),
    )
    assert first.proration_factor == (Decimal(182) / Decimal(366)).quantize(
        Decimal("0.00000001"), rounding=ROUND_HALF_UP
    )
    assert second.proration_factor == (Decimal(184) / Decimal(366)).quantize(
        Decimal("0.00000001"), rounding=ROUND_HALF_UP
    )


if __name__ == "__main__":
    import pytest

    pytest.main([__file__, "-q"])
