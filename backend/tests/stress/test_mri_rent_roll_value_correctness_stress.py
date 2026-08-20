"""End-to-end value-correctness invariants for the MRI rent-roll parser.

MRI Software rent-roll exports differ from the Yardi variant in two ways this
suite pins: (1) property metadata is spread across **separate** labelled lines
(``Property Name:`` / ``Address:`` / ``City:`` / ``State:`` / ``Zip:``) rather
than one comma-split address line, and (2) ``CAM %`` is stored in **percentage**
form and converted to a decimal fraction (``5.23`` → ``0.0523``) via the ``>1``
heuristic — the opposite of Yardi's straight passthrough. The fuzz suite only
proves no-crash; nothing pins these value contracts end to end.

This synthesizes a well-formed MRI rent-roll CSV (labelled metadata preamble,
header, then data rows with sqft/rent in real ERP currency styles and CAM in
percentage form) and checks the parsed result against the generating values as
an independent oracle.

Invariants pinned here:

  * **Multi-line property metadata** — each labelled line resolves to the
    matching name / address / city / state / zip field.
  * **Penny-exact sqft & rent** — ``rentable_sqft`` / ``base_rent`` round-trip
    to the cent across rendered styles.
  * **CAM percentage→decimal** — a ``> 1`` ``CAM %`` value is divided by 100 and
    quantized to 4 dp (the MRI contract).
  * **Vacant rule** — zero rent with no tenant yields ``base_rent`` ``None``.
  * **Dates & identity** — ISO lease start/end and unit/tenant round-trip.
  * **Row conservation** — unique units with valid sqft yield one unit per row.

Plus anchors: total-row skipping and first-wins duplicate dedup.

Run standalone:
    pytest tests/stress/test_mri_rent_roll_value_correctness_stress.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from io import BytesIO

import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.parsers.mri_rent_roll import MRIRentRollParser

STRESS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_PREAMBLE = (
    "MRI Software Rent Roll\n"
    "Property Name: Demo Plaza\n"
    "Address: 123 Main St\n"
    "City: Austin\n"
    "State: TX\n"
    "Zip: 78701\n"
)


def _money(cents: int, style: str) -> str:
    body = f"{Decimal(cents) / 100:,.2f}"
    return f"${body}" if style == "dollar" else body


# ``pandas.read_csv`` coerces these literal tokens to ``NaN`` by default, so the
# parser legitimately reads such a cell as "no tenant" (``tenant_name=None``) —
# the correct, desirable behaviour for real ERP exports where "NA"/"NULL" ARE
# missing-value sentinels. A tenant truly named "NA" cannot survive a CSV round
# trip through any pandas-based parser, so we exclude these from the generator
# (letters-only regex can only emit the alpha members of pandas' na_values set).
_NA_SENTINELS = {"na", "nan", "null", "none"}

_row = st.fixed_dictionaries(
    {
        "unit": st.from_regex(r"U[0-9]{1,5}", fullmatch=True),
        "sqft_cents": st.integers(min_value=100, max_value=9_999_999),
        "rent_cents": st.integers(min_value=0, max_value=9_999_999),
        # CAM stored as a percentage > 1 (1.01% .. 99.99%); MRI divides by 100.
        "cam_pct_bps": st.integers(min_value=101, max_value=9999),
        "tenant": st.one_of(
            st.none(),
            st.from_regex(r"[A-Za-z][A-Za-z]{0,9}", fullmatch=True).filter(
                lambda s: s.lower() not in _NA_SENTINELS
            ),
        ),
        "start": st.dates(min_value=date(1995, 1, 1), max_value=date(2098, 12, 31)),
        "end": st.dates(min_value=date(1995, 1, 1), max_value=date(2098, 12, 31)),
        "style": st.sampled_from(["plain", "dollar"]),
    }
)


@STRESS
@given(rows=st.lists(_row, min_size=1, max_size=10, unique_by=lambda r: r["unit"]))
def test_well_formed_mri_rent_roll_round_trips_exactly(rows):
    frame = pd.DataFrame(
        {
            "Unit Code": [r["unit"] for r in rows],
            "RSF": [_money(r["sqft_cents"], r["style"]) for r in rows],
            "Tenant Name": [
                r["tenant"] if r["tenant"] is not None else "" for r in rows
            ],
            "Start Date": [r["start"].isoformat() for r in rows],
            "End Date": [r["end"].isoformat() for r in rows],
            "Base Rent": [_money(r["rent_cents"], r["style"]) for r in rows],
            "CAM %": [f"{Decimal(r['cam_pct_bps']) / 100:.2f}" for r in rows],
        }
    )
    full = _PREAMBLE + frame.to_csv(index=False)
    buf = BytesIO(full.encode("utf-8"))

    result = MRIRentRollParser().parse(buf, "rent_roll.csv")

    assert result.success is True
    assert result.row_count == len(rows)
    assert len(result.units) == len(rows)

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
        # MRI-specific: percentage divided by 100 to a 4-dp decimal fraction.
        assert unit.cam_share == (Decimal(r["cam_pct_bps"]) / 10000).quantize(
            Decimal("0.0001")
        )
        assert unit.lease_start == r["start"]
        assert unit.lease_end == r["end"]

        expected_rent = (Decimal(r["rent_cents"]) / 100).quantize(Decimal("0.01"))
        if r["rent_cents"] == 0 and r["tenant"] is None:
            assert unit.base_rent is None
        else:
            assert unit.base_rent == expected_rent
        assert unit.tenant_name == r["tenant"]


def test_total_row_is_skipped():
    csv = (
        "Property Name: Demo Plaza\n"
        "Unit Code,RSF,Tenant Name,Base Rent\n"
        "U100,1000.00,Acme,2500.00\n"
        "Total,5000.00,,9999.00\n"
    )
    result = MRIRentRollParser().parse(BytesIO(csv.encode("utf-8")), "rr.csv")
    assert result.success is True
    assert [u.unit_number for u in result.units] == ["U100"]


def test_duplicate_unit_keeps_first():
    csv = (
        "Unit Code,RSF,Tenant Name,Base Rent\n"
        "U100,1000.00,First,2500.00\n"
        "U100,2000.00,Second,9999.00\n"
    )
    result = MRIRentRollParser().parse(BytesIO(csv.encode("utf-8")), "rr.csv")
    assert result.success is True
    assert len(result.units) == 1
    assert result.units[0].tenant_name == "First"


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
