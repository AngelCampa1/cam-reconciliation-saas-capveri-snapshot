"""End-to-end value-correctness invariants for the MRI rent-roll parser.

MRI exports carry a fiscal PERIOD column (``YYYY-MM`` or ``MM/YYYY``) plus
separate Debit/Credit columns. The parser combines debit/credit into a signed
``amount`` and derives ``period_year`` / ``period_month`` and a first-of-month
``transaction_date`` from the PERIOD string. A bug in the period parsing
mis-buckets a GL line into the wrong fiscal month (corrupting period rollups),
and a debit/credit slip inverts the amount. The fuzz suite only proves no-crash;
this pins value correctness.

This synthesizes well-formed MRI CSVs from known (account, debit, credit, year,
month, period-format) tuples and checks the parsed frame against the generating
values as an independent oracle. Periods are constrained to valid ranges (year
1990-2100, month 1-12) and net amounts to non-zero so every row clears the
parser's validation/zero-amount filters, giving an exact row-conservation oracle.

Invariants pinned here:

  * **Signed combination** — every parsed ``amount`` equals ``debit - credit`` to
    the cent.
  * **Period derivation** — both ``YYYY-MM`` and ``MM/YYYY`` PERIOD renderings
    yield the correct ``period_year`` / ``period_month`` and a
    first-of-month ``transaction_date``.
  * **Row conservation** — no row is dropped; ``row_count`` equals the number of
    data rows and the parse succeeds.

Run standalone:
    pytest tests/stress/test_mri_parser_value_correctness_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal
from io import BytesIO

import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.parsers.mri import MRIRentRollParser

STRESS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_PROP = "33333333-3333-3333-3333-333333333333"


def _money(cents: int) -> str:
    return f"{Decimal(cents) / 100:,.2f}"


def _period(year: int, month: int, fmt: str) -> str:
    return f"{year:04d}-{month:02d}" if fmt == "iso" else f"{month:02d}/{year:04d}"


_row = st.fixed_dictionaries(
    {
        "acct": st.from_regex(r"[1-9][0-9]{2,4}", fullmatch=True),
        "debit": st.integers(min_value=0, max_value=50_000_000),
        "credit": st.integers(min_value=0, max_value=50_000_000),
        "year": st.integers(min_value=1990, max_value=2100),
        "month": st.integers(min_value=1, max_value=12),
        "fmt": st.sampled_from(["iso", "slash"]),
    }
)


@STRESS
@given(rows=st.lists(_row, min_size=1, max_size=10))
def test_mri_amount_and_period_round_trip(rows):
    # Non-zero net so no row hits the zero-amount filter.
    rows = [r for r in rows if r["debit"] != r["credit"]]
    if not rows:
        return

    header = "MRI Rent Roll Export\nPeriod,Account,Description,Debit,Credit\n"
    body = "".join(
        f'"{_period(r["year"], r["month"], r["fmt"])}",{r["acct"]},Line,'
        f'"{_money(r["debit"])}","{_money(r["credit"])}"\n'
        for r in rows
    )
    buf = BytesIO((header + body).encode("utf-8"))

    result = MRIRentRollParser().parse(buf, "mri.csv", _PROP)

    assert result.success is True
    assert result.row_count == len(rows)
    assert len(result.data) == len(rows)

    out = result.data.reset_index(drop=True)
    for i, r in enumerate(rows):
        expected_amt = float((Decimal(r["debit"]) - Decimal(r["credit"])) / 100)
        assert round(float(out["amount"].iloc[i]), 2) == round(expected_amt, 2)
        assert str(out["account_code"].iloc[i]) == r["acct"]
        # Period derived from the PERIOD string, in either rendering.
        assert int(out["period_year"].iloc[i]) == r["year"]
        assert int(out["period_month"].iloc[i]) == r["month"]
        # transaction_date is the first of that fiscal month.
        assert out["transaction_date"].iloc[i] == pd.Timestamp(r["year"], r["month"], 1)


def test_mm_yyyy_period_is_month_first():
    """MM/YYYY must read month-first, not as YYYY-MM transposed."""
    csv = (
        "Period,Account,Description,Debit,Credit\n"
        "03/2024,6000,Insurance,1000.00,0.00\n"
    )
    result = MRIRentRollParser().parse(BytesIO(csv.encode("utf-8")), "mri.csv", _PROP)
    assert result.success is True
    assert int(result.data["period_year"].iloc[0]) == 2024
    assert int(result.data["period_month"].iloc[0]) == 3
    assert result.data["transaction_date"].iloc[0] == pd.Timestamp(2024, 3, 1)


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
