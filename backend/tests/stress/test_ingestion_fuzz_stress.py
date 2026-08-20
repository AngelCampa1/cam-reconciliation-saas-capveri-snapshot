"""Fuzz / property-based stress tests for the ingestion layer.

Feeds adversarial bytes and currency/date strings into the parsers and
cleaners. The contract under test is ROBUSTNESS: parsing untrusted ERP exports
must NEVER raise an unhandled exception (it returns a ParseResult with
success=False / errors), and cleaners must coerce garbage to NaN/NaT rather
than crash. A crash here is a denial-of-service / data-integrity bug.

Run standalone:
    pytest tests/stress/test_ingestion_fuzz_stress.py -q
"""

from __future__ import annotations

import math
import re
from io import BytesIO

import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.cleaners import (
    clean_account_code,
    clean_currency_column,
    clean_date_column,
)
from app.services.ingestion.fingerprint import fingerprint_file
from app.services.ingestion.parsers.generic import GenericMappingParser
from app.services.ingestion.parsers.mri import MRIRentRollParser
from app.services.ingestion.parsers.yardi import YardiVoyagerGLParser
from app.services.ingestion.quality_checks import run_all_quality_checks
from app.services.ingestion.schemas import ParseResult
from app.services.ingestion.validation import validate_gl_dataframe

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_PROP = "00000000-0000-0000-0000-000000000001"


# ---------------------------------------------------------------------------
# Parsers must never crash on arbitrary bytes.
# ---------------------------------------------------------------------------


@STRESS
@given(raw=st.binary(min_size=0, max_size=4096))
@pytest.mark.parametrize(
    "parser_cls",
    [YardiVoyagerGLParser, MRIRentRollParser, GenericMappingParser],
)
def test_parsers_never_crash_on_arbitrary_bytes(parser_cls, raw):
    parser = parser_cls()
    result = parser.parse(BytesIO(raw), "fuzz.csv", _PROP)
    # Must return a ParseResult, not raise.
    assert hasattr(result, "success")
    assert isinstance(result.data, pd.DataFrame)
    # Failure must be reported, not silently swallowed into a "successful" empty.
    if not result.success:
        assert result.errors or result.row_count == 0


@STRESS
@given(
    text=st.text(
        alphabet=st.characters(blacklist_categories=("Cs",)), min_size=0, max_size=2000
    )
)
def test_parsers_never_crash_on_text_csv(text):
    for parser_cls in (YardiVoyagerGLParser, MRIRentRollParser, GenericMappingParser):
        result = parser_cls().parse(BytesIO(text.encode("utf-8")), "fuzz.csv", _PROP)
        assert hasattr(result, "success")


@STRESS
@given(raw=st.binary(min_size=0, max_size=2048))
def test_fingerprint_never_crashes(raw):
    fp = fingerprint_file(BytesIO(raw), "fuzz.csv")
    assert fp.source_system in {"yardi", "mri", "generic"}


# ---------------------------------------------------------------------------
# Cleaners must coerce garbage, never raise.
# ---------------------------------------------------------------------------

_CURRENCY_TOKENS = st.one_of(
    st.text(max_size=60),
    st.sampled_from(
        [
            "(1,234.56)",
            "$1,234.56",
            "$-1,234.56",
            "500 CR",
            "500 DR",
            "500.00-",
            "-500.00",
            "1 234.56",
            "1,234,567.89",
            "1.234,56",
            "$1.2M",
            "",
            "NaN",
            "null",
            "  ",
            "12-34",
            "((5))",
            "$$$",
            "-",
            "1e9",
            "infinity",
        ]
    ),
    st.floats(allow_nan=True, allow_infinity=True).map(str),
)


@STRESS
@given(values=st.lists(_CURRENCY_TOKENS, min_size=0, max_size=40))
def test_clean_currency_never_raises_and_is_numeric(values):
    out = clean_currency_column(pd.Series(values, dtype=object))
    assert len(out) == len(values)
    # Output is always numeric (int64 when every value is whole, else float64
    # with NaN for unparseable cells) — never a raw string, never an exception.
    assert pd.api.types.is_numeric_dtype(out)
    for v in out.tolist():
        assert isinstance(v, (int, float))


