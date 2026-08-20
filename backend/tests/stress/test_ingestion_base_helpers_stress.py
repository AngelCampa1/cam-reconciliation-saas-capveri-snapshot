"""Property-based invariants for the shared IngestionStrategy base helpers.

``ingestion/base.py`` is the Strategy-pattern base every ERP parser
(Yardi/MRI/Generic) inherits. Three protected helpers do the cross-parser heavy
lifting just before a ``ParseResult`` is returned, so a defect here corrupts
*every* ingestion path:

  * ``_standardize_columns`` — adds the optional columns with safe defaults and
    coerces types.
  * ``_validate_output`` — schema/type gate run before returning.
  * ``_build_validation_mask`` — row-completeness mask used to drop incomplete
    rows before persistence.

This drives the real helpers (via a trivial concrete subclass — no mocks) over
arbitrary DataFrames and pins their documented contracts against independent
oracles.

Invariants pinned here:

  * **Standardize is idempotent** — applying it twice equals applying it once
    (same columns, same values); the four optional columns always appear;
    ``amount`` becomes numeric and the period columns become nullable ``Int64``.
  * **Independent raw_row_data dicts** (regression for FIX DI-7) — mutating one
    synthesized ``raw_row_data`` dict never bleeds into another row.
  * **Validate-output agrees with the type checks** — a standardized non-empty
    frame with the required columns passes; a frame missing a required column or
    carrying a non-numeric amount reports exactly that error; empty → no errors.
  * **Mask matches an independent oracle** — a row is kept iff every required
    column is non-null / non-blank / not "NaT" (and ``amount != 0`` when
    ``exclude_zero_amounts``); mask length always equals the row count.

Run standalone:
    pytest tests/stress/test_ingestion_base_helpers_stress.py -q
"""

from __future__ import annotations

from typing import BinaryIO

import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.base import IngestionStrategy
from app.services.ingestion.schemas import ParseResult

STRESS = settings(
    max_examples=150,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)


class _Concrete(IngestionStrategy):
    """Minimal concrete strategy so the protected helpers can be exercised."""

    @property
    def source_system(self) -> str:
        return "generic"

    def can_handle(self, file_header: bytes, file_name: str) -> float:
        return 0.0

    def parse(
        self, file: BinaryIO, file_name: str, property_id: str
    ) -> ParseResult:  # pragma: no cover - not used by these tests
        raise NotImplementedError


_STRAT = _Concrete()

_OPTIONAL_ADDED = ["vendor_name", "description", "accrual_date", "raw_row_data"]

# Cell strategies spanning the mask branches: present, blank, whitespace, None,
# and (for amount) zero / non-zero numeric.
_text = st.sampled_from(["5100", "CAM", "  ", "", None, "x"])
_amount = st.sampled_from([0, 0.0, 100.5, -50, None])

_row = st.fixed_dictionaries(
    {
        "account_code": _text,
        "amount": _amount,
        "transaction_date": st.sampled_from(["2024-01-01", "", None]),
    }
)


@STRESS
@given(rows=st.lists(_row, min_size=1, max_size=8))
def test_standardize_is_idempotent_and_complete(rows):
    df = pd.DataFrame(rows)

    once = _STRAT._standardize_columns(df)
    twice = _STRAT._standardize_columns(once)

    # The four optional columns always exist after standardization.
    for col in _OPTIONAL_ADDED:
        assert col in once.columns

    # amount numeric; period columns nullable Int64 when present.
    assert pd.api.types.is_numeric_dtype(once["amount"])
    if "period_year" in once.columns:
        assert once["period_year"].dtype == "Int64"
    if "period_month" in once.columns:
        assert once["period_month"].dtype == "Int64"

    # Idempotent: second pass changes nothing structurally or value-wise.
    assert list(once.columns) == list(twice.columns)
    pd.testing.assert_frame_equal(once, twice)


@STRESS
@given(n=st.integers(min_value=2, max_value=6))
def test_raw_row_data_dicts_are_independent(n):
    """Regression FIX DI-7: synthesized raw_row_data dicts must not be shared
    references, or mutating one row corrupts every row."""
    df = pd.DataFrame({"account_code": ["5100"] * n, "amount": [1.0] * n})
    out = _STRAT._standardize_columns(df)

    raws = list(out["raw_row_data"])
    assert all(isinstance(r, dict) and r == {} for r in raws)

    raws[0]["poisoned"] = True
    # No other row's dict may observe the mutation.
    assert all(r == {} for r in raws[1:])


@STRESS
@given(rows=st.lists(_row, min_size=1, max_size=8))
def test_validate_output_matches_type_checks(rows):
    df = _STRAT._standardize_columns(pd.DataFrame(rows))
    # Standardized frame lacks the period columns (parser-supplied) but has a
    # numeric amount; transaction_date stays object here, so validate flags it.
    errors = _STRAT._validate_output(df)

    # Every reported error must correspond to a real, checkable condition.
    for col in ["account_code", "account_description", "amount"]:
        missing_msg = f"Missing required column: {col}"
        assert (missing_msg in errors) == (col not in df.columns)

    if "amount" in df.columns:
        amount_msg = "Column 'amount' must be numeric"
        assert (amount_msg in errors) == (
            not pd.api.types.is_numeric_dtype(df["amount"])
        )


def test_validate_output_empty_frame_anchor():
    assert _STRAT._validate_output(pd.DataFrame()) == []


def test_validate_output_reports_missing_and_nonnumeric():
    df = pd.DataFrame({"amount": ["not-a-number"], "transaction_date": ["2024-01-01"]})
    errors = _STRAT._validate_output(df)
    assert "Missing required column: account_code" in errors
    assert "Column 'amount' must be numeric" in errors


def _mask_oracle(row: dict, required: list[str], exclude_zero: bool) -> bool:
    for col in required:
        if col not in row:
            continue
        val = row[col]
        if val is None or pd.isna(val):
            return False
        s = str(val).strip()
        if s == "" or s == "NaT":
            return False
    if exclude_zero and "amount" in row:
        amt = row["amount"]
        if amt is not None and not pd.isna(amt) and amt == 0:
            return False
    return True


@STRESS
@given(
    rows=st.lists(_row, min_size=1, max_size=8),
    exclude_zero=st.booleans(),
)
def test_build_validation_mask_matches_oracle(rows, exclude_zero):
    df = pd.DataFrame(rows)
    required = ["account_code", "amount", "transaction_date"]

    mask = _STRAT._build_validation_mask(
        df, required, exclude_zero_amounts=exclude_zero
    )

    assert len(mask) == len(df)
    for i, row in enumerate(rows):
        assert bool(mask.iloc[i]) == _mask_oracle(row, required, exclude_zero)


def test_build_validation_mask_empty_anchor():
    mask = _STRAT._build_validation_mask(pd.DataFrame(), ["amount"])
    assert mask.empty and mask.dtype == bool


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
