"""Property-based stress for the MRI fixed-width ERP export.

BUG CLASS (FINDING-S13)
-----------------------
``MRIFormatter`` (``app/api/v1/exports.py``) hand-rolls a fixed-width record
(no ``csv`` module to quote anything). A property name is the only user-derived
field and is imported verbatim from a Yardi/MRI CSV. Two failure modes:

  * a line break (``\\n``/``\\r``) in the name splits one logical record across
    multiple physical lines — record injection / file corruption;
  * a tab or other control char inside a fixed-width column destroys column
    alignment for every byte-offset-oriented downstream importer.

The fix strips C0 control chars from the property name BEFORE it is sliced into
the 10-char Property column (``csv_safety.strip_control_chars``).

Invariants asserted for ANY generated input within the realistic CAM amount
domain:
  * each snapshot emits exactly two physical lines (a balanced debit/credit
    journal pair) — never more, regardless of the property name;
  * every emitted line is exactly 98 characters wide (10+10+10+15+30+15+8), so
    the columns stay aligned;
  * the debit and credit amounts read back out of the fixed Amount column equal
    the Decimal recovery and its negation.

Run standalone:
    pytest tests/stress/test_mri_fixed_width_stress.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.api.v1.exports import MRIFormatter

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_LINE_WIDTH = 10 + 10 + 10 + 15 + 30 + 15 + 8  # 98

# Property text rich in the chars that break a hand-rolled fixed-width record:
# line breaks, tabs, other control bytes, plus benign ASCII and multibyte text.
_FRAGMENTS = list("abc 0123") + [
    "\n",
    "\r",
    "\r\n",
    "\t",
    chr(0),
    chr(11),
    chr(31),
    chr(127),
    "Tower",
    "Café",  # multibyte, must not raise
    "大厦",  # CJK
]
adversarial_name = st.lists(st.sampled_from(_FRAGMENTS), min_size=0, max_size=10).map(
    "".join
)

# Realistic single-tenant CAM recovery band: fits the 15-char Amount column.
money = st.decimals(
    min_value=Decimal("-9999999.99"),
    max_value=Decimal("9999999.99"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)


def _snapshot(name: str, amount: Decimal) -> dict:
    return {
        "properties": {"name": name},
        "lease_id": "11111111-2222-3333-4444-555555555555",
        "period_start_date": date(2024, 1, 1),
        "period_end_date": date(2024, 12, 31),
        "total_recovery": amount,
    }


@STRESS
@given(name=adversarial_name, amount=money)
def test_mri_record_stays_one_pair_of_aligned_lines(name, amount):
    buf = MRIFormatter([_snapshot(name, amount)]).generate()
    text = buf.getvalue()

    # Exactly two physical lines — a control char in the name must not inject
    # extra records by splitting on an embedded newline.
    lines = text.split("\n")
    assert lines[-1] == "", "output should end with a trailing newline"
    records = lines[:-1]
    assert len(records) == 2, f"expected 1 debit + 1 credit line, got {len(records)}"

    # Columns stay aligned: every record is exactly the fixed width.
    for line in records:
        assert len(line) == _LINE_WIDTH, f"misaligned record width {len(line)}"
        # No stray control characters survived into the record.
        assert not any(ord(c) < 0x20 or ord(c) == 0x7F for c in line)

    # The Amount column (chars 30..45) round-trips the Decimal and its negation.
    debit_amount = Decimal(records[0][30:45].strip())
    credit_amount = Decimal(records[1][30:45].strip())
    assert debit_amount == amount.quantize(Decimal("0.01"))
    assert credit_amount == (-amount).quantize(Decimal("0.01"))


@STRESS
@given(
    names=st.lists(adversarial_name, min_size=0, max_size=4),
)
def test_mri_line_count_is_two_per_snapshot(names):
    snapshots = [_snapshot(n, Decimal("100.00")) for n in names]
    buf = MRIFormatter(snapshots).generate()
    records = [ln for ln in buf.getvalue().split("\n") if ln != ""]
    assert len(records) == 2 * len(names)
    for line in records:
        assert len(line) == _LINE_WIDTH


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
