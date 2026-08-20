"""Property-based invariants for the GL Filter-&-Warn validation gate.

``ingestion/validation.py:validate_gl_dataframe`` is the data-quality gate that runs
just before persistence: it partitions a parsed DataFrame into the rows that may be
inserted and the rows that are dropped, returning warnings for valid-but-suspicious
values. Business rules: ``account_code`` must start with a digit, ``amount`` must be
present and within the $100M sanity bound, ``transaction_date`` must be present and
not in the future, and optional ``period_year``/``period_month`` must fall in
1990-2100 / 1-12. A leak here either inserts garbage or silently drops good money.

This drives the real validator (no mocks) over arbitrary mixed-validity DataFrames
and checks the partition against an independent oracle that replays the documented
rules, plus the warning side-channel.

Invariants pinned here:

  * **Partition is exact** — the surviving row id set equals the oracle's valid set;
    ``valid_count`` and ``invalid_count`` sum to the row count.
  * **No false positives/negatives** — every retained row satisfies all rules; every
    dropped row violates at least one.
  * **is_valid** — true iff at least one row survived.
  * **Warning side-channel** — exactly one info warning per retained zero-amount row,
    and one warning per retained large (>$10M, ≤$100M) amount.

Run standalone:
    pytest tests/stress/test_gl_validation_partition_stress.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.validation import validate_gl_dataframe

STRESS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_PAST = date(2020, 6, 15)
_FUTURE = date(2999, 1, 1)

# amount choices spanning every rule branch: normal, zero (info warning), large
# (warning, still valid), over-limit (invalid), and missing.
_amount = st.sampled_from(
    [
        Decimal("1234.56"),
        Decimal("0"),
        Decimal("50000000"),  # $50M -> large warning, valid
        Decimal("100000001"),  # over $100M -> invalid
        None,
    ]
)
_account = st.sampled_from(["5100", "6000", "7", "ABC", "x9", None])
_txn_date = st.sampled_from([_PAST, _FUTURE, None])
_period_year = st.sampled_from([2024, 1980, 2200, None])
_period_month = st.sampled_from([6, 0, 13, None])

_row = st.fixed_dictionaries(
    {
        "account_code": _account,
        "amount": _amount,
        "transaction_date": _txn_date,
        "period_year": _period_year,
        "period_month": _period_month,
    }
)


def _oracle_valid(r: dict) -> bool:
    """Replay validate_gl_row's documented rules independently."""
    amt = r["amount"]
    if amt is None:
        return False
    txn = r["transaction_date"]
    if txn is None:
        return False
    ac = r["account_code"]
    if ac is None:
        return False
    # All required present -> Pydantic rules apply.
    if not str(ac) or not str(ac)[0].isdigit():
        return False
    if abs(Decimal(str(amt))) > Decimal("100000000"):
        return False
    if txn > date.today():
        return False
    py = r["period_year"]
    if py is not None and (py < 1990 or py > 2100):
        return False
    pm = r["period_month"]
    if pm is not None and (pm < 1 or pm > 12):
        return False
    return True


@STRESS
@given(rows=st.lists(_row, min_size=1, max_size=10))
def test_validation_partition_and_warnings(rows):
    # Tag each row with a stable id so we can compare survivor sets.
    tagged = [dict(r, rid=i) for i, r in enumerate(rows)]
    df = pd.DataFrame(tagged)

    valid_df, result = validate_gl_dataframe(df)

    expected_valid_ids = {r["rid"] for r in tagged if _oracle_valid(r)}

    # Partition is exact.
    assert set(valid_df["rid"]) == expected_valid_ids
    assert result.valid_count == len(expected_valid_ids)
    assert result.invalid_count == len(rows) - len(expected_valid_ids)
    assert result.valid_count + result.invalid_count == len(rows)

    # is_valid iff something survived.
    assert result.is_valid == (len(expected_valid_ids) > 0)

    # Warning side-channel: one info per retained zero-amount row; one warning per
    # retained large (>$10M) amount.
    valid_rows = [r for r in tagged if _oracle_valid(r)]
    expected_zero = sum(1 for r in valid_rows if Decimal(str(r["amount"])) == 0)
    expected_large = sum(
        1 for r in valid_rows if abs(Decimal(str(r["amount"]))) > Decimal("10000000")
    )
    info_warnings = [
        w for w in result.warnings if w.field == "amount" and w.severity == "info"
    ]
    large_warnings = [
        w for w in result.warnings if w.field == "amount" and w.severity == "warning"
    ]
    assert len(info_warnings) == expected_zero
    assert len(large_warnings) == expected_large


def test_empty_dataframe_anchor():
    valid_df, result = validate_gl_dataframe(pd.DataFrame())
    assert valid_df.empty
    assert result.valid_count == 0
    assert result.invalid_count == 0
    assert result.is_valid is False


def test_all_invalid_fails_closed_anchor():
    """A frame where every row breaks a rule yields is_valid False and an empty
    valid frame."""
    df = pd.DataFrame(
        [
            {"account_code": "ABC", "amount": Decimal("10"), "transaction_date": _PAST},
            {"account_code": "5100", "amount": None, "transaction_date": _PAST},
            {
                "account_code": "5100",
                "amount": Decimal("1"),
                "transaction_date": _FUTURE,
            },
        ]
    )
    valid_df, result = validate_gl_dataframe(df)
    assert valid_df.empty
    assert result.valid_count == 0
    assert result.invalid_count == 3
    assert result.is_valid is False


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
