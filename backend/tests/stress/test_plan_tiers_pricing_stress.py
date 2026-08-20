"""Property-based pricing-math invariants for the subscription plan tiers.

``generated_plan_tiers.get_annual_total_cents`` prices a subscription by rentable
unit count through inclusive unit-pricing bands (base covers the first 25 units; the
26-150 band is $179/unit, 151-500 is $169, 501-2500 is $159, 2501+ is $149). The
band loop uses inclusive ``- min + 1`` counting with min/max clamps — a classic
off-by-one / double-count site that, if wrong, mis-charges every customer. The launch
offer (``get_launch_offer_annual_cents``) then takes a fixed discount and ceils to a
whole dollar.

These properties pin the money math directly:

  * **Monotonic** — total never decreases as unit count rises (no unit is free-riding
    or double-charged into a discount).
  * **Correct band attribution** — the marginal cost of the n-th unit equals exactly
    the per-unit price of the band that contains n (×100 cents). This is the strong
    statement: every unit is billed at its band rate, no boundary unit dropped or
    double-counted.
  * **Base floor** — units 1..included (and n<=0) cost exactly the flat base.
  * **Launch offer** — equals the discounted total ceiled up to a whole dollar, never
    exceeds the full price, and stays monotonic.

A break is a direct mis-bill of real customers. The math is pure (no DB), so these
run as fast deterministic properties.

Run standalone:
    pytest tests/stress/test_plan_tiers_pricing_stress.py -q
"""

from __future__ import annotations

import math

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.billing.generated_plan_tiers import (
    LAUNCH_OFFER,
    TIERS,
    get_annual_total_cents,
    get_launch_offer_annual_cents,
)

STRESS = settings(max_examples=300, deadline=None)

_TIER = TIERS[0]  # single "reconcile" tier
_TIER_ID = _TIER["id"]
_BASE_CENTS = _TIER["base_annual"] * 100
_INCLUDED = _TIER["included_units"]
_BANDS = _TIER["unit_pricing_bands"]


def _band_price_for_unit(n: int) -> int | None:
    """Per-unit annual price (dollars) of the band that unit index n falls in, or
    None if n is within the included base."""
    for band in _BANDS:
        lo = band["min_units"]
        hi = band["max_units"]
        if n >= lo and (hi is None or n <= hi):
            return band["price_per_unit_annual"]
    return None


@STRESS
@given(n=st.integers(min_value=-5, max_value=4000))
def test_total_is_monotonic_nondecreasing(n):
    """Adding one more rentable unit never lowers the annual total."""
    here = get_annual_total_cents(_TIER_ID, n)
    nxt = get_annual_total_cents(_TIER_ID, n + 1)
    assert here is not None and nxt is not None
    assert nxt >= here


@STRESS
@given(n=st.integers(min_value=_INCLUDED + 1, max_value=4000))
def test_marginal_unit_billed_at_its_band_rate(n):
    """The marginal cost of the n-th unit (beyond the included base) equals exactly
    the per-unit price of the band containing n, in cents."""
    prev = get_annual_total_cents(_TIER_ID, n - 1)
    here = get_annual_total_cents(_TIER_ID, n)
    band_price = _band_price_for_unit(n)
    assert band_price is not None  # n > included, so it lands in a paid band
    assert here - prev == band_price * 100


@STRESS
@given(n=st.integers(min_value=-5, max_value=4000))
def test_launch_offer_is_ceiled_discount_and_bounded(n):
    """The launch offer equals the discounted total ceiled up to a whole dollar,
    never exceeds the full price, and is non-negative."""
    total = get_annual_total_cents(_TIER_ID, n)
    offer = get_launch_offer_annual_cents(_TIER_ID, n)
    assert total is not None and offer is not None

    keep_pct = 100 - LAUNCH_OFFER["discount_percent"]
    # discounted cents = total * keep_pct / 100; ceil up to a whole dollar (100c).
    discounted = total * keep_pct / 100
    expected = math.ceil(discounted / 100) * 100
    assert offer == expected
    assert 0 <= offer <= total


def test_base_floor_anchor():
    """Units 1..included and n<=0 all cost exactly the flat base; the first paid unit
    adds exactly the first band's per-unit rate."""
    for n in (-3, 0, 1, _INCLUDED):
        assert get_annual_total_cents(_TIER_ID, n) == _BASE_CENTS
    first_band_price = _BANDS[0]["price_per_unit_annual"]
    assert (
        get_annual_total_cents(_TIER_ID, _INCLUDED + 1)
        == _BASE_CENTS + first_band_price * 100
    )


def test_band_boundary_golden_anchor():
    """Hand-computed totals across the first two band boundaries (26-150 @ $179,
    151-500 @ $169) confirm inclusive, contiguous, non-overlapping band counting."""
    base = _TIER["base_annual"]
    # 150 units: 125 units (26..150) at $179.
    assert get_annual_total_cents(_TIER_ID, 150) == (base + 125 * 179) * 100
    # 151 units: the 125 @ $179 plus one unit (151) at $169.
    assert get_annual_total_cents(_TIER_ID, 151) == (base + 125 * 179 + 1 * 169) * 100
    # 500 units: 125 @ $179 + 350 (151..500) @ $169.
    assert get_annual_total_cents(_TIER_ID, 500) == (base + 125 * 179 + 350 * 169) * 100


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
