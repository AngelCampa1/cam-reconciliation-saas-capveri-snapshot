"""Property-based stress for LLM-response JSON extraction.

``extract_json`` pulls a JSON object out of a raw model response (markdown
fences, ``<think>`` blocks, leading/trailing prose, or just bare JSON). Its
callers — the dual-extract judge and gap-filler — catch only ``ValueError`` (or
``Exception``) to *fail open* when a model returns garbage. So the load-bearing
contract is: **extract_json either returns a dict or raises ValueError, and
never any other exception type**. A non-ValueError (e.g. ``RecursionError`` from
deeply nested JSON) would escape ``except (ValueError, KeyError)`` in the judge
and crash the whole extraction.

Invariants:
  * **round-trip**: for any JSON-serializable dict, extracting its ``json.dumps``
    (bare, fenced, or with a ``<think>`` prefix) returns an equal dict;
  * **only ValueError**: arbitrary text and pathologically nested input either
    return a dict or raise ValueError — never RecursionError, TypeError, etc.
    (regression guard for FINDING-S20);
  * **coerce never raises on well-formed shapes**: coerce_llm_output fills the
    documented defaults without mutating unrelated keys;
  * **truncate bound**: truncate_document never exceeds max_chars by more than
    the fixed notice, and is a no-op when already short enough.

Run standalone:
    pytest tests/stress/test_extract_json_stress.py -q
"""

from __future__ import annotations

import json

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.extraction.json_utils import (
    coerce_llm_output,
    extract_json,
    truncate_document,
)

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

# JSON-serializable scalar values.
json_scalars = st.one_of(
    st.none(),
    st.booleans(),
    st.integers(),
    st.floats(allow_nan=False, allow_infinity=False),
    st.text(max_size=30),
)
# Shallow JSON objects (string keys -> scalar/list/object values).
json_objects = st.dictionaries(
    keys=st.text(max_size=15),
    values=st.recursive(
        json_scalars,
        lambda children: st.one_of(
            st.lists(children, max_size=4),
            st.dictionaries(st.text(max_size=10), children, max_size=4),
        ),
        max_leaves=15,
    ),
    max_size=6,
)


@STRESS
@given(obj=json_objects, wrap=st.sampled_from(["bare", "fence", "think", "prose"]))
def test_round_trip_through_wrappers(obj, wrap):
    payload = json.dumps(obj)
    if wrap == "bare":
        text = payload
    elif wrap == "fence":
        text = f"```json\n{payload}\n```"
    elif wrap == "think":
        text = f"<think>reasoning here</think>\n{payload}"
    else:
        text = f"Here is the result:\n{payload}\nHope that helps!"
    assert extract_json(text) == obj


@STRESS
@given(text=st.text(max_size=300))
def test_arbitrary_text_only_returns_dict_or_valueerror(text):
    try:
        result = extract_json(text)
    except ValueError:
        return
    assert isinstance(result, dict)


@STRESS
@given(depth=st.integers(min_value=15000, max_value=60000))
def test_deeply_nested_raises_valueerror_not_recursionerror(depth):
    # Regression guard for FINDING-S20: json.loads recurses per nesting level,
    # so a deeply nested model response used to escape as RecursionError.
    payload = '{"a":' * depth + "1" + "}" * depth
    with pytest.raises(ValueError):
        extract_json(payload)


@STRESS
@given(
    admin=st.one_of(st.none(), st.text(max_size=5)),
    pro_rata=st.one_of(st.none(), st.text(max_size=5)),
    values=st.lists(
        st.one_of(st.none(), st.integers(), st.text(max_size=8)), max_size=4
    ),
)
def test_coerce_fills_defaults(admin, pro_rata, values):
    raw = {
        "admin_fee_percentage": admin,
        "pro_rata_share": pro_rata,
        "extractions": [{"value": v, "source_text": ""} for v in values],
        "untouched": "keep me",
    }
    coerce_llm_output(raw)
    # None defaults filled; existing values preserved.
    assert raw["admin_fee_percentage"] == ("0" if admin is None else admin)
    assert raw["pro_rata_share"] == ("0" if pro_rata is None else pro_rata)
    assert raw["untouched"] == "keep me"
    for ext in raw["extractions"]:
        assert isinstance(ext["value"], str)  # always coerced to str
        assert ext["source_text"]  # blank source filled


@STRESS
@given(text=st.text(max_size=500), max_chars=st.integers(min_value=1, max_value=600))
def test_truncate_is_bounded_and_noop_when_short(text, max_chars):
    out = truncate_document(text, max_chars)
    if len(text) <= max_chars:
        assert out == text
    else:
        # Truncated body is at most max_chars, plus the fixed notice.
        notice = "\n\n[Document truncated — remaining pages omitted]"
        assert out.endswith(notice)
        assert len(out) <= max_chars + len(notice)


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
