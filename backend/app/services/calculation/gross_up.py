"""
Gross-up factor calculation.

BOMA standards require variable operating expenses to be
"grossed up" to a target occupancy level (typically 95%)
to fairly allocate costs among tenants.

Formula:
    factor = target_occupancy / actual_occupancy

Constraints:
    - Factor is always >= 1.0 (never gross down)
    - Factor is quantized to 4 decimal places for precision
    - Optional safety valve (max_factor) to cap extreme values
"""

from __future__ import annotations

import logging
from decimal import ROUND_HALF_UP, Decimal

from app.services.calculation.models import UNIT_RATIO, CalculationTrace

logger = logging.getLogger(__name__)


class GrossUpConfig:
    """Configuration for gross-up calculation.

    Defines the target occupancy, minimum factor, and optional
    maximum factor (safety valve) for gross-up calculations.
    """

    def __init__(
        self,
        target_occupancy: Decimal = Decimal("0.95"),
        min_factor: Decimal = Decimal("1.0"),
        max_factor: Decimal | None = None,
    ):
        """Initialize gross-up configuration.

        Args:
            target_occupancy: Target occupancy rate (default 95%)
            min_factor: Minimum allowed factor (default 1.0 - no gross down)
            max_factor: Optional maximum factor (safety valve)
        """
        self.target_occupancy = target_occupancy
        self.min_factor = min_factor
        self.max_factor = max_factor  # Safety valve


def calculate_gross_up_factor(
    actual_occupancy: Decimal,
    config: GrossUpConfig,
    trace: CalculationTrace | None = None,
) -> Decimal:
    """
    Calculate gross-up factor for variable expense allocation.

    The gross-up factor is used to allocate variable operating expenses
    fairly among tenants. When occupancy is below target, variable expenses
    are "grossed up" so tenants aren't penalized for vacant space.

    Formula: target_occupancy / actual_occupancy

    The factor is always >= 1.0 (never gross down). This ensures that
    when occupancy is at or above target, no adjustment is made.

    Args:
        actual_occupancy: Current occupancy rate (0-1)
        config: Gross-up configuration
        trace: Optional calculation trace for audit logging

    Returns:
        Gross-up factor (Decimal >= 1.0, 4 decimal places)
    """
    # AC3: Handle edge case of 0% occupancy
    if actual_occupancy <= 0:
        factor = config.min_factor
        if trace:
            trace.add_step(
                name="Gross-up factor (zero occupancy)",
                inputs={"actual_occupancy": actual_occupancy},
                operation="Use minimum factor (occupancy is zero)",
                output=factor,
                note="Cannot gross up with zero occupancy",
                input_units={"actual_occupancy": UNIT_RATIO},
                output_unit=UNIT_RATIO,
            )
        return factor

    # AC2: Factor never less than 1.0 - handle case where occupancy >= target
    if actual_occupancy >= config.target_occupancy:
        factor = config.min_factor
        if trace:
            trace.add_step(
                name="Gross-up factor (at or above target)",
                inputs={
                    "actual_occupancy": actual_occupancy,
                    "target_occupancy": config.target_occupancy,
                },
                operation="No gross-up needed (at target)",
                output=factor,
                note="Occupancy at or above target - no adjustment",
                input_units={
                    "actual_occupancy": UNIT_RATIO,
                    "target_occupancy": UNIT_RATIO,
                },
                output_unit=UNIT_RATIO,
            )
        return factor

    # AC1: Calculate factor as target_occupancy / actual_occupancy
    # AC4: Returns factor as Decimal with 4 decimal places
    factor = (config.target_occupancy / actual_occupancy).quantize(
        Decimal("0.0001"), rounding=ROUND_HALF_UP
    )

    # AC2: Apply minimum to ensure factor >= 1.0
    factor = max(factor, config.min_factor)

    # Apply maximum (safety valve) if configured
    if config.max_factor and factor > config.max_factor:
        original_factor = factor
        factor = config.max_factor
        if trace:
            trace.add_step(
                name="Apply safety valve",
                inputs={
                    "calculated_factor": original_factor,
                    "max_factor": config.max_factor,
                },
                operation="min(calculated, max_allowed)",
                output=factor,
                note="Safety valve applied - factor capped",
                input_units={"calculated_factor": UNIT_RATIO, "max_factor": UNIT_RATIO},
                output_unit=UNIT_RATIO,
            )

    # AC5: Log calculation for audit trail
    if trace:
        trace.add_step(
            name="Calculate gross-up factor",
            inputs={
                "target_occupancy": config.target_occupancy,
                "actual_occupancy": actual_occupancy,
            },
            operation=f"{config.target_occupancy} / {actual_occupancy}",
            output=factor,
            input_units={
                "target_occupancy": UNIT_RATIO,
                "actual_occupancy": UNIT_RATIO,
            },
            output_unit=UNIT_RATIO,
        )

    return factor


