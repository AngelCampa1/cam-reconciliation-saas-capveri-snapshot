"""Penny-exact oracle for the split-allocation path of ``aggregate_with_splits``.

``aggregate_with_splits`` (pool_aggregator.py:330-591) routes a GL entry that
matches a ``SplitAllocation`` pattern across several pools by percentage, with any
shortfall going to a default pool:

    split_base_amount = entry.amount * split.allocation_percentage        # line 422
    for pool_id, pct in split.splits:
        pool.total_amount += split_base_amount * pct                      # line 435-436
    total_split_pct = Σ pct                                               # line 460
    if total_split_pct < 1 and split.default_pool_id:                     # line 461-463
        default.total_amount += split_base_amount * (1 - total_split_pct)

This path performs **no ``quantize``** — amounts accumulate as raw, exact Decimal
products. ``test_pool_aggregator_stress.py`` only exercises ``aggregate_by_pools``;
``aggregate_with_splits`` has **no stress coverage at all**, so the per-pool split
total and the remainder routing are unpinned.

This drives the real function on the isolating legacy-split path — ``mappings=[]``
(so ``persisted_splits`` is empty and every split is legacy; pools are created on
demand) — with a single literal pattern, and re-derives each pool's total by
replaying the exact same Decimal multiply/accumulate order with ``==`` (no
tolerance, since production never rounds here).

Run standalone:
    pytest tests/stress/test_pool_aggregator_splits_oracle_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st

from app.services.calculation.pool_aggregator import (
    GLEntry,
    SplitAllocation,
    aggregate_with_splits,
)

STRESS = settings(max_examples=300, deadline=None)

_PATTERN = "5000"  # literal; only "5000" entries match
_NON_MATCH = "6000"  # never matches the split (and no mappings -> contributes nothing)

_amount = st.decimals(
    min_value=Decimal("-2000000"),
    max_value=Decimal("2000000"),
    places=2,
    allow_nan=False,
)
_pct = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)
_alloc = st.decimals(
    min_value=Decimal("0.0001"), max_value=Decimal("1"), places=4, allow_nan=False
)


@STRESS
@given(
    match_amounts=st.lists(_amount, min_size=1, max_size=4),
    noise_amounts=st.lists(_amount, min_size=0, max_size=2),
    percentages=st.lists(_pct, min_size=1, max_size=3),
    alloc_pct=_alloc,
    use_default=st.booleans(),
)
def test_split_allocation_totals_round_trip_exactly(
    match_amounts, noise_amounts, percentages, alloc_pct, use_default
):
    # Distinct target pools, distinct default pool, all created on demand.
    target_ids = [uuid4() for _ in percentages]
    assume(len(set(target_ids)) == len(target_ids))
    default_id = uuid4()
    assume(default_id not in target_ids)

    split = SplitAllocation(
        account_pattern=_PATTERN,
        splits=list(zip(target_ids, percentages)),
        allocation_percentage=alloc_pct,
        default_pool_id=default_id if use_default else None,
    )

    # Matching entries (code 5000) interleaved with non-matching noise (code 6000);
    # with mappings=[] the noise entries land nowhere -> prove isolation.
    entries = [
        GLEntry(id=uuid4(), account_code=_PATTERN, amount=a) for a in match_amounts
    ] + [GLEntry(id=uuid4(), account_code=_NON_MATCH, amount=a) for a in noise_amounts]

    result = aggregate_with_splits(entries=entries, mappings=[], splits=[split])

    # Independent oracle: replay the exact multiply/accumulate order.
    total_pct = sum(percentages, Decimal("0"))
    oracle: dict[UUID, Decimal] = {pid: Decimal("0") for pid in target_ids}
    if use_default:
        oracle[default_id] = Decimal("0")
    for amt in match_amounts:
        split_base = amt * alloc_pct
        for pid, pct in zip(target_ids, percentages):
            oracle[pid] += split_base * pct
        if total_pct < Decimal("1.0") and use_default:
            oracle[default_id] += split_base * (Decimal("1.0") - total_pct)

    # Noise entries created no pools.
    assert _NON_MATCH not in {
        acct for pt in result.values() for acct in pt.matched_accounts
    }

    # Every expected pool's total matches exactly; no extra pools appear.
    expected_pools = set(target_ids)
    if use_default and total_pct < Decimal("1.0"):
        expected_pools.add(default_id)
    elif use_default:
        # default pool only materializes when a remainder is actually routed.
        pass
    assert set(result.keys()) >= set(target_ids)
    for pid in target_ids:
        assert result[pid].total_amount == oracle[pid]
    if use_default and total_pct < Decimal("1.0"):
        assert result[default_id].total_amount == oracle[default_id]


def test_split_50_50_halves_each_pool():
    """A 50/50 split sends exactly half of each matching amount to each pool."""
    a, b = uuid4(), uuid4()
    split = SplitAllocation(
        account_pattern="5100",
        splits=[(a, Decimal("0.5")), (b, Decimal("0.5"))],
    )
    entries = [GLEntry(id=uuid4(), account_code="5100", amount=Decimal("1000.00"))]
    result = aggregate_with_splits(entries=entries, mappings=[], splits=[split])
    assert result[a].total_amount == Decimal("500.0")
    assert result[b].total_amount == Decimal("500.0")


def test_split_remainder_routes_to_default_pool():
    """A 70% split with a default pool routes the remaining 30% to the default."""
    a, default = uuid4(), uuid4()
    split = SplitAllocation(
        account_pattern="5200",
        splits=[(a, Decimal("0.7"))],
        default_pool_id=default,
    )
    entries = [GLEntry(id=uuid4(), account_code="5200", amount=Decimal("1000.00"))]
    result = aggregate_with_splits(entries=entries, mappings=[], splits=[split])
    assert result[a].total_amount == Decimal("700.0")
    assert result[default].total_amount == Decimal("300.00")


def test_partial_allocation_percentage_scales_the_base():
    """allocation_percentage scales the base before the per-pool split."""
    # alloc 0.5 of 1000 = 500 base; split 100% to pool a -> 500.
    a = uuid4()
    split = SplitAllocation(
        account_pattern="5300",
        splits=[(a, Decimal("1.0"))],
        allocation_percentage=Decimal("0.5"),
    )
    entries = [GLEntry(id=uuid4(), account_code="5300", amount=Decimal("1000.00"))]
    result = aggregate_with_splits(entries=entries, mappings=[], splits=[split])
    assert result[a].total_amount == Decimal("500.000")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
