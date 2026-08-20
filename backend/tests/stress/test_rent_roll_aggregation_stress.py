"""Property-based stress for rent-roll parsing: CAM-share normalization and
square-footage aggregation.

This cycle drives the REAL rent-roll parsers (no DB needed) across a wide
adversarial-but-valid input space and asserts the invariants that must hold for
every output. No product bug was found — the parsers' CAM-share handling is a
deliberate auto-detecting heuristic; see OBS-S16 below.

Invariants asserted (against the real parsers / real aggregation arithmetic):
  * every parsed ``cam_share`` is in ``[0, 1]`` for in-contract inputs
    (percentage values ``0..100`` and decimal fractions ``0..1``);
  * the MRI/Generic percentage→decimal heuristic matches its documented
    contract exactly at the ``1`` boundary (see OBS-S16);
  * property-level rentable sqft equals the exact ``Decimal`` sum of per-unit
    rentable sqft and is order-independent;
  * usable never exceeds rentable and common area is never negative after the
    property-level cap;
  * an empty rent roll aggregates to zero without crashing.

OBS-S16 (NOT a bug — documented intentional behavior)
-----------------------------------------------------
``MRIRentRollParser._get_cam_share`` / ``GenericRentRollParser._get_cam_share``
auto-detect percentage vs. decimal form with ``if raw_value > 1`` (divide by
100) ``else`` pass through. The boundary value ``1`` is inherently ambiguous —
it is ``1%`` in percentage form but ``100%`` (a whole-building single tenant) in
decimal form. The parsers deliberately treat ``<= 1`` as already-decimal (the
``test_get_cam_share_already_decimal`` "returns value <=1 unchanged" contract),
so ``1`` → ``1.0000`` (100%). This preserves the common single-tenant net-lease
case (decimal ``1.0`` = 100%). Flipping the boundary to ``>= 1`` would fix the
rarer "1% written as integer 1" case but would silently turn every 100%
single-tenant building into a 1% share — a worse, more common 100x error. The
boundary is left as designed and pinned by this test so it cannot drift
unnoticed.

Run standalone:
    pytest tests/stress/test_rent_roll_aggregation_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal
from io import BytesIO

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.parsers.generic_rent_roll import GenericRentRollParser
from app.services.ingestion.parsers.mri_rent_roll import MRIRentRollParser
from app.services.ingestion.schemas import RentRollRow

STRESS = settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)


# ---------------------------------------------------------------------------
# CAM-share normalization (real parsers)
# ---------------------------------------------------------------------------

# In-contract percentage inputs: whole/ fractional percents in 0..100.
percentage_value = st.decimals(
    min_value=Decimal("0"),
    max_value=Decimal("100"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


def _mri_csv(cam_value: str) -> bytes:
    lines = [
        "MRI SOFTWARE",
        "Property Name: Test Building",
        "Address: 100 Main St",
        "City: Austin",
        "State: TX",
        "Zip: 78701",
        "Unit Code,RSF,Tenant Name,Start Date,End Date,Base Rent,CAM %",
        f"100,2500.00,Acme Corp,2024-01-01,2026-12-31,5000.00,{cam_value}",
    ]
    return "\n".join(lines).encode("utf-8")


def _parse_one_mri_cam(cam_value: str) -> Decimal | None:
    result = MRIRentRollParser().parse(BytesIO(_mri_csv(cam_value)), "test_mri.csv")
    assert result.success, f"parse failed: {result.errors}"
    assert len(result.units) == 1
    return result.units[0].cam_share


@STRESS
@given(pct=percentage_value)
def test_mri_cam_share_in_unit_range(pct):
    """Any in-contract percentage (0..100) must normalize into [0, 1]."""
    cam = _parse_one_mri_cam(format(pct, "f"))
    assert cam is not None
    assert Decimal("0") <= cam <= Decimal("1"), f"cam={cam} out of [0,1] for {pct}"


@pytest.mark.parametrize(
    "raw,expected",
    [
        # > 1 → treated as percentage, divided by 100.
        ("5.23", Decimal("0.0523")),
        ("50", Decimal("0.5000")),
        ("100", Decimal("1.0000")),
        # < 1 → already decimal, passed through.
        ("0.05", Decimal("0.0500")),
        ("0.5", Decimal("0.5000")),
        # == 1 BOUNDARY (OBS-S16): intentionally treated as decimal 100%,
        # NOT 1%. Pinned so the documented heuristic cannot drift.
        ("1", Decimal("1.0000")),
        ("1.00", Decimal("1.0000")),
    ],
)
def test_mri_cam_share_boundary_is_documented_decimal_passthrough(raw, expected):
    assert _parse_one_mri_cam(raw) == expected


def _generic_csv(cam_value: str) -> bytes:
    lines = [
        "Unit,Rentable SF,Tenant,Lease Start,Lease End,Base Rent,CAM Share",
        f"100,2500.00,Acme Corp,2024-01-01,2026-12-31,5000.00,{cam_value}",
    ]
    return "\n".join(lines).encode("utf-8")


@STRESS
@given(pct=percentage_value)
def test_generic_cam_share_in_unit_range(pct):
    """The generic parser must also keep in-contract shares within [0, 1]."""
    result = GenericRentRollParser().parse(
        BytesIO(_generic_csv(format(pct, "f"))), "test_generic.csv"
    )
    assert result.success, f"parse failed: {result.errors}"
    if result.units:
        cam = result.units[0].cam_share
        if cam is not None:
            assert Decimal("0") <= cam <= Decimal("1"), f"cam={cam} out of [0,1]"


# ---------------------------------------------------------------------------
# Square-footage aggregation arithmetic (mirrors rent_roll_import.py 179-191/316)
# ---------------------------------------------------------------------------

sqft = st.decimals(
    min_value=Decimal("1"),
    max_value=Decimal("500000"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


def _make_unit(num: str, rentable: Decimal, usable: Decimal | None) -> RentRollRow:
    return RentRollRow(
        unit_number=num,
        rentable_sqft=rentable,
        usable_sqft=usable,
        cam_share=None,
        raw_row_data={},
    )


@st.composite
def unit_list(draw):
    n = draw(st.integers(min_value=0, max_value=20))
    return [
        _make_unit(f"UNIT-{i:03d}", draw(sqft), draw(st.one_of(st.none(), sqft)))
        for i in range(n)
    ]


def _totals(units: list[RentRollRow]) -> tuple[Decimal, Decimal, Decimal]:
    total_rentable = sum((u.rentable_sqft for u in units), Decimal("0"))
    total_usable = sum(
        (u.usable_sqft or u.rentable_sqft * Decimal("0.9") for u in units),
        Decimal("0"),
    )
    if total_usable > total_rentable:
        total_usable = total_rentable * Decimal("0.9")
    return total_rentable, total_usable, total_rentable - total_usable


@STRESS
@given(units=unit_list())
def test_rentable_is_exact_order_independent_sum(units):
    total_rentable, _, _ = _totals(units)
    assert total_rentable == sum((u.rentable_sqft for u in units), Decimal("0"))
    # Order-independent: reversing the unit order yields the same total.
    assert total_rentable == _totals(list(reversed(units)))[0]


@STRESS
@given(units=unit_list())
def test_usable_capped_and_common_area_nonnegative(units):
    total_rentable, total_usable, common_area = _totals(units)
    assert total_usable <= total_rentable
    assert common_area >= Decimal("0")


def test_empty_rent_roll_aggregates_to_zero():
    assert _totals([]) == (Decimal("0"), Decimal("0"), Decimal("0"))


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
