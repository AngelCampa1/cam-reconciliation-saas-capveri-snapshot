# Story 6.5: Create Full Gross-Up Calculation

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)
**Dependencies**: Story 6.1 (Occupancy validation), Story 6.2 (Gross-up configuration), Story 6.3 (Expense filtering), Story 6.4 (Safety valve logic)
**Estimated Time**: 4 hours

---

## User Story
**As a** property accountant
**I want** a complete gross-up calculation function
**So that** I can get grossed-up expenses in one call

---

## Acceptance Criteria

- [ ] **AC1**: Combines occupancy, factor, filter, and safety valve
- [ ] **AC2**: Returns complete breakdown
- [ ] **AC3**: Full trace for audit
- [ ] **AC4**: Handles all edge cases
- [ ] **AC5**: End-to-end test with real data

---

## Technical Specifications

**Prerequisites**: This story assumes the following modules exist (created in stories 6.1-6.4):
- `app.services.calculation.occupancy` with `OccupancyInput`, `LeaseOccupancy`, `calculate_occupancy()` (Story 6.1)
- `app.services.calculation.gross_up` with `GrossUpConfig`, `calculate_grossed_up_expenses()` (Story 6.2)
- `app.services.calculation.expense_filter` with `ExpensePoolSummary`, `filter_expenses_for_gross_up()` (Story 6.3)
- `app.services.calculation.safety_valve` with `safety_valve_check()` (Story 6.4)

**Files to Create**:
```
backend/app/services/calculation/
└── gross_up_orchestrator.py
```

**gross_up_orchestrator.py**:
```python
"""
Orchestrate complete gross-up calculation.
"""
from datetime import date
from decimal import Decimal
from typing import List, Dict, Optional
from uuid import UUID

from pydantic import BaseModel

from app.services.calculation.models import CalculationTrace
from app.services.calculation.occupancy import (
    OccupancyInput,
    LeaseOccupancy,
    calculate_occupancy,
)
from app.services.calculation.gross_up import (
    GrossUpConfig,
    calculate_grossed_up_expenses,
)
from app.services.calculation.expense_filter import (
    ExpensePoolSummary,
    filter_expenses_for_gross_up,
)


class GrossUpInput(BaseModel):
    """Input for full gross-up calculation."""
    property_id: UUID
    period_start: date
    period_end: date
    total_rentable_sqft: Decimal
    target_occupancy: Decimal = Decimal('0.95')


class GrossUpResult(BaseModel):
    """Complete gross-up calculation result."""
    # Input summary
    period_start: date
    period_end: date
    total_rentable_sqft: Decimal

    # Occupancy
    actual_occupancy: Decimal
    target_occupancy: Decimal
    occupied_sqft: Decimal
    vacant_sqft: Decimal

    # Expense totals
    total_operating_expenses: Decimal
    variable_expenses: Decimal
    fixed_expenses: Decimal

    # Gross-up results
    gross_up_factor: Decimal
    grossed_up_variable: Decimal
    total_after_gross_up: Decimal

    # Safety valve
    safety_valve_applied: bool

    # Audit trail
    trace: CalculationTrace


def calculate_full_gross_up(
    input_data: GrossUpInput,
    leases: List[LeaseOccupancy],
    pool_totals: Dict[UUID, ExpensePoolSummary],
) -> GrossUpResult:
    """
    Perform complete gross-up calculation.

    Steps:
    1. Calculate actual occupancy
    2. Calculate gross-up factor
    3. Filter variable vs fixed expenses
    4. Apply gross-up to variable expenses
    5. Apply safety valve
    6. Return complete result with trace

    Args:
        input_data: Property and period info
        leases: Active leases for occupancy
        pool_totals: Expense totals by pool

    Returns:
        GrossUpResult with all calculations and trace
    """
    trace = CalculationTrace(
        calculation_type='gross_up_full',
        property_id=input_data.property_id,
        period_start=input_data.period_start,
        period_end=input_data.period_end,
    )

    # Step 1: Calculate occupancy
    occupancy_input = OccupancyInput(
        property_id=input_data.property_id,
        period_start=input_data.period_start,
        period_end=input_data.period_end,
        total_rentable_sqft=input_data.total_rentable_sqft,
    )
    occupancy_result = calculate_occupancy(occupancy_input, leases)

    # Merge occupancy trace
    for step in occupancy_result.trace.steps:
        trace.steps.append(step)

    # Step 2: Filter expenses
    filtered = filter_expenses_for_gross_up(pool_totals)

    trace.add_step(
        name='Filter expenses by type',
        inputs={
            'pool_count': len(pool_totals),
        },
        operation='Separate variable from fixed',
        output=filtered.gross_up_expenses,
        note=f'Variable: {filtered.gross_up_expenses}, Fixed: {filtered.fixed_expenses}',
    )

    # Step 3: Configure and calculate gross-up
    config = GrossUpConfig(
        target_occupancy=input_data.target_occupancy,
        min_factor=Decimal('1.0'),
    )

    grossed_up_variable = calculate_grossed_up_expenses(
        variable_expenses=filtered.gross_up_expenses,
        actual_occupancy=occupancy_result.occupancy_rate,
        config=config,
        trace=trace,
    )

    # Determine if safety valve was applied
    expected_grossed_up = filtered.gross_up_expenses * (
        input_data.target_occupancy / occupancy_result.occupancy_rate
        if occupancy_result.occupancy_rate > 0
        else Decimal('1')
    )
    safety_valve_applied = grossed_up_variable < expected_grossed_up

    # Calculate totals
    total_after_gross_up = grossed_up_variable + filtered.fixed_expenses
    total_operating = filtered.gross_up_expenses + filtered.fixed_expenses

    trace.add_step(
        name='Calculate total after gross-up',
        inputs={
            'grossed_up_variable': grossed_up_variable,
            'fixed_expenses': filtered.fixed_expenses,
        },
        operation='grossed_up_variable + fixed_expenses',
        output=total_after_gross_up,
    )

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
        gross_up_factor=config.target_occupancy / occupancy_result.occupancy_rate
            if occupancy_result.occupancy_rate > 0 else Decimal('1'),
        grossed_up_variable=grossed_up_variable,
        total_after_gross_up=total_after_gross_up,
        safety_valve_applied=safety_valve_applied,
        trace=trace,
    )
```

---

## Definition of Done
- [ ] Complete calculation works
- [ ] All components integrated
- [ ] Full trace captured
- [ ] End-to-end test passes
