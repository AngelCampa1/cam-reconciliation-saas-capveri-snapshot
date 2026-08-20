"""Penny-exact oracle for per-tenant share-impact values in denominator change.

``DenominatorChangeService._calculate_tenant_impacts`` (denominator_change.py:472-551)
computes, for every tenant present in BOTH the prior and current period whose share
or recovery moved, two money/percentage figures:

    delta_pct_points = ((current_share - prior_share) * Decimal("100"))
                          .quantize(Decimal("0.01"), ROUND_HALF_UP)      # one expr
    recovery_delta   = current_total_recovery - prior_total_recovery     # RAW, no round

The seam is the **subtract → multiply-by-100 → THEN quantize** order applied to the
whole expression (NOT quantizing each share first, NOT quantizing the difference
before the ``*100``). A share delta of ``0.000050`` becomes ``0.005`` after the
``*100`` and rounds HALF_UP to ``0.01`` — a value a quantize-then-multiply ordering
would lose entirely. ``recovery_delta`` is the raw exact Decimal difference (a dollar
figure that must never be rounded). An impact is emitted iff the tenant continues
AND (share moved OR recovery moved).

``test_denominator_change_stress.py`` drives the full async ``generate_report`` but
only FORMAT-checks ``share_delta_pct_points == ...quantize(_CENT)`` — it never
independently recomputes the absolute ``(current_share - prior_share) * 100`` value
with ``==``, so the multiply-then-quantize arithmetic and the rounding-boundary
behaviour are unpinned. This calls the real method directly (no db / async needed)
and re-derives every emitted field with ``==`` (no tolerance).

Run standalone:
    pytest tests/stress/test_denominator_change_impact_oracle_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from uuid import uuid4

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.analysis.denominator_change import DenominatorChangeService

STRESS = settings(max_examples=300, deadline=None)

_Q = Decimal("0.01")


def _q(value: Decimal) -> Decimal:
    return value.quantize(_Q, rounding=ROUND_HALF_UP)


# Pro-rata shares carry many decimal places (a 6-dp fraction), so the
# (current - prior) * 100 product lands on rounding boundaries the quantize must
# resolve HALF_UP. Recovery is a 2-dp dollar figure.
_share = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=6, allow_nan=False
)
_recovery = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("5000000"), places=2, allow_nan=False
)


@st.composite
def _continuing_tenant(draw):
    """A lease present in both periods, with independently drawn prior/current
    shares and recoveries (so either, both, or neither may move)."""
    return {
        "lease_id": str(uuid4()),
        "tenant_name": draw(st.text(alphabet="ABCDEFGHIJ", min_size=1, max_size=8)),
        "prior_share": draw(_share),
        "current_share": draw(_share),
        "prior_recovery": draw(_recovery),
        "current_recovery": draw(_recovery),
    }


def _component(name: str, share: Decimal, recovery: Decimal) -> dict:
    return {
        "tenant_name": name,
        "pro_rata_share": share,
        "rsf": Decimal("0"),
        "boma_standard": None,
        "total_recovery": recovery,
    }


@STRESS
@given(tenants=st.lists(_continuing_tenant(), min_size=1, max_size=6))
def test_tenant_impact_values_round_trip_exactly(tenants):
    prior = {
        t["lease_id"]: _component(
            t["tenant_name"], t["prior_share"], t["prior_recovery"]
        )
        for t in tenants
    }
    current = {
        t["lease_id"]: _component(
            t["tenant_name"], t["current_share"], t["current_recovery"]
        )
        for t in tenants
    }

    impacts = DenominatorChangeService()._calculate_tenant_impacts(
        prior, current, changes=[]
    )

    # Independent oracle: emit iff share OR recovery moved; pin both figures.
    oracle: dict[str, tuple[Decimal, Decimal]] = {}
    for t in tenants:
        share_moved = t["prior_share"] != t["current_share"]
        recovery_moved = t["prior_recovery"] != t["current_recovery"]
        if not (share_moved or recovery_moved):
            continue
        delta_pct = _q((t["current_share"] - t["prior_share"]) * Decimal("100"))
        recovery_delta = t["current_recovery"] - t["prior_recovery"]  # raw, no round
        oracle[t["lease_id"]] = (delta_pct, recovery_delta)

    assert {str(i.lease_id) for i in impacts} == set(oracle.keys())
    for impact in impacts:
        expected_pct, expected_recovery = oracle[str(impact.lease_id)]
        assert impact.share_delta_pct_points == expected_pct
        assert impact.recovery_delta == expected_recovery


def test_anchor_half_up_boundary_rounds_the_product():
    """A 0.000050 share rise -> *100 = 0.0050 -> HALF_UP rounds to 0.01."""
    lid = str(uuid4())
    prior = {lid: _component("Acme", Decimal("0.100000"), Decimal("1000.00"))}
    current = {lid: _component("Acme", Decimal("0.100050"), Decimal("1000.00"))}
    impacts = DenominatorChangeService()._calculate_tenant_impacts(
        prior, current, changes=[]
    )
    assert len(impacts) == 1
    # (0.100050 - 0.100000) * 100 = 0.0050 -> 0.01, not 0.00.
    assert impacts[0].share_delta_pct_points == Decimal("0.01")
    assert impacts[0].recovery_delta == Decimal("0.00")


def test_anchor_recovery_only_move_emits_zero_share_delta():
    """Recovery alone moving still emits an impact with an exact raw delta."""
    lid = str(uuid4())
    prior = {lid: _component("Beta", Decimal("0.25"), Decimal("1000.00"))}
    current = {lid: _component("Beta", Decimal("0.25"), Decimal("1234.56"))}
    impacts = DenominatorChangeService()._calculate_tenant_impacts(
        prior, current, changes=[]
    )
    assert len(impacts) == 1
    assert impacts[0].share_delta_pct_points == Decimal("0.00")
    assert impacts[0].recovery_delta == Decimal("234.56")


def test_anchor_unchanged_tenant_emits_no_impact():
    """A tenant with identical share and recovery produces no impact."""
    lid = str(uuid4())
    prior = {lid: _component("Gamma", Decimal("0.30"), Decimal("500.00"))}
    current = {lid: _component("Gamma", Decimal("0.30"), Decimal("500.00"))}
    impacts = DenominatorChangeService()._calculate_tenant_impacts(
        prior, current, changes=[]
    )
    assert impacts == []


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
