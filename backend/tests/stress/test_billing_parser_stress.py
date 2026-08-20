"""Property-based invariants for the actual-billed billing parser.

``ingestion/parsers/billing.py`` reads a landlord's CAM-reconciliation / billing
export and extracts what was *actually* billed to each tenant — the figure later
compared against CapVeri's calculation to surface leakage. The row loop encodes
several money-safety rules: currency formatting is stripped (``$``, thousands commas,
accounting parentheses for negatives), total/subtotal rows are dropped, blank/NaN
tenants are dropped, and only strictly-positive amounts are kept. A mistake here
mis-states the billed baseline and corrupts every downstream leakage number.

This drives the parser end-to-end through a real in-memory CSV (only the file is
synthetic — the parser runs for real, no mocks) and checks the output against an
independent oracle that replays the documented rules.

Invariants pinned here:

  * **Conservation** — ``total_billed`` equals the exact Decimal sum of the kept
    rows' amounts, and ``row_count == len(data)``.
  * **Positivity** — every retained ``billed_amount`` is strictly positive.
  * **Selection oracle** — the retained ``(tenant, amount)`` multiset equals the set
    the rules say to keep: non-blank tenant, not a total/subtotal/sum/grand row, a
    parseable positive amount (accounting-negative parentheses are dropped).
  * **Empty result fails closed** — when nothing survives the rules, ``success`` is
    False and ``data`` is empty (no silent zero-billed "success").

Run standalone:
    pytest tests/stress/test_billing_parser_stress.py -q
"""

from __future__ import annotations

import csv
import io
from decimal import Decimal

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.parsers.billing import BillingParser

STRESS = settings(
    max_examples=120,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# Real tenant names chosen to contain none of the skip substrings
# (total/subtotal/sum/grand), so only the explicit total-word rows are dropped.
_REAL_NAMES = ["Acme LLC", "Bravo Corp", "Cendant", "Delaware Co", "Echo Partners"]
_TOTAL_WORDS = ["Total", "Subtotal", "Grand Total", "SUM"]

_amount = st.decimals(
    min_value=Decimal("0"),
    max_value=Decimal("100000"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

_record = st.fixed_dictionaries(
    {
        # "" exercises the blank/NaN-tenant skip path.
        "tenant": st.sampled_from(_REAL_NAMES + _TOTAL_WORDS + [""]),
        "amount": _amount,
        # When True the amount is rendered in accounting parentheses -> negative -> dropped.
        "parens": st.booleans(),
    }
)


def _render_csv(records: list[dict]) -> bytes:
    """Render records as a quoted CSV the parser will accept (the thousands comma
    inside a money cell forces quoting, which is exactly what real exports do)."""
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["tenant", "amount", "suite"])
    for r in records:
        cell = f"${r['amount']:,.2f}"
        if r["parens"]:
            cell = f"(${r['amount']:,.2f})"
        writer.writerow([r["tenant"], cell, "100"])
    return buf.getvalue().encode("utf-8")


def _expected_kept(records: list[dict]) -> list[tuple[str, Decimal]]:
    """Independent oracle: replay the parser's documented keep/skip rules."""
    kept: list[tuple[str, Decimal]] = []
    for r in records:
        tenant = str(r["tenant"]).strip()
        if not tenant or tenant.lower() in ("nan", "none", ""):
            continue
        if any(w in tenant.lower() for w in ("total", "subtotal", "sum", "grand")):
            continue
        if r["parens"]:  # accounting-negative -> dropped
            continue
        if r["amount"] <= 0:
            continue
        kept.append((tenant, r["amount"]))
    return kept


@STRESS
@given(records=st.lists(_record, max_size=10))
def test_billing_selection_and_conservation(records):
    result = BillingParser().parse(io.BytesIO(_render_csv(records)), "billing.csv")
    expected = _expected_kept(records)

    if not expected:
        # Nothing survives the rules -> must fail closed, never a silent zero success.
        assert result.success is False
        assert result.data == []
        return

    assert result.success is True
    # row_count tracks the data list.
    assert result.row_count == len(result.data)

    got = sorted((row.tenant_name, row.billed_amount) for row in result.data)
    assert got == sorted(expected)

    # Conservation: the reported total is the exact Decimal sum of retained rows.
    assert result.total_billed == sum((amt for _, amt in expected), Decimal("0"))
    assert result.total_billed == sum(
        (row.billed_amount for row in result.data), Decimal("0")
    )

    # Positivity: every retained amount is strictly positive.
    assert all(row.billed_amount > 0 for row in result.data)


def test_currency_and_paren_cleaning_anchor():
    """A dollar-formatted positive amount is kept and cleaned; an accounting-negative
    in parentheses is dropped; a total row is dropped."""
    records = [
        {"tenant": "Acme LLC", "amount": Decimal("1234.56"), "parens": False},
        {
            "tenant": "Bravo Corp",
            "amount": Decimal("500.00"),
            "parens": True,
        },  # negative
        {"tenant": "Total", "amount": Decimal("1734.56"), "parens": False},  # total row
    ]
    result = BillingParser().parse(io.BytesIO(_render_csv(records)), "billing.csv")
    assert result.success is True
    assert [(r.tenant_name, r.billed_amount) for r in result.data] == [
        ("Acme LLC", Decimal("1234.56"))
    ]
    assert result.total_billed == Decimal("1234.56")


def test_no_valid_rows_fails_closed_anchor():
    """A file of only total rows and parenthesized negatives yields a closed failure."""
    records = [
        {"tenant": "Grand Total", "amount": Decimal("999.00"), "parens": False},
        {"tenant": "Acme LLC", "amount": Decimal("10.00"), "parens": True},
    ]
    result = BillingParser().parse(io.BytesIO(_render_csv(records)), "billing.csv")
    assert result.success is False
    assert result.data == []
    assert result.total_billed == Decimal("0")


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
