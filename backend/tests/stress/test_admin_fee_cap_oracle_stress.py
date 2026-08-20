"""Penny-exact oracle for the admin-fee-cap clamp in ``calculate_tenant_share``.

The admin fee is a surcharge on top of the CAM share. When a lease caps it
(``admin_fee_cap``), Step 5b of ``calculate_tenant_share``
(calculation/tenant_share.py) applies the ``min()`` to the **unquantized**
product and quantizes once:

    admin_fee = round(min(admin_base * admin_fee_percentage, admin_fee_cap), 2)

so the clamp lands before rounding — swapping the ``min`` / ``quantize`` order, or
an off-by-one cent, would mis-bill every capped tenant. The existing assembly
stress (``test_admin_fee_assembly_stress.py::test_admin_fee_cap_clamps``) only
asserts ``admin_fee <= cap + cent`` — a one-cent *upper-bound tolerance* that
would pass even if the output were a cent wrong or the ordering were swapped. The
concrete anchor pins values only on the **no-cap** path. So the cap clamp has no
penny-exact value oracle.

This synthesizes known ``(net, pro_rata, admin_pct, admin_cap)`` tuples (no cap on
the CAM share, no base year, no exclusions, no gross-up, no proration) so that
``admin_base == tenant_share_after_cap == round(net * pro_rata, 2)``, runs the
real calculation, and checks against an independent oracle:

    after    = round(net * pro_rata, 2)
    uncapped = after * admin_pct                       # unquantized product
    expected = round(min(uncapped, admin_cap), 2)      # clamp THEN quantize
    total    = after + expected

The strategy lets ``uncapped`` straddle the cap so both the cap-active
(``uncapped > cap``) and cap-inactive (``uncapped <= cap``) regimes are hit, with
exact equality asserted in both.

Run standalone:
    pytest tests/stress/test_admin_fee_cap_oracle_stress.py -q
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

import pytest
from hypothesis import given, settings
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


_net = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("3000000"), places=2, allow_nan=False
)
_ratio = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)
_fee_pct = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("0.5"), places=4, allow_nan=False
)
# A finite cap that frequently binds: small relative to typical uncapped fees.
_cap = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("100000"), places=2, allow_nan=False
)


@STRESS
@given(net=_net, pro_rata=_ratio, admin_pct=_fee_pct, admin_cap=_cap)
def test_admin_fee_cap_round_trips_exactly(net, pro_rata, admin_pct, admin_cap):
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin_pct,
        admin_fee_cap=admin_cap,
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=net,
            pool_breakdown={},
            current_year=2024,
        )
    )

    # admin_base == after (no admin exclusions); after == before (no cap).
    after = _q(net * pro_rata)
    uncapped = after * admin_pct  # unquantized product
    expected_admin = _q(min(uncapped, admin_cap))  # clamp THEN quantize
    expected_total = after + expected_admin

    assert result.tenant_share_after_cap == after
    assert result.admin_fee == expected_admin
    assert result.admin_fee <= admin_cap  # the cap is never exceeded
    assert result.total_recovery == expected_total


def test_admin_fee_cap_binds_below_uncapped():
    """When the uncapped fee exceeds the cap, the fee is exactly the cap."""
    # after 100000; uncapped = 100000 * 0.10 = 10000; cap 2500 -> fee 2500.
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=Decimal("1"),
        admin_fee_percentage=Decimal("0.10"),
        admin_fee_cap=Decimal("2500.00"),
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={},
            current_year=2024,
        )
    )
    assert result.admin_fee == Decimal("2500.00")
    assert result.total_recovery == Decimal("102500.00")


def test_admin_fee_cap_slack_passes_uncapped_fee_through():
    """A cap above the uncapped fee leaves the fee at the full percentage."""
    # after 100000; uncapped = 5000; cap 9999 (slack) -> fee 5000.
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=Decimal("1"),
        admin_fee_percentage=Decimal("0.05"),
        admin_fee_cap=Decimal("9999.00"),
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=Decimal("100000.00"),
            pool_breakdown={},
            current_year=2024,
        )
    )
    assert result.admin_fee == Decimal("5000.00")
    assert result.total_recovery == Decimal("105000.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