def apply_safety_valve(
    original_amount: Decimal,
    grossed_up_amount: Decimal,
    actual_occupancy: Decimal,
    target_occupancy: Decimal,
    trace: CalculationTrace | None = None,
) -> Decimal:
    """
    Apply safety valve to prevent grossed-up amount from exceeding
    100% occupancy equivalent.

    Story 6.4: Ensures grossed-up expenses never exceed what they
    would be at 100% occupancy.

    Args:
        original_amount: Original expense amount
        grossed_up_amount: Amount after gross-up factor applied
        actual_occupancy: Current occupancy rate
        target_occupancy: Target occupancy rate
        trace: Optional calculation trace

    Returns:
        Capped amount (never exceeds 100% occupancy equivalent)
    """
    # FIX FC-1: Robust check for zero/near-zero occupancy to prevent division
    # Check for zero, negative, or extremely small values that cause issues
    min_safe_occupancy = Decimal("0.0001")  # 0.01% minimum
    if actual_occupancy <= min_safe_occupancy:
        # Can't calculate 100% equivalent with zero/near-zero occupancy
        if trace:
            trace.add_step(
                name="Safety valve (zero/near-zero occupancy)",
                inputs={"actual_occupancy": actual_occupancy},
                operation="Return original (occupancy too low for safe division)",
                output=original_amount,
                note=f"Cannot apply safety valve: occupancy <= {min_safe_occupancy}",
                input_units={"actual_occupancy": UNIT_RATIO},
            )
        return original_amount

    # FIX FC-11: Calculate expense at 100% occupancy with higher precision
    # Use 6 decimal places for intermediate calculation, then quantize final result
    # This prevents precision loss when comparing against grossed_up_amount
    max_at_full_occupancy = (original_amount / actual_occupancy).quantize(
        Decimal("0.000001"), rounding=ROUND_HALF_UP
    )

    # If grossed up amount exceeds 100% equivalent, cap it
    if grossed_up_amount > max_at_full_occupancy:
        if trace:
            trace.add_step(
                name="Apply safety valve",
                inputs={
                    "grossed_up_amount": grossed_up_amount,
                    "max_at_100_percent": max_at_full_occupancy,
                },
                operation="min(grossed_up, max_at_100%)",
                output=max_at_full_occupancy,
                note="Safety valve applied - capped at 100% occupancy equivalent",
            )
        return max_at_full_occupancy

    # No cap needed
    if trace:
        trace.add_step(
            name="Safety valve check",
            inputs={
                "grossed_up_amount": grossed_up_amount,
                "max_at_100_percent": max_at_full_occupancy,
            },
            operation="No cap needed",
            output=grossed_up_amount,
            note="Grossed-up amount within safe limits",
        )

    return grossed_up_amount


def calculate_grossed_up_expenses(
    original_amount: Decimal,
    actual_occupancy: Decimal,
    target_occupancy: Decimal = Decimal("0.95"),
    apply_safety: bool = True,
    trace: CalculationTrace | None = None,
) -> Decimal:
    """
    Calculate grossed-up expense amount with optional safety valve.

    Combines gross-up factor calculation with safety valve application.
    Story 6.4 and 6.5 orchestration function.

    Args:
        original_amount: Original expense amount
        actual_occupancy: Current occupancy rate (0-1)
        target_occupancy: Target occupancy rate (default 0.95)
        apply_safety: Whether to apply safety valve (default True)
        trace: Optional calculation trace

    Returns:
        Grossed-up amount (with safety valve if enabled)
    """
    config = GrossUpConfig(target_occupancy=target_occupancy)
    factor = calculate_gross_up_factor(actual_occupancy, config, trace)

    grossed_up = (original_amount * factor).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )

    if trace:
        trace.add_step(
            name="Apply gross-up factor",
            inputs={"original_amount": original_amount, "factor": factor},
            operation=f"{original_amount} * {factor}",
            output=grossed_up,
            input_units={"factor": UNIT_RATIO},
        )

    if apply_safety:
        grossed_up = apply_safety_valve(
            original_amount, grossed_up, actual_occupancy, target_occupancy, trace
        )

    return grossed_up
