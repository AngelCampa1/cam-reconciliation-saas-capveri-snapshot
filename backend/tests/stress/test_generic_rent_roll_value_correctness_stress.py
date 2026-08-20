"""End-to-end value-correctness invariants for the Generic rent-roll parser.

The rent roll is the denominator side of every CAM reconciliation: each unit's
``rentable_sqft`` is what a tenant's pro-rata share is weighed against, so a
square-footage slip here silently mis-bills every tenant in the building. The
existing aggregation stress (``test_rent_roll_aggregation_stress.py``) builds
``RentRollRow`` objects directly to exercise cam-share normalization and the
sqft sum; nothing drives the full ``GenericRentRollParser.parse`` row path on
currency-formatted input or pins its structural row rules.

This synthesizes a well-formed rent-roll CSV from known (unit, sqft-cents,
rent-cents, tenant?, render-style) tuples — with sqft/rent rendered in real ERP
currency styles (plain, ``$1,234.50``, ``1,234.50``) — parses it, and checks the
parsed units against the generating values as an independent oracle.

Invariants pinned here:

  * **Penny-exact sqft & rent** — every parsed ``rentable_sqft`` / ``base_rent``
    equals the generating value to the cent, across all rendered styles.
  * **Row conservation** — with unique unit numbers and a valid sqft on every
    row, ``parse`` returns exactly one unit per input row (no silent drop/dupe).
  * **Unit/tenant fidelity** — unit numbers and tenant names round-trip exactly.
  * **Vacant rule** — a row with zero rent and no tenant yields ``base_rent``
    ``None`` (vacancy), while zero rent with a tenant stays ``0.00``.

Plus anchors for the structural rules: total/summary rows are skipped and a
duplicate unit number keeps only the first occurrence.

Run standalone:
    pytest tests/stress/test_generic_rent_roll_value_correctness_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal
from io import BytesIO

import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.parsers.generic_rent_roll import GenericRentRollParser

STRESS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)


def _money(cents: int, style: str) -> str:
    """Render non-negative cents in an ERP currency style."""
    body = f"{Decimal(cents) / 100:,.2f}"
    return f"${body}" if style == "dollar" else body


# A rent-roll row: unit number (letter-prefixed so the CSV column stays string,
# never float-coerced), rentable sqft cents (>= 1.00 so it is a valid sqft and
# the row is kept), base-rent cents (0 allowed), whether a tenant occupies it,
# and a render style for the numeric columns.
_row = st.fixed_dictionaries(
    {
        "unit": st.from_regex(r"U[0-9]{1,5}", fullmatch=True),
        "sqft_cents": st.integers(min_value=100, max_value=9_999_999),
        "rent_cents": st.integers(min_value=0, max_value=9_999_999),
        "tenant": st.one_of(
            st.none(), st.from_regex(r"[A-Za-z][A-Za-z]{0,9}", fullmatch=True)
        ),
        "style": st.sampled_from(["plain", "dollar"]),
    }
)


@STRESS
@given(rows=st.lists(_row, min_size=1, max_size=12, unique_by=lambda r: r["unit"]))
def test_well_formed_rent_roll_round_trips_exactly(rows):
    frame = pd.DataFrame(
        {
            "Unit": [r["unit"] for r in rows],
            "Rentable SF": [_money(r["sqft_cents"], r["style"]) for r in rows],
            "Tenant": [r["tenant"] if r["tenant"] is not None else "" for r in rows],
            "Base Rent": [_money(r["rent_cents"], r["style"]) for r in rows],
        }
    )
    buf = BytesIO()
    frame.to_csv(buf, index=False)
    buf.seek(0)

    result = GenericRentRollParser().parse(buf, "rent_roll.csv")

    # Row conservation: unique units, valid sqft on every row, no total rows.
    assert result.success is True
    assert result.row_count == len(rows)
    assert len(result.units) == len(rows)

    # parse preserves input order; index by unit number to be robust regardless.
    by_unit = {u.unit_number: u for u in result.units}
    assert set(by_unit) == {r["unit"] for r in rows}

    for r in rows:
        unit = by_unit[r["unit"]]
        expected_sqft = (Decimal(r["sqft_cents"]) / 100).quantize(Decimal("0.01"))
        assert unit.rentable_sqft == expected_sqft

        expected_tenant = r["tenant"]
        assert unit.tenant_name == expected_tenant

        expected_rent = (Decimal(r["rent_cents"]) / 100).quantize(Decimal("0.01"))
        # Vacant rule: zero rent AND no tenant -> None; otherwise the exact value.
        if r["rent_cents"] == 0 and expected_tenant is None:
            assert unit.base_rent is None
        else:
            assert unit.base_rent == expected_rent


def test_total_row_is_skipped():
    """A 'Total' summary row must not be parsed as a unit."""
    csv = (
        "Unit,Rentable SF,Tenant,Base Rent\n"
        "U100,1000.00,Acme,2500.00\n"
        "Total,1000.00,,2500.00\n"
    )
    result = GenericRentRollParser().parse(BytesIO(csv.encode("utf-8")), "rr.csv")
    assert result.success is True
    assert [u.unit_number for u in result.units] == ["U100"]


def test_duplicate_unit_keeps_first():
    """A repeated unit number keeps only the first occurrence."""
    csv = (
        "Unit,Rentable SF,Tenant,Base Rent\n"
        "U100,1000.00,First,2500.00\n"
        "U100,2000.00,Second,9999.00\n"
    )
    result = GenericRentRollParser().parse(BytesIO(csv.encode("utf-8")), "rr.csv")
    assert result.success is True
    assert len(result.units) == 1
    assert result.units[0].tenant_name == "First"
    assert result.units[0].rentable_sqft == Decimal("1000.00")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
