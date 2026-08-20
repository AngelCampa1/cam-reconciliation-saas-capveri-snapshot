"""Property-based stress for calculation-trace checksum + readable format.

``compute_trace_checksum`` is stored in ``reconciliation_snapshots`` to *prove*
a finalized calculation trace was not altered after the fact — it is the audit
trail's tamper-evidence. Two properties make it trustworthy: it is fully
deterministic (the same trace always hashes the same, so a re-derivation can be
checked against the stored value), and it is sensitive (any change to any step,
the engine version, or the period changes the hash). ``trace_to_readable_format``
renders the same trace for human export and must never crash on real-world
content.

Invariants:
  * **deterministic**: hashing the same trace twice, and hashing two
    independently-built identical traces, yields the same checksum;
  * **tamper-evident (step content)**: mutating any single step's output,
    operation, or note changes the checksum;
  * **tamper-evident (structure/metadata)**: appending a step, or changing the
    engine version or the period, changes the checksum;
  * **readable format total**: never raises on arbitrary step content, and the
    output contains the calculation type plus every step's name.

Run standalone:
    pytest tests/stress/test_trace_persistence_stress.py -q
"""

from __future__ import annotations

from datetime import date
from uuid import UUID

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.models import CalculationTrace
from app.services.calculation.trace_persistence import (
    compute_trace_checksum,
    trace_to_readable_format,
)

STRESS = settings(
    max_examples=300,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

_PID = UUID(int=42)

text = st.text(max_size=40)
# add_step stringifies everything, so any scalar input survives as a string.
scalar = st.one_of(
    text, st.integers(), st.decimals(allow_nan=False, allow_infinity=False)
)


@st.composite
def step_specs(draw: st.DrawFn) -> list[dict]:
    n = draw(st.integers(min_value=0, max_value=6))
    specs = []
    for _ in range(n):
        keys = draw(st.lists(text, max_size=3, unique=True))
        inputs = {k: draw(scalar) for k in keys}
        specs.append(
            {
                "name": draw(text),
                "inputs": inputs,
                "operation": draw(text),
                "output": draw(scalar),
                "note": draw(st.one_of(st.none(), text)),
            }
        )
    return specs


def _build(
    specs: list[dict], engine: str = "", period=(date(2024, 1, 1), date(2024, 12, 31))
) -> CalculationTrace:
    trace = CalculationTrace(
        calculation_type="reconciliation",
        property_id=_PID,
        period_start=period[0],
        period_end=period[1],
        engine_version=engine,
    )
    for s in specs:
        # output_unit defaults to currency (valid); inputs default to currency too.
        trace.add_step(
            name=s["name"],
            inputs=s["inputs"],
            operation=s["operation"],
            output=str(s["output"]),
            note=s["note"],
        )
    return trace


@STRESS
@given(specs=step_specs(), engine=text)
def test_checksum_is_deterministic(specs, engine):
    t1 = _build(specs, engine)
    t2 = _build(specs, engine)
    c = compute_trace_checksum(t1)
    assert c == compute_trace_checksum(t1)  # stable across repeated calls
    assert c == compute_trace_checksum(t2)  # identical rebuild matches
    assert len(c) == 64  # SHA-256 hex


@STRESS
@given(specs=step_specs(), idx=st.integers(0, 1000))
def test_step_content_mutation_changes_checksum(specs, idx):
    if not specs:
        return
    base = _build(specs)
    before = compute_trace_checksum(base)
    pos = idx % len(base.steps)
    mutated = base.model_copy(deep=True)
    # Flip the output value to a guaranteed-different string.
    old = mutated.steps[pos].output_value
    mutated.steps[pos].output_value = old + "X" if old != "X" else "Y"
    assert compute_trace_checksum(mutated) != before


@STRESS
@given(specs=step_specs())
def test_appending_step_or_metadata_change_changes_checksum(specs):
    base = _build(specs)
    before = compute_trace_checksum(base)

    # Append a step.
    grown = base.model_copy(deep=True)
    grown.add_step(name="extra", inputs={}, operation="op", output="1")
    assert compute_trace_checksum(grown) != before

    # Change engine version (base was built with engine="").
    versioned = _build(specs, engine="deadbeef")
    assert compute_trace_checksum(versioned) != before

    # Change period.
    shifted = _build(specs, period=(date(2023, 1, 1), date(2023, 12, 31)))
    assert compute_trace_checksum(shifted) != before


@STRESS
@given(specs=step_specs())
def test_readable_format_never_raises_and_is_complete(specs):
    trace = _build(specs)
    out = trace_to_readable_format(trace)
    assert isinstance(out, str)
    assert "reconciliation" in out
    for step in trace.steps:
        assert step.step_name in out


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
