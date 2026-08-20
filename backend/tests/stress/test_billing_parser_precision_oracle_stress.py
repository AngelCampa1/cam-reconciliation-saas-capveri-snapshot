"""Penny-exact (sub-penny actually) oracle for billing-parser amount precision.

``BillingParser.parse`` (billing.py:89-276) parses each retained billing row's
amount with **arbitrary-precision** ``Decimal`` and accumulates the running total
with NO quantize:

    amount_str   = str(raw).replace("$", "").replace(",", "").strip()   # strip currency
    # accounting-negative: "($1,234.56)" -> "-1234.56"
    if amount_str.startswith("(") and amount_str.endswith(")"):
        amount_str = "-" + amount_str[1:-1]
    amount       = Decimal(amount_str)        # full precision preserved, NOT 2dp
    if amount <= 0: continue                  # zero / negative dropped
    rows.append(BilledAmountRow(billed_amount=amount, ...))
    total_billed += amount                    # RAW accumulation, no rounding

``test_billing_parser_stress.py`` only ever feeds amounts rendered with ``:,.2f``
(``places=2``), so it never proves the parser preserves **sub-cent precision** in
either ``billed_amount`` or the accumulated ``total_billed`` — a multi-dp currency
string like ``$1,234.5678`` would expose any silent quantization or float coercion.

This drives the real parser with currency strings carrying 2-6 decimal places and
re-derives ``total_billed`` as the exact ``sum`` of the kept full-precision Decimals
(and each row's ``billed_amount``) with ``==`` (no tolerance). The accumulation
order is insertion order, which for ``sum`` of exact Decimals is associative, so the
total is order-independent and exact.

Run standalone:
    pytest tests/stress/test_billing_parser_precision_oracle_stress.py -q
"""

from __future__ import annotations

import csv
import io
from decimal import Decimal

import pytest
from hypothesis import assume, given, settings
from hypothesis import strategies as st

from app.services.ingestion.parsers.billing import BillingParser

STRESS = settings(max_examples=300, deadline=None)

# Amounts with 2-6 decimal places: the parser keeps full precision, so a sub-cent
# tail (e.g. .5678) must survive verbatim in billed_amount AND in the raw total.
_amount = st.decimals(
    min_value=Decimal("0.000001"),
    max_value=Decimal("100000"),
    places=6,
    allow_nan=False,
    allow_infinity=False,
)

# ``pandas.read_csv`` coerces these literal tokens to ``NaN``, so the parser
# legitimately reads such a cell as a null tenant and drops the row — a tenant
# named exactly "NA"/"NULL"/"NaN"/"None" cannot survive a CSV round trip. Exclude
# them by EXACT (case-insensitive) match so substrings like "Nancy" still pass.
_NA_SENTINELS = {"na", "nan", "null", "none"}

# A clean tenant name: letters/spaces, never a total/subtotal keyword (which the
# parser also drops), never a null sentinel, never empty.
_tenant = st.from_regex(r"[A-Za-z][A-Za-z ]{0,18}[A-Za-z]", fullmatch=True).filter(
    lambda s: s.strip().lower() not in _NA_SENTINELS
    and not any(w in s.lower() for w in ("total", "subtotal", "sum", "grand"))
)

_record = st.fixed_dictionaries(
    {
        "tenant": _tenant,
        "amount": _amount,
        # When True, render in accounting parentheses -> parsed negative -> dropped.
        "parens": st.booleans(),
        # Render with a $ and thousands separators, or bare.
        "dollar": st.booleans(),
    }
)


def _render(amount: Decimal, *, dollar: bool, parens: bool) -> str:
    # Keep all significant decimals (the seam: 2-6 dp must round-trip exactly).
    body = f"{amount:,f}" if dollar else format(amount, "f")
    if dollar:
        body = f"${body}"
    return f"({body})" if parens else body


@STRESS
@given(records=st.lists(_record, min_size=1, max_size=12))
def test_billing_total_preserves_subcent_precision_exactly(records):
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["tenant", "amount"])
    for r in records:
        writer.writerow(
            [r["tenant"], _render(r["amount"], dollar=r["dollar"], parens=r["parens"])]
        )

    # Oracle: only non-parenthesised (positive) rows are kept, at full precision.
    kept = [r["amount"] for r in records if not r["parens"]]
    assume(kept)  # parser returns success=False when nothing is retained

    result = BillingParser().parse(io.BytesIO(buf.getvalue().encode("utf-8")), "b.csv")

    assert result.success is True
    assert result.row_count == len(kept)
    # Per-row precision: the kept multiset of amounts round-trips verbatim.
    assert sorted(row.billed_amount for row in result.data) == sorted(kept)
    # Raw accumulation: total is the exact sum of the kept full-precision Decimals.
    assert result.total_billed == sum(kept, Decimal("0"))


def test_anchor_subcent_total_is_not_quantized():
    """Two 4-dp amounts sum to a 4-dp total with no rounding to the cent."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["tenant", "amount"])
    writer.writerow(["Acme", "1234.5678"])
    writer.writerow(["Beta", "0.0001"])
    result = BillingParser().parse(io.BytesIO(buf.getvalue().encode("utf-8")), "b.csv")
    assert result.success is True
    assert [r.billed_amount for r in result.data] == [
        Decimal("1234.5678"),
        Decimal("0.0001"),
    ]
    assert result.total_billed == Decimal("1234.5679")


def test_anchor_dollar_and_parentheses_negative_dropped():
    """A $-formatted positive is kept at full precision; a parens negative is dropped."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["tenant", "amount"])
    writer.writerow(["Acme", "$1,234.5678"])
    writer.writerow(["Beta", "($500.1234)"])
    result = BillingParser().parse(io.BytesIO(buf.getvalue().encode("utf-8")), "b.csv")
    assert result.success is True
    assert [(r.tenant_name, r.billed_amount) for r in result.data] == [
        ("Acme", Decimal("1234.5678"))
    ]
    assert result.total_billed == Decimal("1234.5678")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
