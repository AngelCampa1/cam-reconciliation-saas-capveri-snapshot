"""
CalculationStep domain type for audit trail of reconciliation calculations.

Each CalculationStep represents a single step in the reconciliation calculation
process, capturing inputs, the operation performed, and the resulting output.
This enables complete audit trail and debugging of financial calculations.
"""

from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.services.formatting import format_usd


class CalculationStep(BaseModel):
    """
    A single step in a reconciliation calculation.

    Used for audit trail and debugging. Each step captures:
    - What inputs were used
    - What operation was performed
    - What output was produced
    - Any notes or warnings

    Example:
        CalculationStep(
            step_order=1,
            step_name="Calculate Actual Occupancy",
            input_values={"occupied_sqft": 45000, "total_sqft": 50000},
            operation="occupied_sqft / total_sqft",
            output_value=Decimal("0.90"),
            note=None
        )
    """

    step_order: int = Field(
        ...,
        ge=1,
        description="Order of this step in the calculation sequence (1-indexed)",
    )
    step_name: str = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Human-readable name for this calculation step",
    )
    input_values: dict[str, Any] = Field(
        ...,
        description="Input values used in this step",
    )
    input_units: dict[str, str] = Field(
        default_factory=dict,
        description=(
            "Unit tag per input key (currency/ratio/area/count/date/text). "
            "Keys absent here default to currency on display."
        ),
    )
    operation: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Formula or description of the operation performed",
    )
    output_value: Decimal | dict[str, Any] = Field(
        ...,
        description="Result of step (Decimal or dict for complex values)",
    )
    output_unit: str = Field(
        default="currency",
        description="Unit tag for output_value (defaults to currency).",
    )
    note: str | None = Field(
        None,
        max_length=500,
        description="Explanation, warning, or clarification about this step",
    )

    @field_validator("input_values")
    @classmethod
    def validate_input_values_not_empty(cls, v: dict[str, Any]) -> dict[str, Any]:
        """Ensure input_values is not empty."""
        if not v:
            raise ValueError("input_values cannot be empty")
        return v


class CalculationStepCreate(BaseModel):
    """
    DTO for creating a calculation step.

    All fields except note are required.
    """

    step_order: int = Field(..., ge=1)
    step_name: str = Field(..., min_length=1, max_length=100)
    input_values: dict[str, Any] = Field(...)
    input_units: dict[str, str] = Field(default_factory=dict)
    operation: str = Field(..., min_length=1, max_length=500)
    output_value: Decimal | dict[str, Any] = Field(...)
    output_unit: str = Field(default="currency")
    note: str | None = Field(None, max_length=500)

    @field_validator("input_values")
    @classmethod
    def validate_input_values_not_empty(cls, v: dict[str, Any]) -> dict[str, Any]:
        """Ensure input_values is not empty."""
        if not v:
            raise ValueError("input_values cannot be empty")
        return v


def create_calculation_step(
    step_order: int,
    step_name: str,
    input_values: dict[str, Any],
    operation: str,
    output_value: Decimal | dict[str, Any],
    note: str | None = None,
) -> CalculationStep:
    """
    Factory function to create a CalculationStep.

    Args:
        step_order: Order of this step (1-indexed)
        step_name: Human-readable name for the step
        input_values: Dict of inputs used in calculation
        operation: Formula or description of operation
        output_value: Result of the calculation
        note: Optional explanation or warning

    Returns:
        A validated CalculationStep instance
    """
    return CalculationStep(
        step_order=step_order,
        step_name=step_name,
        input_values=input_values,
        operation=operation,
        output_value=output_value,
        note=note,
    )


def format_step_summary(step: CalculationStep) -> str:
    """
    Format a calculation step as a human-readable summary.

    Args:
        step: The calculation step to format

    Returns:
        A formatted string summary of the step
    """
    output_str = (
        format_usd(step.output_value)
        if isinstance(step.output_value, Decimal)
        else str(step.output_value)
    )
    summary = f"Step {step.step_order}: {step.step_name} = {output_str}"
    if step.note:
        summary += f" ({step.note})"
    return summary


def validate_step_sequence(steps: list[CalculationStep]) -> bool:
    """
    Validate that a list of calculation steps has correct sequential ordering.

    Args:
        steps: List of calculation steps to validate

    Returns:
        True if steps are correctly ordered (1, 2, 3, ...)

    Raises:
        ValueError: If steps are not in sequential order starting from 1
    """
    if not steps:
        return True

    expected_order = 1
    for step in steps:
        if step.step_order != expected_order:
            raise ValueError(
                f"Expected step_order {expected_order}, got {step.step_order}"
            )
        expected_order += 1

    return True
