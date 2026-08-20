"""Penny-exact oracle for day-based proration into the per-pool allocation.

When a lease starts or ends mid-period, ``calculate_tenant_share``
(tenant_share.py:531-535) prorates the tenant's share with a SECOND quantize on
top of the pro-rata quantize:

    net      = total_recoverable_expenses - excluded_pool_amounts   # line 468
    unprorat = round(net * pro_rata, 2)                             # line 517-519
    before   = round(unprorat * proration_factor, 2)               # line 533-535

That prorated ``before`` is then handed to ``allocate_pool_recoveries``
(pool_allocation.py) which must split it back across the non-excluded pools by the
largest-remainder method so the per-pool ``share_before_cap`` values **sum exactly
to the prorated aggregate** — no penny created or lost by the second quantize plus
the integer-cents redistribution.

The proration step is pinned only by a MONOTONIC band
(``test_proration_monotonic_stress.py`` uses ``>= lo - cent``), the multi-pool
oracle (``test_tenant_share_multipool_oracle_stress.py``) explicitly fixes
``proration_factor=1`` and omits proration, and the empty-pool arithmetic oracle
(``test_tenant_share_orchestrator_stress.py``) uses ``pool_breakdown={}`` so the
allocator never runs. **No test combines ``proration_factor != 1`` with a
non-empty multi-pool breakdown plus exclusions and asserts both the prorated
``before == oracle`` and the per-pool reconciliation with ``==``.**

This drives the real ``calculate_tenant_share`` on an isolating path — no cap
(``cap_type=NONE`` so ``before == after`` and the allocator runs without needing
classification), no base year, no management fee, no admin exclusions — with a
``proration_factor`` strictly in ``(0, 1)`` and at least one excluded pool, and
checks against an independent oracle:

    net    = Σ amount for non-excluded pools
    before = round(round(net * pro_rata, 2) * proration, 2)
    admin  = round(before * admin_pct, 2)
    total  = before + admin
    Σ pool.share_before_cap == before        # largest-remainder conservation

Run standalone:
    pytest tests/stress/test_proration_pool_allocation_oracle_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st

from app.services.calculation.caps import CapType
from app.services.calculation.tenant_share import (
    LeaseTerms,
    TenantShareInput,
    calculate_tenant_share,
)

STRESS = settings(max_examples=300, deadline=None)


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


_amount = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("2000000"), places=2, allow_nan=False
)
_ratio = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)
_fee_pct = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("0.5"), places=4, allow_nan=False
)
# Strictly inside (0, 1): a factor of exactly 1 skips the proration branch.
_proration = st.decimals(
    min_value=Decimal("0.0001"), max_value=Decimal("0.9999"), places=4, allow_nan=False
)
_PTYPES = ["operating", "tax", "insurance", "capital"]


@STRESS
@given(
    amounts=st.lists(_amount, min_size=2, max_size=4),
    exclude_flags=st.lists(st.booleans(), min_size=2, max_size=4),
    ptypes=st.lists(st.sampled_from(_PTYPES), min_size=2, max_size=4),
    pro_rata=_ratio,
    admin_pct=_fee_pct,
    proration=_proration,
)
def test_proration_into_pool_allocation_round_trips_exactly(
    amounts, exclude_flags, ptypes, pro_rata, admin_pct, proration
):
    n = min(len(amounts), len(exclude_flags), len(ptypes))
    assume(n >= 2)
    amounts, exclude_flags, ptypes = amounts[:n], exclude_flags[:n], ptypes[:n]

    names = [f"p{i}" for i in range(n)]
    pool_breakdown = dict(zip(names, amounts))
    pool_types = dict(zip(names, ptypes))
    excluded = [names[i] for i in range(n) if exclude_flags[i]]
    # At least one excluded and at least one non-excluded, with non-excluded > 0
    # so the allocator runs (it returns [] when every weight is zero).
    assume(excluded)
    non_excluded = [names[i] for i in range(n) if not exclude_flags[i]]
    assume(non_excluded)
    net = sum((amounts[i] for i in range(n) if not exclude_flags[i]), Decimal("0"))
    assume(net > 0)

    total = sum((Decimal(a) for a in amounts), Decimal("0"))
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin_pct,
        proration_factor=proration,
        excluded_pools=excluded,
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=total,
            pool_breakdown=pool_breakdown,
            pool_types=pool_types,
            current_year=2024,
        )
    )

    # Independent oracle: two-step quantize then admin.
    unprorated = _q(net * pro_rata)
    before = _q(unprorated * proration)
    admin = _q(before * admin_pct)
    expected_total = before + admin

    assert result.tenant_share_before_cap == before
    assert result.tenant_share_after_cap == before
    assert result.admin_fee == admin
    assert result.total_recovery == expected_total

    # Largest-remainder conservation: the prorated aggregate is split penny-exact.
    assert (
        sum((p.share_before_cap for p in result.pool_breakdowns), Decimal("0"))
        == before
    )


def test_half_year_proration_halves_the_share():
    """A 0.5 proration factor halves the (rounded) pro-rata share exactly."""
    # net = 100000 (cam) ; taxes 40000 excluded. pro_rata 1 -> unprorated 100000.
    # proration 0.5 -> before 50000; admin 10% -> 5000; total 55000.
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="Solo",
        pro_rata_share=Decimal("1"),
        admin_fee_percentage=Decimal("0.10"),
        proration_factor=Decimal("0.5"),
        excluded_pools=["taxes"],
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=Decimal("140000.00"),
            pool_breakdown={
                "cam": Decimal("100000.00"),
                "taxes": Decimal("40000.00"),
            },
            pool_types={"cam": "operating", "taxes": "tax"},
            current_year=2024,
        )
    )
    assert result.tenant_share_before_cap == Decimal("50000.00")
    assert result.admin_fee == Decimal("5000.00")
    assert result.total_recovery == Decimal("55000.00")
    # Only the non-excluded "cam" pool carries the whole prorated share.
    assert len(result.pool_breakdowns) == 1
    assert result.pool_breakdowns[0].share_before_cap == Decimal("50000.00")


def test_proration_pennies_reconcile_across_pools():
    """An odd prorated total is split so the per-pool cents still sum exactly."""
    # two equal non-excluded pools; a prorated total ending in an odd cent must
    # hand the leftover penny to one pool via largest-remainder, never drop it.
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="Solo",
        pro_rata_share=Decimal("1"),
        admin_fee_percentage=Decimal("0"),
        proration_factor=Decimal("0.3333"),
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=Decimal("3.00"),
            pool_breakdown={"a": Decimal("1.50"), "b": Decimal("1.50")},
            pool_types={"a": "operating", "b": "operating"},
            current_year=2024,
        )
    )
    # unprorated 3.00; before = round(3.00 * 0.3333, 2) = round(0.9999, 2) = 1.00.
    assert result.tenant_share_before_cap == Decimal("1.00")
    assert sum(
        (p.share_before_cap for p in result.pool_breakdowns), Decimal("0")
    ) == Decimal("1.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
