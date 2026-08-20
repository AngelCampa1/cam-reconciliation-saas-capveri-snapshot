"""
Orchestrate complete gross-up calculation.

Combines occupancy calculation, expense filtering, gross-up factor application,
and safety valve logic into a single end-to-end calculation workflow.

This module provides a high-level API that integrates all gross-up components:
- Weighted average occupancy calculation (Story 6.1)
- Gross-up factor calculation (Story 6.2)
- Variable vs fixed expense filtering (Story 6.3)
- Safety valve protection (Story 6.4)
"""

from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.services.calculation.expense_filter import (
    ExpensePoolSummary,
    filter_expenses_for_gross_up,
)
from app.services.calculation.gross_up import (
    GrossUpConfig,
    calculate_grossed_up_expenses,
)
from app.services.calculation.models import UNIT_COUNT, CalculationTrace
from app.services.calculation.occupancy import (
    LeaseOccupancy,
    OccupancyInput,
    calculate_occupancy,
)


class GrossUpInput(BaseModel):
    """Input for full gross-up calculation.

    Contains property information and calculation parameters needed
    to perform complete gross-up workflow.
    """

    property_id: UUID = Field(description="Property to calculate gross-up for")
    period_start: date = Field(description="Start date of calculation period")
    period_end: date = Field(description="End date of calculation period")
    total_rentable_sqft: Decimal = Field(
        gt=0, description="Total rentable square footage of property"
    )
    target_occupancy: Decimal = Field(
        default=Decimal("0.95"),
        ge=0,
        le=1,
        description="Target occupancy for gross-up (default 95%)",
    )


class GrossUpResult(BaseModel):
    """Complete gross-up calculation result.

    Contains all input parameters, calculated values, and complete audit trail
    for the gross-up workflow.
    """

    # Input summary
    period_start: date = Field(description="Calculation period start")
    period_end: date = Field(description="Calculation period end")
    total_rentable_sqft: Decimal = Field(description="Total property square footage")

    # Occupancy results
    actual_occupancy: Decimal = Field(
        ge=0, le=1, description="Calculated actual occupancy rate"
    )
    target_occupancy: Decimal = Field(
        ge=0, le=1, description="Target occupancy for gross-up"
    )
    occupied_sqft: Decimal = Field(ge=0, description="Occupied square footage")
    vacant_sqft: Decimal = Field(ge=0, description="Vacant square footage")

    # Expense totals
    # NOTE: These monetary totals may be negative when GL credits exceed charges
    # in a pool. ExpensePoolSummary.total_amount and FilteredExpenses both
    # explicitly support net-negative pools, and downstream PoolRecovery clamps
    # recoverable amounts to >= 0. A `ge=0` guard here would crash an otherwise
    # valid reconciliation on a net-credit pool, so it is intentionally absent.
    total_operating_expenses: Decimal = Field(
        description="Total operating expenses before gross-up (negative with net GL credits)"  # noqa: E501
    )
    variable_expenses: Decimal = Field(
        description="Variable expenses subject to gross-up (negative with net GL credits)"  # noqa: E501
    )
    fixed_expenses: Decimal = Field(
        description="Fixed expenses, NOT grossed up (negative with net GL credits)"
    )

    # Gross-up results
    gross_up_factor: Decimal = Field(ge=1, description="Calculated gross-up factor")
    grossed_up_variable: Decimal = Field(
        description="Variable expenses after gross-up (negative with net GL credits)"
    )
    total_after_gross_up: Decimal = Field(
        description="Total expenses after gross-up (negative with net GL credits)"
    )

    # Safety valve indicator
    safety_valve_applied: bool = Field(
        description="Whether safety valve capped the gross-up"
    )

    # Complete audit trail
    trace: CalculationTrace = Field(description="Complete calculation trace for audit")


