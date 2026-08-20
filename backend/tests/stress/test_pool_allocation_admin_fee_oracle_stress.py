"""Penny-exact oracle for Layer-3 admin-fee per-pool attribution.

``allocate_pool_recoveries`` (pool_allocation.py:182-210) splits the lease-level
``admin_fee`` across the *fee-eligible* pools by their post-cap share, using the
largest-remainder method on integer cents:

    admin_cents = _to_cents(admin_fee)
    fee_idx     = [i for i in range(len(names)) if is_fee_eligible[i]]
    alloc       = _largest_remainder(admin_cents, [Decimal(share_after[i]) for i in fee_idx])
    # per pool:  admin_fee = _from_cents(admin_alloc[i])
    #            total_recovery = round(share_after + admin_fee, 2)

The crucial seam: the weight vector is the post-cap share of *only the eligible
pools* — pools in ``admin_fee_excluded_pools`` are dropped from the vector, so the
whole fee concentrates on the remaining subset and each cent lands by that subset's
relative shares.

``test_pool_allocation_stress.py::test_allocation_conserves_and_reconciles`` pins
only the AGGREGATE (`Σ admin_fee == _from_cents(_to_cents(admin_fee))`) and the
per-pool identity ``total_recovery == share_after + admin_fee`` — it never checks an
individual pool's ``admin_fee``. The cap-spill and proration oracles both pass
``admin_fee=0`` so Layer 3 never runs. **No test pins each pool's ``admin_fee`` to an
independent largest-remainder oracle, especially with a non-empty exclusion set
shifting the weight vector.**

This calls ``allocate_pool_recoveries`` directly with ``before == after`` (Layer 2
inert: zero reduction, no cap adjustment) and a positive ``admin_fee`` plus a
non-empty ``admin_fee_excluded_pools`` subset, then checks each pool's fee against an
independent oracle reusing the module's own ``_largest_remainder`` (independently
pinned by the conservation stress). The seam under test is the *attribution branch*
(which pools carry the fee, by what weights), not the split primitive.

Run standalone:
    pytest tests/stress/test_pool_allocation_admin_fee_oracle_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st

from app.services.calculation.pool_allocation import (
    _from_cents,
    _largest_remainder,
    _to_cents,
    allocate_pool_recoveries,
)

STRESS = settings(max_examples=300, deadline=None)

_amount = st.decimals(
    min_value=Decimal("1"), max_value=Decimal("1000000"), places=2, allow_nan=False
)
_fee = st.decimals(
    min_value=Decimal("0.01"), max_value=Decimal("500000"), places=2, allow_nan=False
)


@STRESS
@given(
    amounts=st.lists(_amount, min_size=2, max_size=5),
    exclude_flags=st.lists(st.booleans(), min_size=2, max_size=5),
    admin_fee=_fee,
)
def test_admin_fee_attributed_to_eligible_pools_exactly(
    amounts, exclude_flags, admin_fee
):
    n = min(len(amounts), len(exclude_flags))
    assume(n >= 2)
    amounts, exclude_flags = amounts[:n], exclude_flags[:n]

    names = [f"p{i}" for i in range(n)]
    recoverable = dict(zip(names, amounts))
    excluded = {names[i] for i in range(n) if exclude_flags[i]}
    # Keep the exclusion non-empty AND leave at least one eligible pool, so the
    # weight vector is a strict, non-trivial subset (the seam under test).
    assume(excluded)
    eligible = [names[i] for i in range(n) if not exclude_flags[i]]
    assume(eligible)

    total = sum((Decimal(a) for a in amounts), Decimal("0"))
    # before == after -> Layer 2 inert (no cap reduction); Layer 1 splits the
    # whole recoverable so every pool has a positive post-cap share to weight by.
    pools = allocate_pool_recoveries(
        recoverable_by_pool=recoverable,
        cap_exempt_pools=set(),
        admin_fee_excluded_pools=excluded,
        tenant_share_before_cap=total,
        tenant_share_after_cap=total,
        admin_fee=admin_fee,
    )
    assume(pools)
    by_name = {p.pool_name: p for p in pools}

    # Reproduce the Layer-1 post-cap cent split (== before since no reduction).
    after_cents = _to_cents(total)
    weights = [recoverable[nm] for nm in names]
    share_after = _largest_remainder(after_cents, weights)
    sa = dict(zip(names, share_after))

    # Oracle: split admin cents over the eligible subset by their post-cap shares.
    admin_cents = _to_cents(admin_fee)
    alloc = _largest_remainder(admin_cents, [Decimal(sa[nm]) for nm in eligible])
    expected_fee = {nm: Decimal("0.00") for nm in names}
    for pos, nm in enumerate(eligible):
        expected_fee[nm] = _from_cents(alloc[pos])

    for nm in names:
        assert by_name[nm].admin_fee == expected_fee[nm]
        # Excluded pools carry no fee at all.
        if nm in excluded:
            assert by_name[nm].admin_fee == Decimal("0.00")
        # Per-pool identity holds penny-exact.
        assert by_name[nm].total_recovery == (
            by_name[nm].share_after_cap + by_name[nm].admin_fee
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # The per-pool fees reconcile EXACTLY to the booked admin fee.
    assert sum((p.admin_fee for p in pools), Decimal("0")) == _from_cents(admin_cents)


def test_admin_fee_concentrates_on_single_eligible_pool():
    """With one pool fee-excluded, the whole fee lands on the eligible pool."""
    # cam 6000 / taxes 4000, before==after 10000. taxes excluded -> fee all to cam.
    pools = allocate_pool_recoveries(
        recoverable_by_pool={"cam": Decimal("6000.00"), "taxes": Decimal("4000.00")},
        cap_exempt_pools=set(),
        admin_fee_excluded_pools={"taxes"},
        tenant_share_before_cap=Decimal("10000.00"),
        tenant_share_after_cap=Decimal("10000.00"),
        admin_fee=Decimal("500.00"),
    )
    by_name = {p.pool_name: p for p in pools}
    assert by_name["cam"].admin_fee == Decimal("500.00")
    assert by_name["taxes"].admin_fee == Decimal("0.00")
    assert by_name["cam"].total_recovery == Decimal("6500.00")
    assert by_name["taxes"].total_recovery == Decimal("4000.00")


def test_admin_fee_split_by_post_cap_share_with_odd_penny():
    """An odd admin cent is handed by largest-remainder, never dropped."""
    # two equal eligible pools, fee 1.01 -> 0.51 / 0.50 by lowest-index tie-break.
    pools = allocate_pool_recoveries(
        recoverable_by_pool={"a": Decimal("5000.00"), "b": Decimal("5000.00")},
        cap_exempt_pools=set(),
        admin_fee_excluded_pools=set(),
        tenant_share_before_cap=Decimal("10000.00"),
        tenant_share_after_cap=Decimal("10000.00"),
        admin_fee=Decimal("1.01"),
    )
    by_name = {p.pool_name: p for p in pools}
    fees = sorted((by_name["a"].admin_fee, by_name["b"].admin_fee))
    assert fees == [Decimal("0.50"), Decimal("0.51")]
    assert by_name["a"].admin_fee + by_name["b"].admin_fee == Decimal("1.01")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
