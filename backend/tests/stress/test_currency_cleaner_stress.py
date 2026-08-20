"""Property-based stress for ERP currency-string cleaning.

``clean_currency_column`` (ingestion/cleaners.py) is the vectorized parser that
turns raw ERP currency text (Yardi/MRI exports) into signed numeric GL amounts.
It feeds every downstream reconciliation, so a sign error or magnitude slip here
would silently corrupt the expense base. It must correctly decode the sign across
all the accounting conventions it documents — parentheses, CR suffix, trailing
minus, leading minus (optionally behind a currency symbol) — and strip grouping
separators, currency symbols, and spaces.

This harness generates a known magnitude, formats it under each supported
convention, and asserts the parsed value has the right sign and magnitude. It also
fuzzes arbitrary text to prove the function is total (never raises, returns a
same-length series of floats/NaN) and length-bounded against ReDoS.

Invariants:
  * **sign + magnitude**: each documented format parses to ±magnitude correctly;
  * **positive formats stay positive**: plain / comma-grouped / $-prefixed values
    with no negative marker parse to +magnitude;
  * **total**: arbitrary text never raises; output is one numeric/NaN per input;
  * **empty**: an empty series yields an empty float series.

Run standalone:
    pytest tests/stress/test_currency_cleaner_stress.py -q
"""

from __future__ import annotations

from decimal import Decimal

import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.cleaners import clean_currency_column

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# Positive magnitudes with cents — the value an accountant typed, sans sign.
magnitudes = st.decimals(
    min_value=Decimal("0.01"),
    max_value=Decimal("999999999"),
    places=2,
    allow_nan=False,
    allow_infinity=False,
)

POSITIVE_FORMATS = ["plain", "comma", "dollar", "dollar_comma"]
NEGATIVE_FORMATS = ["paren", "cr", "trailing_minus", "leading_minus", "dollar_minus"]


def _fmt(mag: Decimal, fmt: str) -> str:
    grouped = f"{mag:,.2f}"
    plain = f"{mag:.2f}"
    return {
        "plain": plain,
        "comma": grouped,
        "dollar": f"${plain}",
        "dollar_comma": f"${grouped}",
        "paren": f"({grouped})",
        "cr": f"{grouped} CR",
        "trailing_minus": f"{plain}-",
        "leading_minus": f"-{plain}",
        "dollar_minus": f"$-{plain}",
    }[fmt]


@STRESS
@given(mag=magnitudes, fmt=st.sampled_from(POSITIVE_FORMATS + NEGATIVE_FORMATS))
def test_sign_and_magnitude(mag, fmt):
    raw = _fmt(mag, fmt)
    out = clean_currency_column(pd.Series([raw]))
    val = out.iloc[0]

    assert not pd.isna(val), f"{raw!r} parsed to NaN"
    expected = -float(mag) if fmt in NEGATIVE_FORMATS else float(mag)
    # 2dp magnitudes up to ~1e9 round-trip through float well under a cent.
    assert abs(val - expected) < 0.005, f"{raw!r} -> {val} (expected {expected})"


@STRESS
@given(texts=st.lists(st.text(max_size=60), max_size=20))
def test_total_on_arbitrary_text(texts):
    out = clean_currency_column(pd.Series(texts, dtype=object))
    # One numeric (or NaN) output per input — never raises, never drops rows.
    assert len(out) == len(texts)
    assert pd.api.types.is_numeric_dtype(out)


def test_empty_series_yields_empty_float_series():
    out = clean_currency_column(pd.Series([], dtype=object))
    assert out.empty
    assert out.dtype == float


def test_known_accounting_conventions():
    raw = ["(500.00)", "500 CR", "500.00-", "-500.00", "$-1,234.56", "1,234.56"]
    out = clean_currency_column(pd.Series(raw))
    assert list(out) == [-500.0, -500.0, -500.0, -500.0, -1234.56, 1234.56]


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