@STRESS
@given(values=st.lists(_CURRENCY_TOKENS, min_size=1, max_size=20))
def test_clean_currency_documented_signs(values):
    """Documented negative markers must yield negative (or NaN), never positive."""
    out = clean_currency_column(pd.Series(values, dtype=object))
    for raw, num in zip(values, out.tolist()):
        if math.isnan(num):
            continue
        s = raw.strip().upper()
        is_neg_marker = (
            (s.startswith("(") and s.endswith(")"))
            or s.endswith("CR")
            or s.endswith("-")
            or s.startswith("-")
        )
        if is_neg_marker and num != 0:
            assert num < 0, f"{raw!r} -> {num} (expected negative)"


@STRESS
@given(
    values=st.lists(
        st.one_of(
            st.text(max_size=30),
            st.sampled_from(
                ["2024-01-15", "01/15/2024", "15-Jan-2024", "garbage", "", "2024-13-99"]
            ),
            st.none(),
        ),
        min_size=0,
        max_size=30,
    )
)
def test_clean_date_never_raises(values):
    out = clean_date_column(pd.Series(values, dtype=object))
    assert len(out) == len(values)
    assert pd.api.types.is_datetime64_any_dtype(out)


@STRESS
@given(
    values=st.lists(
        st.one_of(st.text(max_size=40), st.none(), st.integers(), st.floats()),
        min_size=0,
        max_size=30,
    )
)
def test_clean_account_code_never_raises(values):
    out = clean_account_code(pd.Series(values, dtype=object))
    assert len(out) == len(values)
    for v in out.tolist():
        if v is None or (isinstance(v, float) and math.isnan(v)):
            continue
        # Contract: strip everything except word chars (\w, incl. "_" and
        # Unicode letters/digits), "." and "-". No whitespace survives.
        assert re.fullmatch(r"[\w.\-]*", str(v)) is not None


# ---------------------------------------------------------------------------
# Validation + quality checks must never raise on a garbage DataFrame.
# ---------------------------------------------------------------------------


@st.composite
def gl_dataframe(draw):
    n = draw(st.integers(min_value=0, max_value=30))
    cols = {
        "account_code": [draw(st.text(max_size=12)) for _ in range(n)],
        "account_description": [draw(st.text(max_size=20)) for _ in range(n)],
        "amount": [
            draw(st.one_of(st.floats(allow_nan=True, allow_infinity=True), st.none()))
            for _ in range(n)
        ],
        "transaction_date": [
            draw(st.sampled_from(["2024-01-15", "bad", "", "2099-12-31"]))
            for _ in range(n)
        ],
        "period_year": [
            draw(st.integers(min_value=-1, max_value=99999)) for _ in range(n)
        ],
        "period_month": [
            draw(st.integers(min_value=-5, max_value=50)) for _ in range(n)
        ],
    }
    return pd.DataFrame(cols)


@STRESS
@given(df=gl_dataframe())
def test_validate_gl_dataframe_never_raises(df):
    valid_df, result = validate_gl_dataframe(df)
    assert isinstance(valid_df, pd.DataFrame)
    assert result.valid_count + result.invalid_count == len(df)
    # Valid rows are a subset.
    assert len(valid_df) == result.valid_count


@STRESS
@given(
    df=gl_dataframe(),
    success=st.booleans(),
    error_count=st.integers(min_value=0, max_value=1000),
)
def test_run_all_quality_checks_never_raises(df, success, error_count):
    pr = ParseResult(
        success=success,
        source_system="generic",
        data=df,
        row_count=len(df),
        error_count=error_count,
        errors=[],
        warnings=[],
    )
    qc = run_all_quality_checks(pr)
    # Returns a structured verdict, never raises; score stays in [0, 100].
    assert isinstance(qc.passed, bool)
    assert isinstance(qc.issues, list)
    assert 0.0 <= qc.score <= 100.0


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
