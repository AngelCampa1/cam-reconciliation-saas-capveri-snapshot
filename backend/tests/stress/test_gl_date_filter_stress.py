"""Property-based stress for GL-entry date filtering by accounting basis.

``filter_gl_entries_by_basis`` is the gate that decides which raw GL entries
fall inside a reconciliation period — under *cash* basis it keys off
``transaction_date``; under *accrual* basis it keys off ``accrual_date`` with a
fallback to ``transaction_date``. Every downstream recovery number is computed
from whatever this filter keeps, so a wrong inclusion/exclusion silently
mis-states a tenant's bill. Hand-written examples exist; this harness proves the
invariants hold across the whole input space.

Invariants:
  * **subset, order-preserving**: the output is a sublist of the input in the
    same relative order (no rows invented, duplicated, or reordered);
  * **range-correct**: every kept entry's *effective* date is within
    ``[period_start, period_end]`` and every dropped entry is either out of
    range or has no effective date;
  * **basis selection**: accrual uses ``accrual_date or transaction_date``;
    cash uses ``transaction_date`` only — proven by reconstructing the expected
    set independently;
  * **str/date parity**: ISO-string dates and ``date`` objects filter
    identically (Supabase may hand back either);
  * **invalid basis rejected**: any basis other than cash/accrual raises
    ValueError, never silently returns rows.

Run standalone:
    pytest tests/stress/test_gl_date_filter_stress.py -q
"""

from __future__ import annotations

from datetime import date

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.gl_date_filter import filter_gl_entries_by_basis

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

dates = st.dates(min_value=date(2000, 1, 1), max_value=date(2035, 12, 31))
# Optional dates may also be absent (None) or an empty string (falsy -> fallback).
opt_date_value = st.one_of(st.none(), st.just(""), dates)


def _as_iso(value: object) -> object:
    """Render a date as an ISO string, pass through None/'' unchanged."""
    return value.isoformat() if isinstance(value, date) else value


@st.composite
def entries(draw: st.DrawFn) -> list[dict[str, object]]:
    n = draw(st.integers(min_value=0, max_value=12))
    rows: list[dict[str, object]] = []
    for _ in range(n):
        row: dict[str, object] = {"_id": draw(st.integers())}
        # transaction_date present most of the time; sometimes missing entirely.
        if draw(st.booleans()):
            row["transaction_date"] = draw(opt_date_value)
        # accrual_date independently present or not.
        if draw(st.booleans()):
            row["accrual_date"] = draw(opt_date_value)
        rows.append(row)
    return rows


def _effective(row: dict[str, object], basis: str) -> date | None:
    """Reference re-implementation of the effective-date selection."""
    if basis == "accrual":
        raw = row.get("accrual_date") or row.get("transaction_date")
    else:
        raw = row.get("transaction_date")
    if raw is None or raw == "":
        return None
    if isinstance(raw, str):
        return date.fromisoformat(raw)
    assert isinstance(raw, date)
    return raw


def _ordered_period(a: date, b: date) -> tuple[date, date]:
    return (a, b) if a <= b else (b, a)


@STRESS
@given(rows=entries(), basis=st.sampled_from(["cash", "accrual"]), d1=dates, d2=dates)
def test_subset_order_preserving_and_range_correct(rows, basis, d1, d2):
    start, end = _ordered_period(d1, d2)
    result = filter_gl_entries_by_basis(rows, basis, start, end)

    # Subset, order-preserving: result is rows filtered by an indicator, so the
    # surviving _ids appear as a subsequence of the input _ids.
    input_ids = [r["_id"] for r in rows]
    result_ids = [r["_id"] for r in result]
    it = iter(input_ids)
    assert all(rid in it for rid in result_ids), "result not an in-order subsequence"

    # Range-correct against an independent reference for every row.
    for row in rows:
        eff = _effective(row, basis)
        kept = row in result
        if eff is not None and start <= eff <= end:
            assert kept, f"in-range row dropped: {row}"
        else:
            assert not kept, f"out-of-range/no-date row kept: {row}"


@STRESS
@given(rows=entries(), basis=st.sampled_from(["cash", "accrual"]), d1=dates, d2=dates)
def test_iso_string_and_date_object_filter_identically(rows, basis, d1, d2):
    start, end = _ordered_period(d1, d2)
    str_rows = [
        {
            k: (_as_iso(v) if k in ("transaction_date", "accrual_date") else v)
            for k, v in r.items()
        }
        for r in rows
    ]
    by_date = [r["_id"] for r in filter_gl_entries_by_basis(rows, basis, start, end)]
    by_str = [r["_id"] for r in filter_gl_entries_by_basis(str_rows, basis, start, end)]
    assert by_date == by_str


@STRESS
@given(
    rows=entries(),
    basis=st.text(max_size=12).filter(lambda s: s not in {"cash", "accrual"}),
    d1=dates,
    d2=dates,
)
def test_invalid_basis_always_raises(rows, basis, d1, d2):
    start, end = _ordered_period(d1, d2)
    with pytest.raises(ValueError):
        filter_gl_entries_by_basis(rows, basis, start, end)


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
