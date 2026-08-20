"""Property-based stress for weighted-average occupancy.

``calculate_occupancy`` (calculation/occupancy.py) computes the day-weighted
average occupancy of a property over a period — the denominator that drives the
gross-up factor for variable CAM expenses. Each lease contributes
``sqft * (overlap_days / total_days)``; the result is ``Σ weighted_sqft /
total_rentable_sqft``, quantized to 4dp and clamped to [0, 1]. A sign error on the
overlap window, an off-by-one on inclusive day counts, or a missing clamp would
mis-state every gross-up.

Invariants:
  * **rate domain**: occupancy_rate ∈ [0, 1] always (clamped), and 0 when
    total_rentable_sqft ≤ 0;
  * **weighted-sqft identity**: occupied_sqft == Σ over valid, overlapping leases
    of sqft * (inclusive_overlap_days / inclusive_total_days), exactly (Decimal);
  * **rate identity**: occupancy_rate == min(1, round(occupied/total, 4)) when
    total > 0;
  * **malformed/out-of-window leases ignored**: start>end leases and leases with
    no period overlap contribute nothing;
  * **vacancy**: vacancy_sqft == max(0, total - occupied);
  * **deterministic** and **total** (never raises on valid inputs).

Run standalone:
    pytest tests/stress/test_occupancy_stress.py -q
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import uuid4

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.models import OccupancyInput
from app.services.calculation.occupancy import LeaseOccupancy, calculate_occupancy

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_EPOCH = date(2020, 1, 1)
day_offsets = st.integers(min_value=0, max_value=2000)
sqfts = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("100000"), places=2, allow_nan=False
)


def _d(offset: int) -> date:
    return _EPOCH + timedelta(days=offset)


@st.composite
def _lease(draw):
    a = draw(day_offsets)
    b = draw(day_offsets)
    # Half the time produce a deliberately malformed (start > end) lease.
    if draw(st.booleans()) and a != b:
        start, end = max(a, b), min(a, b)
    else:
        start, end = min(a, b), max(a, b)
    return LeaseOccupancy(
        lease_id=str(uuid4()),
        tenant_name=draw(st.text(max_size=6)),
        sqft=draw(sqfts),
        start_date=_d(start),
        end_date=_d(end),
    )


@STRESS
@given(
    p_start=day_offsets,
    p_len=st.integers(min_value=0, max_value=730),
    total_sqft=st.decimals(
        min_value=Decimal("0"), max_value=Decimal("500000"), places=2, allow_nan=False
    ),
    leases=st.lists(_lease(), max_size=8),
)
def test_occupancy_identity(p_start, p_len, total_sqft, leases):
    period_start = _d(p_start)
    period_end = _d(p_start + p_len)
    total_days = (period_end - period_start).days + 1

    result = calculate_occupancy(
        OccupancyInput(
            property_id=uuid4(),
            period_start=period_start,
            period_end=period_end,
            total_rentable_sqft=total_sqft,
        ),
        leases,
    )

    # Re-derive weighted sqft independently.
    expected_weighted = Decimal("0")
    for lease in leases:
        if lease.start_date > lease.end_date:
            continue
        o_start = max(lease.start_date, period_start)
        o_end = min(lease.end_date, period_end)
        if o_start > o_end:
            continue
        overlap_days = (o_end - o_start).days + 1
        expected_weighted += lease.sqft * (Decimal(overlap_days) / Decimal(total_days))

    assert result.occupied_sqft == expected_weighted

    if total_sqft <= 0:
        expected_rate = Decimal("0")
    else:
        raw = (expected_weighted / total_sqft).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        expected_rate = min(raw, Decimal("1"))
    assert result.occupancy_rate == expected_rate

    # Domain + vacancy invariants.
    assert Decimal("0") <= result.occupancy_rate <= Decimal("1")
    assert result.vacancy_sqft == max(Decimal("0"), total_sqft - expected_weighted)
    assert result.total_sqft == total_sqft


def test_full_occupancy_single_lease_covers_period():
    res = calculate_occupancy(
        OccupancyInput(
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        ),
        [
            LeaseOccupancy(
                lease_id="l1",
                tenant_name="Acme",
                sqft=Decimal("10000"),
                start_date=date(2024, 1, 1),
                end_date=date(2024, 12, 31),
            )
        ],
    )
    assert res.occupancy_rate == Decimal("1.0000")
    assert res.vacancy_sqft == Decimal("0")


def test_vacant_property_is_zero_occupancy():
    res = calculate_occupancy(
        OccupancyInput(
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        ),
        [],
    )
    assert res.occupancy_rate == Decimal("0")
    assert res.vacancy_sqft == Decimal("10000")


def test_malformed_lease_skipped():
    res = calculate_occupancy(
        OccupancyInput(
            property_id=uuid4(),
            period_start=date(2024, 1, 1),
            period_end=date(2024, 12, 31),
            total_rentable_sqft=Decimal("10000"),
        ),
        [
            LeaseOccupancy(
                lease_id="bad",
                tenant_name="Backwards",
                sqft=Decimal("5000"),
                start_date=date(2024, 6, 1),
                end_date=date(2024, 1, 1),  # end before start
            )
        ],
    )
    assert res.occupied_sqft == Decimal("0")
    assert res.occupancy_rate == Decimal("0")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
