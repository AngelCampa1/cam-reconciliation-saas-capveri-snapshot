"""End-to-end value-correctness invariants for the Yardi Voyager GL parser.

Yardi exports carry separate Debit/Credit columns that the parser combines into
a single signed ``amount`` (positive=debit, negative=credit) — the single most
error-prone money path in ingestion. A sign flip or a debit/credit transposition
here silently inverts every GL line in a CAM reconciliation. The fuzz suite only
proves Yardi never crashes; nothing asserts the combined amount is correct.

This synthesizes a well-formed Yardi-style CSV (report header rows, then a real
column header, then data rows with Debit/Credit rendered in mixed ERP currency
styles), parses it, and checks the result against the generating values as an
independent oracle. Net amounts are constrained non-zero so every row clears the
parser's zero-amount filter, giving an exact row-conservation oracle.

Invariants pinned here:

  * **Signed combination** — every parsed ``amount`` equals ``debit - credit`` to
    the cent, regardless of which side is larger or how each is rendered.
  * **Row conservation** — with all net amounts non-zero, no row is dropped:
    ``row_count`` equals the number of data rows, and the parse succeeds.
  * **Account-code & period fidelity** — account codes round-trip and
    ``period_year`` / ``period_month`` match each row's source date.

Run standalone:
    pytest tests/stress/test_yardi_parser_value_correctness_stress.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from io import BytesIO

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser

STRESS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_PROP = "22222222-2222-2222-2222-222222222222"


def _money(cents: int, style: str) -> str:
    """Render non-negative cents in an ERP currency style (debit/credit are >=0)."""
    dollars = Decimal(cents) / 100
    body = f"{dollars:,.2f}"
    return f"${body}" if style == "dollar" else body


# A GL row: account, debit cents, credit cents, date, render style. Net != 0 is
# enforced in the test so every row survives the zero-amount filter.
_row = st.fixed_dictionaries(
    {
        "acct": st.from_regex(r"[1-9][0-9]{2,4}", fullmatch=True),
        "debit": st.integers(min_value=0, max_value=50_000_000),
        "credit": st.integers(min_value=0, max_value=50_000_000),
        "d": st.dates(min_value=date(1995, 1, 1), max_value=date(2098, 12, 31)),
        "style": st.sampled_from(["plain", "dollar"]),
    }
)


@STRESS
@given(rows=st.lists(_row, min_size=1, max_size=10))
def test_debit_credit_combines_to_signed_amount(rows):
    # Enforce non-zero net so no row is dropped by the zero-amount filter.
    rows = [r for r in rows if r["debit"] != r["credit"]]
    if not rows:
        return

    header = "Yardi Voyager GL Detail Report\nProperty: Demo Plaza\n"
    header += "Account,Description,Date,Debit,Credit\n"
    # Quote the money fields: ERP currency styles include thousands separators
    # ("1,234.56"), and an unquoted comma would split the CSV row.
    body = "".join(
        f"{r['acct']},Line item,{r['d'].isoformat()},"
        f'"{_money(r["debit"], r["style"])}","{_money(r["credit"], r["style"])}"\n'
        for r in rows
    )
    buf = BytesIO((header + body).encode("utf-8"))

    result = YardiVoyagerGLParser().parse(buf, "gl_export.csv", _PROP)

    assert result.success is True
    assert result.row_count == len(rows)
    assert len(result.data) == len(rows)

    out = result.data.reset_index(drop=True)
    for i, r in enumerate(rows):
        expected = float((Decimal(r["debit"]) - Decimal(r["credit"])) / 100)
        assert round(float(out["amount"].iloc[i]), 2) == round(expected, 2)
        assert str(out["account_code"].iloc[i]) == r["acct"]
        assert int(out["period_year"].iloc[i]) == r["d"].year
        assert int(out["period_month"].iloc[i]) == r["d"].month


def test_single_credit_only_row_is_negative():
    """A pure credit (debit 0) combines to a negative amount."""
    csv = (
        "Account,Description,Date,Debit,Credit\n"
        "6000,Insurance,2024-03-31,0.00,1500.00\n"
    )
    result = YardiVoyagerGLParser().parse(BytesIO(csv.encode("utf-8")), "gl.csv", _PROP)
    assert result.success is True
    assert result.row_count == 1
    assert round(float(result.data["amount"].iloc[0]), 2) == -1500.00


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
