"""End-to-end value-correctness invariants for the Yardi rent-roll parser.

Yardi Voyager rent-roll exports carry a header preamble (``Property:`` /
``Address:`` lines) above the real column header, and — unlike the generic/MRI
rent-roll parsers, which auto-detect percentage vs. decimal cam-share with a
``>1`` heuristic — Yardi reads ``Pro Rata Share`` straight through
``_get_decimal_value(precision=4)`` with **no** percentage division. So a stored
``0.0523`` stays ``0.0523``. That distinct contract, the property-metadata /
address extraction, and the multi-line header skip are all unpinned for value
correctness; the fuzz suite only proves no-crash.

This synthesizes a well-formed Yardi rent-roll CSV (Voyager banner, Property /
Address metadata lines, then the column header and data rows with sqft/rent
rendered in real ERP currency styles) and checks the parsed result against the
generating values as an independent oracle.

Invariants pinned here:

  * **Property metadata** — ``Property:`` name and the comma-split
    ``Address:`` line resolve to the expected name / line1 / city / state / zip.
  * **Penny-exact sqft & rent** — every ``rentable_sqft`` / ``base_rent``
    round-trips to the cent across rendered styles.
  * **Cam-share passthrough** — ``cam_share`` equals the stored 4-dp decimal
    with no division (the Yardi-specific contract).
  * **Lease dates & identity** — ISO lease start/end and unit/tenant names
    round-trip exactly.
  * **Row conservation** — unique units with valid sqft yield one unit per row.

Plus anchors: a total/summary row is skipped, a duplicate unit keeps the first,
and the no-division cam-share contract is asserted on a > 1 value.

Run standalone:
    pytest tests/stress/test_yardi_rent_roll_value_correctness_stress.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from io import BytesIO

import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.parsers.yardi_rent_roll import YardiRentRollParser

STRESS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_PREAMBLE = (
    "Yardi Voyager Rent Roll\n"
    "Property: Demo Plaza\n"
    "Address: 123 Main St, Austin, TX 78701\n"
)


def _money(cents: int, style: str) -> str:
    body = f"{Decimal(cents) / 100:,.2f}"
    return f"${body}" if style == "dollar" else body


_row = st.fixed_dictionaries(
    {
        "unit": st.from_regex(r"U[0-9]{1,5}", fullmatch=True),
        "sqft_cents": st.integers(min_value=100, max_value=9_999_999),
        "rent_cents": st.integers(min_value=0, max_value=9_999_999),
        # Pro-rata share stored as 4-dp decimal (0.0000 .. 0.9999).
        "share_bps": st.integers(min_value=0, max_value=9999),
        # Exclude pandas default NA sentinels (NA / NULL / NaN / None): the CSV
        # reader coerces them to NaN before the parser sees them, so a tenant
        # literally named one of these is correctly read as vacant (None).
        "tenant": st.from_regex(r"[A-Za-z][A-Za-z]{0,9}", fullmatch=True).filter(
            lambda s: s.lower() not in {"na", "null", "nan", "none"}
        ),
        "start": st.dates(min_value=date(1995, 1, 1), max_value=date(2098, 12, 31)),
        "end": st.dates(min_value=date(1995, 1, 1), max_value=date(2098, 12, 31)),
        "style": st.sampled_from(["plain", "dollar"]),
    }
)


@STRESS
@given(rows=st.lists(_row, min_size=1, max_size=10, unique_by=lambda r: r["unit"]))
def test_well_formed_yardi_rent_roll_round_trips_exactly(rows):
    frame = pd.DataFrame(
        {
            "Unit": [r["unit"] for r in rows],
            "Suite SF": [_money(r["sqft_cents"], r["style"]) for r in rows],
            "Tenant Name": [r["tenant"] for r in rows],
            "Lease Start": [r["start"].isoformat() for r in rows],
            "Lease End": [r["end"].isoformat() for r in rows],
            "Monthly Rent": [_money(r["rent_cents"], r["style"]) for r in rows],
            "Pro Rata Share": [f"{Decimal(r['share_bps']) / 10000:.4f}" for r in rows],
        }
    )
    full = _PREAMBLE + frame.to_csv(index=False)
    buf = BytesIO(full.encode("utf-8"))

    result = YardiRentRollParser().parse(buf, "rent_roll.csv")

    assert result.success is True
    assert result.row_count == len(rows)
    assert len(result.units) == len(rows)

    # Header preamble resolves to the expected property metadata.
    meta = result.property_metadata
    assert meta.name == "Demo Plaza"
    assert meta.address_line1 == "123 Main St"
    assert meta.city == "Austin"
    assert meta.state == "TX"
    assert meta.postal_code == "78701"

    by_unit = {u.unit_number: u for u in result.units}
    assert set(by_unit) == {r["unit"] for r in rows}

    for r in rows:
        unit = by_unit[r["unit"]]
        assert unit.rentable_sqft == (Decimal(r["sqft_cents"]) / 100).quantize(
            Decimal("0.01")
        )
        assert unit.base_rent == (Decimal(r["rent_cents"]) / 100).quantize(
            Decimal("0.01")
        )
        # Yardi-specific: no percentage division; stored 4-dp decimal passes through.
        assert unit.cam_share == (Decimal(r["share_bps"]) / 10000).quantize(
            Decimal("0.0001")
        )
        assert unit.tenant_name == r["tenant"]
        assert unit.lease_start == r["start"]
        assert unit.lease_end == r["end"]


def test_total_row_is_skipped():
    csv = (
        "Property: Demo Plaza\n"
        "Unit,Suite SF,Tenant Name,Monthly Rent\n"
        "U100,1000.00,Acme,2500.00\n"
        "Total,5000.00,,9999.00\n"
    )
    result = YardiRentRollParser().parse(BytesIO(csv.encode("utf-8")), "rr.csv")
    assert result.success is True
    assert [u.unit_number for u in result.units] == ["U100"]


def test_duplicate_unit_keeps_first():
    csv = (
        "Unit,Suite SF,Tenant Name,Monthly Rent\n"
        "U100,1000.00,First,2500.00\n"
        "U100,2000.00,Second,9999.00\n"
    )
    result = YardiRentRollParser().parse(BytesIO(csv.encode("utf-8")), "rr.csv")
    assert result.success is True
    assert len(result.units) == 1
    assert result.units[0].tenant_name == "First"


def test_cam_share_is_not_divided():
    """A Pro Rata Share > 1 passes through undivided (Yardi contract)."""
    csv = "Unit,Suite SF,Pro Rata Share\n" "U100,1000.00,5.2300\n"
    result = YardiRentRollParser().parse(BytesIO(csv.encode("utf-8")), "rr.csv")
    assert result.success is True
    assert result.units[0].cam_share == Decimal("5.2300")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
