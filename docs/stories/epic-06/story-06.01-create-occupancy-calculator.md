# Story 6.1: Create Occupancy Calculator

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)
**Estimated Time**: 3 hours

---

## User Story
**As a** property accountant
**I want** occupancy calculated from rent roll data
**So that** I can determine gross-up factors accurately

---

## Acceptance Criteria

- [x] **AC1**: Calculates weighted average occupancy for a period
- [x] **AC2**: Handles partial-year tenants (prorate by days)
- [x] **AC3**: Handles vacant units correctly
- [x] **AC4**: Returns occupancy as Decimal (0.0 - 1.0)
- [x] **AC5**: Logs calculation steps for audit trail

---

## Technical Specifications

**Files to Create**:
```
backend/app/services/calculation/
├── __init__.py
├── occupancy.py
└── models.py
```

**models.py**:
```python
"""
Models for calculation inputs and outputs.
"""
from datetime import date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class CalculationStep(BaseModel):
    """Single step in a calculation trace."""
    step_order: int
    step_name: str
    input_values: dict
    operation: str
    output_value: str
    note: Optional[str] = None


class CalculationTrace(BaseModel):
    """Complete trace of a calculation for audit trail."""
    calculation_type: str
    property_id: UUID
    period_start: date
    period_end: date
    steps: List[CalculationStep] = Field(default_factory=list)

    def add_step(
        self,
        name: str,
        inputs: dict,
        operation: str,
        output: Decimal | float | int,
        note: str = None,
    ) -> None:
        """Add a step to the trace."""
        self.steps.append(CalculationStep(
            step_order=len(self.steps) + 1,
            step_name=name,
            input_values={k: str(v) for k, v in inputs.items()},
            operation=operation,
            output_value=str(output),
            note=note,
        ))


class OccupancyInput(BaseModel):
    """Input for occupancy calculation."""
    property_id: UUID
    period_start: date
    period_end: date
    total_rentable_sqft: Decimal


class OccupancyResult(BaseModel):
    """Result of occupancy calculation."""
    occupancy_rate: Decimal = Field(ge=0, le=1)
    occupied_sqft: Decimal
    total_sqft: Decimal
    vacancy_sqft: Decimal
    trace: CalculationTrace
```

**occupancy.py**:
```python
"""
Occupancy calculation for gross-up.
"""
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import List

from app.services.calculation.models import (
    OccupancyInput,
    OccupancyResult,
    CalculationTrace,
)


class LeaseOccupancy:
    """Lease data for occupancy calculation."""
    def __init__(
        self,
        lease_id: str,
        tenant_name: str,
        sqft: Decimal,
        start_date: date,
        end_date: date,
    ):
        self.lease_id = lease_id
        self.tenant_name = tenant_name
        self.sqft = sqft
        self.start_date = start_date
        self.end_date = end_date


def calculate_occupancy(
    input_data: OccupancyInput,
    leases: List[LeaseOccupancy],
) -> OccupancyResult:
    """
    Calculate weighted average occupancy for a property/period.

    Formula:
    For each lease:
      days_occupied = min(lease_end, period_end) - max(lease_start, period_start)
      weighted_sqft = lease_sqft * (days_occupied / total_days)

    Occupancy = sum(weighted_sqft) / total_rentable_sqft

    Args:
        input_data: Property and period information
        leases: Active leases for the property

    Returns:
        OccupancyResult with rate and trace
    """
    trace = CalculationTrace(
        calculation_type='occupancy',
        property_id=input_data.property_id,
        period_start=input_data.period_start,
        period_end=input_data.period_end,
    )

    # Calculate period days
    total_days = (input_data.period_end - input_data.period_start).days + 1
    trace.add_step(
        name='Calculate period days',
        inputs={
            'period_start': input_data.period_start,
            'period_end': input_data.period_end,
        },
        operation='end - start + 1',
        output=total_days,
    )

    # Calculate weighted occupancy for each lease
    total_weighted_sqft = Decimal('0')

    for lease in leases:
        # Determine overlap with period
        overlap_start = max(lease.start_date, input_data.period_start)
        overlap_end = min(lease.end_date, input_data.period_end)

        if overlap_start > overlap_end:
            # No overlap
            continue

        overlap_days = (overlap_end - overlap_start).days + 1
        weight = Decimal(overlap_days) / Decimal(total_days)
        weighted_sqft = lease.sqft * weight

        trace.add_step(
            name=f'Lease: {lease.tenant_name}',
            inputs={
                'sqft': lease.sqft,
                'overlap_days': overlap_days,
                'total_days': total_days,
            },
            operation=f'{lease.sqft} * ({overlap_days} / {total_days})',
            output=weighted_sqft,
            note=f'{overlap_start} to {overlap_end}',
        )

        total_weighted_sqft += weighted_sqft

    # Calculate occupancy rate
    if input_data.total_rentable_sqft <= 0:
        occupancy_rate = Decimal('0')
    else:
        occupancy_rate = (
            total_weighted_sqft / input_data.total_rentable_sqft
        ).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)

    # Cap at 1.0 (can happen with overlapping leases)
    occupancy_rate = min(occupancy_rate, Decimal('1'))

    trace.add_step(
        name='Calculate occupancy rate',
        inputs={
            'total_weighted_sqft': total_weighted_sqft,
            'total_rentable_sqft': input_data.total_rentable_sqft,
        },
        operation='weighted_sqft / total_sqft',
        output=occupancy_rate,
    )

    # Ensure vacancy is not negative (can happen with overlapping leases)
    vacancy_sqft = max(Decimal('0'), input_data.total_rentable_sqft - total_weighted_sqft)

    return OccupancyResult(
        occupancy_rate=occupancy_rate,
        occupied_sqft=total_weighted_sqft,
        total_sqft=input_data.total_rentable_sqft,
        vacancy_sqft=vacancy_sqft,
        trace=trace,
    )
```

---

## Definition of Done
- [x] Weighted average calculated correctly
- [x] Partial occupancy handled
- [x] Trace captures all steps
- [x] Tests verify expected values
