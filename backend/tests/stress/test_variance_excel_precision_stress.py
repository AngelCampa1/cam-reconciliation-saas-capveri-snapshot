"""Property-based stress for the variance Excel export.

Covers two invariants of ``app.api.v1.export._generate_variance_excel``:

CRASH SURVIVAL (FINDING-S11, twin of FINDING-S08/S09)
-----------------------------------------------------
A property name carrying a stray XML-illegal control byte (reachable from a
messy Yardi/MRI CSV import) was written verbatim into cell ``A1``, making
openpyxl raise ``IllegalCharacterError`` and crash the whole tenant-facing
variance export. The fix strips those control chars with the openpyxl
``ILLEGAL_CHARACTERS_RE`` before writing. We assert the generator never raises
on adversarial property text and always returns a real ``.xlsx`` (``PK\\x03\\x04``).

MONEY PRECISION
---------------
The money cells are summed with ``Decimal`` and written via ``float()`` so
spreadsheet users can re-compute against them. We assert the values read back
out of the workbook match the exact ``Decimal`` computation to within half a
cent — i.e. the ``float`` coercion introduces no cent-level display error.

Run standalone:
    pytest tests/stress/test_variance_excel_precision_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal
from io import BytesIO

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st
from openpyxl import load_workbook

from app.api.v1.export import _generate_variance_excel

STRESS = settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# Property text that frequently contains XML-illegal control bytes plus the
# markup/ampersand characters that trip sibling serialization boundaries.
_FRAGMENTS = list("abc 0123<>&/") + [
    "</b>",
    "<i",
    chr(31),
    chr(0),
    chr(11),
    "&amp;",
    "<unclosed",
    "Tom <Jerry",
    "Building <A>",
    "AT&T Tower",
]
adversarial_name = st.lists(st.sampled_from(_FRAGMENTS), min_size=0, max_size=8).map(
    "".join
)

money = st.decimals(
    min_value=Decimal("-99999.99"),
    max_value=Decimal("99999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


def _snapshots(amounts: list[Decimal]) -> list[dict]:
    return [{"total_recovery": a} for a in amounts]


@STRESS
@given(name=adversarial_name)
def test_variance_excel_survives_adversarial_property_name(name):
    buf = _generate_variance_excel(
        snapshots_current=_snapshots([Decimal("100.00")]),
        snapshots_prior=_snapshots([Decimal("50.00")]),
        current_year=2024,
        prior_year=2023,
        threshold_percent=10.0,
        property_data={"name": name},
    )
    assert isinstance(buf, BytesIO)
    data = buf.getvalue()
    assert data.startswith(b"PK\x03\x04"), "expected a real .xlsx (zip) container"


@STRESS
@given(
    current=st.lists(money, min_size=0, max_size=6),
    prior=st.lists(money, min_size=0, max_size=6),
)
def test_variance_excel_money_cells_match_decimal_to_the_cent(current, prior):
    current_total = sum(current, Decimal("0"))
    prior_total = sum(prior, Decimal("0"))

    buf = _generate_variance_excel(
        snapshots_current=_snapshots(current),
        snapshots_prior=_snapshots(prior),
        current_year=2024,
        prior_year=2023,
        threshold_percent=10.0,
        property_data={"name": "Acme Tower"},
    )
    sheet = load_workbook(buf).active

    # Current total -> B5, prior total -> B6 (header_row=4, +1 / +2).
    read_current = Decimal(str(sheet["B5"].value))
    read_prior = Decimal(str(sheet["B6"].value))
    half_cent = Decimal("0.005")
    assert abs(read_current - current_total) <= half_cent
    assert abs(read_prior - prior_total) <= half_cent

    # Variance fraction -> C6, stored as value/100 for a "0.00%" format.
    if prior_total != 0:
        expected_fraction = (current_total - prior_total) / prior_total
        read_fraction = Decimal(str(sheet["C6"].value))
        # Display precision is two decimals of a percentage = 1e-4 of a fraction.
        assert abs(read_fraction - expected_fraction) <= Decimal("0.00005")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
