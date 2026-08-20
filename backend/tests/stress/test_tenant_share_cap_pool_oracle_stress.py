"""Penny-exact oracle for the binding-cap, per-pool-attribution tenant-share path.

A non-cumulative expense cap limits a tenant's CAM share to a percentage increase
over last year (``round(prior * (1 + rate), 2)``). When it BINDS and the run has
pool classification, ``calculate_tenant_share`` (calculation/tenant_share.py)
pushes the cap reduction onto *controllable* pools first (operating-type), spilling
to cap-exempt pools (tax / insurance / capital) only if the controllable capacity
is exhausted — all via largest-remainder cent allocation so nothing drifts. The cap
math is stress-tested in isolation (``test_non_cumulative_cap_stress.py``) and the
allocation in isolation (``test_pool_allocation_stress.py``); the prior tenant-share
oracles all run with ``cap_type=NONE``. So the **binding cap + pool_types path of
``calculate_tenant_share`` has no penny-exact property oracle** — only two
hand-crafted cases in ``test_tenant_share.py`` that don't check the per-pool column
sums or the exempt-untouched condition.

This synthesizes known ``(pools, pool_types, pro_rata, prior, cap_rate, admin_pct)``
tuples (no exclusions, no base year, no proration), runs the real calculation, and
checks against an independent oracle:

    net      = Σ pool amounts
    before   = round(net * pro_rata, 2)
    ceiling  = round(prior * (1 + cap_rate), 2)
    after    = min(before, ceiling)            # cap_applied iff before > ceiling
    admin    = round(after * admin_pct, 2)
    total    = after + admin

Invariants pinned here:

  * **Ceiling & binding** — ``after`` and ``cap_applied`` match the oracle exactly.
  * **Per-pool conservation** — with classification supplied the split is produced
    and its ``share_before_cap`` / ``share_after_cap`` / ``admin_fee`` /
    ``total_recovery`` columns each sum back to the aggregate to the cent.
  * **Direction & non-negativity** — every ``cap_adjustment <= 0`` (a cap only
    reduces) and every ``share_after_cap >= 0`` (no pool driven negative).
  * **Eligibility tag** — ``is_cap_eligible`` is exactly "type not in
    {tax, insurance, capital}".
  * **Exempt untouched** — when the reduction fits within controllable capacity,
    cap-exempt pools keep their pre-cap share (zero ``cap_adjustment``).

Run standalone:
    pytest tests/stress/test_tenant_share_cap_pool_oracle_stress.py -q
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

_CAP_EXEMPT_TYPES = {"tax", "insurance", "capital"}


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# A pool: unique lowercase name, non-negative 2dp amount, and a pool_type that is
# either controllable ("operating") or cap-exempt (tax/insurance/capital).
_pool = st.fixed_dictionaries(
    {
        "name": st.from_regex(r"p[0-9]{1,4}", fullmatch=True),
        "amount": st.decimals(
            min_value=Decimal("0"),
            max_value=Decimal("1000000"),
            places=2,
            allow_nan=False,
        ),
        "ptype": st.sampled_from(["operating", "tax", "insurance", "capital"]),
    }
)

_ratio = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)
_fee_pct = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("0.5"), places=4, allow_nan=False
)
# Prior > 0 anchors the percentage cap (a zero prior passes the cap through). A
# small upper bound keeps the ceiling low enough that the cap frequently binds.
_prior = st.decimals(
    min_value=Decimal("0.01"), max_value=Decimal("200000"), places=2, allow_nan=False
)
_cap_rate = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("0.5"), places=4, allow_nan=False
)


@STRESS
@given(
    pools=st.lists(_pool, min_size=1, max_size=5, unique_by=lambda p: p["name"]),
    pro_rata=_ratio,
    prior=_prior,
    cap_rate=_cap_rate,
    admin_pct=_fee_pct,
)
def test_binding_cap_with_pools_round_trips_exactly(
    pools, pro_rata, prior, cap_rate, admin_pct
):
    pool_breakdown = {p["name"]: p["amount"] for p in pools}
    pool_types = {p["name"]: p["ptype"] for p in pools}
    total = sum((p["amount"] for p in pools), Decimal("0"))

    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin_pct,
        cap_type=CapType.NON_CUMULATIVE,
        cap_rate=cap_rate,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=total,
            pool_breakdown=pool_breakdown,
            pool_types=pool_types,
            prior_year_amount=prior,
            current_year=2024,
        )
    )

    # Independent oracle.
    net = total
    before = _q(net * pro_rata)
    ceiling = _q(prior * (Decimal("1") + cap_rate))
    after = min(before, ceiling)
    cap_applied = before > ceiling
    admin = _q(after * admin_pct)
    total_recovery = after + admin

    assert result.tenant_share_before_cap == before
    assert result.cap_applied is cap_applied
    assert result.tenant_share_after_cap == after
    assert result.admin_fee == admin
    assert result.total_recovery == total_recovery

    if net > 0:
        pbs = result.pool_breakdowns
        assert pbs, "classification supplied -> per-pool split must be produced"

        # Four-column conservation against the aggregate.
        assert sum((pb.share_before_cap for pb in pbs), Decimal("0")) == before
        assert sum((pb.share_after_cap for pb in pbs), Decimal("0")) == after
        assert sum((pb.admin_fee for pb in pbs), Decimal("0")) == admin
        assert sum((pb.total_recovery for pb in pbs), Decimal("0")) == total_recovery

        for pb in pbs:
            # A cap only ever reduces, and no pool is driven negative.
            assert pb.cap_adjustment <= Decimal("0.00")
            assert pb.share_after_cap >= Decimal("0")
            # Eligibility is exactly "type not in {tax, insurance, capital}".
            expected_eligible = (
                pool_types[pb.pool_name].lower() not in _CAP_EXEMPT_TYPES
            )
            assert pb.is_cap_eligible is expected_eligible

        # Exempt-untouched: when controllable pools can absorb the whole reduction,
        # cap-exempt pools keep their pre-cap share.
        reduction = before - after
        controllable_share = sum(
            (pb.share_before_cap for pb in pbs if pb.is_cap_eligible), Decimal("0")
        )
        if reduction <= controllable_share:
            for pb in pbs:
                if not pb.is_cap_eligible:
                    assert pb.share_after_cap == pb.share_before_cap
                    assert pb.cap_adjustment == Decimal("0.00")


def test_binding_cap_reduces_controllable_pool_only():
    """A binding cap whose reduction fits controllable capacity spares T&I."""
    # net 100k, pro_rata 1.0 -> before 100k. prior 50k, rate 0 -> ceiling 50k.
    # reduction 50k; operating pool holds 60k of the pre-cap share, so the tax
    # pool is untouched.
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=Decimal("1"),
        cap_type=CapType.NON_CUMULATIVE,
        cap_rate=Decimal("0"),
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={"op": Decimal("60000.00"), "tax": Decimal("40000.00")},
            pool_types={"op": "operating", "tax": "tax"},
            prior_year_amount=Decimal("50000.00"),
            current_year=2024,
        )
    )
    assert result.cap_applied is True
    assert result.tenant_share_after_cap == Decimal("50000.00")
    by_pool = {pb.pool_name: pb for pb in result.pool_breakdowns}
    # Tax (exempt) keeps its full pre-cap share; the cut lands on operating.
    assert by_pool["tax"].share_after_cap == by_pool["tax"].share_before_cap
    assert by_pool["tax"].cap_adjustment == Decimal("0.00")
    assert by_pool["op"].cap_adjustment < Decimal("0.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
