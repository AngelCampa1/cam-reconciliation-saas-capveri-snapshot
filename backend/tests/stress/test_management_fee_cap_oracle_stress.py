"""Penny-exact oracle for the management-fee cap flowing into ``total_recovery``.

``management_fee_percentage`` is a CAP on the recoverable management-fee pool —
not an add-on. ``calculate_tenant_share`` (tenant_share.py) caps it in Step 0 via
``_apply_management_fee_cap`` and removes the excess from the recoverable total
*before* any tenant-level math:

    operating_base = Σ amount for operating-type pools EXCLUDING the fee pool(s)
    cap            = max(0, round(rate * operating_base, 2))      # tenant_share.py:332-335
    booked_fee     = Σ amount for management-fee pool(s)
    excess         = max(0, booked_fee - cap)
    net            = total_recoverable_expenses - excess          # line 451
    before         = round(net * pro_rata, 2)                     # line 517-519
    admin          = round(before * admin_pct, 2)                 # line 686-689
    total          = before + admin                               # line 706

The helper ``_apply_management_fee_cap`` is unit-tested in isolation
(``test_tenant_share_helpers_stress.py`` asserts only the returned ``excess`` and
no-mutation) — **but no test drives ``calculate_tenant_share`` with a
``management_fee_percentage`` set and re-derives ``total_recovery`` penny-exact.**
The downstream cap-quantize → scalar-subtract → pro-rata-quantize → admin chain
has no value oracle at all (not even a tolerance band).

This synthesizes a three-pool property (one ``Management Fee`` operating pool, one
plain operating pool, one tax pool) with no exclusions, no base year, no cap, no
proration, no expense stops — so the management-fee cap is the only non-trivial
seam — and checks the real calculation against an independent oracle. The strategy
lets the booked fee straddle the cap so both the cap-binding (``fee > cap``) and
cap-slack (``fee <= cap``, ``excess == 0``) regimes are exercised.

Run standalone:
    pytest tests/stress/test_management_fee_cap_oracle_stress.py -q
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


_amount = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("2000000"), places=2, allow_nan=False
)
_ratio = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("1"), places=4, allow_nan=False
)
_fee_pct = st.decimals(
    min_value=Decimal("0"), max_value=Decimal("0.5"), places=4, allow_nan=False
)
# Management-fee cap rate: a common 3-5% range, widened so the cap straddles the
# booked fee (both binding and slack regimes).
_mgmt_rate = st.decimals(
    min_value=Decimal("0.01"), max_value=Decimal("0.5"), places=4, allow_nan=False
)


@STRESS
@given(
    fee_amt=_amount,
    op_amt=_amount,
    tax_amt=_amount,
    mgmt_rate=_mgmt_rate,
    pro_rata=_ratio,
    admin_pct=_fee_pct,
)
def test_management_fee_cap_round_trips_exactly(
    fee_amt, op_amt, tax_amt, mgmt_rate, pro_rata, admin_pct
):
    pool_breakdown = {
        "Management Fee": fee_amt,
        "cam operating": op_amt,
        "taxes": tax_amt,
    }
    pool_types = {
        "Management Fee": "operating",
        "cam operating": "operating",
        "taxes": "tax",
    }
    total = fee_amt + op_amt + tax_amt

    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="T",
        pro_rata_share=pro_rata,
        admin_fee_percentage=admin_pct,
        management_fee_percentage=mgmt_rate,
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

    # Independent oracle: cap base = operating pools excluding the fee pool.
    operating_base = op_amt  # only "cam operating" is operating-and-not-fee
    cap = max(Decimal("0"), _q(mgmt_rate * operating_base))
    booked_fee = fee_amt
    excess = max(Decimal("0"), booked_fee - cap)
    net = total - excess
    before = _q(net * pro_rata)
    admin = _q(before * admin_pct)
    expected_total = before + admin

    assert result.tenant_share_before_cap == before
    assert result.tenant_share_after_cap == before
    assert result.admin_fee == admin
    assert result.total_recovery == expected_total


def test_overbooked_fee_clamped_to_cap():
    """A management fee booked above the cap is reduced to the cap exactly."""
    # operating base 200000; rate 5% -> cap 10000. booked fee 30000 -> excess 20000.
    # net = (30000 + 200000) - 20000 = 210000; pro_rata 1 -> share 210000; no admin.
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="Solo",
        pro_rata_share=Decimal("1"),
        admin_fee_percentage=Decimal("0"),
        management_fee_percentage=Decimal("0.05"),
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=Decimal("230000.00"),
            pool_breakdown={
                "Management Fee": Decimal("30000.00"),
                "cam operating": Decimal("200000.00"),
            },
            pool_types={
                "Management Fee": "operating",
                "cam operating": "operating",
            },
            current_year=2024,
        )
    )
    assert result.tenant_share_before_cap == Decimal("210000.00")
    assert result.total_recovery == Decimal("210000.00")


def test_fee_within_cap_passes_through_untouched():
    """A fee at or below the cap removes no excess; the full total is recoverable."""
    # operating base 200000; rate 5% -> cap 10000. booked fee 8000 <= cap -> excess 0.
    terms = LeaseTerms(
        lease_id=UUID(int=0),
        tenant_name="Solo",
        pro_rata_share=Decimal("1"),
        admin_fee_percentage=Decimal("0.10"),
        management_fee_percentage=Decimal("0.05"),
        cap_type=CapType.NONE,
    )
    result = calculate_tenant_share(
        TenantShareInput(
            lease_terms=terms,
            total_recoverable_expenses=Decimal("208000.00"),
            pool_breakdown={
                "Management Fee": Decimal("8000.00"),
                "cam operating": Decimal("200000.00"),
            },
            pool_types={
                "Management Fee": "operating",
                "cam operating": "operating",
            },
            current_year=2024,
        )
    )
    # No excess removed -> share 208000; admin 10% -> 20800; total 228800.
    assert result.tenant_share_before_cap == Decimal("208000.00")
    assert result.admin_fee == Decimal("20800.00")
    assert result.total_recovery == Decimal("228800.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
