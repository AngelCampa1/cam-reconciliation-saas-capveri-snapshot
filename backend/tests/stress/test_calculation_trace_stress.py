"""Property-based stress for ``CalculationTrace.add_step`` (audit-trail builder).

Every calculation in the engine records its work through ``add_step`` so the
frontend can render a regulator-facing audit trail. Two behaviours must hold no
matter how steps are added:

  * **Unit-tag validation** — ``output_unit`` and every ``input_units`` value must
    be one of VALID_UNITS. A typo'd tag (e.g. "raito") must raise ValueError and
    leave the trace unchanged, rather than silently falling back to currency
    formatting and mislabeling a ratio as "$0.95". (Same audit-correctness class
    as the gross-up safety-valve flag bug.)
  * **Monotonic step ordering** — successful steps get ``step_order`` 1, 2, 3 …
    contiguous with no gaps, and a rejected step never consumes an order number.

This harness drives random valid/invalid step sequences and re-derives the
expected trace from scratch.

Run standalone:
    pytest tests/stress/test_calculation_trace_stress.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.services.calculation.models import (
    VALID_UNITS,
    CalculationTrace,
)

STRESS = settings(
    max_examples=400,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.filter_too_much],
)

valid_unit = st.sampled_from(sorted(VALID_UNITS))
# Tags that are NOT valid units (typos / wrong vocabulary).
invalid_unit = st.sampled_from(["raito", "dollars", "sqft", "", "Currency", "%", "usd"])

step_value = st.one_of(
    st.decimals(
        min_value=Decimal("-1000000"),
        max_value=Decimal("1000000"),
        places=2,
        allow_nan=False,
        allow_infinity=False,
    ),
    st.integers(min_value=-10000, max_value=10000),
    st.dates(),
)
input_key = st.text(
    alphabet=st.characters(min_codepoint=97, max_codepoint=122), min_size=1, max_size=6
)


def _new_trace() -> CalculationTrace:
    return CalculationTrace(
        calculation_type="test",
        property_id=UUID(int=0),
        period_start=date(2024, 1, 1),
        period_end=date(2024, 12, 31),
    )


@STRESS
@given(
    steps=st.lists(
        st.fixed_dictionaries(
            {
                "inputs": st.dictionaries(input_key, step_value, max_size=3),
                "output": step_value,
                "output_unit": st.one_of(valid_unit, invalid_unit),
                "input_units_valid": st.booleans(),
            }
        ),
        min_size=0,
        max_size=12,
    )
)
def test_add_step_validation_and_ordering(steps):
    trace = _new_trace()
    expected_appended = 0

    for spec in steps:
        inputs = spec["inputs"]
        output = spec["output"]
        output_unit = spec["output_unit"]
        # Build input_units that is either all-valid or contains one invalid tag.
        if inputs and not spec["input_units_valid"]:
            bad_key = next(iter(inputs))
            input_units = {bad_key: "raito"}
        else:
            input_units = {k: "currency" for k in inputs}

        output_ok = output_unit in VALID_UNITS
        input_units_ok = all(u in VALID_UNITS for u in input_units.values())

        if output_ok and input_units_ok:
            trace.add_step(
                name="step",
                inputs=inputs,
                operation="op",
                output=output,
                input_units=input_units,
                output_unit=output_unit,
            )
            expected_appended += 1
            # Newly appended step carries the correct 1-based order and stringified
            # values.
            last = trace.steps[-1]
            assert last.step_order == expected_appended
            assert last.output_value == str(output)
            assert last.output_unit == output_unit
            assert last.input_values == {k: str(v) for k, v in inputs.items()}
        else:
            before = len(trace.steps)
            with pytest.raises(ValueError):
                trace.add_step(
                    name="step",
                    inputs=inputs,
                    operation="op",
                    output=output,
                    input_units=input_units,
                    output_unit=output_unit,
                )
            # Rejected step left the trace untouched.
            assert len(trace.steps) == before

    # Final ordering is a contiguous 1..N with no gaps from rejected steps.
    assert [s.step_order for s in trace.steps] == list(range(1, expected_appended + 1))


def test_add_step_defaults_to_currency_output_unit():
    trace = _new_trace()
    trace.add_step(
        name="s", inputs={"a": Decimal("1.50")}, operation="op", output=Decimal("3.00")
    )
    step = trace.steps[0]
    assert step.output_unit == "currency"
    assert step.input_units == {}
    assert step.input_values == {"a": "1.50"}
    assert step.output_value == "3.00"


def test_add_step_rejects_typo_unit_and_preserves_trace():
    trace = _new_trace()
    trace.add_step(
        name="ok",
        inputs={"r": Decimal("0.95")},
        operation="op",
        output=Decimal("0.95"),
        input_units={"r": "ratio"},
        output_unit="ratio",
    )
    with pytest.raises(ValueError, match="Invalid output_unit"):
        trace.add_step(
            name="bad",
            inputs={},
            operation="op",
            output=Decimal("1"),
            output_unit="raito",
        )
    with pytest.raises(ValueError, match="Invalid input unit"):
        trace.add_step(
            name="bad2",
            inputs={"x": Decimal("1")},
            operation="op",
            output=Decimal("1"),
            input_units={"x": "sqft"},
        )
    # Only the first valid step survived; ordering intact.
    assert len(trace.steps) == 1
    assert trace.steps[0].step_order == 1


if __name__ == "__main__":
    pytest.main([__file__, "-q"])
