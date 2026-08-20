"""Tests for the CalculationStep model and helper functions."""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.models.calculation_step import (
    CalculationStep,
    CalculationStepCreate,
    create_calculation_step,
    format_step_summary,
    validate_step_sequence,
)


class TestCalculationStep:
    """Tests for the CalculationStep model."""

    def test_valid_step_with_decimal_output(self):
        """Test creating a step with a Decimal output value."""
        step = CalculationStep(
            step_order=1,
            step_name="Calculate Actual Occupancy",
            input_values={"occupied_sqft": 45000, "total_sqft": 50000},
            operation="occupied_sqft / total_sqft",
            output_value=Decimal("0.90"),
            note=None,
        )
        assert step.step_order == 1
        assert step.step_name == "Calculate Actual Occupancy"
        assert step.input_values == {"occupied_sqft": 45000, "total_sqft": 50000}
        assert step.operation == "occupied_sqft / total_sqft"
        assert step.output_value == Decimal("0.90")
        assert step.note is None

    def test_valid_step_with_dict_output(self):
        """Test creating a step with a dict output value."""
        step = CalculationStep(
            step_order=2,
            step_name="Calculate Pool Allocations",
            input_values={"total_expenses": Decimal("100000.00")},
            operation="Allocate expenses across pools",
            output_value={
                "cam_pool": Decimal("60000.00"),
                "tax_pool": Decimal("40000.00"),
            },
            note="Allocation based on GL account mappings",
        )
        assert step.step_order == 2
        assert step.output_value == {
            "cam_pool": Decimal("60000.00"),
            "tax_pool": Decimal("40000.00"),
        }
        assert step.note == "Allocation based on GL account mappings"

    def test_valid_step_with_note(self):
        """Test creating a step with a note."""
        step = CalculationStep(
            step_order=3,
            step_name="Apply Gross-Up Factor",
            input_values={"base_amount": Decimal("1000.00"), "factor": Decimal("1.05")},
            operation="base_amount * factor",
            output_value=Decimal("1050.00"),
            note="Gross-up factor capped at 1.05 due to 95% target occupancy",
        )
        assert step.note == "Gross-up factor capped at 1.05 due to 95% target occupancy"

    def test_step_order_must_be_positive(self):
        """Test that step_order must be >= 1."""
        with pytest.raises(ValidationError) as exc_info:
            CalculationStep(
                step_order=0,
                step_name="Invalid Step",
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
            )
        assert "greater than or equal to 1" in str(exc_info.value)

    def test_step_order_cannot_be_negative(self):
        """Test that step_order cannot be negative."""
        with pytest.raises(ValidationError) as exc_info:
            CalculationStep(
                step_order=-1,
                step_name="Invalid Step",
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
            )
        assert "greater than or equal to 1" in str(exc_info.value)

    def test_step_name_required(self):
        """Test that step_name is required."""
        with pytest.raises(ValidationError) as exc_info:
            CalculationStep(
                step_order=1,
                step_name="",
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
            )
        assert "String should have at least 1 character" in str(exc_info.value)

    def test_step_name_max_length(self):
        """Test that step_name has max 100 characters."""
        with pytest.raises(ValidationError) as exc_info:
            CalculationStep(
                step_order=1,
                step_name="A" * 101,
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
            )
        assert "String should have at most 100 characters" in str(exc_info.value)

    def test_input_values_cannot_be_empty(self):
        """Test that input_values cannot be empty."""
        with pytest.raises(ValidationError) as exc_info:
            CalculationStep(
                step_order=1,
                step_name="Test Step",
                input_values={},
                operation="test",
                output_value=Decimal("0"),
            )
        assert "input_values cannot be empty" in str(exc_info.value)

    def test_operation_required(self):
        """Test that operation is required and non-empty."""
        with pytest.raises(ValidationError) as exc_info:
            CalculationStep(
                step_order=1,
                step_name="Test Step",
                input_values={"a": 1},
                operation="",
                output_value=Decimal("0"),
            )
        assert "String should have at least 1 character" in str(exc_info.value)

    def test_operation_max_length(self):
        """Test that operation has max 500 characters."""
        with pytest.raises(ValidationError) as exc_info:
            CalculationStep(
                step_order=1,
                step_name="Test Step",
                input_values={"a": 1},
                operation="A" * 501,
                output_value=Decimal("0"),
            )
        assert "String should have at most 500 characters" in str(exc_info.value)

    def test_note_max_length(self):
        """Test that note has max 500 characters."""
        with pytest.raises(ValidationError) as exc_info:
            CalculationStep(
                step_order=1,
                step_name="Test Step",
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
                note="A" * 501,
            )
        assert "String should have at most 500 characters" in str(exc_info.value)

    def test_nested_input_values(self):
        """Test that input_values can contain nested structures."""
        step = CalculationStep(
            step_order=1,
            step_name="Complex Calculation",
            input_values={
                "tenant_info": {"name": "Acme Corp", "pro_rata_share": Decimal("0.25")},
                "expenses": [Decimal("1000.00"), Decimal("2000.00")],
            },
            operation="sum(expenses) * tenant_info.pro_rata_share",
            output_value=Decimal("750.00"),
        )
        assert step.input_values["tenant_info"]["name"] == "Acme Corp"
        assert step.input_values["expenses"] == [
            Decimal("1000.00"),
            Decimal("2000.00"),
        ]


