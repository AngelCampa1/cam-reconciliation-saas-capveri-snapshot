"""Penny-exact oracle for the PERSISTED-mapping split path of ``aggregate_with_splits``.

``aggregate_with_splits`` (pool_aggregator.py:330-591) has two split paths:

  * the **legacy** path (lines 417-497) — a ``SplitAllocation`` whose
    ``(default_pool_id, account_pattern)`` is NOT among the pool mappings; this is
    what ``test_pool_aggregator_splits_oracle_stress.py`` pins by forcing
    ``mappings=[]`` so every split is legacy and the persisted branch never runs.
  * the **persisted** path (lines 502-589) — a ``SplitAllocation`` keyed by
    ``(default_pool_id, account_pattern)`` that ALSO appears in ``mapping_keys``.
    For an entry NOT matched by any legacy split, the persisted branch walks the
    pool mappings in **priority-descending** order, consuming a shared
    ``remaining_allocation`` budget:

        remaining = 1
        for mapping in sorted(mappings, by priority desc):
            if remaining <= 0: break
            if not mapping.pattern matches entry.account_code: continue
            split = persisted_splits[(mapping.pool_id, mapping.pattern)]
            actual = min(split.allocation_percentage, remaining)   # the CLIP seam
            remaining -= actual
            split_base = entry.amount * actual                     # raw product
            for pool_id, pct in split.splits:
                pool[pool_id] += split_base * pct                  # 2nd raw product
            if Σ pct < 1 and split.default_pool_id:
                pool[default] += split_base * (1 - Σ pct)

    Every multiply/accumulate is RAW exact Decimal — **no quantize anywhere**.

``test_pool_aggregator_splits_oracle_stress.py`` never activates this branch
(``mappings=[]`` at every call site → ``persisted_splits`` is always empty), and
``test_pool_aggregator_stress.py`` only exercises ``aggregate_by_pools``. So the
priority-ordered ``remaining_allocation`` consumption, the ``min(allocation,
remaining)`` clip, the per-pool sub-split, and the remainder-to-default of the
persisted path are entirely unpinned.

This drives the real function with ``SplitAllocation``\\s made persistent (each
keyed to a matching ``PoolMapping``) and re-derives each pool's total by replaying
the exact priority-ordered consume/clip/distribute order with ``==`` (no
tolerance, since production never rounds here). Distinct mapping priorities make
the sort deterministic; multiple mappings on one pattern force the clip seam when
their allocations over-subscribe the budget.

Run standalone:
    pytest tests/stress/test_pool_aggregator_persisted_splits_oracle_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st

from app.services.calculation.pool_aggregator import (
    GLEntry,
    PoolMapping,
    SplitAllocation,
    aggregate_with_splits,
)

STRESS = settings(max_examples=300, deadline=None)

_PATTERN = "5000"  # one shared literal pattern; only "5000" entries match
_NON_MATCH = "6000"  # matches neither the pattern nor any split

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


@st.composite
def _persisted_config(draw):
    """Build N anchor mappings on one pattern, each paired with a persisted split.

    A split becomes "persisted" when its (default_pool_id, account_pattern) is in
    mapping_keys, so each anchor mapping's pool_id is reused as its split's
    default_pool_id. Distinct integer priorities make the sort order deterministic.
    """
    n = draw(st.integers(min_value=1, max_value=3))
    anchor_ids = [uuid4() for _ in range(n)]
    assume(len(set(anchor_ids)) == n)
    # Distinct priorities (a permutation of 0..n-1) -> stable, unambiguous order.
    priorities = draw(st.permutations(list(range(n))))

    configs = []
    for k in range(n):
        alloc = draw(_alloc)
        n_targets = draw(st.integers(min_value=1, max_value=2))
        target_ids = [uuid4() for _ in range(n_targets)]
        pcts = [draw(_pct) for _ in range(n_targets)]
        configs.append((anchor_ids[k], priorities[k], alloc, target_ids, pcts))

    # All target ids must be distinct from every anchor id so each pool's
    # provenance is unambiguous in the assertion (accumulation across overlapping
    # targets is still exercised because target ids are independent draws).
    all_targets = [t for _, _, _, ts, _ in configs for t in ts]
    assume(len(set(all_targets)) == len(all_targets))
    assume(not (set(all_targets) & set(anchor_ids)))
    return configs


@STRESS
@given(
    cfg=_persisted_config(),
    match_amounts=st.lists(_amount, min_size=1, max_size=4),
    noise_amounts=st.lists(_amount, min_size=0, max_size=2),
)
def test_persisted_split_totals_round_trip_exactly(cfg, match_amounts, noise_amounts):
    mappings = [
        PoolMapping(
            pool_id=anchor,
            pool_name=f"anchor-{anchor}",
            pattern=_PATTERN,
            priority=prio,
        )
        for (anchor, prio, _alloc_k, _targets, _pcts) in cfg
    ]
    splits = [
        SplitAllocation(
            account_pattern=_PATTERN,
            splits=list(zip(targets, pcts)),
            allocation_percentage=alloc_k,
            default_pool_id=anchor,
            priority=prio,
        )
        for (anchor, prio, alloc_k, targets, pcts) in cfg
    ]
    entries = [
        GLEntry(id=uuid4(), account_code=_PATTERN, amount=a) for a in match_amounts
    ] + [GLEntry(id=uuid4(), account_code=_NON_MATCH, amount=a) for a in noise_amounts]

    result = aggregate_with_splits(entries=entries, mappings=mappings, splits=splits)

    # Independent oracle: replay the priority-ordered consume/clip/distribute.
    by_priority = sorted(cfg, key=lambda c: c[1], reverse=True)
    oracle: dict[UUID, Decimal] = {anchor: Decimal("0") for anchor, *_ in cfg}
    for amt in match_amounts:
        remaining = Decimal("1")
        for anchor, _prio, alloc_k, targets, pcts in by_priority:
            if remaining <= Decimal("0"):
                break
            actual = min(alloc_k, remaining)
            remaining -= actual
            split_base = amt * actual
            for pid, pct in zip(targets, pcts):
                oracle[pid] = oracle.get(pid, Decimal("0")) + split_base * pct
            total_pct = sum(pcts, Decimal("0"))
            if total_pct < Decimal("1.0"):
                oracle[anchor] = oracle.get(anchor, Decimal("0")) + split_base * (
                    Decimal("1.0") - total_pct
                )

    # The non-matching noise contributed to no pool.
    assert _NON_MATCH not in {
        acct for pt in result.values() for acct in pt.matched_accounts
    }

    # Every pool the oracle touched is present and penny-exact; no value drift.
    for pid, expected in oracle.items():
        assert result[pid].total_amount == expected
    # And the aggregator created no pool the oracle did not account for.
    assert set(result.keys()) == set(oracle.keys())


def test_anchor_single_persisted_split_60_40_with_remainder():
    """One anchor mapping + persisted 50/30 split: 20% remainder lands on anchor."""
    anchor, a, b = uuid4(), uuid4(), uuid4()
    mappings = [PoolMapping(pool_id=anchor, pool_name="cam", pattern="7000")]
    splits = [
        SplitAllocation(
            account_pattern="7000",
            splits=[(a, Decimal("0.5")), (b, Decimal("0.3"))],
            default_pool_id=anchor,
        )
    ]
    entries = [GLEntry(id=uuid4(), account_code="7000", amount=Decimal("1000.00"))]
    result = aggregate_with_splits(entries=entries, mappings=mappings, splits=splits)
    assert result[a].total_amount == Decimal("500.0")
    assert result[b].total_amount == Decimal("300.0")
    # 20% remainder of the 1000 base routes to the default (anchor) pool.
    assert result[anchor].total_amount == Decimal("200.00")


def test_anchor_two_mappings_clip_the_remaining_budget():
    """Two persisted splits on one pattern over-subscribe the budget; #2 is clipped.

    Mapping P1 (priority 10, alloc 0.7) consumes 0.7 of the budget; mapping P2
    (priority 5, alloc 0.6) is clipped to the remaining 0.3. Each routes 100% to
    its own target, so target1 gets 700, target2 gets 300 — never 600.
    """
    anchor1, anchor2, t1, t2 = uuid4(), uuid4(), uuid4(), uuid4()
    mappings = [
        PoolMapping(pool_id=anchor1, pool_name="m1", pattern="8000", priority=10),
        PoolMapping(pool_id=anchor2, pool_name="m2", pattern="8000", priority=5),
    ]
    splits = [
        SplitAllocation(
            account_pattern="8000",
            splits=[(t1, Decimal("1.0"))],
            allocation_percentage=Decimal("0.7"),
            default_pool_id=anchor1,
            priority=10,
        ),
        SplitAllocation(
            account_pattern="8000",
            splits=[(t2, Decimal("1.0"))],
            allocation_percentage=Decimal("0.6"),
            default_pool_id=anchor2,
            priority=5,
        ),
    ]
    entries = [GLEntry(id=uuid4(), account_code="8000", amount=Decimal("1000.00"))]
    result = aggregate_with_splits(entries=entries, mappings=mappings, splits=splits)
    assert result[t1].total_amount == Decimal("700.0")
    # 0.6 clipped to the remaining 0.3 -> 300, not 600.
    assert result[t2].total_amount == Decimal("300.0")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
