# Story 6.6: Create Non-Cumulative Cap

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)

---

## User Story
**As a** lease with a non-cumulative cap
**I want** my expenses capped year-over-year
**So that** increases are limited per the lease terms

---

## Acceptance Criteria

- [ ] **AC1**: Caps increase to prior_year * (1 + cap_rate) for percentage caps
- [ ] **AC2**: Year 1 has no cap (no prior year)
- [ ] **AC3**: Unused cap capacity is lost
- [ ] **AC4**: Returns both capped and uncapped amounts
- [ ] **AC5**: Trace shows cap calculation
- [ ] **AC6**: Supports fixed dollar caps (prior_year + fixed_amount)

---

## Technical Specifications

**Files to Create**:
```
backend/app/services/calculation/
└── caps.py
```

**caps.py**:
```python
"""
Expense cap calculations.

Three types of caps:
1. Non-cumulative: Caps increase each year, unused capacity lost
2. Cumulative: Unused capacity carries forward
3. Cumulative Compounding: Base amount grows each year
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, List

from pydantic import BaseModel

from app.services.calculation.models import CalculationTrace


class CapType:
    """Cap type constants."""
    NONE = 'none'
    NON_CUMULATIVE = 'non_cumulative'
    CUMULATIVE = 'cumulative'
    CUMULATIVE_COMPOUNDING = 'cumulative_compounding'


class CapInput(BaseModel):
    """Input for cap calculation."""
    cap_type: str
    cap_rate: Optional[Decimal] = None  # e.g., 0.05 for 5% (percentage-based)
    cap_fixed_amount: Optional[Decimal] = None  # e.g., 5000 for $5k max increase (dollar-based)
    current_year_amount: Decimal
    prior_year_amount: Optional[Decimal] = None
    base_year_amount: Optional[Decimal] = None
    # For cumulative: list of all prior year amounts
    all_prior_amounts: Optional[List[Decimal]] = None


class CapResult(BaseModel):
    """Result of cap calculation."""
    original_amount: Decimal
    capped_amount: Decimal
    cap_applied: bool
    savings_from_cap: Decimal
    cap_headroom: Decimal  # For cumulative: unused capacity


def calculate_non_cumulative_cap(
    current_amount: Decimal,
    prior_amount: Optional[Decimal],
    cap_rate: Optional[Decimal] = None,
    cap_fixed_amount: Optional[Decimal] = None,
    trace: Optional[CalculationTrace] = None,
) -> CapResult:
    """
    Calculate non-cumulative cap.

    Supports two modes:
    1. Percentage cap: max_allowed = prior_year * (1 + cap_rate)
    2. Fixed dollar cap: max_allowed = prior_year + cap_fixed_amount

    Year 1: No cap (no prior year to base on)

    Args:
        current_amount: This year's calculated expense
        prior_amount: Last year's expense (None for year 1)
        cap_rate: Annual cap rate (e.g., 0.05 for 5%) - use this OR cap_fixed_amount
        cap_fixed_amount: Fixed dollar max increase (e.g., 5000 for $5k) - use this OR cap_rate
        trace: Optional calculation trace

    Returns:
        CapResult with capped amount
    """
    # Year 1: No cap
    if prior_amount is None:
        if trace:
            trace.add_step(
                name='Non-cumulative cap (Year 1)',
                inputs={'current_amount': current_amount},
                operation='No cap - first year',
                output=current_amount,
                note='No prior year to base cap on',
            )
        return CapResult(
            original_amount=current_amount,
            capped_amount=current_amount,
            cap_applied=False,
            savings_from_cap=Decimal('0'),
            cap_headroom=Decimal('0'),
        )

    # Calculate maximum allowed increase
    if cap_fixed_amount is not None:
        # Fixed dollar cap: max increase is a fixed amount
        max_increase = cap_fixed_amount
        operation_desc = f'{prior_amount} + {cap_fixed_amount}'
    elif cap_rate is not None:
        # Percentage cap: max increase is percentage of prior
        max_increase = prior_amount * cap_rate
        operation_desc = f'{prior_amount} * (1 + {cap_rate})'
    else:
        raise ValueError("Either cap_rate or cap_fixed_amount must be provided")

    max_allowed = prior_amount + max_increase
    max_allowed = max_allowed.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    if trace:
        trace.add_step(
            name='Calculate max allowed',
            inputs={
                'prior_amount': prior_amount,
                'cap_rate': cap_rate,
                'cap_fixed_amount': cap_fixed_amount,
            },
            operation=operation_desc,
            output=max_allowed,
        )

    # Apply cap
    if current_amount <= max_allowed:
        # Under cap
        capped = current_amount
        cap_applied = False
        savings = Decimal('0')
        headroom = max_allowed - current_amount
    else:
        # Over cap - limit to max
        capped = max_allowed
        cap_applied = True
        savings = current_amount - max_allowed
        headroom = Decimal('0')

    if trace:
        trace.add_step(
            name='Apply non-cumulative cap',
            inputs={
                'current_amount': current_amount,
                'max_allowed': max_allowed,
            },
            operation='min(current, max_allowed)',
            output=capped,
            note='Cap applied' if cap_applied else 'Within cap limit',
        )

    return CapResult(
        original_amount=current_amount,
        capped_amount=capped,
        cap_applied=cap_applied,
        savings_from_cap=savings,
        cap_headroom=headroom,
    )
```

---

## Definition of Done
- [ ] Non-cumulative cap works
- [ ] Year 1 handled correctly
- [ ] Savings calculated
- [ ] Tests verify formula

---

## Estimated Time: 3 hours