class TestCalculationStepCreate:
    """Tests for the CalculationStepCreate DTO."""

    def test_valid_create(self):
        """Test creating a valid CalculationStepCreate."""
        create = CalculationStepCreate(
            step_order=1,
            step_name="Calculate Total",
            input_values={"a": 100, "b": 200},
            operation="a + b",
            output_value=Decimal("300.00"),
        )
        assert create.step_order == 1
        assert create.note is None

    def test_create_with_note(self):
        """Test creating with an optional note."""
        create = CalculationStepCreate(
            step_order=1,
            step_name="Calculate Total",
            input_values={"a": 100, "b": 200},
            operation="a + b",
            output_value=Decimal("300.00"),
            note="Simple addition",
        )
        assert create.note == "Simple addition"

    def test_create_validates_input_values(self):
        """Test that create also validates input_values."""
        with pytest.raises(ValidationError) as exc_info:
            CalculationStepCreate(
                step_order=1,
                step_name="Test",
                input_values={},
                operation="test",
                output_value=Decimal("0"),
            )
        assert "input_values cannot be empty" in str(exc_info.value)


class TestCreateCalculationStepFactory:
    """Tests for the create_calculation_step factory function."""

    def test_factory_creates_valid_step(self):
        """Test that factory creates a valid step."""
        step = create_calculation_step(
            step_order=1,
            step_name="Occupancy Calculation",
            input_values={"occupied": 9000, "total": 10000},
            operation="occupied / total",
            output_value=Decimal("0.90"),
        )
        assert isinstance(step, CalculationStep)
        assert step.step_order == 1
        assert step.output_value == Decimal("0.90")

    def test_factory_with_note(self):
        """Test factory with optional note."""
        step = create_calculation_step(
            step_order=2,
            step_name="Gross-Up",
            input_values={"factor": Decimal("1.0556")},
            operation="apply gross-up",
            output_value=Decimal("1055.60"),
            note="Factor limited by safety valve",
        )
        assert step.note == "Factor limited by safety valve"

    def test_factory_validates_inputs(self):
        """Test that factory validates inputs."""
        with pytest.raises(ValidationError):
            create_calculation_step(
                step_order=0,  # Invalid
                step_name="Test",
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
            )


class TestFormatStepSummary:
    """Tests for the format_step_summary function."""

    def test_format_decimal_output(self):
        """Test formatting a step with Decimal output."""
        step = CalculationStep(
            step_order=1,
            step_name="Calculate Total",
            input_values={"a": 1},
            operation="test",
            output_value=Decimal("12345.67"),
        )
        summary = format_step_summary(step)
        assert summary == "Step 1: Calculate Total = $12,345.67"

    def test_format_dict_output(self):
        """Test formatting a step with dict output."""
        step = CalculationStep(
            step_order=2,
            step_name="Split Allocation",
            input_values={"a": 1},
            operation="test",
            output_value={"pool_a": Decimal("500.00"), "pool_b": Decimal("500.00")},
        )
        summary = format_step_summary(step)
        assert "Step 2: Split Allocation = " in summary
        assert "pool_a" in summary

    def test_format_with_note(self):
        """Test formatting includes note."""
        step = CalculationStep(
            step_order=3,
            step_name="Apply Cap",
            input_values={"a": 1},
            operation="test",
            output_value=Decimal("1000.00"),
            note="Cap exceeded",
        )
        summary = format_step_summary(step)
        assert summary == "Step 3: Apply Cap = $1,000.00 (Cap exceeded)"

    def test_format_large_amount(self):
        """Test formatting large amounts with commas."""
        step = CalculationStep(
            step_order=1,
            step_name="Total Recovery",
            input_values={"a": 1},
            operation="test",
            output_value=Decimal("1234567.89"),
        )
        summary = format_step_summary(step)
        assert summary == "Step 1: Total Recovery = $1,234,567.89"

    def test_format_negative_amount(self):
        """Test formatting negative amounts."""
        step = CalculationStep(
            step_order=1,
            step_name="Credit Adjustment",
            input_values={"a": 1},
            operation="test",
            output_value=Decimal("-500.00"),
        )
        summary = format_step_summary(step)
        assert summary == "Step 1: Credit Adjustment = -$500.00"


