"""Property-based stress for the gross-up expense partition.

``filter_expenses_for_gross_up`` (calculation/expense_filter.py) splits the pool
totals into the variable bucket that gets grossed up for occupancy and the fixed
bucket that does not (taxes, insurance, capital). The split decides how much of
the expense base is inflated toward target occupancy, so the partition must be
**complete and disjoint**: every dollar lands in exactly one bucket and nothing is
created or lost. ``get_default_gross_up_setting`` is the BOMA default classifier
that decides applicability for un-configured pools — taxes/insurance/capital must
default to fixed, everything else (including unknown types) to variable.

Both are pure and deterministic. Amounts may be negative (GL credits exceeding
charges), so the sums are exercised with adversarial signed 2dp decimals.

Invariants:
  * **complete + disjoint partition**: gross_up_expenses + fixed_expenses == Σ of
    every pool's total_amount, exactly (Decimal, no float drift);
  * **bucket membership**: gross_up_expenses == Σ of applicable pools'
    total_amount; fixed_expenses == Σ of the rest;
  * **breakdown preserved**: pool_breakdown lists every input pool, unchanged;
  * **default classifier**: tax/insurance/capital → False; the known variable
    types and any unknown type → True; case-insensitive.

Run standalone:
    pytest tests/stress/test_expense_filter_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.expense_filter import (
    DEFAULT_POOL_SETTINGS,
    ExpensePoolSummary,
    filter_expenses_for_gross_up,
    get_default_gross_up_setting,
)

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

signed_money = st.decimals(
    min_value=Decimal("-1000000"),
    max_value=Decimal("1000000"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


@st.composite
def _pools(draw):
    n = draw(st.integers(0, 6))
    out = {}
    for i in range(n):
        pid = uuid4()
        out[pid] = ExpensePoolSummary(
            pool_id=pid,
            pool_name=f"Pool {i}",
            pool_type=draw(st.sampled_from(["operating", "tax", "insurance", "x"])),
            total_amount=draw(signed_money),
            is_gross_up_applicable=draw(st.booleans()),
        )
    return out


@STRESS
@given(pools=_pools())
def test_partition_is_complete_and_disjoint(pools):
    result = filter_expenses_for_gross_up(pools)

    grand_total = sum((s.total_amount for s in pools.values()), Decimal("0"))
    applicable = sum(
        (s.total_amount for s in pools.values() if s.is_gross_up_applicable),
        Decimal("0"),
    )
    fixed = grand_total - applicable

    # Complete + disjoint: the two buckets exactly reconstitute the grand total.
    assert result.gross_up_expenses == applicable
    assert result.fixed_expenses == fixed
    assert result.gross_up_expenses + result.fixed_expenses == grand_total

    # Breakdown preserves every input pool unchanged.
    assert len(result.pool_breakdown) == len(pools)
    assert {s.pool_id for s in result.pool_breakdown} == set(pools)
    for s in result.pool_breakdown:
        assert s is pools[s.pool_id]


@STRESS
@given(
    pool_type=st.text(max_size=12),
    case=st.sampled_from(["lower", "upper", "title"]),
)
def test_default_classifier(pool_type, case):
    transformed = getattr(pool_type, case)()
    expected = DEFAULT_POOL_SETTINGS.get(pool_type.lower(), True)
    assert get_default_gross_up_setting(transformed) == expected


def test_fixed_types_default_to_not_grossed_up():
    for t in ("tax", "insurance", "capital"):
        assert get_default_gross_up_setting(t) is False
    for t in ("operating", "utility", "maintenance", "management", "wildcard"):
        assert get_default_gross_up_setting(t) is True


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
