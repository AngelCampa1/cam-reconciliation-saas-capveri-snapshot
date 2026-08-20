"""Property-based invariants for the structural cleaners in cleaners.py.

Before any GL row is parsed, the generic ingestion path has to find the header
row, normalize account codes, and drop rows missing required data. Three pure
helpers do this:

  * ``detect_header_row`` — locate the real header row among title/summary noise
    using whole-word matching (FIX DI-9: "describe" must not match
    "description").
  * ``clean_account_code`` — strip whitespace and disallowed characters.
  * ``filter_by_required_columns`` — drop rows below a non-null threshold across
    the required columns.

A defect here mis-parses or silently empties an entire import, so each is pinned
against an independent oracle.

Invariants pinned here:

  * **Header detection** — a planted header row is found at its true index when no
    earlier row also clears the 60% threshold; a frame with no header-like row
    returns 0; a near-miss substring ("description" vs expected "describe") does
    not trigger a match.
  * **Account-code cleaning** — output contains only word chars / ``-`` / ``.``,
    is idempotent, and never grows.
  * **Required-column filtering** — a row survives iff it has at least
    ``min_non_null`` non-null values across the existing required columns; a
    frame with none of the required columns is returned unchanged.

Run standalone:
    pytest tests/stress/test_cleaners_structure_stress.py -q
"""

from __future__ import annotations

import re

import pandas as pd
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from app.services.ingestion.cleaners import (
    clean_account_code,
    detect_header_row,
    filter_by_required_columns,
)

STRESS = settings(max_examples=250, deadline=None)

_HEADERS = ["account_code", "amount", "transaction_date", "vendor_name"]


@STRESS
@given(
    header_at=st.integers(min_value=0, max_value=5),
    noise_rows=st.integers(min_value=0, max_value=4),
)
def test_detect_header_row_finds_planted_header(header_at, noise_rows):
    # Build rows of unrelated noise, then a clean header row at `header_at`.
    rows = []
    for _ in range(header_at):
        rows.append(["Report Summary", "Confidential", "Page 1", "xyz"])
    rows.append(list(_HEADERS))  # the true header row
    for _ in range(noise_rows):
        rows.append(["foo", "bar", "baz", "qux"])

    df = pd.DataFrame(rows)
    # None of the noise rows contain any expected header word, so the planted
    # row is the first (and only) one clearing the threshold.
    assert detect_header_row(df, _HEADERS) == header_at


def test_detect_header_row_no_match_returns_zero():
    df = pd.DataFrame([["a", "b"], ["c", "d"], ["e", "f"]])
    assert detect_header_row(df, _HEADERS) == 0


def test_detect_header_row_word_boundary_no_false_positive():
    """FIX DI-9: a row of near-miss substrings must not be read as the header."""
    # "description" should NOT satisfy the expected header "describe".
    df = pd.DataFrame([["description", "amounts", "transactional", "vendors"]])
    assert detect_header_row(df, ["describe", "amount", "transaction", "vendor"]) == 0


@STRESS
@given(code=st.text(max_size=30))
def test_clean_account_code_charset_and_idempotent(code):
    out = clean_account_code(pd.Series([code]))
    cleaned = out.iloc[0]

    # Only word chars, '-' and '.' survive.
    assert re.fullmatch(r"[\w\-.]*", cleaned) is not None
    # Never grows beyond the stripped input length.
    assert len(cleaned) <= len(str(code).strip())
    # Idempotent.
    again = clean_account_code(pd.Series([cleaned])).iloc[0]
    assert again == cleaned


_cell = st.one_of(st.none(), st.integers(-5, 5), st.sampled_from(["x", "y"]))


@STRESS
@given(
    rows=st.lists(
        st.fixed_dictionaries({"account_code": _cell, "amount": _cell, "extra": _cell}),
        min_size=1,
        max_size=8,
    ),
    min_non_null=st.integers(min_value=1, max_value=2),
)
def test_filter_by_required_columns_matches_oracle(rows, min_non_null):
    df = pd.DataFrame(rows)
    required = ["account_code", "amount"]

    out = filter_by_required_columns(df, required, min_non_null=min_non_null)

    # Oracle: keep rows with >= min_non_null non-null values in required cols.
    expected_idx = [
        i
        for i, r in enumerate(rows)
        if sum(1 for c in required if r[c] is not None) >= min_non_null
    ]
    assert len(out) == len(expected_idx)


def test_filter_by_required_columns_no_required_cols_unchanged():
    df = pd.DataFrame([{"other": 1}, {"other": None}])
    out = filter_by_required_columns(df, ["account_code"], min_non_null=1)
    # None of the required columns exist -> frame returned unchanged.
    assert len(out) == len(df)


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
