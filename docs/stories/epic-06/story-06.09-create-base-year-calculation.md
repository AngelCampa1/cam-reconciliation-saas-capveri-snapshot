# Story 6.9: Create Base Year Calculation

**Epic**: [Epic 6 - Financial Calculation Engine](./_overview.md)

---

## User Story
**As a** tenant with a base year stop
**I want** my share calculated as (current - base) * pro_rata
**So that** I only pay for increases above the base year

---

## Acceptance Criteria

- [ ] **AC1**: Calculates (current - base) * pro_rata_share
- [ ] **AC2**: Handles positive increases correctly
- [ ] **AC3**: Handles negative increases (current < base)
- [ ] **AC4**: Base year from lease or calculated
- [ ] **AC5**: Trace shows base year calculation

---

## Technical Specifications

**Files to Create**:
```
backend/app/services/calculation/
└── base_year.py
```

**base_year.py**:
```python
"""
Base year calculation for expense stop leases.
"""
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from pydantic import BaseModel

from app.services.calculation.models import CalculationTrace


class BaseYearInput(BaseModel):
    """Input for base year calculation."""
    current_year_expenses: Decimal
    base_year_amount: Decimal
    pro_rata_share: Decimal  # 0.05 = 5%


class BaseYearResult(BaseModel):
    """Result of base year calculation."""
    current_expenses: Decimal
    base_year_amount: Decimal
    increase_over_base: Decimal
    pro_rata_share: Decimal
    tenant_share: Decimal
    is_under_base: bool


def calculate_base_year_increase(
    input_data: BaseYearInput,
    trace: Optional[CalculationTrace] = None,
) -> BaseYearResult:
    """
    Calculate tenant's share of increase over base year.

    Formula:
    increase = max(0, current - base)
    tenant_share = increase * pro_rata_share

    If current is below base, tenant pays nothing for that pool.

    Args:
        input_data: Expenses and lease terms
        trace: Optional calculation trace

    Returns:
        BaseYearResult with tenant share
    """
    # Calculate increase
    increase = input_data.current_year_expenses - input_data.base_year_amount
    is_under_base = increase < 0

    if trace:
        trace.add_step(
            name='Calculate increase over base',
            inputs={
                'current': input_data.current_year_expenses,
                'base': input_data.base_year_amount,
            },
            operation='current - base',
            output=increase,
            note='Under base year - no pass-through' if is_under_base else None,
        )

    # For under-base scenarios, increase is effectively 0
    recoverable_increase = max(increase, Decimal('0'))

    # Apply pro rata share
    tenant_share = recoverable_increase * input_data.pro_rata_share
    tenant_share = tenant_share.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    if trace:
        trace.add_step(
            name='Apply pro rata share',
            inputs={
                'increase': recoverable_increase,
                'pro_rata': input_data.pro_rata_share,
            },
            operation=f'{recoverable_increase} * {input_data.pro_rata_share}',
            output=tenant_share,
        )

    return BaseYearResult(
        current_expenses=input_data.current_year_expenses,
        base_year_amount=input_data.base_year_amount,
        increase_over_base=increase,
        pro_rata_share=input_data.pro_rata_share,
        tenant_share=tenant_share,
        is_under_base=is_under_base,
    )
```

---

## Definition of Done
- [ ] Formula implemented correctly
- [ ] Positive/negative tested
- [ ] Pro-rata applied
- [ ] Trace complete

---

## Estimated Time: 3 hours
