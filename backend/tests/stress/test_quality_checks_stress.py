"""Property-based stress for GL ingestion quality-check thresholds.

The ``check_*`` functions in ingestion/quality_checks.py gate import quality: they
turn parse statistics into INFO/WARNING/CRITICAL issues the user sees before
committing an import. The decisions are pure threshold comparisons, exactly the
place a flipped ``>`` vs ``>=`` or a wrong severity cutoff silently mis-classifies
a bad import as clean (or nags on a good one). This harness pins each documented
boundary against an independent re-derivation of the rule.

Invariants:
  * **row_count**: 0 → CRITICAL; 0 < n < min → WARNING; n ≥ min → None;
  * **error_rate**: rate = err/(rows+err); 0 total → None; rate > 0.5 → CRITICAL;
    max_rate < rate ≤ 0.5 → WARNING; rate ≤ max_rate → None;
  * **zero_amounts**: zero_rate ≤ max → None; max < rate ≤ 0.8 → WARNING;
    rate > 0.8 → CRITICAL; empty/no-amount-column → None;
  * all checks are total (never raise) and a returned issue carries its own
    check_name.

Run standalone:
    pytest tests/stress/test_quality_checks_stress.py -q
"""

from __future__ import annotations

import pandas as pd
import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.ingestion.quality_checks import (
    QualitySeverity,
    check_error_rate,
    check_row_count,
    check_zero_amounts,
)
from app.services.ingestion.schemas import ParseResult

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)


def _result(row_count: int, error_count: int) -> ParseResult:
    return ParseResult(
        success=True,
        source_system="generic",
        data=pd.DataFrame(),
        row_count=row_count,
        error_count=error_count,
    )


@STRESS
@given(row_count=st.integers(0, 1000), min_expected=st.integers(1, 100))
def test_row_count_boundaries(row_count, min_expected):
    issue = check_row_count(_result(row_count, 0), min_expected=min_expected)
    if row_count == 0:
        assert issue is not None
        assert issue.severity == QualitySeverity.CRITICAL
        assert issue.check_name == "row_count"
    elif row_count < min_expected:
        assert issue is not None
        assert issue.severity == QualitySeverity.WARNING
    else:
        assert issue is None


@STRESS
@given(
    rows=st.integers(0, 1000),
    errors=st.integers(0, 1000),
    max_rate=st.floats(0.05, 0.5),
)
def test_error_rate_boundaries(rows, errors, max_rate):
    issue = check_error_rate(_result(rows, errors), max_rate=max_rate)
    total = rows + errors
    if total == 0:
        assert issue is None
        return
    rate = errors / total
    if rate > 0.5:
        assert issue is not None and issue.severity == QualitySeverity.CRITICAL
    elif rate > max_rate:
        assert issue is not None and issue.severity == QualitySeverity.WARNING
    else:
        assert issue is None


@STRESS
@given(
    n_zero=st.integers(0, 50),
    n_nonzero=st.integers(0, 50),
    max_rate=st.floats(0.1, 0.9),
)
def test_zero_amounts_boundaries(n_zero, n_nonzero, max_rate):
    total = n_zero + n_nonzero
    if total == 0:
        df = pd.DataFrame({"amount": []})
        assert check_zero_amounts(df, max_rate=max_rate) is None
        return

    df = pd.DataFrame({"amount": [0.0] * n_zero + [1.0] * n_nonzero})
    issue = check_zero_amounts(df, max_rate=max_rate)
    rate = n_zero / total
    if rate <= max_rate:
        assert issue is None
    elif rate > 0.8:
        assert issue is not None and issue.severity == QualitySeverity.CRITICAL
    else:
        assert issue is not None and issue.severity == QualitySeverity.WARNING


def test_zero_amounts_no_column_or_empty_is_none():
    assert check_zero_amounts(pd.DataFrame(), max_rate=0.5) is None
    assert check_zero_amounts(pd.DataFrame({"x": [1, 2]}), max_rate=0.5) is None


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