def calculate_full_gross_up(
    input_data: GrossUpInput,
    leases: list[LeaseOccupancy],
    pool_totals: dict[UUID, ExpensePoolSummary],
) -> GrossUpResult:
    """
    Perform complete end-to-end gross-up calculation.

    AC1: Combines occupancy, factor, filter, and safety valve
    AC2: Returns complete breakdown
    AC3: Full trace for audit
    AC4: Handles all edge cases
    AC5: End-to-end test with real data

    Steps:
    1. Calculate weighted average occupancy from leases
    2. Filter expenses into variable (gross-up) vs fixed (no gross-up)
    3. Calculate gross-up factor and apply to variable expenses
    4. Apply safety valve to cap at 100% occupancy equivalent
    5. Combine grossed-up variable and fixed expenses
    6. Return complete result with full audit trail

    Args:
        input_data: Property and period information
        leases: Active leases for occupancy calculation
        pool_totals: Expense totals by pool (with gross-up applicability)

    Returns:
        GrossUpResult with all calculations and complete trace
    """
    # Initialize calculation trace
    trace = CalculationTrace(
        calculation_type="gross_up_full",
        property_id=input_data.property_id,
        period_start=input_data.period_start,
        period_end=input_data.period_end,
    )

    # Step 1: Calculate actual occupancy from leases
    occupancy_input = OccupancyInput(
        property_id=input_data.property_id,
        period_start=input_data.period_start,
        period_end=input_data.period_end,
        total_rentable_sqft=input_data.total_rentable_sqft,
    )
    occupancy_result = calculate_occupancy(occupancy_input, leases)

    # Merge occupancy trace steps into main trace
    for step in occupancy_result.trace.steps:
        trace.steps.append(step)

    # Step 2: Filter expenses into variable vs fixed
    filtered = filter_expenses_for_gross_up(pool_totals)

    trace.add_step(
        name="Filter expenses by type",
        inputs={
            "pool_count": len(pool_totals),
            "total_expenses": filtered.gross_up_expenses + filtered.fixed_expenses,
        },
        operation="Separate variable from fixed based on pool config",
        output=filtered.gross_up_expenses,
        note=f"Variable (gross-up): {filtered.gross_up_expenses}, "
        f"Fixed (no gross-up): {filtered.fixed_expenses}",
        input_units={"pool_count": UNIT_COUNT},
    )

    # Step 3: Configure gross-up and calculate grossed-up variable expenses
    config = GrossUpConfig(
        target_occupancy=input_data.target_occupancy,
        min_factor=Decimal("1.0"),
        max_factor=None,  # Let safety valve handle the cap
    )

    grossed_up_variable = calculate_grossed_up_expenses(
        original_amount=filtered.gross_up_expenses,
        actual_occupancy=occupancy_result.occupancy_rate,
        target_occupancy=config.target_occupancy,
        apply_safety=True,
        trace=trace,
    )

    # Step 4: Determine the gross-up factor actually used, then detect whether the
    # safety valve capped the result.
    #
    # The factor MUST be quantized to 4 dp and floored at 1.0 — identical to
    # calculate_gross_up_factor (max_factor=None) — because that is the factor
    # calculate_grossed_up_expenses applied to produce grossed_up_variable. An
    # earlier version compared against the *unquantized* target/occupancy ratio,
    # which made expected_grossed_up drift above grossed_up_variable on large
    # pools and falsely reported safety_valve_applied=True even when the valve
    # never fired. Reusing the same quantized factor makes expected_grossed_up
    # exactly the pre-valve amount, so the flag is True only when the valve
    # actually substituted a smaller (capped) figure.
    if occupancy_result.occupancy_rate > 0:
        gross_up_factor = input_data.target_occupancy / occupancy_result.occupancy_rate
        # Apply minimum factor constraint (never gross down)
        if gross_up_factor < Decimal("1.0"):
            gross_up_factor = Decimal("1.0")
        # Quantize to 4 decimals to match calculate_gross_up_factor
        gross_up_factor = gross_up_factor.quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        expected_grossed_up = (filtered.gross_up_expenses * gross_up_factor).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP
        )
    else:
        # Zero occupancy: factor = 1.0, no gross-up
        gross_up_factor = Decimal("1.0")
        expected_grossed_up = filtered.gross_up_expenses

    # Safety valve applied if the post-valve amount is below the uncapped amount.
    safety_valve_applied = grossed_up_variable < expected_grossed_up

    # Step 5: Calculate total after gross-up
    total_after_gross_up = grossed_up_variable + filtered.fixed_expenses
    total_operating = filtered.gross_up_expenses + filtered.fixed_expenses

    trace.add_step(
        name="Calculate total after gross-up",
        inputs={
            "grossed_up_variable": grossed_up_variable,
            "fixed_expenses": filtered.fixed_expenses,
        },
        operation="grossed_up_variable + fixed_expenses",
        output=total_after_gross_up,
        note=f"Final total: {total_after_gross_up} "
        f"(variable: {grossed_up_variable}, fixed: {filtered.fixed_expenses})",
    )

    # Return complete result
    # (gross_up_factor was computed in Step 4 and reused here.)
    return GrossUpResult(
        period_start=input_data.period_start,
        period_end=input_data.period_end,
        total_rentable_sqft=input_data.total_rentable_sqft,
        actual_occupancy=occupancy_result.occupancy_rate,
        target_occupancy=input_data.target_occupancy,
        occupied_sqft=occupancy_result.occupied_sqft,
        vacant_sqft=occupancy_result.vacancy_sqft,
        total_operating_expenses=total_operating,
        variable_expenses=filtered.gross_up_expenses,
        fixed_expenses=filtered.fixed_expenses,
        gross_up_factor=gross_up_factor,
        grossed_up_variable=grossed_up_variable,
        total_after_gross_up=total_after_gross_up,
        safety_valve_applied=safety_valve_applied,
        trace=trace,
    )
