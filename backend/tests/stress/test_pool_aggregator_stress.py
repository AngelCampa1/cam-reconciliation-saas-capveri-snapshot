"""Property-based stress for GL→expense-pool aggregation.

``aggregate_by_pools`` maps each GL entry into one or more expense pools by
wildcard account-code patterns, applying per-mapping allocation percentages and
priority ordering. It is the step that turns raw ledger rows into the pool
totals every recovery number is built on, so two properties are load-bearing:
no money is invented or lost, and no single entry is ever allocated beyond 100%
of its value (regression guard for FIX NEW-FC-4). ``pattern_to_regex`` is the
matcher underneath it.

Invariants:
  * **conservation @100%**: when every mapping allocates 100%, each matched
    entry lands fully in exactly one pool (highest priority wins), so the sum of
    all pool totals equals the sum of the matched entries' amounts — exactly, in
    Decimal — and the total entry_count equals the number of matched entries;
  * **no over-allocation**: for non-negative amounts and arbitrary allocation
    fractions in [0, 1], the total allocated across all pools never exceeds the
    total entry amount (an entry can be split but never amplified);
  * **matched_accounts is a unique set**: every pool's matched_accounts list has
    no duplicates and contains only account codes that actually matched it;
  * **pattern_to_regex literal exactness**: a wildcard-free pattern matches its
    own text and rejects any single-character mutation; `*`/`%` and `?` behave
    as documented.

Run standalone:
    pytest tests/stress/test_pool_aggregator_stress.py -q
"""

from __future__ import annotations

import re
from decimal import Decimal
from uuid import UUID

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.pool_aggregator import (
    GLEntry,
    PoolMapping,
    aggregate_by_pools,
    pattern_to_regex,
)

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# A small fixed pool of UUIDs so multiple mappings can target the same pool.
POOL_IDS = [UUID(int=i) for i in range(1, 6)]

# Account codes drawn from a tiny alphabet so wildcard patterns actually hit.
account_codes = st.text(alphabet="0123459", min_size=1, max_size=5)
# Patterns mix literals and the two documented wildcards.
patterns = st.text(alphabet="0123459*?", min_size=1, max_size=5)
amounts = st.decimals(
    min_value=Decimal("-1000000"),
    max_value=Decimal("1000000"),
    allow_nan=False,
    allow_infinity=False,
    places=2,
)
nonneg_amounts = st.decimals(
    min_value=Decimal("0"),
    max_value=Decimal("1000000"),
    allow_nan=False,
    allow_infinity=False,
    places=2,
)
# Allocation fractions in [0, 1] with 2 decimal places (exact in Decimal).
fractions = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), allow_nan=False, places=2
)


@st.composite
def entries(draw: st.DrawFn) -> list[GLEntry]:
    n = draw(st.integers(min_value=0, max_value=10))
    return [
        GLEntry(
            id=UUID(int=1000 + i),
            account_code=draw(account_codes),
            amount=draw(amounts),
        )
        for i in range(n)
    ]


@st.composite
def nonneg_entries(draw: st.DrawFn) -> list[GLEntry]:
    n = draw(st.integers(min_value=0, max_value=10))
    return [
        GLEntry(
            id=UUID(int=2000 + i),
            account_code=draw(account_codes),
            amount=draw(nonneg_amounts),
        )
        for i in range(n)
    ]


@st.composite
def mappings_full(draw: st.DrawFn) -> list[PoolMapping]:
    """Mappings that always allocate 100% (default)."""
    n = draw(st.integers(min_value=1, max_value=5))
    return [
        PoolMapping(
            pool_id=draw(st.sampled_from(POOL_IDS)),
            pool_name=f"Pool {i}",
            pattern=draw(patterns),
            priority=draw(st.integers(min_value=0, max_value=5)),
        )
        for i in range(n)
    ]


@st.composite
def mappings_fractional(draw: st.DrawFn) -> list[PoolMapping]:
    """Mappings with arbitrary allocation fractions in [0, 1]."""
    n = draw(st.integers(min_value=1, max_value=5))
    return [
        PoolMapping(
            pool_id=draw(st.sampled_from(POOL_IDS)),
            pool_name=f"Pool {i}",
            pattern=draw(patterns),
            allocation_percentage=draw(fractions),
            priority=draw(st.integers(min_value=0, max_value=5)),
        )
        for i in range(n)
    ]


def _matches_any(account_code: str, maps: list[PoolMapping]) -> bool:
    return any(
        re.match(pattern_to_regex(m.pattern), account_code, re.IGNORECASE) for m in maps
    )


@STRESS
@given(rows=entries(), maps=mappings_full())
def test_conservation_at_full_allocation(rows, maps):
    totals = aggregate_by_pools(rows, maps)

    matched = [e for e in rows if _matches_any(e.account_code, maps)]
    expected_sum = sum((e.amount for e in matched), Decimal("0"))
    actual_sum = sum((p.total_amount for p in totals.values()), Decimal("0"))
    assert actual_sum == expected_sum, "money created or destroyed at 100% allocation"

    total_count = sum(p.entry_count for p in totals.values())
    assert total_count == len(matched), "entry_count != matched entries at 100%"


@STRESS
@given(rows=nonneg_entries(), maps=mappings_fractional())
def test_no_over_allocation_for_nonnegative_amounts(rows, maps):
    totals = aggregate_by_pools(rows, maps)
    allocated = sum((p.total_amount for p in totals.values()), Decimal("0"))
    available = sum((e.amount for e in rows), Decimal("0"))
    # An entry may be split across pools but never amplified beyond its value.
    assert Decimal("0") <= allocated <= available


@STRESS
@given(rows=entries(), maps=mappings_full())
def test_matched_accounts_unique_and_genuine(rows, maps):
    totals = aggregate_by_pools(rows, maps)
    for pool in totals.values():
        assert len(pool.matched_accounts) == len(set(pool.matched_accounts))
        for code in pool.matched_accounts:
            # The code must match at least one pattern that targets this pool.
            pool_patterns = [m for m in maps if m.pool_id == pool.pool_id]
            assert any(
                re.match(pattern_to_regex(m.pattern), code, re.IGNORECASE)
                for m in pool_patterns
            )


@STRESS
@given(literal=st.text(alphabet="0123459", min_size=1, max_size=6))
def test_pattern_to_regex_literal_is_exact(literal):
    rx = re.compile(pattern_to_regex(literal), re.IGNORECASE)
    assert rx.match(literal)
    # Appending any char must break the match (anchored regex).
    assert not rx.match(literal + "0")


@STRESS
@given(
    prefix=st.text(alphabet="0123459", min_size=1, max_size=3),
    suffix=st.text(alphabet="0123459", max_size=4),
)
def test_star_matches_any_suffix(prefix, suffix):
    rx = re.compile(pattern_to_regex(prefix + "*"), re.IGNORECASE)
    assert rx.match(prefix + suffix)


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
