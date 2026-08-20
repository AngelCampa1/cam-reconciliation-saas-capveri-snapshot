from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.services.calculation.models import (
    UNIT_COUNT,
    UNIT_CURRENCY,
    UNIT_RATIO,
    UNIT_TEXT,
    CalculationStep,
    CalculationTrace,
)


def test_calculation_trace_has_engine_version_field():
    trace = CalculationTrace(
        calculation_type="tenant_share",
        property_id=uuid4(),
        period_start=date(2025, 1, 1),
        period_end=date(2025, 12, 31),
        engine_version="abc1234567890abc1234567890abc1234567890ab",
    )
    assert trace.engine_version == "abc1234567890abc1234567890abc1234567890ab"


def test_calculation_trace_engine_version_defaults_empty():
    trace = CalculationTrace(
        calculation_type="occupancy",
        property_id=uuid4(),
        period_start=date(2025, 1, 1),
        period_end=date(2025, 12, 31),
    )
    assert trace.engine_version == ""


def test_calculation_step_unit_fields_default():
    """CalculationStep defaults: input_units={}, output_unit='currency'."""
    step = CalculationStep(
        step_order=1,
        step_name="Test step",
        input_values={"amount": "100.00"},
        operation="passthrough",
        output_value="100.00",
    )
    assert step.input_units == {}
    assert step.output_unit == UNIT_CURRENCY


def test_add_step_stores_input_units_and_output_unit():
    """add_step passes input_units and output_unit through to the stored step."""
    trace = CalculationTrace(
        calculation_type="occupancy",
        property_id=uuid4(),
        period_start=date(2025, 1, 1),
        period_end=date(2025, 12, 31),
    )
    trace.add_step(
        name="Calculate occupancy rate",
        inputs={
            "total_weighted_sqft": Decimal("9000"),
            "total_rentable_sqft": Decimal("10000"),
        },
        operation="weighted / total",
        output=Decimal("0.9000"),
        input_units={"total_weighted_sqft": "area", "total_rentable_sqft": "area"},
        output_unit=UNIT_RATIO,
    )
    step = trace.steps[0]
    assert step.input_units == {
        "total_weighted_sqft": "area",
        "total_rentable_sqft": "area",
    }
    assert step.output_unit == UNIT_RATIO


def test_add_step_defaults_when_units_omitted():
    """add_step uses defaults when input_units and output_unit are omitted."""
    trace = CalculationTrace(
        calculation_type="tenant_share",
        property_id=uuid4(),
        period_start=date(2025, 1, 1),
        period_end=date(2025, 12, 31),
    )
    trace.add_step(
        name="Total recovery",
        inputs={"share": Decimal("5000.00"), "admin_fee": Decimal("250.00")},
        operation="share + admin_fee",
        output=Decimal("5250.00"),
    )
    step = trace.steps[0]
    assert step.input_units == {}
    assert step.output_unit == UNIT_CURRENCY


def test_calculation_step_serialization_round_trip():
    """input_units and output_unit survive a JSON round-trip via model_dump."""
    step = CalculationStep(
        step_order=1,
        step_name="Annotated step",
        input_values={"count": "365", "label": "Q1"},
        input_units={"count": UNIT_COUNT, "label": UNIT_TEXT},
        operation="passthrough",
        output_value="365",
        output_unit=UNIT_COUNT,
    )
    dumped = step.model_dump(mode="json")
    restored = CalculationStep.model_validate(dumped)
    assert restored.input_units == {"count": UNIT_COUNT, "label": UNIT_TEXT}
    assert restored.output_unit == UNIT_COUNT


def test_add_step_rejects_invalid_output_unit():
    """A typo'd output_unit is rejected so it cannot silently render as currency."""
    trace = CalculationTrace(
        calculation_type="occupancy",
        property_id=uuid4(),
        period_start=date(2025, 1, 1),
        period_end=date(2025, 12, 31),
    )
    with pytest.raises(ValueError, match="Invalid output_unit"):
        trace.add_step(
            name="Bad output unit",
            inputs={"amount": Decimal("100.00")},
            operation="passthrough",
            output=Decimal("100.00"),
            output_unit="raito",
        )
    assert trace.steps == []


def test_add_step_rejects_invalid_input_unit():
    """A typo'd input unit tag is rejected before the step is recorded."""
    trace = CalculationTrace(
        calculation_type="occupancy",
        property_id=uuid4(),
        period_start=date(2025, 1, 1),
        period_end=date(2025, 12, 31),
    )
    with pytest.raises(ValueError, match="Invalid input unit"):
        trace.add_step(
            name="Bad input unit",
            inputs={"sqft": Decimal("10000")},
            operation="passthrough",
            output=Decimal("10000"),
            input_units={"sqft": "aera"},
        )
    assert trace.steps == []
