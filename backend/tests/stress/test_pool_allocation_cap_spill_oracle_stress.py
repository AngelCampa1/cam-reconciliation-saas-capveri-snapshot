"""Penny-exact oracle for the cap-adjustment SPILL branch of pool allocation.

``allocate_pool_recoveries`` (pool_allocation.py:154-178) attributes a cap
reduction to controllable (cap-eligible) pools first. When the reduction exceeds
the controllable pools' combined pre-cap share, the controllable pools are zeroed
and the *remainder* spills onto cap-exempt pools:

    reduction = before_cents - after_cents
    eligible_capacity = Σ share_before[i] for controllable i
    if reduction > eligible_capacity:           # the SPILL branch
        for i in controllable: cap_adj[i] = -share_before[i]   # zero them out
        spill = reduction - eligible_capacity
        cap_adj[exempt] = -largest_remainder(spill, [share_before[exempt]])

The aggregate conservation (`Σ cap_adjustment == -(before-after)`) is pinned by
``test_pool_allocation_stress.py::test_allocation_conserves_and_reconciles``, and
the *no-spill* attribution by ``test_cap_attributed_to_controllable_first`` — but
**no test exercises ``reduction > eligible_capacity`` at all** (grep for "spill"
in tests/stress/ finds nothing). So the per-pool outcome of the spill — every
controllable pool driven to exactly ``0.00`` and the leftover landing only on
exempt pools, penny-exact — is unpinned.

This forces the spill branch (``tenant_share_after_cap`` below the exempt pools'
combined share, so the whole controllable capacity must be cut and then some) and
checks each pool against an independent oracle. The oracle reuses the module's
``_largest_remainder`` / ``_to_cents`` helpers — those are independently pinned by
the conservation stress; the seam under test here is the spill *branch logic*
(which pools are zeroed, where the remainder is routed), not the split algorithm.

Run standalone:
    pytest tests/stress/test_pool_allocation_cap_spill_oracle_stress.py -q
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


@STRESS
@given(
    ctrl_amounts=st.lists(_amount, min_size=1, max_size=3),
    exempt_amounts=st.lists(_amount, min_size=1, max_size=3),
    before=st.decimals(
        min_value=Decimal("100"),
        max_value=Decimal("2000000"),
        places=2,
        allow_nan=False,
    ),
    after_frac=st.decimals(
        min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
    ),
)
def test_cap_spill_zeroes_controllable_and_routes_remainder(
    ctrl_amounts, exempt_amounts, before, after_frac
):
    ctrl_names = [f"cam{i}" for i in range(len(ctrl_amounts))]
    exempt_names = [f"tax{i}" for i in range(len(exempt_amounts))]
    recoverable = dict(zip(ctrl_names + exempt_names, ctrl_amounts + exempt_amounts))
    cap_exempt = set(exempt_names)

    after = (before * after_frac).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    pools = allocate_pool_recoveries(
        recoverable_by_pool=recoverable,
        cap_exempt_pools=cap_exempt,
        admin_fee_excluded_pools=set(),
        tenant_share_before_cap=before,
        tenant_share_after_cap=after,
        admin_fee=Decimal("0.00"),
    )
    assume(pools)  # allocator yields data (Σ weight > 0)
    by_name = {p.pool_name: p for p in pools}

    # Reproduce the integer-cents split of the pre-cap share (Layer 1).
    before_cents = _to_cents(before)
    after_cents = _to_cents(after)
    names = list(recoverable.keys())
    weights = [recoverable[n] for n in names]
    share_before = _largest_remainder(before_cents, weights)
    sb = dict(zip(names, share_before))

    ctrl_capacity = sum(sb[n] for n in ctrl_names)
    reduction = max(0, before_cents - after_cents)
    # Only assert the spill regime; the no-spill branch is covered elsewhere.
    assume(reduction > ctrl_capacity)

    # Oracle: controllable pools zeroed; remainder spills onto exempt by weight.
    spill = reduction - ctrl_capacity
    spill_alloc = _largest_remainder(spill, [Decimal(sb[n]) for n in exempt_names])
    expected_after = {n: Decimal("0.00") for n in ctrl_names}
    for pos, n in enumerate(exempt_names):
        expected_after[n] = _from_cents(sb[n] - spill_alloc[pos])

    for n in ctrl_names:
        assert by_name[n].share_after_cap == Decimal("0.00")
        assert by_name[n].cap_adjustment == -_from_cents(sb[n])
    for n in exempt_names:
        assert by_name[n].share_after_cap == expected_after[n]

    # The per-pool post-cap shares reconcile EXACTLY to the capped aggregate.
    assert sum((p.share_after_cap for p in pools), Decimal("0")) == _from_cents(
        after_cents
    )


def test_spill_anchor_controllable_zeroed_remainder_on_taxes():
    """$5000 cut > $3000 controllable: cam zeroed, $2000 spills to taxes."""
    pools = allocate_pool_recoveries(
        recoverable_by_pool={"cam": Decimal("3000.00"), "taxes": Decimal("7000.00")},
        cap_exempt_pools={"taxes"},
        admin_fee_excluded_pools=set(),
        tenant_share_before_cap=Decimal("10000.00"),
        tenant_share_after_cap=Decimal("5000.00"),
        admin_fee=Decimal("0.00"),
    )
    by_name = {p.pool_name: p for p in pools}
    # share_before splits 10000 by 3000:7000 -> cam 3000, taxes 7000.
    assert by_name["cam"].share_before_cap == Decimal("3000.00")
    assert by_name["taxes"].share_before_cap == Decimal("7000.00")
    # reduction 5000 > cam capacity 3000 -> cam zeroed, spill 2000 onto taxes.
    assert by_name["cam"].share_after_cap == Decimal("0.00")
    assert by_name["cam"].cap_adjustment == Decimal("-3000.00")
    assert by_name["taxes"].share_after_cap == Decimal("5000.00")
    assert by_name["taxes"].cap_adjustment == Decimal("-2000.00")
    assert sum((p.share_after_cap for p in pools), Decimal("0")) == Decimal("5000.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
