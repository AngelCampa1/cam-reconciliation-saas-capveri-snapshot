"""Property-based stress for NOI-impact / asset-valuation lift.

``calculate_noi_impact`` (calculation/noi_impact.py) turns a CAM recovery dollar
amount into an NOI lift (equal to the recovery — permanent additional income) and
an asset-value lift via cap-rate math (``noi_lift / cap_rate``). It is the number
shown to landlords to justify recovery work, so a rounding slip or a missing
cap-rate guard would over- or under-state the value story.

Invariants:
  * noi_lift == round(recovery_amount, 2, HALF_UP);
  * asset_value_lift == round(noi_lift / cap_rate, 2, HALF_UP);
  * recovery_amount and cap_rate are echoed back unchanged;
  * because cap_rate ∈ [0.01, 0.25] < 1, asset_value_lift ≥ noi_lift;
  * cap_rate outside [0.01, 0.25] raises ValueError;
  * deterministic; never raises for in-range inputs.

Run standalone:
    pytest tests/stress/test_noi_impact_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.noi_impact import (
    NOIImpactInput,
    calculate_noi_impact,
)

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

recoveries = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("10000000"), places=2, allow_nan=False
)
valid_caps = st.decimals(
    min_value=Decimal("0.01"), max_value=Decimal("0.25"), places=4, allow_nan=False
)


def _q(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


@STRESS
@given(recovery=recoveries, cap_rate=valid_caps)
def test_noi_impact_identity(recovery, cap_rate):
    result = calculate_noi_impact(
        NOIImpactInput(recovery_amount=recovery, cap_rate=cap_rate)
    )

    expected_noi = _q(recovery)
    expected_asset = _q(expected_noi / cap_rate)

    assert result.noi_lift == expected_noi
    assert result.asset_value_lift == expected_asset
    assert result.recovery_amount == recovery
    assert result.cap_rate == cap_rate
    # Cap rate < 1 ⇒ the income stream capitalizes to at least its own size.
    assert result.asset_value_lift >= result.noi_lift


@STRESS
@given(
    recovery=recoveries,
    bad_cap=st.one_of(
        st.decimals(
            min_value=Decimal("0.0001"),
            max_value=Decimal("0.0099"),
            places=4,
            allow_nan=False,
        ),
        st.decimals(
            min_value=Decimal("0.2501"),
            max_value=Decimal("10"),
            places=4,
            allow_nan=False,
        ),
    ),
)
def test_out_of_range_cap_rate_raises(recovery, bad_cap):
    with pytest.raises(ValueError):
        calculate_noi_impact(NOIImpactInput(recovery_amount=recovery, cap_rate=bad_cap))


def test_known_noi_example():
    # $100k recovery at a 7% cap rate ⇒ ~$1.43M asset value lift.
    result = calculate_noi_impact(
        NOIImpactInput(recovery_amount=Decimal("100000.00"), cap_rate=Decimal("0.07"))
    )
    assert result.noi_lift == Decimal("100000.00")
    assert result.asset_value_lift == Decimal("1428571.43")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
