"""End-to-end value-correctness invariants for the Generic mapping parser.

The existing fuzz suite proves the parsers never *crash* on garbage. This suite
proves the complementary contract on *well-formed* input: a clean CSV mapped
through ``GenericMappingParser`` Phase 2 must come out the other side with every
row preserved and every dollar amount penny-exact. Phase 2 cleans columns in
place and never filters rows, so a silently dropped row, a rounding slip, or a
sign flip here corrupts a downstream CAM reconciliation — the exact class of
bug this goal hunts.

We synthesize a CSV from known (account_code, amount-cents, date) tuples, render
each amount in a real ERP currency style (plain, ``$1,234.56``, parentheses- or
trailing-minus negatives), map it back, and check the parsed frame against the
generating values as an independent oracle.

Invariants pinned here:

  * **Row conservation** — Phase 2 returns exactly as many rows as the input CSV
    (no silent drops/dupes) and reports ``success``.
  * **Penny-exact amounts** — every parsed ``amount`` equals the generating
    signed dollar value to the cent, across all rendered currency styles.
  * **Account-code preservation** — the mapped ``account_code`` round-trips.
  * **Period derivation** — ``period_year`` / ``period_month`` equal the source
    transaction date's year/month for every row.

Run standalone:
    pytest tests/stress/test_generic_parser_value_correctness_stress.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from io import BytesIO

import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.parsers.generic import GenericMappingParser

STRESS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_PROP = "11111111-1111-1111-1111-111111111111"
_MAPPING = {
    "account_code": "Acct",
    "amount": "Amt",
    "transaction_date": "Dt",
}

# A GL row: account code, signed cents, date, and a currency rendering style.
_row = st.fixed_dictionaries(
    {
        "acct": st.from_regex(r"[1-9][0-9]{2,4}", fullmatch=True),
        "cents": st.integers(min_value=-99_999_999, max_value=99_999_999),
        "d": st.dates(min_value=date(1995, 1, 1), max_value=date(2098, 12, 31)),
        "style": st.sampled_from(["plain", "dollar", "paren", "trailing"]),
    }
)


def _render(cents: int, style: str) -> str:
    """Render signed cents in a real ERP currency style."""
    dollars = Decimal(abs(cents)) / 100
    body = f"{dollars:,.2f}"  # e.g. 1,234.56
    neg = cents < 0
    if style == "plain":
        return f"-{body}" if neg else body
    if style == "dollar":
        return f"$-{body}" if neg else f"${body}"
    if style == "paren":
        return f"({body})" if neg else body
    # trailing minus
    return f"{body}-" if neg else body


@STRESS
@given(rows=st.lists(_row, min_size=1, max_size=12))
def test_well_formed_csv_round_trips_exactly(rows):
    frame = pd.DataFrame(
        {
            "Acct": [r["acct"] for r in rows],
            "Amt": [_render(r["cents"], r["style"]) for r in rows],
            "Dt": [r["d"].isoformat() for r in rows],
        }
    )
    buf = BytesIO()
    frame.to_csv(buf, index=False)
    buf.seek(0)

    result = GenericMappingParser().parse(buf, "gl.csv", _PROP, column_mapping=_MAPPING)

    # Row conservation: no silent drops or dupes, and Phase 2 succeeded.
    assert result.success is True
    assert result.row_count == len(rows)
    assert len(result.data) == len(rows)

    out = result.data.reset_index(drop=True)
    for i, r in enumerate(rows):
        # Penny-exact amount across every rendered style.
        expected = float(Decimal(r["cents"]) / 100)
        assert round(float(out["amount"].iloc[i]), 2) == round(expected, 2)
        # Account code preserved (string identity).
        assert str(out["account_code"].iloc[i]) == r["acct"]
        # Period derived from the source date.
        assert int(out["period_year"].iloc[i]) == r["d"].year
        assert int(out["period_month"].iloc[i]) == r["d"].month


def test_zero_amount_is_exact_zero():
    frame = pd.DataFrame({"Acct": ["6000"], "Amt": ["0.00"], "Dt": ["2024-06-15"]})
    buf = BytesIO()
    frame.to_csv(buf, index=False)
    buf.seek(0)
    result = GenericMappingParser().parse(buf, "gl.csv", _PROP, column_mapping=_MAPPING)
    assert result.success is True
    assert float(result.data["amount"].iloc[0]) == 0.0


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
