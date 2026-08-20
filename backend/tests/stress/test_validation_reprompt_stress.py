"""Property-based stress for the validation reflexion (re-prompt) loop.

``reprompt_invalid_fields`` runs after gap-fill: when the business-rule validator
reports a consistency ERROR (today only the cap pair — an orphaned ``cap_rate``
with ``cap_type`` == "none"), it re-prompts the model to reconcile the coupled
fields and patches ``merged`` in place. Three contracts are load-bearing:

  * **bounded**: it never loops more than ``max_attempts`` model calls, so a
    model that keeps returning inconsistent values cannot hang the pipeline;
  * **scoped patching**: it overwrites ONLY the coupled reconciliation fields —
    a hallucinated extra key must never clobber unrelated good data;
  * **fail-open**: a model/transport error, or a model that returns nothing
    usable, returns ``merged`` (with prior patches) and never raises — a human
    verifies in the HITL UI regardless.

This harness pins those plus the early-exit-when-fixed and token-accounting
behaviour, using a fake OpenRouter client (the only external boundary).

Run standalone:
    pytest tests/stress/test_validation_reprompt_stress.py -q
"""

from __future__ import annotations

import asyncio
import json

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.extraction.validation_reprompt import reprompt_invalid_fields

STRESS = settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)


def _orphan_merged() -> dict:
    """A merged dict that is pydantic-valid but trips the cap-consistency ERROR:
    a cap_rate present while cap_type is "none" (orphaned rate)."""
    return {
        "pro_rata_share": "0.5",
        "cap_type": "none",
        "cap_rate": "0.05",
        "extractions": [
            {
                "field": "pro_rata_share",
                "value": "0.5",
                "confidence": 90,
                "source_text": "x",
            }
        ],
        "unrelated_keep_me": "ORIGINAL",
    }


class FakeReader:
    """Scripted OpenRouter stand-in that counts calls.

    ``mode``:
      * "fix"          — first call returns a consistent cap pair (cap removed)
      * "stay_invalid" — every call returns the same orphaned pair (never fixes)
      * "raise"        — first call raises
      * "no_keys"      — returns JSON with no reconciliation keys
    """

    def __init__(self, mode: str, tokens: int):
        self.mode = mode
        self.tokens = tokens
        self.calls = 0

    async def extract_pdf(self, *, prompt, pdf_bytes, filename, model, **kwargs):
        self.calls += 1
        if self.mode == "raise":
            raise RuntimeError("simulated model failure")
        if self.mode == "fix":
            body = {"cap_type": "none", "cap_rate": None}
        elif self.mode == "fix_structural":
            body = {"cap_type": "cumulative", "cap_rate": "0.06"}
        elif self.mode == "no_keys":
            body = {"some_other_key": 1}
        else:  # stay_invalid
            body = {"cap_type": "none", "cap_rate": "0.05"}
        return (json.dumps(body), self.tokens, model)


def _run(reader, merged, max_attempts):
    return asyncio.run(
        reprompt_invalid_fields(
            reader, b"%PDF", "lease.pdf", merged, max_attempts=max_attempts
        )
    )


@STRESS
@given(max_attempts=st.integers(1, 4), tokens=st.integers(0, 40))
def test_bounded_scoped_and_never_clobbers_unrelated(max_attempts, tokens):
    merged = _orphan_merged()
    reader = FakeReader("stay_invalid", tokens)
    result, total = _run(reader, merged, max_attempts)

    # Bounded: never more model calls than allowed.
    assert reader.calls == max_attempts
    assert total == tokens * max_attempts
    # Scoped: unrelated key is never touched by the patch loop.
    assert result["unrelated_keep_me"] == "ORIGINAL"
    # The model never fixed it, so it stays in the (still-invalid) patched state.
    assert result["cap_type"] == "none"
    assert result["cap_rate"] == "0.05"


@STRESS
@given(max_attempts=st.integers(1, 4), tokens=st.integers(1, 40))
def test_early_exit_when_model_reconciles(max_attempts, tokens):
    merged = _orphan_merged()
    reader = FakeReader("fix", tokens)
    result, total = _run(reader, merged, max_attempts)

    # One call reconciles (cap removed); the loop re-validates and stops.
    assert reader.calls == 1
    assert total == tokens
    assert result["cap_rate"] is None
    assert result["unrelated_keep_me"] == "ORIGINAL"


@STRESS
@given(max_attempts=st.integers(1, 4))
def test_fail_open_on_model_error(max_attempts):
    merged = _orphan_merged()
    reader = FakeReader("raise", 10)
    result, total = _run(reader, merged, max_attempts)  # must not raise

    # Errored before counting tokens; merged returned unchanged (no patch).
    assert reader.calls == 1
    assert total == 0
    assert result["cap_type"] == "none"
    assert result["cap_rate"] == "0.05"
    assert result["unrelated_keep_me"] == "ORIGINAL"


@STRESS
@given(max_attempts=st.integers(1, 4), tokens=st.integers(0, 40))
def test_no_usable_keys_breaks(max_attempts, tokens):
    merged = _orphan_merged()
    reader = FakeReader("no_keys", tokens)
    result, total = _run(reader, merged, max_attempts)

    # Nothing usable for the coupled fields → stop after one round.
    assert reader.calls == 1
    assert total == tokens
    assert result["cap_rate"] == "0.05"  # unchanged
    assert result["unrelated_keep_me"] == "ORIGINAL"


@STRESS
@given(max_attempts=st.integers(1, 4))
def test_structurally_invalid_cap_pair_reprompts(max_attempts):
    # cap_type set to a real cap with NO cap_rate → pydantic rejects it, so the
    # validator can't reconcile and the loop breaks before any model call.
    merged = {
        "pro_rata_share": "0.5",
        "cap_type": "cumulative",
        "cap_rate": None,
        "extractions": [
            {"field": "x", "value": "y", "confidence": 90, "source_text": "z"}
        ],
    }
    reader = FakeReader("fix_structural", 5)
    result, total = _run(reader, merged, max_attempts)
    assert reader.calls == 1
    assert total == 5
    assert result["cap_type"] == "cumulative"
    assert result["cap_rate"] == "0.06"


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