class TestValidateStepSequence:
    """Tests for the validate_step_sequence function."""

    def test_empty_list_is_valid(self):
        """Test that an empty list is valid."""
        assert validate_step_sequence([]) is True

    def test_single_step_is_valid(self):
        """Test that a single step starting at 1 is valid."""
        steps = [
            CalculationStep(
                step_order=1,
                step_name="Only Step",
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
            )
        ]
        assert validate_step_sequence(steps) is True

    def test_sequential_steps_are_valid(self):
        """Test that sequential steps 1, 2, 3 are valid."""
        steps = [
            CalculationStep(
                step_order=i,
                step_name=f"Step {i}",
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
            )
            for i in range(1, 4)
        ]
        assert validate_step_sequence(steps) is True

    def test_gap_in_sequence_raises_error(self):
        """Test that a gap in sequence raises ValueError."""
        steps = [
            CalculationStep(
                step_order=1,
                step_name="Step 1",
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
            ),
            CalculationStep(
                step_order=3,  # Gap - should be 2
                step_name="Step 3",
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
            ),
        ]
        with pytest.raises(ValueError) as exc_info:
            validate_step_sequence(steps)
        assert "Expected step_order 2, got 3" in str(exc_info.value)

    def test_not_starting_at_one_raises_error(self):
        """Test that not starting at 1 raises ValueError."""
        steps = [
            CalculationStep(
                step_order=2,  # Should start at 1
                step_name="Step 2",
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
            ),
        ]
        with pytest.raises(ValueError) as exc_info:
            validate_step_sequence(steps)
        assert "Expected step_order 1, got 2" in str(exc_info.value)

    def test_out_of_order_raises_error(self):
        """Test that out of order steps raise ValueError."""
        steps = [
            CalculationStep(
                step_order=1,
                step_name="Step 1",
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
            ),
            CalculationStep(
                step_order=3,
                step_name="Step 3",
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
            ),
            CalculationStep(
                step_order=2,
                step_name="Step 2",
                input_values={"a": 1},
                operation="test",
                output_value=Decimal("0"),
            ),
        ]
        with pytest.raises(ValueError) as exc_info:
            validate_step_sequence(steps)
        assert "Expected step_order 2, got 3" in str(exc_info.value)


class TestSerialization:
    """Tests for model serialization."""

    def test_to_dict(self):
        """Test converting model to dictionary."""
        step = CalculationStep(
            step_order=1,
            step_name="Test",
            input_values={"a": Decimal("1.5")},
            operation="test",
            output_value=Decimal("100.00"),
            note="Test note",
        )
        data = step.model_dump()
        assert data["step_order"] == 1
        assert data["step_name"] == "Test"
        assert data["output_value"] == Decimal("100.00")
        assert data["note"] == "Test note"

    def test_to_json(self):
        """Test converting model to JSON."""
        step = CalculationStep(
            step_order=1,
            step_name="Test",
            input_values={"value": 100},
            operation="test",
            output_value=Decimal("100.00"),
        )
        json_str = step.model_dump_json()
        assert '"step_order":1' in json_str
        assert '"step_name":"Test"' in json_str

    def test_dict_output_serializes(self):
        """Test that dict output values serialize correctly."""
        step = CalculationStep(
            step_order=1,
            step_name="Multi-Output",
            input_values={"total": 1000},
            operation="split",
            output_value={"a": Decimal("500.00"), "b": Decimal("500.00")},
        )
        data = step.model_dump()
        assert data["output_value"]["a"] == Decimal("500.00")


class TestImports:
    """Tests for model imports from the models package."""

    def test_import_from_models(self):
        """Test that models can be imported from the main package."""
        from app.models import (
            CalculationStep,
            create_calculation_step,
            format_step_summary,
            validate_step_sequence,
        )

        # Verify we can create instances
        step = CalculationStep(
            step_order=1,
            step_name="Import Test",
            input_values={"test": True},
            operation="test import",
            output_value=Decimal("1.00"),
        )
        assert step.step_order == 1

        # Verify factory works
        created = create_calculation_step(
            step_order=2,
            step_name="Factory Test",
            input_values={"a": 1},
            operation="test",
            output_value=Decimal("2.00"),
        )
        assert created.step_order == 2

        # Verify helper functions work
        assert format_step_summary(step) == "Step 1: Import Test = $1.00"
        assert validate_step_sequence([step, created]) is True
