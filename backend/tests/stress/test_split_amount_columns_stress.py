"""Property-based stress for debit/credit → signed-amount combination.

``split_amount_columns`` (ingestion/cleaners.py) collapses an ERP export's
separate debit and credit columns into one signed ``amount`` column under the
accounting convention *positive = debit, negative = credit* (``amount = debit -
credit``). It sits directly on the GL ingestion path, so the sign and magnitude
of every posted line depends on it. It also surfaces a data-quality warning when a
row has BOTH a debit and a credit (a likely accounting error). It reuses the
already-verified ``clean_currency_column`` for parsing, with NaN filled to 0.

Invariants:
  * **amount identity**: when both columns exist, amount == cleaned_debit -
    cleaned_credit (NaN→0), exactly, row-by-row;
  * **row-count preserved**: the row count and index are unchanged;
  * **both-filled warning**: exactly one warning iff ≥1 row has both debit≠0 and
    credit≠0 — and none when warn_both_filled=False;
  * **missing column is a no-op**: if either column is absent, the frame is
    returned without an amount column and with no warnings;
  * **total**: never raises on adversarial currency text.

Run standalone:
    pytest tests/stress/test_split_amount_columns_stress.py -q
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.cleaners import clean_currency_column, split_amount_columns

STRESS = settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# Currency cells the parser must cope with: clean numbers, blanks, junk.
cells = st.one_of(
    st.just(""),
    st.just("0.00"),
    st.builds(lambda d: f"{d:.2f}", st.floats(-1e6, 1e6, allow_nan=False)),
    st.builds(lambda d: f"({abs(d):.2f})", st.floats(-1e6, 1e6, allow_nan=False)),
    st.text(max_size=6),
)


@STRESS
@given(
    debits=st.lists(cells, min_size=1, max_size=12),
    warn=st.booleans(),
)
def test_amount_identity_and_warning(debits, warn):
    # Pair each debit with a credit (independently drawn pool, recycled by index).
    credits = list(reversed(debits))
    df = pd.DataFrame({"debit": debits, "credit": credits, "ref": range(len(debits))})

    out, warnings = split_amount_columns(df, warn_both_filled=warn)

    # Row count + index preserved; unrelated column untouched.
    assert len(out) == len(df)
    assert list(out["ref"]) == list(range(len(debits)))

    exp_debit = clean_currency_column(df["debit"]).fillna(0)
    exp_credit = clean_currency_column(df["credit"]).fillna(0)
    expected_amount = exp_debit - exp_credit

    # amount == debit - credit exactly, NaN-for-NaN aligned.
    pd.testing.assert_series_equal(
        out["amount"].reset_index(drop=True),
        expected_amount.reset_index(drop=True),
        check_names=False,
    )

    both_filled = ((exp_debit != 0) & (exp_credit != 0)).any()
    if warn and both_filled:
        assert len(warnings) == 1
    else:
        assert warnings == []


@STRESS
@given(missing=st.sampled_from(["debit", "credit", "both"]))
def test_missing_column_is_noop(missing):
    data = {"debit": ["100.00"], "credit": ["40.00"], "ref": [1]}
    if missing in ("debit", "both"):
        data.pop("debit")
    if missing in ("credit", "both"):
        data.pop("credit")
    df = pd.DataFrame(data)

    out, warnings = split_amount_columns(df)
    assert "amount" not in out.columns
    assert warnings == []
    assert len(out) == len(df)


def test_known_debit_credit_signing():
    df = pd.DataFrame(
        {
            "debit": ["1,000.00", "0.00", "500.00"],
            "credit": ["0.00", "750.00", "200.00"],
        }
    )
    out, warnings = split_amount_columns(df)
    assert list(out["amount"]) == [1000.0, -750.0, 300.0]
    # Row 3 has both filled → one warning.
    assert len(warnings) == 1


def test_nan_debit_or_credit_treated_as_zero():
    df = pd.DataFrame({"debit": [np.nan], "credit": ["250.00"]})
    out, _ = split_amount_columns(df)
    assert out["amount"].iloc[0] == -250.0


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
