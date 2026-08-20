"""Property-based stress for ERP garbage-row filtering.

``filter_garbage_rows`` (ingestion/cleaners.py) strips the non-data noise ERP
exports carry — title/report headers, "Page 1 of 5" lines, dashed/star
separators, Total/Subtotal rows, and fully blank rows — before the GL lines are
parsed. Two risks bracket it: filtering too aggressively drops real GL lines
(under-recovery), filtering too little lets a "Total" row double-count. This
harness proves the safe contract: it only ever removes rows (never invents or
mutates data), genuine data rows always survive, and the documented garbage
patterns are removed.

Invariants:
  * **subset + reindex**: output is a row-subset of the input with a clean
    0..n-1 index; never more rows than the input;
  * **data rows survive**: a row whose checked cells are ordinary GL values
    (numeric account code + amount, no Total/Page/separator) is always kept;
  * **garbage removed**: separator lines, page-number lines, and leading-Total
    rows are dropped;
  * **empty rows removed**: an all-blank/NaN row is dropped;
  * **empty frame**: an empty input returns an empty copy;
  * **total**: never raises.

Run standalone:
    pytest tests/stress/test_filter_garbage_rows_stress.py -q
"""

from __future__ import annotations

import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.cleaners import filter_garbage_rows

STRESS = settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# Ordinary GL account codes — digits/dots, never a garbage pattern.
account_codes = st.from_regex(r"\A[1-9][0-9]{3}(\.[0-9]{2})?\Z", fullmatch=True)
amounts = st.builds(lambda x: f"{x:.2f}", st.floats(-1e6, 1e6, allow_nan=False))


@STRESS
@given(
    codes=st.lists(account_codes, min_size=1, max_size=15, unique=True),
    amts=st.lists(amounts, min_size=15, max_size=15),
)
def test_subset_and_data_rows_survive(codes, amts):
    df = pd.DataFrame(
        {
            "account_code": codes,
            "description": [f"Expense {c}" for c in codes],
            "amount": amts[: len(codes)],
        }
    )
    out = filter_garbage_rows(df)

    # Subset: never more rows than the input; clean reindex.
    assert len(out) <= len(df)
    assert list(out.index) == list(range(len(out)))

    # Every genuine GL row survived (none matched a garbage/total pattern and
    # none was empty).
    assert len(out) == len(df)
    assert list(out["account_code"]) == codes


def test_documented_garbage_is_removed():
    df = pd.DataFrame(
        {
            "account_code": [
                "4000",  # data — keep
                "------",  # dashed separator — drop
                "Page 1 of 5",  # page number — drop
                "Total",  # leading total — drop
                "5000.10",  # data — keep
                "",  # empty row — drop (all blank)
            ],
            "amount": ["100.00", "", "", "", "250.00", ""],
        }
    )
    out = filter_garbage_rows(df)
    assert list(out["account_code"]) == ["4000", "5000.10"]


def test_empty_frame_returns_empty_copy():
    df = pd.DataFrame(columns=["account_code", "amount"])
    out = filter_garbage_rows(df)
    assert out.empty
    assert list(out.columns) == ["account_code", "amount"]


def test_all_blank_row_dropped():
    df = pd.DataFrame({"account_code": ["", "4000"], "amount": ["", "10.00"]})
    out = filter_garbage_rows(df)
    assert list(out["account_code"]) == ["4000"]


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
