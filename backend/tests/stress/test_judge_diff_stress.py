"""Property-based stress for the dual-extract diff computation.

``compute_diff`` (dual/judge.py) decides which fields the judge model is even
asked to arbitrate: it returns the per-field disagreements between the primary
and sibling extractions. A field that wrongly lands in the diff wastes a judge
call; a field wrongly *omitted* means a real disagreement is silently resolved by
the merger's primary-fallback without the judge ever seeing it. ``_normalize_value``
is the comparison kernel — it coerces numeric strings so "0.05" and 0.05 are not
treated as a disagreement. Both are pure and deterministic.

Invariants:
  * **total + deterministic**: never raises; identical inputs → identical diff;
  * **keys bounded**: every diff key derives from union(a, b) keys; the
    ``extractions`` audit key never appears;
  * **diff iff normalized-unequal**: a top-level key is in the diff exactly when
    its normalized values differ, and the stored tuple holds the *raw* values;
  * **identity**: ``compute_diff(d, d)`` is empty for any dict;
  * **numeric-equivalence**: a numeric string and its float never disagree
    ("0.05" vs 0.05), so they stay out of the diff;
  * **nested recursion**: a differing leaf inside nested dicts surfaces under its
    dotted key path, not as a whole-dict diff.

Run standalone:
    pytest tests/stress/test_judge_diff_stress.py -q
"""

from __future__ import annotations

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.extraction.dual.judge import _normalize_value, compute_diff

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

scalars = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(-1000, 1000),
    st.floats(allow_nan=False, allow_infinity=False, width=32),
    st.text(max_size=8),
)
keys = st.sampled_from(["cap_type", "cap_rate", "base_year", "pro_rata_share", "x"])
flat_dicts = st.dictionaries(keys, scalars, max_size=5)


@STRESS
@given(a=flat_dicts, b=flat_dicts)
def test_total_deterministic_and_in_domain(a, b):
    diff = compute_diff(a, b)

    # Total + deterministic.
    assert compute_diff(a, b) == diff

    union = set(a) | set(b)
    for field, (a_val, b_val) in diff.items():
        # Keys are bounded by the union; the audit key is never diffed.
        assert field in union
        assert field != "extractions"
        # Stored tuple holds the RAW values (not the normalized forms).
        assert a_val == a.get(field)
        assert b_val == b.get(field)
        # Present only because the normalized values genuinely differ.
        assert _normalize_value(a_val) != _normalize_value(b_val)

    # Completeness: every genuinely-differing non-extractions key is present.
    for key in union:
        if key == "extractions":
            continue
        if _normalize_value(a.get(key)) != _normalize_value(b.get(key)):
            assert key in diff


@STRESS
@given(d=flat_dicts)
def test_identity_diff_is_empty(d):
    assert compute_diff(d, d) == {}


@STRESS
@given(
    extr_a=st.lists(st.text(max_size=3), max_size=3),
    extr_b=st.lists(st.text(max_size=3), max_size=3),
)
def test_extractions_key_never_diffed(extr_a, extr_b):
    a = {"cap_rate": "0.05", "extractions": extr_a}
    b = {"cap_rate": "0.05", "extractions": extr_b}
    assert "extractions" not in compute_diff(a, b)


@STRESS
@given(
    num=st.floats(min_value=-1e6, max_value=1e6, allow_nan=False, allow_infinity=False)
)
def test_numeric_string_equals_float(num):
    # A field carrying a numeric string on one side and the equal float on the
    # other must NOT be reported as a disagreement.
    rounded = round(num, 10)
    a = {"cap_rate": str(rounded)}
    b = {"cap_rate": rounded}
    assert compute_diff(a, b) == {}


def test_nested_leaf_surfaces_under_dotted_key():
    a = {"caps": {"cap_rate": "0.05", "kind": "yoy"}}
    b = {"caps": {"cap_rate": "0.07", "kind": "yoy"}}
    diff = compute_diff(a, b)
    # Only the differing leaf, keyed by its dotted path — not the whole dict.
    assert diff == {"caps.cap_rate": ("0.05", "0.07")}


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
