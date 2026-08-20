"""Property-based stress for per-pool allocation of aggregate tenant share.

``allocate_pool_recoveries`` (calculation/pool_allocation.py) pushes the aggregate
tenant-share results (pre-cap share, post-cap share, admin fee) back down onto the
individual expense pools so Module B "Compare" can check a charge pool-by-pool.
Its non-negotiable contract is **conservation**: the per-pool numbers must sum
*exactly* (to the cent) to the aggregates they came from — indivisible pennies are
placed by largest-remainder so nothing is dropped or double-counted. A drift here
would make the pool-by-pool view disagree with the headline recovery an auditor
checks first.

Invariants:
  * **conservation**: Σ share_before_cap == agg before; Σ share_after_cap == agg
    after; Σ admin_fee == agg fee (each to the cent);
  * **per-pool identities**: share_after_cap == share_before_cap + cap_adjustment;
    total_recovery == share_after_cap + admin_fee; cap_adjustment ≤ 0;
  * **cap attribution**: Σ cap_adjustment == -(before - after);
  * **weighting basis**: recoverable_amount == max(0, input); negative inputs
    clamped to 0 for weighting;
  * **eligibility flags** mirror the passed cap-exempt / fee-excluded name sets;
  * **order preserved**; empty/all-zero-weight input → [] (aggregate-only fallback).

Run standalone:
    pytest tests/stress/test_pool_allocation_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.pool_allocation import (
    _from_cents,
    _to_cents,
    allocate_pool_recoveries,
)

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

money = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1000000"), places=2, allow_nan=False
)
# Contributions may be negative (GL credits); the module clamps them for weighting.
contributions = st.decimals(
    min_value=Decimal("-50000"), max_value=Decimal("1000000"), places=2, allow_nan=False
)
pool_names = st.text(
    alphabet=st.characters(min_codepoint=97, max_codepoint=122), min_size=1, max_size=6
)


@st.composite
def _scenario(draw):
    names = draw(st.lists(pool_names, min_size=0, max_size=6, unique=True))
    recoverable = {n: draw(contributions) for n in names}
    cap_exempt = (
        set(draw(st.lists(st.sampled_from(names), max_size=3))) if names else set()
    )
    fee_excluded = (
        set(draw(st.lists(st.sampled_from(names), max_size=3))) if names else set()
    )

    before = draw(money)
    # Cap never increases the share: after ∈ [0, before].
    after = draw(
        st.decimals(min_value=Decimal("0"), max_value=before, places=2, allow_nan=False)
    )
    admin_fee = draw(money)
    return recoverable, cap_exempt, fee_excluded, before, after, admin_fee


@STRESS
@given(scenario=_scenario())
def test_allocation_conserves_and_reconciles(scenario):
    recoverable, cap_exempt, fee_excluded, before, after, admin_fee = scenario

    pools = allocate_pool_recoveries(
        recoverable_by_pool=recoverable,
        cap_exempt_pools=cap_exempt,
        admin_fee_excluded_pools=fee_excluded,
        tenant_share_before_cap=before,
        tenant_share_after_cap=after,
        admin_fee=admin_fee,
    )

    names = list(recoverable.keys())
    clamped = [max(Decimal("0"), recoverable[n]) for n in names]

    # Empty / all-zero-weight inputs fall back to aggregate-only ([]).
    if not names or sum(clamped, Decimal("0")) <= 0:
        assert pools == []
        return

    # Order preserved.
    assert [p.pool_name for p in pools] == names

    # Conservation: per-pool sums == aggregates, to the cent.
    assert sum((p.share_before_cap for p in pools), Decimal("0")) == _from_cents(
        _to_cents(before)
    )
    assert sum((p.share_after_cap for p in pools), Decimal("0")) == _from_cents(
        _to_cents(after)
    )
    assert sum((p.admin_fee for p in pools), Decimal("0")) == _from_cents(
        _to_cents(admin_fee)
    )

    cap_exempt_lc = {p.lower() for p in cap_exempt}
    fee_excluded_lc = {p.lower() for p in fee_excluded}
    for p, name, clamp in zip(pools, names, clamped):
        # Per-pool identities.
        assert p.share_after_cap == p.share_before_cap + p.cap_adjustment
        assert p.total_recovery == p.share_after_cap + p.admin_fee
        assert p.cap_adjustment <= 0
        # Weighting basis is the clamped contribution.
        assert p.recoverable_amount == clamp
        # Eligibility flags mirror the supplied sets.
        assert p.is_cap_eligible == (name.lower() not in cap_exempt_lc)
        assert p.is_admin_fee_eligible == (name.lower() not in fee_excluded_lc)

    # Cap attribution sums to the negative of the total reduction.
    expected_reduction = _to_cents(before) - _to_cents(after)
    total_cap_adj_cents = _to_cents(
        sum((p.cap_adjustment for p in pools), Decimal("0")).copy_abs()
    )
    assert total_cap_adj_cents == expected_reduction


def test_empty_and_zero_weight_return_empty():
    assert (
        allocate_pool_recoveries(
            recoverable_by_pool={},
            cap_exempt_pools=set(),
            admin_fee_excluded_pools=set(),
            tenant_share_before_cap=Decimal("0"),
            tenant_share_after_cap=Decimal("0"),
            admin_fee=Decimal("0"),
        )
        == []
    )
    # All contributions clamp to zero ⇒ aggregate-only fallback.
    assert (
        allocate_pool_recoveries(
            recoverable_by_pool={"taxes": Decimal("-100"), "cam": Decimal("0")},
            cap_exempt_pools={"taxes"},
            admin_fee_excluded_pools=set(),
            tenant_share_before_cap=Decimal("500"),
            tenant_share_after_cap=Decimal("500"),
            admin_fee=Decimal("0"),
        )
        == []
    )


def test_cap_attributed_to_controllable_first():
    # CAM (controllable) and taxes (exempt). A cap cut hits CAM, not taxes.
    pools = allocate_pool_recoveries(
        recoverable_by_pool={"cam": Decimal("8000"), "taxes": Decimal("2000")},
        cap_exempt_pools={"taxes"},
        admin_fee_excluded_pools=set(),
        tenant_share_before_cap=Decimal("10000.00"),
        tenant_share_after_cap=Decimal("9000.00"),
        admin_fee=Decimal("0"),
    )
    by_name = {p.pool_name: p for p in pools}
    # The entire $1,000 reduction lands on the controllable CAM pool.
    assert by_name["cam"].cap_adjustment == Decimal("-1000.00")
    assert by_name["taxes"].cap_adjustment == Decimal("0.00")
    assert by_name["taxes"].share_after_cap == Decimal("2000.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
