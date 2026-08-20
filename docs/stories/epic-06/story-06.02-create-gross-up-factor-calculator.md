# Story 6.2: Create Gross-Up Factor Calculator

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)

---

## User Story
**As a** property accountant
**I want** gross-up factors calculated automatically
**So that** variable expenses are fairly allocated

---

## Acceptance Criteria

- [x] **AC1**: Calculates factor as target_occupancy / actual_occupancy
- [x] **AC2**: Factor never less than 1.0 (no "grossing down")
- [x] **AC3**: Handles edge case of 0% occupancy
- [x] **AC4**: Returns factor as Decimal with 4 decimal places
- [x] **AC5**: Logs calculation for audit trail

---

## Technical Specifications

**Files to Create**:
```
backend/app/services/calculation/
└── gross_up.py
```

**gross_up.py**:
```python
"""
Gross-up factor calculation.

BOMA standards require variable operating expenses to be
"grossed up" to a target occupancy level (typically 95%)
to fairly allocate costs.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from app.services.calculation.models import CalculationTrace


class GrossUpConfig:
    """Configuration for gross-up calculation."""
    def __init__(
        self,
        target_occupancy: Decimal = Decimal('0.95'),
        min_factor: Decimal = Decimal('1.0'),
        max_factor: Optional[Decimal] = None,
    ):
        self.target_occupancy = target_occupancy
        self.min_factor = min_factor
        self.max_factor = max_factor  # Safety valve


def calculate_gross_up_factor(
    actual_occupancy: Decimal,
    config: GrossUpConfig,
    trace: Optional[CalculationTrace] = None,
) -> Decimal:
    """
    Calculate gross-up factor.

    Formula: target_occupancy / actual_occupancy

    The factor is always >= 1.0 (never gross down).

    Args:
        actual_occupancy: Current occupancy rate (0-1)
        config: Gross-up configuration
        trace: Optional calculation trace for logging

    Returns:
        Gross-up factor (Decimal >= 1.0)
    """
    # Handle edge case: 0% occupancy
    if actual_occupancy <= 0:
        factor = config.min_factor
        if trace:
            trace.add_step(
                name='Gross-up factor (zero occupancy)',
                inputs={'actual_occupancy': actual_occupancy},
                operation='Use minimum factor (occupancy is zero)',
                output=factor,
                note='Cannot gross up with zero occupancy',
            )
        return factor

    # Handle case where occupancy >= target
    if actual_occupancy >= config.target_occupancy:
        factor = config.min_factor
        if trace:
            trace.add_step(
                name='Gross-up factor (at or above target)',
                inputs={
                    'actual_occupancy': actual_occupancy,
                    'target_occupancy': config.target_occupancy,
                },
                operation='No gross-up needed (at target)',
                output=factor,
                note='Occupancy at or above target - no adjustment',
            )
        return factor

    # Calculate factor
    factor = (
        config.target_occupancy / actual_occupancy
    ).quantize(Decimal('0.0001'), rounding=ROUND_HALF_UP)

    # Apply minimum
    factor = max(factor, config.min_factor)

    # Apply maximum (safety valve) if configured
    if config.max_factor and factor > config.max_factor:
        original_factor = factor
        factor = config.max_factor
        if trace:
            trace.add_step(
                name='Apply safety valve',
                inputs={
                    'calculated_factor': original_factor,
                    'max_factor': config.max_factor,
                },
                operation='min(calculated, max_allowed)',
                output=factor,
                note='Safety valve applied - factor capped',
            )

    if trace:
        trace.add_step(
            name='Calculate gross-up factor',
            inputs={
                'target_occupancy': config.target_occupancy,
                'actual_occupancy': actual_occupancy,
            },
            operation=f'{config.target_occupancy} / {actual_occupancy}',
            output=factor,
        )

    return factor
```

---

## Definition of Done
- [x] Factor calculation correct
- [x] Never grosses down
- [x] Zero occupancy handled
- [x] Safety valve works

---

## Estimated Time: 2 hours
