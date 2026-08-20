"""Penny-exact oracle for the multi-pool, with-exclusions tenant-share path.

``calculate_tenant_share`` (calculation/tenant_share.py) is the dollar figure a
tenant is billed. The existing orchestrator stress
(``test_tenant_share_orchestrator_stress.py``) pins cross-step invariants over the
full adversarial space and an exact re-derivation of the *degenerate* path —
``pool_breakdown={}``, no exclusions, no cap. What it does **not** pin is the
common production shape: a **non-empty multi-pool breakdown with some pools
excluded from recovery**, where two things must hold at once and to the cent:

  1. the aggregate share is computed off the *net* of the non-excluded pools, and
  2. the per-pool allocation that fans the aggregate back across pools loses no
     penny (``allocate_pool_recoveries`` is conservation-tested in isolation, but
     never against an oracle recomputed from the generating pool amounts end to
     end through ``calculate_tenant_share``).

This synthesizes known ``(pool_amounts, excluded_set, pro_rata, admin_pct)``
tuples, runs the real calculation (no base year, no cap, no proration, no
management fee, no admin-fee pool exclusions), and checks the result against an
independent oracle:

    net            = Σ amount over non-excluded pools
    expected_share = round(net * pro_rata, 2)            # ROUND_HALF_UP
    expected_admin = round(expected_share * admin_pct, 2)
    expected_total = expected_share + expected_admin

Invariants pinned here:

  * **Net exclusion** — ``net_recoverable == total - Σ excluded`` exactly.
  * **Penny-exact headline** — ``tenant_share_before_cap`` / ``after_cap`` /
    ``admin_fee`` / ``total_recovery`` each equal the oracle to the cent.
  * **No cap** — ``cap_applied`` is ``False`` and after == before.
  * **Per-pool conservation against the oracle** — the produced ``pool_breakdowns``
    cover exactly the non-excluded pools and their ``share_before_cap`` /
    ``share_after_cap`` / ``admin_fee`` / ``total_recovery`` columns each sum back
    to the oracle aggregate with no penny lost in the split.

Run standalone:
    pytest tests/stress/test_tenant_share_multipool_oracle_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.caps import CapType
from app.services.calculation.tenant_share import (
    LeaseTerms,
    TenantShareInput,
    calculate_tenant_share,
)

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# A pool: a unique lowercase name (so the parser's exact-match exclusion and the
# allocation's lowercase recoverable filter agree), a non-negative 2dp amount, and
# whether the lease excludes it from recovery.
_pool = st.fixed_dictionaries(
    {
        "name": st.from_regex(r"p[0-9]{1,4}", fullmatch=True),
        "amount": st.decimals(
            min_value=Decimal("0"),
            max_value=Decimal("2000000"),
            places=2,
            allow_nan=False,
        ),
        "excluded": st.booleans(),
    }
)

_ratio = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)
_fee_pct = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("0.5"), places=4, allow_nan=False
)


@STRESS
@given(
    pools=st.lists(_pool, min_size=1, max_size=6, unique_by=lambda p: p["name"]),
    pro_rata=_ratio,
    admin_pct=_fee_pct,
)
def test_multipool_with_exclusions_round_trips_exactly(pools, pro_rata, admin_pct):
    pool_breakdown = {p["name"]: p["amount"] for p in pools}
    excluded = [p["name"] for p in pools if p["excluded"]]
    # total_recoverable_expenses is the scalar the exclusion step subtracts from;
    # it must equal the sum of the pools for the net to equal the non-excluded sum.
    total = sum((p["amount"] for p in pools), Decimal("0"))

    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin_pct,
        excluded_pools=excluded,
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=total,
            pool_breakdown=pool_breakdown,
            current_year=2024,
        )
    )

    # Independent oracle from the generating values.
    excluded_set = set(excluded)
    net = sum(
        (p["amount"] for p in pools if p["name"] not in excluded_set), Decimal("0")
    )
    expected_share = _q(net * pro_rata)
    expected_admin = _q(expected_share * admin_pct)
    expected_total = expected_share + expected_admin

    # Net exclusion is an exact Decimal subtraction.
    assert result.net_recoverable == net
    assert result.gross_recoverable == total
    assert result.excluded_amount == total - net

    # Penny-exact headline figures.
    assert result.tenant_share_before_cap == expected_share
    assert result.cap_applied is False
    assert result.tenant_share_after_cap == expected_share
    assert result.admin_fee == expected_admin
    assert result.total_recovery == expected_total

    # Per-pool allocation conserves every aggregate column down to the cent
    # against the oracle (an empty split — when no recoverable dollars exist —
    # sums to zero, which equals the zero oracle, so this holds either way).
    assert (
        sum((pb.share_before_cap for pb in result.pool_breakdowns), Decimal("0"))
        == expected_share
    )
    assert (
        sum((pb.share_after_cap for pb in result.pool_breakdowns), Decimal("0"))
        == expected_share
    )
    assert (
        sum((pb.admin_fee for pb in result.pool_breakdowns), Decimal("0"))
        == expected_admin
    )
    assert (
        sum((pb.total_recovery for pb in result.pool_breakdowns), Decimal("0"))
        == expected_total
    )

    # When recoverable dollars exist, the split covers exactly the non-excluded
    # pools. With zero recoverable dollars the breakdown is withheld (the caller
    # falls back to aggregate-only reporting), so the set is empty by design.
    recoverable_names = {p["name"] for p in pools if p["name"] not in excluded_set}
    if net > 0:
        assert {pb.pool_name for pb in result.pool_breakdowns} == recoverable_names
    else:
        assert result.pool_breakdowns == []


def test_all_pools_excluded_yields_zero_recovery():
    """Excluding every pool drives net, share, and recovery to zero with no split."""
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=Decimal("0.25"),
        admin_fee_percentage=Decimal("0.10"),
        excluded_pools=["p1", "p2"],
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=Decimal("5000.00"),
            pool_breakdown={"p1": Decimal("2000.00"), "p2": Decimal("3000.00")},
            current_year=2024,
        )
    )
    assert result.net_recoverable == Decimal("0.00")
    assert result.tenant_share_before_cap == Decimal("0.00")
    assert result.total_recovery == Decimal("0.00")
    assert result.pool_breakdowns == []


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
