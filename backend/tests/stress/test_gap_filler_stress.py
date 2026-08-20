"""Property-based stress for the extraction gap-filler.

After the dual-extract merge, ``fill_fields`` re-extracts only the critical
fields that are still ``None`` and patches them in place. Two contracts are
load-bearing: it must be **fail-open** (one field's model call blowing up must
not abort the others) and it must **never clobber** a value the main extraction
already produced. A regression here would silently overwrite good data or drop
the whole gap-fill pass on a single bad field. This harness pins both, plus the
token accounting, using a fake OpenRouter client (the only external boundary).

Invariants:
  * **missing-field detection is exact**: get_missing_critical_fields returns
    exactly the CRITICAL_FIELDS that are None or absent in the merged dict;
  * **never clobbers**: any field that was already non-None in merged keeps its
    original value, regardless of what the model returns for it;
  * **fills only valid Nones**: a field ends up filled iff it was None, has a
    prompt, and the model returned a non-None value for it; failed/garbage calls
    leave it None (fail-open);
  * **token accounting**: returned token total equals the sum of tokens reported
    by every successful model call.

Run standalone:
    pytest tests/stress/test_gap_filler_stress.py -q
"""

from __future__ import annotations

import asyncio
import json

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.extraction.gap_filler import (
    CRITICAL_FIELDS,
    fill_fields,
    get_missing_critical_fields,
)
from app.services.extraction.gap_filler_prompts import GAP_FILLER_PROMPTS

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)


class FakeReader:
    """Stand-in for OpenRouterClient: scripted per-field responses.

    ``behaviors`` maps a field name to one of:
      * ("ok", value, tokens) — return JSON {field: value} with that token count
      * ("raise", _, _)       — raise (simulates a model/transport failure)
      * ("garbage", _, tokens)— return non-JSON text (extract_json → ValueError)
    """

    def __init__(self, behaviors: dict[str, tuple]):
        self._behaviors = behaviors

    async def extract_pdf(self, *, prompt, pdf_bytes, filename, model, **kwargs):
        # Identify which field this call is for via its prompt.
        field = next((f for f, p in GAP_FILLER_PROMPTS.items() if p == prompt), None)
        kind, value, tokens = self._behaviors.get(field, ("garbage", None, 0))
        if kind == "raise":
            raise RuntimeError(f"simulated model failure for {field}")
        if kind == "garbage":
            return ("not json at all {", tokens, model)
        return (json.dumps({field: value}), tokens, model)


# Critical fields that have a prompt (only these can ever be filled).
_PROMPTED = [f for f in CRITICAL_FIELDS if f in GAP_FILLER_PROMPTS]

field_values = st.one_of(st.none(), st.text(max_size=6), st.integers(-5, 5))
behavior_kinds = st.sampled_from(["ok", "raise", "garbage"])


@STRESS
@given(
    merged=st.fixed_dictionaries(
        {f: field_values for f in CRITICAL_FIELDS}, optional={}
    ),
)
def test_missing_critical_fields_exact(merged):
    expected = [f for f in CRITICAL_FIELDS if merged.get(f) is None]
    assert get_missing_critical_fields(merged) == expected


@STRESS
@given(
    presence=st.lists(st.booleans(), min_size=5, max_size=5),
    behaviors=st.lists(
        st.tuples(behavior_kinds, st.integers(-3, 3), st.integers(0, 50)),
        min_size=5,
        max_size=5,
    ),
)
def test_fill_is_fail_open_and_never_clobbers(presence, behaviors):
    # Build a merged dict: some critical fields already have a value, others None.
    merged = {}
    originals = {}
    for field, present in zip(CRITICAL_FIELDS, presence):
        merged[field] = "ORIGINAL" if present else None
        originals[field] = merged[field]

    behavior_map = {field: behaviors[i] for i, field in enumerate(CRITICAL_FIELDS)}
    reader = FakeReader(behavior_map)
    missing = get_missing_critical_fields(merged)

    result, total_tokens = asyncio.run(
        fill_fields(reader, b"%PDF-fake", "lease.pdf", missing, merged)
    )

    expected_tokens = 0
    for field in missing:
        kind, value, tokens = behavior_map[field]
        prompted = field in GAP_FILLER_PROMPTS
        if not prompted:
            # No prompt → no call, field stays None.
            assert result[field] is None
            continue
        if kind == "ok":
            expected_tokens += tokens
            if value is None:
                assert result[field] is None  # model returned null → not filled
            else:
                assert result[field] == value
        elif kind == "garbage":
            expected_tokens += tokens  # tokens counted before parse failure
            assert result[field] is None  # parse failed → fail-open, stays None
        else:  # raise — no tokens counted (exception before increment? no: after)
            assert result[field] is None

    # Never clobbered an already-present value.
    for field, present in zip(CRITICAL_FIELDS, presence):
        if present:
            assert result[field] == originals[field] == "ORIGINAL"

    assert total_tokens == expected_tokens


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
