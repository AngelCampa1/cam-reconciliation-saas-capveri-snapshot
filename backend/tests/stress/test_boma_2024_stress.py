"""Property-based stress for the BOMA 2024 rentable-area calculator.

``calculate_boma_2024`` (calculation/boma_2024.py) derives a building's existing
load factor (rentable/usable) and re-applies it to an *expanded* usable area that
includes outdoor amenity SF newly measurable under BOMA 2024, to quantify the
extra billable ("hidden") rentable SF and its revenue / asset-value lift. It is a
landlord-facing value story, so a wrong rounding sequence, a dropped non-negative
clamp, or a missing load-factor guard would mis-state the upside.

Invariants:
  * rentable_sf < usable_sf raises ValueError (load factor < 1 is invalid);
  * load_factor == round(rentable/usable, 4);
  * new_usable == round(usable + balcony + terrace + outdoor, 2);
  * new_rentable == round(new_usable * load_factor, 2);
  * hidden_sf == round(max(0, new_rentable - rentable), 2), never negative;
  * pct_increase == round(hidden/rentable*100, 4);
  * revenue_lift == round(hidden * rent_per_sf, 2);
  * asset_value_lift == round(revenue_lift / cap_rate, 0);
  * monotonicity: adding outdoor SF never decreases hidden_sf.

Run standalone:
    pytest tests/stress/test_boma_2024_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.boma_2024 import (
    BomaCalculationInput,
    calculate_boma_2024,
)

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

areas = st.decimals(
    min_value=Decimal("1"), max_value=Decimal("500000"), places=2, allow_nan=False
)
outdoor = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("100000"), places=2, allow_nan=False
)
rents = st.decimals(
    min_value=Decimal("0.01"), max_value=Decimal("500"), places=2, allow_nan=False
)
caps = st.decimals(
    min_value=Decimal("0.01"), max_value=Decimal("1"), places=4, allow_nan=False
)


def _q(value: Decimal, places: str) -> Decimal:
    return value.quantize(Decimal(places), rounding=ROUND_HALF_UP)


@st.composite
def _inputs(draw):
    usable = draw(areas)
    # rentable_sf must be >= usable_sf for a valid (>=1) load factor.
    rentable = draw(
        st.decimals(
            min_value=usable, max_value=Decimal("1000000"), places=2, allow_nan=False
        )
    )
    return BomaCalculationInput(
        usable_sf=usable,
        rentable_sf=rentable,
        balcony_sf=draw(outdoor),
        terrace_sf=draw(outdoor),
        outdoor_amenity_sf=draw(outdoor),
        annual_rent_per_sf=draw(rents),
        cap_rate=draw(caps),
    )


@STRESS
@given(inputs=_inputs())
def test_boma_identity(inputs):
    result = calculate_boma_2024(inputs)

    load_factor = _q(inputs.rentable_sf / inputs.usable_sf, "0.0001")
    new_usable = _q(
        inputs.usable_sf
        + inputs.balcony_sf
        + inputs.terrace_sf
        + inputs.outdoor_amenity_sf,
        "0.01",
    )
    new_rentable = _q(new_usable * load_factor, "0.01")
    hidden = _q(max(Decimal("0"), new_rentable - inputs.rentable_sf), "0.01")
    pct = _q(hidden / inputs.rentable_sf * Decimal("100"), "0.0001")
    revenue = _q(hidden * inputs.annual_rent_per_sf, "0.01")
    asset = _q(revenue / inputs.cap_rate, "1")

    assert result.load_factor == load_factor
    assert result.new_usable_sf == new_usable
    assert result.new_rentable_sf == new_rentable
    assert result.hidden_sf == hidden
    assert result.pct_increase == pct
    assert result.revenue_lift == revenue
    assert result.asset_value_lift == asset

    # Structural guarantees.
    assert result.hidden_sf >= 0
    assert result.load_factor >= 1
    assert result.new_usable_sf >= inputs.usable_sf


@STRESS
@given(inputs=_inputs(), extra=outdoor.filter(lambda d: d > 0))
def test_more_outdoor_sf_never_shrinks_hidden(inputs, extra):
    base = calculate_boma_2024(inputs)
    bumped = calculate_boma_2024(
        inputs.model_copy(update={"balcony_sf": inputs.balcony_sf + extra})
    )
    # Load factor >= 1 is fixed, so a larger usable base can only grow hidden SF.
    assert bumped.hidden_sf >= base.hidden_sf
    assert bumped.new_usable_sf > base.new_usable_sf


def test_rentable_below_usable_raises():
    with pytest.raises(ValueError):
        calculate_boma_2024(
            BomaCalculationInput(
                usable_sf=Decimal("100"),
                rentable_sf=Decimal("90"),
                annual_rent_per_sf=Decimal("30"),
            )
        )


def test_known_boma_example():
    # 10,000 usable / 11,500 rentable ⇒ load factor 1.15. Add 1,000 SF balcony ⇒
    # new usable 11,000, new rentable 11,000*1.15 = 12,650, hidden 1,150 SF.
    # At $30/SF ⇒ $34,500 revenue lift; at 6.5% cap ⇒ $530,769 asset lift.
    result = calculate_boma_2024(
        BomaCalculationInput(
            usable_sf=Decimal("10000"),
            rentable_sf=Decimal("11500"),
            balcony_sf=Decimal("1000"),
            annual_rent_per_sf=Decimal("30"),
            cap_rate=Decimal("0.065"),
        )
    )
    assert result.load_factor == Decimal("1.1500")
    assert result.new_rentable_sf == Decimal("12650.00")
    assert result.hidden_sf == Decimal("1150.00")
    assert result.revenue_lift == Decimal("34500.00")
    assert result.asset_value_lift == Decimal("530769")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
